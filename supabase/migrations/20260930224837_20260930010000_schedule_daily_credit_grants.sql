/*
# Schedule Daily Voting Credit Grants via pg_cron

## Purpose
Schedules the `grant_monthly_voting_credits()` function to run daily at midnight UTC.
Each run grants credits only to members whose personal anniversary falls on that day.

## Changes
1. Schedules the daily job under the name 'voting_credits_daily_grant'.
2. The job calls `SELECT public.grant_monthly_voting_credits()` every day at 00:00 UTC.

## Important Notes
1. The function is idempotent — running it twice on the same day is safe.
2. pg_cron runs as the postgres superuser, which can execute SECURITY DEFINER
   functions regardless of grants.
*/

-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Schedule the daily credit grant at midnight UTC
SELECT cron.schedule(
  'voting_credits_daily_grant',
  '0 0 * * *',
  $$SELECT public.grant_monthly_voting_credits();$$
);