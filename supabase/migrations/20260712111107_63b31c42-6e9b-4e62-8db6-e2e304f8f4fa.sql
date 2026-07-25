
-- =====================================================================
-- 1. user_offers additions
-- =====================================================================
ALTER TABLE public.user_offers
  ADD COLUMN IF NOT EXISTS offer_type text,
  ADD COLUMN IF NOT EXISTS max_benefit numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_used boolean NOT NULL DEFAULT false;

UPDATE public.user_offers SET offer_type =
  CASE reward_type
    WHEN 'multiplier' THEN 'multiplier'
    WHEN 'percent_back' THEN 'percent_back'
    WHEN 'statement_credit' THEN 'dollars_off_threshold'
    ELSE 'multiplier'
  END
WHERE offer_type IS NULL;

ALTER TABLE public.user_offers DROP CONSTRAINT IF EXISTS user_offers_offer_type_check;
ALTER TABLE public.user_offers
  ADD CONSTRAINT user_offers_offer_type_check
  CHECK (offer_type IN ('dollars_off_threshold','percent_back','bonus_points','multiplier','statement_credit'));

-- =====================================================================
-- 2. user_purchases -> planned_purchases log columns
-- =====================================================================
ALTER TABLE public.user_purchases
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS recommendation_json jsonb;

-- =====================================================================
-- 3. cards_catalog rates_as_of
-- =====================================================================
ALTER TABLE public.cards_catalog
  ADD COLUMN IF NOT EXISTS rates_as_of date NOT NULL DEFAULT '2026-11-01';

