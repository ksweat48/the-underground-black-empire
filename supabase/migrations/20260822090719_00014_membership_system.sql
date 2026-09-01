/*
# Membership System — Tiers, Voting Credits, Legacy Fund

1. Overview
   Adds a monthly membership system to The Underground Black Empire.
   Members choose a membership tier (White, Black, Black+, Emerald, Plum).
   Each tier provides benefits and monthly voting credits.
   Membership is separate from Empire Level (which is earned through XP).
   Paid memberships do NOT award XP.

2. New Tables
   - `membership_tiers` — reference table defining the 5 tiers with price, voting credits, labels, and card color family.
   - `voting_credits` — tracks each member's current voting credit balance.
   - `legacy_fund` — stores the total legacy fund reserve for display.

3. Modified Tables
   - `members` — adds `membership_tier` column (text, defaults to 'white') and `membership_started_at` (timestamptz, nullable).

4. Security
   - RLS enabled on all new tables.
   - Members can read their own voting credits and all membership tier definitions.
   - Membership tier definitions are public to authenticated users (read-only reference data).
   - Legacy fund data is readable by all authenticated users.
   - Members can insert/update their own voting credits row.
   - Members table: existing UPDATE policy already allows members to update their own row, which covers changing membership_tier.

5. Important Notes
   - Voting credits have no cash value, cannot be withdrawn, do not represent ownership or equity.
   - Paid memberships do NOT award XP.
   - Legacy Fund benefits are subject to qualification and available reserves — NOT guaranteed insurance.
*/

-- ============================================================
-- 1. Add membership columns to members table
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'white',
  ADD COLUMN IF NOT EXISTS membership_started_at timestamptz;

-- ============================================================
-- 2. Membership tiers reference table
-- ============================================================

CREATE TABLE IF NOT EXISTS membership_tiers (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  public_label text NOT NULL,
  price_monthly integer NOT NULL DEFAULT 0,
  voting_credits integer NOT NULL DEFAULT 0,
  card_color text NOT NULL,
  purpose text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE membership_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_membership_tiers" ON membership_tiers;
CREATE POLICY "read_membership_tiers" ON membership_tiers FOR SELECT
  TO authenticated USING (true);

INSERT INTO membership_tiers (id, display_name, public_label, price_monthly, voting_credits, card_color, purpose, sort_order) VALUES
  ('white',      'White',            'White Member',             0,  0,   'white',  'Participate',     1),
  ('black',      'Black',            'Black Member',             2,  10,  'black',  'Contribute',      2),
  ('black_plus', 'Black+',           'Black+ Active Member',      5,  30,  'black',  'Serve',           3),
  ('emerald',    'Emerald',          'Emerald Family Member',    10,  75,  'emerald','Protect Family',  4),
  ('plum',       'Plum',             'Plum Legacy Member',       15, 125,  'plum',   'Build Legacy',    5)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  public_label = EXCLUDED.public_label,
  price_monthly = EXCLUDED.price_monthly,
  voting_credits = EXCLUDED.voting_credits,
  card_color = EXCLUDED.card_color,
  purpose = EXCLUDED.purpose,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 3. Voting credits table
-- ============================================================

CREATE TABLE IF NOT EXISTS voting_credits (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  last_reset_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE voting_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_voting_credits" ON voting_credits;
CREATE POLICY "select_own_voting_credits" ON voting_credits FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "update_own_voting_credits" ON voting_credits;
CREATE POLICY "update_own_voting_credits" ON voting_credits FOR UPDATE
  TO authenticated USING (auth.uid() = member_id) WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "insert_own_voting_credits" ON voting_credits;
CREATE POLICY "insert_own_voting_credits" ON voting_credits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

-- ============================================================
-- 4. Legacy fund table
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_fund (
  id integer PRIMARY KEY DEFAULT 1,
  total_reserve numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE legacy_fund ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_legacy_fund" ON legacy_fund;
CREATE POLICY "read_legacy_fund" ON legacy_fund FOR SELECT
  TO authenticated USING (true);

INSERT INTO legacy_fund (id, total_reserve) VALUES (1, 487000)
ON CONFLICT (id) DO UPDATE SET total_reserve = EXCLUDED.total_reserve;