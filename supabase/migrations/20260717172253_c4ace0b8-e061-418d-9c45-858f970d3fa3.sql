
ALTER TABLE public.user_prefs
  ADD COLUMN IF NOT EXISTS plaid_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS plaid_top_merchants jsonb;

ALTER TABLE public.user_cards
  ADD COLUMN IF NOT EXISTS plaid_account_id text,
  ADD COLUMN IF NOT EXISTS plaid_item_id text,
  ADD COLUMN IF NOT EXISTS mask text;

CREATE INDEX IF NOT EXISTS idx_user_cards_plaid_account
  ON public.user_cards(user_id, plaid_account_id)
  WHERE plaid_account_id IS NOT NULL;
