CREATE TABLE public.journey_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (name IN (
    'wallet_ready',
    'merchant_selected',
    'recommendation_viewed',
    'proof_opened',
    'payment_choice_recorded',
    'wallet_opened',
    'situation_tried',
    'card_guide_opened',
    'benefit_detail_opened'
  )),
  props JSONB NOT NULL DEFAULT '{}',
  at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.journey_events TO anon, authenticated;
GRANT SELECT ON public.journey_events TO authenticated;

ALTER TABLE public.journey_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guests and users insert journey events"
ON public.journey_events FOR INSERT
TO anon, authenticated
WITH CHECK (client_id IS NOT NULL);

CREATE POLICY "admins read journey events"
ON public.journey_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
