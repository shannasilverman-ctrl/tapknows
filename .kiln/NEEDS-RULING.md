# NEEDS RULING — deploy blocked

Written 2026-07-26 ~21:35 local by the overnight loop.

## The block

Shanna authorized: apply the additive journey-events migration to production
Supabase, then deploy to tapknows.com.

She ran `npx supabase login` successfully. **But the authenticated account does
not own the production database.**

- The app points at `https://mrbjmclcylbfynblejdn.supabase.co`
  (confirmed in `.env` → `SUPABASE_URL`, and `supabase/config.toml` →
  `project_id = "mrbjmclcylbfynblejdn"`).
- `supabase projects list` for the logged-in account returns exactly one
  project: `chqfqnqtrhrezegrovlg` ("shannasilverman@gmail.com's Project"),
  status **INACTIVE**.
- `mrbjmclcylbfynblejdn` is absent from that list.

So `supabase link --project-ref mrbjmclcylbfynblejdn` will fail: this account
has no access. Most likely the project was provisioned under a Lovable-owned
organization rather than her personal Supabase account.

## Consequence

**DO NOT DEPLOY.** The build creates
`supabase/migrations/20260726000000_2d1cfcbf-1f3f-4d91-9c3b-89a89c853498.sql`,
which creates the journey-events table. Deploying the worker without that table
existing in production is a guaranteed outage, not a risk.

The loop will still build, test, and commit to the branch. Only the deploy and
the migration are held.

## What Shanna needs to decide

1. **Log in as the account that owns `mrbjmclcylbfynblejdn`** — possibly via
   Lovable, or a different email / organization. Then the loop can link, apply,
   and deploy as authorized. OR
2. **Deploy in the morning by hand**, applying the migration herself where she
   can see it. OR
3. **Confirm the production project ref is something else** — if
   `mrbjmclcylbfynblejdn` is stale and prod actually runs elsewhere, the
   `.env` and `config.toml` both need correcting, which is its own change.

Never attempt to obtain, guess, or work around credentials.

## Also flagged

Disk fell from 4.7 GB to 2.7 GB free during the build (Playwright cache 831 MB,
node_modules 569 MB). Loop holds at 2 GB.
