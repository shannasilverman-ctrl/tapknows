ALTER TABLE public.user_prefs
  ADD COLUMN IF NOT EXISTS priority_preset text,
  ADD COLUMN IF NOT EXISTS priority_values jsonb,
  ADD COLUMN IF NOT EXISTS recovered_entries jsonb,
  ADD COLUMN IF NOT EXISTS first_decide_at timestamptz;