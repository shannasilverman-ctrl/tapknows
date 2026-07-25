
-- Plaid data retention: nightly cleanup enforces 30-day cap on derived Plaid
-- aggregates. Raw Plaid transaction rows are never persisted; this job
-- resets stale top-merchant snapshots so they never outlive the 30-day window.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.enforce_plaid_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Any Plaid-derived aggregate older than 30 days is cleared.
  UPDATE public.user_prefs
  SET plaid_top_merchants = NULL,
      plaid_last_sync_at = NULL
  WHERE plaid_last_sync_at IS NOT NULL
    AND plaid_last_sync_at < now() - INTERVAL '30 days';
END;
$$;

-- Only allow service_role to invoke.
REVOKE ALL ON FUNCTION public.enforce_plaid_retention() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_plaid_retention() TO service_role;

-- Schedule daily at 03:15 UTC. cron.schedule is idempotent by name.
SELECT cron.unschedule('plaid-retention-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'plaid-retention-daily'
);
SELECT cron.schedule(
  'plaid-retention-daily',
  '15 3 * * *',
  $CRON$ SELECT public.enforce_plaid_retention(); $CRON$
);
