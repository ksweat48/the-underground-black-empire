/*
# SSOT Data Migration — Reconcile Existing XP & Influence Ledger

## Purpose
Corrects existing XP entries to match the new SSOT reward values without
deleting legitimate participation history. Uses negative correction entries
to adjust totals, then backfills missing rewards.

## Corrections Applied
1. Signup XP: old 100 → new 10 (insert -90 correction per signup entry)
2. City selection XP: old 25 → new 10 (insert -15 correction per city entry)
3. Vote influence: old +1 → new +5 (insert +4 correction per existing vote influence)
4. Vote XP: old 0 → new +10 (insert +10 for existing vote records that got no XP)
5. Verified referral influence: normalize to +25 (insert correction entries)

## Idempotency
All correction entries use idempotency keys so re-running this migration
is safe and will not create duplicates.
*/

-- ============================================================
-- 1. CORRECT SIGNUP XP (100 → 10, correction = -90)
-- ============================================================

INSERT INTO xp_ledger (member_id, amount, source, event_type, idempotency_key, notes, reference_id)
SELECT
  x.member_id,
  -90,
  'migration_correction',
  'migration_correction',
  'migration:signup_correction:' || x.id::text,
  'Correcting signup XP from 100 to 10',
  x.id
FROM xp_ledger x
WHERE x.source IN ('founder_signup', 'member_signup')
  AND x.amount = 100
  AND NOT EXISTS (
    SELECT 1 FROM xp_ledger existing
    WHERE existing.idempotency_key = 'migration:signup_correction:' || x.id::text
  );

-- ============================================================
-- 2. CORRECT CITY SELECTION XP (25 → 10, correction = -15)
-- ============================================================

INSERT INTO xp_ledger (member_id, amount, source, event_type, idempotency_key, notes, reference_id)
SELECT
  x.member_id,
  -15,
  'migration_correction',
  'migration_correction',
  'migration:city_correction:' || x.id::text,
  'Correcting city selection XP from 25 to 10',
  x.id
FROM xp_ledger x
WHERE x.source = 'city_selection'
  AND x.amount = 25
  AND NOT EXISTS (
    SELECT 1 FROM xp_ledger existing
    WHERE existing.idempotency_key = 'migration:city_correction:' || x.id::text
  );

-- ============================================================
-- 3. BACKFILL VOTE XP (+10 per existing vote record)
-- ============================================================

INSERT INTO xp_ledger (member_id, amount, source, event_type, idempotency_key, notes, reference_id)
SELECT
  vr.member_id,
  10,
  'ballot_participation',
  'ballot_participation',
  'migration:vote_xp:' || vr.id::text,
  'Backfilling vote XP (+10 per ballot)',
  vr.vote_id
FROM vote_records vr
WHERE NOT EXISTS (
  SELECT 1 FROM xp_ledger existing
  WHERE existing.idempotency_key = 'migration:vote_xp:' || vr.id::text
);

-- Mark existing vote records as having received XP
UPDATE vote_records
SET xp_awarded = true
WHERE xp_awarded = false;

-- ============================================================
-- 4. CORRECT VOTE INFLUENCE (old +1 → new +5, correction = +4)
-- Only if there are existing influence entries from voting
-- ============================================================

INSERT INTO influence_ledger (member_id, amount, source, event_type, idempotency_key, notes, reference_id)
SELECT
  i.member_id,
  4,
  'migration_correction',
  'migration_correction',
  'migration:vote_influence:' || i.id::text,
  'Correcting vote influence from 1 to 5',
  i.reference_id
FROM influence_ledger i
WHERE i.source = 'vote_cast'
  AND i.amount = 1
  AND NOT EXISTS (
    SELECT 1 FROM influence_ledger existing
    WHERE existing.idempotency_key = 'migration:vote_influence:' || i.id::text
  );

-- ============================================================
-- 5. NORMALIZE VERIFIED REFERRAL INFLUENCE to +25
-- If any existing referral influence entries are not 25, correct them
-- ============================================================

INSERT INTO influence_ledger (member_id, amount, source, event_type, idempotency_key, notes, reference_id)
SELECT
  i.member_id,
  25 - i.amount,
  'migration_correction',
  'migration_correction',
  'migration:referral_influence:' || i.id::text,
  'Normalizing referral influence to 25',
  i.reference_id
FROM influence_ledger i
WHERE i.source = 'referral_verified'
  AND i.amount <> 25
  AND NOT EXISTS (
    SELECT 1 FROM influence_ledger existing
    WHERE existing.idempotency_key = 'migration:referral_influence:' || i.id::text
  );

-- ============================================================
-- 6. BACKFILL VERIFIED REFERRAL INFLUENCE
-- For referrals that are verified but have no influence entry
-- ============================================================

INSERT INTO influence_ledger (member_id, amount, source, event_type, idempotency_key, notes, reference_id)
SELECT
  r.referring_member_id,
  25,
  'verified_referral',
  'verified_referral',
  'migration:referral_backfill:' || r.id::text,
  'Backfilling verified referral influence (+25)',
  r.referred_member_id
FROM referrals r
WHERE r.status = 'verified'
  AND NOT EXISTS (
    SELECT 1 FROM influence_ledger existing
    WHERE existing.idempotency_key = 'migration:referral_backfill:' || r.id::text
  )
  AND NOT EXISTS (
    SELECT 1 FROM influence_ledger existing
    WHERE existing.source = 'verified_referral'
      AND existing.reference_id = r.referred_member_id
      AND existing.member_id = r.referring_member_id
  );
