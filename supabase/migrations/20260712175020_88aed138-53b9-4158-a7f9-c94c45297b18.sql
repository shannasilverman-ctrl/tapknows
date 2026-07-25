
-- Fix 1: Tighten waitlist INSERT policy to require a valid email format (not always-true).
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(email) BETWEEN 3 AND 320
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

-- Fix 2: Convert migrate_guest_wallet from SECURITY DEFINER to SECURITY INVOKER.
-- All inserts already scope to auth.uid(); RLS policies on the target tables
-- (user_cards, user_offers, user_cpp_overrides) allow the authenticated user
-- to write their own rows, so INVOKER is sufficient and safer.
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
  new_card_id uuid;
  slug_to_uuid jsonb := '{}'::jsonb;
  cards_added int := 0;
  offers_added int := 0;
  overrides_added int := 0;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR gc IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'cards', '[]'::jsonb))
  LOOP
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

  FOR go IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'offers', '[]'::jsonb))
  LOOP
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

  FOR gov IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'overrides', '[]'::jsonb))
  LOOP
    INSERT INTO public.user_cpp_overrides (user_id, points_program_id, cpp)
    VALUES (uid, gov->>'points_program_id', (gov->>'cpp')::numeric)
    ON CONFLICT (user_id, points_program_id) DO UPDATE SET cpp = EXCLUDED.cpp;
    overrides_added := overrides_added + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'cards_added', cards_added,
    'offers_added', offers_added,
    'overrides_added', overrides_added
  );
END;
$function$;

-- Ensure only authenticated role can execute; revoke broad grants.
REVOKE ALL ON FUNCTION public.migrate_guest_wallet(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_guest_wallet(jsonb) TO authenticated;
