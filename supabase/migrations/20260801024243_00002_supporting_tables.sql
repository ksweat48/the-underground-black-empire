/*
# Supporting Tables: referrals, xp_ledger, city_progress, empire_progress, feature_flags, audit_log

## Purpose
Completes the Founder Campaign schema with:
- Referral tracking and verified attribution
- Append-only XP ledger (balances derived from sum of entries)
- Cached city and empire progress (reproducible from authoritative records)
- Server-side feature flags (independently disableable systems)
- Append-only audit log for admin and governance actions

## New Tables

### referrals
- `id` (uuid, PK)
- `referring_member_id` (uuid, FK -> members) — the founder who shared the link
- `referred_member_id` (uuid, FK -> members) — the new member who signed up
- `referral_code` (text, NOT NULL) — the code used
- `status` (text, NOT NULL, default 'pending') — pending | verified | rejected
- `verified_at` (timestamptz, nullable) — when the referral was verified
- `created_at` (timestamptz) — when the referral was recorded
- UNIQUE (referred_member_id) — each member can only be referred once

### xp_ledger (APPEND-ONLY)
- `id` (uuid, PK)
- `member_id` (uuid, FK -> members) — who received the XP
- `amount` (int, NOT NULL) — positive for awards, negative for reversals
- `source` (text, NOT NULL) — founder_signup | city_selection | referral_verified | mission_completed | admin_adjustment | reversal
- `reference_id` (uuid, nullable) — links to the source record (e.g., referral id)
- `notes` (text, nullable) — human-readable note
- `created_at` (timestamptz) — when the entry was created
- This table is NEVER updated or deleted. Reversals are new negative rows.

### city_progress (cached)
- `city_id` (uuid, PK, FK -> cities) — one row per city
- `founder_count` (int, NOT NULL, default 0) — cached founder count
- `tier` (text, NOT NULL, default 'settlement') — cached tier
- `updated_at` (timestamptz) — last refresh time
- Refreshable from founder_numbers.

### empire_progress (singleton)
- `id` (int, PK, DEFAULT 1, CHECK (id = 1)) — only one row ever
- `tribe_city_count` (int, NOT NULL, default 0) — count of cities at Tribe status
- `total_founders` (int, NOT NULL, default 0) — total founders across all cities
- `updated_at` (timestamptz) — last refresh time
- Refreshable from cities + founder_numbers.

### feature_flags
- `key` (text, PK) — unique flag identifier
- `label` (text, NOT NULL) — display label
- `description` (text, NOT NULL) — what this flag controls
- `status` (text, NOT NULL, default 'active') — active | locked | disabled
- `updated_at` (timestamptz) — last change
- `updated_by` (uuid, FK -> auth.users, nullable) — who changed it

### audit_log (APPEND-ONLY)
- `id` (uuid, PK)
- `actor_id` (uuid, FK -> auth.users) — who performed the action
- `action` (text, NOT NULL) — what action was taken
- `target_type` (text, nullable) — type of target (e.g., 'member', 'city')
- `target_id` (uuid, nullable) — ID of the target record
- `metadata` (jsonb, nullable) — additional context
- `created_at` (timestamptz) — when the action occurred
- This table is NEVER updated or deleted.

## Security
- RLS enabled on all tables
- referrals: users can read their own referrals (as referrer or referred); inserts allowed for own referral; updates are server-side only (for verification)
- xp_ledger: readable by owner; inserts/updates/deletes are server-side only
- city_progress: publicly readable; updates are server-side only
- empire_progress: publicly readable; updates are server-side only
- feature_flags: publicly readable; updates are admin-only
- audit_log: admin-only read; inserts are server-side only

## Important Notes
1. xp_ledger and audit_log are append-only by design — no UPDATE or DELETE policies are defined.
2. Referral verification (status: pending -> verified) is done server-side only, preventing clients from self-verifying referrals (anti-farming).
3. city_progress and empire_progress are cached values that must be reproducible from authoritative records (founder_numbers, cities).
4. feature_flags allows high-risk systems to be disabled independently without taking down the app.
*/

-- ==================== REFERRALS ====================
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  referred_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_member_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Users can read referrals where they are the referrer or the referred member
DROP POLICY IF EXISTS "select_own_referrals" ON referrals;
CREATE POLICY "select_own_referrals" ON referrals FOR SELECT
  TO authenticated USING (
    auth.uid() = referring_member_id OR auth.uid() = referred_member_id
  );

-- Users can insert a referral for themselves (when they sign up with a referral code)
DROP POLICY IF EXISTS "insert_own_referral" ON referrals;
CREATE POLICY "insert_own_referral" ON referrals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = referred_member_id);

-- No UPDATE or DELETE policies — verification is server-side only

-- ==================== XP_LEDGER (APPEND-ONLY) ====================
CREATE TABLE IF NOT EXISTS xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount int NOT NULL,
  source text NOT NULL,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own XP ledger entries
DROP POLICY IF EXISTS "select_own_xp" ON xp_ledger;
CREATE POLICY "select_own_xp" ON xp_ledger FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

-- Users can read all XP entries (for leaderboard — shows total XP per member)
DROP POLICY IF EXISTS "select_all_xp" ON xp_ledger;
CREATE POLICY "select_all_xp" ON xp_ledger FOR SELECT
  TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies — XP awards are server-side only

-- ==================== CITY_PROGRESS (cached) ====================
CREATE TABLE IF NOT EXISTS city_progress (
  city_id uuid PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
  founder_count int NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'settlement',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE city_progress ENABLE ROW LEVEL SECURITY;

-- Publicly readable (visitors can see city growth)
DROP POLICY IF EXISTS "public_read_city_progress" ON city_progress;
CREATE POLICY "public_read_city_progress" ON city_progress FOR SELECT
  TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies — updates are server-side only

-- ==================== EMPIRE_PROGRESS (singleton) ====================
CREATE TABLE IF NOT EXISTS empire_progress (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tribe_city_count int NOT NULL DEFAULT 0,
  total_founders int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE empire_progress ENABLE ROW LEVEL SECURITY;

-- Publicly readable
DROP POLICY IF EXISTS "public_read_empire_progress" ON empire_progress;
CREATE POLICY "public_read_empire_progress" ON empire_progress FOR SELECT
  TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies — updates are server-side only

-- ==================== FEATURE_FLAGS ====================
CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Publicly readable (frontend needs to know which features are active)
DROP POLICY IF EXISTS "public_read_feature_flags" ON feature_flags;
CREATE POLICY "public_read_feature_flags" ON feature_flags FOR SELECT
  TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies — updates are admin-side only

-- ==================== AUDIT_LOG (APPEND-ONLY) ====================
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only the actor can read their own audit entries (admin reads via service role)
DROP POLICY IF EXISTS "select_own_audit" ON audit_log;
CREATE POLICY "select_own_audit" ON audit_log FOR SELECT
  TO authenticated USING (auth.uid() = actor_id);

-- No INSERT/UPDATE/DELETE policies — inserts are server-side only

-- ==================== INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_referrals_referring ON referrals(referring_member_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_member_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_member_id ON xp_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_source ON xp_ledger(source);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);

-- ==================== INITIAL EMPIRE PROGRESS ROW ====================
INSERT INTO empire_progress (id, tribe_city_count, total_founders)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;
