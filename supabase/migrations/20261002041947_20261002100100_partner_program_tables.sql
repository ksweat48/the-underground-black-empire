/*
# Empire Partner Program — Tables and Attribution

## Purpose
Creates the database structure for the Empire Partner referral commission program.
Partners earn recurring monthly commissions from members they personally refer.
Attribution is permanent: the first valid referrer owns the relationship forever.

## New Tables

### empire_partners
- `member_id` (uuid, PK, FK->members) — the partner
- `stripe_connect_account_id` (text, nullable) — their Stripe Connect Express account
- `stripe_connect_status` (text, default 'not_started') — onboarding status
- `is_active` (boolean, default true) — whether the partner account is active
- `joined_at` (timestamptz) — when they joined the program
- `created_at`, `updated_at` (timestamptz)

### partner_referrals
- `id` (uuid, PK)
- `partner_id` (uuid, FK->empire_partners) — the referring partner
- `referred_member_id` (uuid, FK->members, UNIQUE) — each member can only have one partner referrer
- `referral_code` (text) — the code used at signup
- `attributed_at` (timestamptz) — when the attribution was locked in
- `created_at` (timestamptz)

### partner_commission_ledger
- `id` (uuid, PK)
- `partner_id` (uuid, FK->empire_partners) — who earns the commission
- `referred_member_id` (uuid, FK->members) — whose payment triggered it
- `stripe_event_id` (text, UNIQUE) — prevents duplicate commissions
- `membership_tier` (text) — the tier at the time of the payment
- `amount_cents` (integer) — commission amount in cents
- `status` (text) — 'pending', 'available', 'reversed', 'paid'
- `payment_period_start` (date) — the billing period this commission covers
- `available_at` (timestamptz, nullable) — when it moved to available
- `reversed_at` (timestamptz, nullable) — when it was reversed
- `paid_at` (timestamptz, nullable) — when it was paid out
- `payout_id` (uuid, nullable, FK->partner_payouts) — which payout included it
- `created_at` (timestamptz)

### partner_payouts
- `id` (uuid, PK)
- `partner_id` (uuid, FK->empire_partners) — who is being paid
- `gross_amount_cents` (integer) — total available amount
- `fee_cents` (integer) — 3% processing fee
- `net_amount_cents` (integer) — final amount received
- `status` (text) — 'requested', 'processing', 'completed', 'failed'
- `stripe_transfer_id` (text, nullable) — Stripe Connect transfer ID
- `requested_at` (timestamptz)
- `completed_at` (timestamptz, nullable)
- `created_at` (timestamptz)

### treasury_allocations
- `id` (uuid, PK)
- `stripe_event_id` (text, UNIQUE) — one allocation per payment event
- `member_id` (uuid, FK->members) — the paying member
- `membership_tier` (text) — tier at time of payment
- `gross_amount_cents` (integer) — total payment amount
- `city_treasury_cents` (integer)
- `empire_treasury_cents` (integer)
- `family_legacy_cents` (integer)
- `operations_cents` (integer)
- `referral_commission_cents` (integer, default 0) — zero if no active referral
- `has_active_referral` (boolean) — whether a partner commission was generated
- `created_at` (timestamptz)

## Security
- RLS enabled on all new tables.
- Partners can read their own partner record, referrals, commissions, and payouts.
- No client-side INSERT/UPDATE/DELETE on financial tables — all writes go through
  SECURITY DEFINER functions or service-role edge functions.
- Treasury allocations are admin-readable only (service role).

## Important Notes
1. partner_referrals has a UNIQUE constraint on referred_member_id — each member
   can only be referred by one partner, ever.
2. partner_commission_ledger has a UNIQUE constraint on stripe_event_id — duplicate
   Stripe webhook deliveries cannot create duplicate commissions.
3. All money amounts are stored as integer cents, never floating point.
4. The partner program is free to join and completely separate from paid membership.
*/

-- ============================================================
-- 1. empire_partners
-- ============================================================

CREATE TABLE IF NOT EXISTS empire_partners (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  stripe_connect_account_id text,
  stripe_connect_status text NOT NULL DEFAULT 'not_started'
    CHECK (stripe_connect_status IN ('not_started', 'onboarding', 'verified', 'restricted')),
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE empire_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_partner" ON empire_partners;
CREATE POLICY "select_own_partner" ON empire_partners FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "insert_own_partner" ON empire_partners;
CREATE POLICY "insert_own_partner" ON empire_partners FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

-- ============================================================
-- 2. partner_referrals
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES empire_partners(member_id) ON DELETE CASCADE,
  referred_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_member_id)
);

ALTER TABLE partner_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_partner_referrals" ON partner_referrals;
CREATE POLICY "select_own_partner_referrals" ON partner_referrals FOR SELECT
  TO authenticated USING (auth.uid() = partner_id);

CREATE INDEX IF NOT EXISTS idx_partner_referrals_partner ON partner_referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_referred ON partner_referrals(referred_member_id);

-- ============================================================
-- 3. partner_payouts (created before ledger for FK)
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES empire_partners(member_id) ON DELETE CASCADE,
  gross_amount_cents integer NOT NULL CHECK (gross_amount_cents > 0),
  fee_cents integer NOT NULL CHECK (fee_cents >= 0),
  net_amount_cents integer NOT NULL CHECK (net_amount_cents > 0),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'processing', 'completed', 'failed')),
  stripe_transfer_id text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payouts" ON partner_payouts;
CREATE POLICY "select_own_payouts" ON partner_payouts FOR SELECT
  TO authenticated USING (auth.uid() = partner_id);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner ON partner_payouts(partner_id);

-- ============================================================
-- 4. partner_commission_ledger
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES empire_partners(member_id) ON DELETE CASCADE,
  referred_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  stripe_event_id text UNIQUE NOT NULL,
  membership_tier text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'reversed', 'paid')),
  payment_period_start date,
  available_at timestamptz,
  reversed_at timestamptz,
  paid_at timestamptz,
  payout_id uuid REFERENCES partner_payouts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_commission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_commissions" ON partner_commission_ledger;
CREATE POLICY "select_own_commissions" ON partner_commission_ledger FOR SELECT
  TO authenticated USING (auth.uid() = partner_id);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_partner ON partner_commission_ledger(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_referred ON partner_commission_ledger(referred_member_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_stripe_event ON partner_commission_ledger(stripe_event_id);

-- ============================================================
-- 5. treasury_allocations
-- ============================================================

CREATE TABLE IF NOT EXISTS treasury_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_tier text NOT NULL,
  gross_amount_cents integer NOT NULL,
  city_treasury_cents integer NOT NULL,
  empire_treasury_cents integer NOT NULL,
  family_legacy_cents integer NOT NULL,
  operations_cents integer NOT NULL,
  referral_commission_cents integer NOT NULL DEFAULT 0,
  has_active_referral boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE treasury_allocations ENABLE ROW LEVEL SECURITY;

-- Treasury allocations are not visible to regular users — only service role
-- No SELECT policy for authenticated; admin queries use service role.
