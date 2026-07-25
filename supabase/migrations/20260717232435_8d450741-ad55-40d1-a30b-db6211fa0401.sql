
CREATE TABLE public.user_benefit_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_catalog_id text NOT NULL,
  benefit_id text NOT NULL,
  period_key text NOT NULL,
  redeemed_cents integer NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_catalog_id, benefit_id, period_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_benefit_redemptions TO authenticated;
GRANT ALL ON public.user_benefit_redemptions TO service_role;

ALTER TABLE public.user_benefit_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own benefit redemptions"
  ON public.user_benefit_redemptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX user_benefit_redemptions_user_idx ON public.user_benefit_redemptions (user_id);
