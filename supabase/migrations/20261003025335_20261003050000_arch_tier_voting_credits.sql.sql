/*
# Give Arch Tiers Voting Credits — All Black Card Pro Benefits

## Purpose
The user decided that Arch Member and Arch Pro Member should have all the voting
benefits of Black Card Pro — specifically 25 monthly voting credits each.  Until now
both Arch tiers had 0 voting credits, which blocked them from voting on Metro
Initiatives even though they pay the highest membership price.

## Changes
- `membership_tiers`: update `voting_credits` for the `arch` and `arch_pro` rows
  from 0 to 25, matching `black_pro`.
- No new tables, columns, or policy changes.

## Important Notes
1. Existing Arch-tier members who already have a `voting_credits` row will receive
   their 25 credits on their next monthly anniversary grant run (the daily pg_cron
   job `grant_monthly_voting_credits` reads the updated tier value).
2. New Arch-tier members get 25 credits immediately on checkout via
   `grant_initial_voting_credits`, which also reads from `membership_tiers`.
3. This is idempotent — re-running just sets the same value again.
*/

UPDATE membership_tiers
  SET voting_credits = 25
  WHERE id IN ('arch', 'arch_pro');

UPDATE membership_tiers
  SET voting_credits = 25
  WHERE id IN ('arch', 'arch_pro');
