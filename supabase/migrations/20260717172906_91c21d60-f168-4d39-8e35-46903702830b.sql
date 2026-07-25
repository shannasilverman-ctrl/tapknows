
ALTER TABLE public.user_plaid_items
  ADD COLUMN IF NOT EXISTS needs_attention_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS webhook_code_last text,
  ADD COLUMN IF NOT EXISTS error_last text;