-- =====================================================================
-- 4. Reseat points_programs to canonical cents-per-point defaults
-- =====================================================================
INSERT INTO public.points_programs (id, name, kind, default_cpp) VALUES
  ('amex_mr',      'Amex Membership Rewards', 'transferable', 1.6),
  ('chase_ur',     'Chase Ultimate Rewards',  'transferable', 1.7),
  ('capone_miles', 'Capital One Miles',       'transferable', 1.5),
  ('citi_typ',     'Citi ThankYou Points',    'transferable', 1.4),
  ('bilt_pts',     'Bilt Rewards',            'transferable', 1.8),
  ('hyatt_wob',    'World of Hyatt',          'hotel',        1.7),
  ('discover_cb',  'Discover Cashback',       'cashback',     1.0),
  ('cashback_usd', 'Cashback (USD)',          'cashback',     1.0),
  ('usb_altitude', 'US Bank Altitude',        'transferable', 1.0),
  ('apple_cash',   'Apple Cash',              'cashback',     1.0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  default_cpp = EXCLUDED.default_cpp;

-- =====================================================================
-- 5. Seed the Top 20 US rewards cards (idempotent by stable id)
-- =====================================================================
INSERT INTO public.cards_catalog
  (id, issuer, name, annual_fee, points_program_id, foreign_tx_fee_pct, earn_rules, notes, rates_as_of, is_custom, user_id)
VALUES
  ('amex_gold','American Express','Gold Card',325,'amex_mr',0,
   '[{"category":"dining","multiplier":4},{"category":"groceries","multiplier":4,"cap_annual_spend":25000,"note":"US supermarkets"},{"category":"flights","multiplier":3,"note":"booked with airline"},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('amex_platinum','American Express','Platinum Card',695,'amex_mr',0,
   '[{"category":"flights","multiplier":5,"note":"airline or Amex Travel"},{"category":"hotels","multiplier":5,"note":"prepaid via Amex Travel"},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('amex_bcp','American Express','Blue Cash Preferred',95,'cashback_usd',2.7,
   '[{"category":"groceries","multiplier":0.06,"cap_annual_spend":6000,"note":"US supermarkets"},{"category":"streaming","multiplier":0.06},{"category":"gas","multiplier":0.03},{"category":"transit","multiplier":0.03},{"category":"everything_else","multiplier":0.01}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('amex_biz_gold','American Express','Business Gold',375,'amex_mr',0,
   '[{"category":"online_shopping","multiplier":4},{"category":"dining","multiplier":4},{"category":"everything_else","multiplier":1}]'::jsonb,
   'Top 2 of 6 categories earn 4x','2026-11-01',false,NULL),
  ('csp','Chase','Sapphire Preferred',95,'chase_ur',0,
   '[{"category":"travel","multiplier":2},{"category":"hotels","multiplier":5,"note":"via Chase Travel"},{"category":"dining","multiplier":3},{"category":"streaming","multiplier":3},{"category":"online_shopping","multiplier":3},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('csr','Chase','Sapphire Reserve',795,'chase_ur',0,
   '[{"category":"travel","multiplier":3},{"category":"hotels","multiplier":8,"note":"via Chase Travel"},{"category":"flights","multiplier":8,"note":"via Chase Travel"},{"category":"dining","multiplier":3},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('cfu','Chase','Freedom Unlimited',0,'chase_ur',3,
   '[{"category":"drugstores","multiplier":3},{"category":"dining","multiplier":3},{"category":"everything_else","multiplier":1.5}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('cff','Chase','Freedom Flex',0,'chase_ur',3,
   '[{"category":"dining","multiplier":3},{"category":"drugstores","multiplier":3},{"category":"rotating","multiplier":5,"cap_annual_spend":6000,"note":"5% rotating, $1500/qtr"},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('ink_preferred','Chase','Ink Business Preferred',95,'chase_ur',0,
   '[{"category":"travel","multiplier":3,"cap_annual_spend":150000},{"category":"online_shopping","multiplier":3,"cap_annual_spend":150000},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('citi_dc','Citi','Double Cash',0,'cashback_usd',3,
   '[{"category":"everything_else","multiplier":0.02}]'::jsonb,
   '1% at purchase, 1% at payment','2026-11-01',false,NULL),
  ('citi_cc','Citi','Custom Cash',0,'cashback_usd',3,
   '[{"category":"top_category","multiplier":0.05,"cap_annual_spend":6000,"note":"top eligible cat, $500/mo cap"},{"category":"everything_else","multiplier":0.01}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('venture_x','Capital One','Venture X',395,'capone_miles',0,
   '[{"category":"hotels","multiplier":10,"note":"via portal"},{"category":"flights","multiplier":5,"note":"via portal"},{"category":"everything_else","multiplier":2}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('savor','Capital One','Savor',0,'cashback_usd',0,
   '[{"category":"dining","multiplier":0.03},{"category":"streaming","multiplier":0.03},{"category":"groceries","multiplier":0.03},{"category":"everything_else","multiplier":0.01}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('quicksilver','Capital One','Quicksilver',0,'cashback_usd',3,
   '[{"category":"everything_else","multiplier":0.015}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('discover_it','Discover','it Cash Back',0,'discover_cb',0,
   '[{"category":"rotating","multiplier":0.05,"cap_annual_spend":6000,"note":"5% rotating, $1500/qtr"},{"category":"everything_else","multiplier":0.01}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('wf_active','Wells Fargo','Active Cash',0,'cashback_usd',3,
   '[{"category":"everything_else","multiplier":0.02}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('bofa_ccr','Bank of America','Customized Cash Rewards',0,'cashback_usd',3,
   '[{"category":"choice_category","multiplier":0.03,"note":"pick one: gas, dining, travel, online etc"},{"category":"groceries","multiplier":0.02},{"category":"everything_else","multiplier":0.01}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('usb_altitude_go','US Bank','Altitude Go',0,'usb_altitude',3,
   '[{"category":"dining","multiplier":4},{"category":"streaming","multiplier":2},{"category":"groceries","multiplier":2},{"category":"gas","multiplier":2},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('apple_card','Apple / Goldman','Apple Card',0,'apple_cash',3,
   '[{"category":"apple","multiplier":0.03},{"category":"everything_else","multiplier":0.02,"note":"2% via Apple Pay, 1% physical"}]'::jsonb,
   NULL,'2026-11-01',false,NULL),
  ('bilt_mc','Bilt','Mastercard',0,'bilt_pts',0,
   '[{"category":"rent","multiplier":1,"note":"no fee, once/mo"},{"category":"dining","multiplier":3},{"category":"travel","multiplier":2},{"category":"everything_else","multiplier":1}]'::jsonb,
   NULL,'2026-11-01',false,NULL)
ON CONFLICT (id) DO UPDATE SET
  issuer = EXCLUDED.issuer,
  name = EXCLUDED.name,
  annual_fee = EXCLUDED.annual_fee,
  points_program_id = EXCLUDED.points_program_id,
  foreign_tx_fee_pct = EXCLUDED.foreign_tx_fee_pct,
  earn_rules = EXCLUDED.earn_rules,
  notes = EXCLUDED.notes,
  rates_as_of = EXCLUDED.rates_as_of;

-- =====================================================================
-- 6. Public catalog reads for guest (anon) mode
-- =====================================================================
GRANT SELECT ON public.cards_catalog TO anon;
GRANT SELECT ON public.points_programs TO anon;
GRANT SELECT ON public.merchants_catalog TO anon;

DROP POLICY IF EXISTS catalogs_anon_select_pp ON public.points_programs;
CREATE POLICY catalogs_anon_select_pp ON public.points_programs
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS catalogs_anon_select_mc ON public.merchants_catalog;
CREATE POLICY catalogs_anon_select_mc ON public.merchants_catalog
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS catalogs_anon_select_cc ON public.cards_catalog;
CREATE POLICY catalogs_anon_select_cc ON public.cards_catalog
  FOR SELECT TO anon USING (user_id IS NULL);

-- =====================================================================
-- 7. Guest wallet migration RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.migrate_guest_wallet(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.migrate_guest_wallet(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_guest_wallet(jsonb) TO authenticated;
