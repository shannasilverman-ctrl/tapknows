
ALTER TABLE public.user_plaid_items
  ADD COLUMN IF NOT EXISTS new_accounts_at timestamp with time zone;
