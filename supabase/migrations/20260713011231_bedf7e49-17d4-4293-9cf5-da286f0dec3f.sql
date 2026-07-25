
-- user_prefs
CREATE TABLE public.user_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  utilization_enabled boolean NOT NULL DEFAULT false,
  utilization_threshold_pct int NOT NULL DEFAULT 10 CHECK (utilization_threshold_pct BETWEEN 1 AND 90),
  utilization_behavior text NOT NULL DEFAULT 'warn' CHECK (utilization_behavior IN ('warn','rerank','split')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_prefs TO authenticated;
GRANT ALL ON public.user_prefs TO service_role;
ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.user_prefs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_plaid_items (public metadata)
CREATE TABLE public.user_plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_item_id text NOT NULL,
  institution_name text,
  status text NOT NULL DEFAULT 'active',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plaid_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_plaid_items TO authenticated;
GRANT ALL ON public.user_plaid_items TO service_role;
ALTER TABLE public.user_plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plaid items" ON public.user_plaid_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_plaid_items_private (server-only)
CREATE TABLE public.user_plaid_items_private (
  plaid_item_pk uuid PRIMARY KEY REFERENCES public.user_plaid_items(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_plaid_items_private TO service_role;
ALTER TABLE public.user_plaid_items_private ENABLE ROW LEVEL SECURITY;
-- no policies: only service_role bypasses RLS

-- user_card_accounts
CREATE TABLE public.user_card_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_card_id uuid REFERENCES public.user_cards(id) ON DELETE SET NULL,
  plaid_item_pk uuid REFERENCES public.user_plaid_items(id) ON DELETE CASCADE,
  plaid_account_id text,
  mask text,
  credit_limit_cents bigint,
  current_balance_cents bigint,
  statement_balance_cents bigint,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('plaid','manual')),
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plaid_item_pk, plaid_account_id)
);
CREATE INDEX ON public.user_card_accounts (user_id);
CREATE INDEX ON public.user_card_accounts (user_card_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_card_accounts TO authenticated;
GRANT ALL ON public.user_card_accounts TO service_role;
ALTER TABLE public.user_card_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card accounts" ON public.user_card_accounts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- per-card override
ALTER TABLE public.user_cards
  ADD COLUMN utilization_override_pct int
    CHECK (utilization_override_pct IS NULL OR utilization_override_pct BETWEEN 1 AND 90);

-- Extend migrate_guest_wallet to accept accounts payload
CREATE OR REPLACE FUNCTION public.migrate_guest_wallet(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  gc jsonb;
  go jsonb;
  gov jsonb;
  ga jsonb;
  new_card_id uuid;
  slug_to_uuid jsonb := '{}'::jsonb;
  cards_added int := 0;
  offers_added int := 0;
  overrides_added int := 0;
  accounts_added int := 0;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR gc IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'cards', '[]'::jsonb)) LOOP
    SELECT id INTO new_card_id FROM public.user_cards
      WHERE user_id = uid AND card_catalog_id = gc->>'card_catalog_id' LIMIT 1;
    IF new_card_id IS NULL THEN
      INSERT INTO public.user_cards (user_id, card_catalog_id, nickname)
      VALUES (uid, gc->>'card_catalog_id', NULLIF(gc->>'nickname',''))
      RETURNING id INTO new_card_id;
      cards_added := cards_added + 1;
    END IF;
    slug_to_uuid := slug_to_uuid || jsonb_build_object(gc->>'id', new_card_id::text);
  END LOOP;

  FOR go IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'offers', '[]'::jsonb)) LOOP
    new_card_id := NULLIF(slug_to_uuid->>(go->>'user_card_id'),'')::uuid;
    IF new_card_id IS NOT NULL THEN
      INSERT INTO public.user_offers
        (user_id, user_card_id, merchant_text, reward_type, reward_value,
         min_spend, expires_at, offer_type, max_benefit)
      VALUES (
        uid, new_card_id,
        COALESCE(go->>'merchant_text',''),
        COALESCE(go->>'reward_type','multiplier'),
        COALESCE((go->>'reward_value')::numeric, 0),
        COALESCE((go->>'min_spend')::int, 0),
        NULLIF(go->>'expires_at','')::date,
        COALESCE(go->>'offer_type','multiplier'),
        NULLIF(go->>'max_benefit','')::numeric
      );
      offers_added := offers_added + 1;
    END IF;
  END LOOP;

  FOR gov IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'overrides', '[]'::jsonb)) LOOP
    INSERT INTO public.user_cpp_overrides (user_id, points_program_id, cpp)
    VALUES (uid, gov->>'points_program_id', (gov->>'cpp')::numeric)
    ON CONFLICT (user_id, points_program_id) DO UPDATE SET cpp = EXCLUDED.cpp;
    overrides_added := overrides_added + 1;
  END LOOP;

  FOR ga IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'accounts', '[]'::jsonb)) LOOP
    new_card_id := NULLIF(slug_to_uuid->>(ga->>'user_card_id'),'')::uuid;
    IF new_card_id IS NOT NULL THEN
      INSERT INTO public.user_card_accounts
        (user_id, user_card_id, source, credit_limit_cents, current_balance_cents)
      VALUES (
        uid, new_card_id, 'manual',
        NULLIF(ga->>'credit_limit_cents','')::bigint,
        NULLIF(ga->>'current_balance_cents','')::bigint
      );
      accounts_added := accounts_added + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'cards_added', cards_added,
    'offers_added', offers_added,
    'overrides_added', overrides_added,
    'accounts_added', accounts_added
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.migrate_guest_wallet(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_guest_wallet(jsonb) TO authenticated;
