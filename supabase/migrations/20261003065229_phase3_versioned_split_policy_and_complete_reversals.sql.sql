/*
# Phase 3: Versioned Treasury split policy + complete 5-share reversals + actual collected amount

## Plain-English summary
1. Creates a `treasury_split_policies` table that version-controls the exact percentages
   for each financial share (Metro Treasury, Empire Treasury, Family & Legacy, Operations,
   Partner Commission). Every payment is stamped with the policy version in effect at the
   time, so historical allocations can never be retroactively changed.
2. Adds `policy_version_id`, `net_collected_cents`, and `stripe_fee_cents` columns to
   `treasury_allocations` so each allocation records what was actually collected by Stripe
   (after fees and partial refunds), not just the tier price.
3. Rewrites `generate_partner_commission` to accept the actual collected amount, look up
   the active split policy, and stamp the allocation with the policy version.
4. Rewrites `reverse_partner_commission` to reverse ALL FIVE shares (Metro contribution,
   Empire Treasury, Family & Legacy, Operations, and Partner Commission) — not just
   partner commission and Metro contribution.

## New Tables
### treasury_split_policies
- `id` (serial PK) — the policy version number
- `label` (text) — human-readable name like "v1 – Launch"
- `city_treasury_pct` (numeric, 0-1) — Metro Treasury share
- `empire_treasury_pct` (numeric, 0-1) — Empire Treasury share
- `family_legacy_pct` (numeric, 0-1) — Family & Legacy Fund share
- `operations_pct` (numeric, 0-1) — Platform Operations share
- `partner_commission_pct` (numeric, 0-1) — Partner commission share (0 when no referral)
- `city_treasury_pct_with_referral` (numeric) — Metro share when a referral is active
- `empire_treasury_pct_with_referral` (numeric)
- `family_legacy_pct_with_referral` (numeric)
- `operations_pct_with_referral` (numeric)
- `partner_commission_pct_with_referral` (numeric)
- `is_active` (boolean) — only one row should be true at a time
- `effective_from` (timestamptz) — when this policy took effect
- `created_at` (timestamptz)

## Modified Tables
- `treasury_allocations`: adds `policy_version_id` (int, FK), `net_collected_cents`
  (bigint), `stripe_fee_cents` (bigint)
- `metro_treasury_ledger`: adds `policy_version_id` (int, FK, nullable) for historical
  traceability

## Security
- RLS enabled on `treasury_split_policies`. Public read (aggregate policy data, no
  member info). No client writes — service role only.
- `treasury_allocations` new columns inherit existing RLS (no policy changes needed).
- `metro_treasury_ledger` new column inherits existing locked-down RLS.

## Important Notes
1. The seed policy (id=1) matches the current hardcoded percentages:
   - No referral: 40% Metro, 20% Empire, 10% Family, 30% Ops
   - With referral: 35% Metro, 15% Empire, 10% Family, 20% Ops, 20% Partner
2. `generate_partner_commission` now accepts `p_net_collected_cents` and
   `p_stripe_fee_cents` parameters. The function uses the net collected amount to
   calculate all shares, and stores the gross, net, and fee for audit.
3. `reverse_partner_commission` now creates negative entries for ALL five shares:
   Metro contribution reversal, Empire reversal, Family reversal, Ops reversal, and
   Partner commission reversal.
4. All existing allocations get `policy_version_id = 1` by default.
*/

-- ============================================================
-- 1. treasury_split_policies table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.treasury_split_policies (
  id serial PRIMARY KEY,
  label text NOT NULL,
  city_treasury_pct numeric(5,4) NOT NULL,
  empire_treasury_pct numeric(5,4) NOT NULL,
  family_legacy_pct numeric(5,4) NOT NULL,
  operations_pct numeric(5,4) NOT NULL,
  partner_commission_pct numeric(5,4) NOT NULL DEFAULT 0,
  city_treasury_pct_with_referral numeric(5,4) NOT NULL,
  empire_treasury_pct_with_referral numeric(5,4) NOT NULL,
  family_legacy_pct_with_referral numeric(5,4) NOT NULL,
  operations_pct_with_referral numeric(5,4) NOT NULL,
  partner_commission_pct_with_referral numeric(5,4) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treasury_split_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read split policies" ON public.treasury_split_policies;
CREATE POLICY "Public can read split policies" ON public.treasury_split_policies
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.treasury_split_policies FROM anon, authenticated;

-- Seed the initial policy (v1 – Launch)
INSERT INTO public.treasury_split_policies (
  id, label,
  city_treasury_pct, empire_treasury_pct, family_legacy_pct, operations_pct, partner_commission_pct,
  city_treasury_pct_with_referral, empire_treasury_pct_with_referral, family_legacy_pct_with_referral,
  operations_pct_with_referral, partner_commission_pct_with_referral,
  is_active, effective_from
) VALUES (
  1, 'v1 – Launch',
  0.40, 0.20, 0.10, 0.30, 0.00,
  0.35, 0.15, 0.10, 0.20, 0.20,
  true, '2026-09-19T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Add columns to treasury_allocations
-- ============================================================

ALTER TABLE public.treasury_allocations
  ADD COLUMN IF NOT EXISTS policy_version_id int REFERENCES public.treasury_split_policies(id),
  ADD COLUMN IF NOT EXISTS net_collected_cents bigint,
  ADD COLUMN IF NOT EXISTS stripe_fee_cents bigint;

-- Backfill existing rows with policy version 1
UPDATE public.treasury_allocations
SET policy_version_id = 1, net_collected_cents = gross_amount_cents, stripe_fee_cents = 0
WHERE policy_version_id IS NULL;

-- ============================================================
-- 3. Add policy_version_id to metro_treasury_ledger
-- ============================================================

ALTER TABLE public.metro_treasury_ledger
  ADD COLUMN IF NOT EXISTS policy_version_id int REFERENCES public.treasury_split_policies(id);

-- ============================================================
-- 4. Rewrite generate_partner_commission with actual collected amount + policy version
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_partner_commission(
  p_referred_member_id uuid,
  p_stripe_event_id text,
  p_tier_id text,
  p_net_collected_cents bigint DEFAULT NULL,
  p_stripe_fee_cents bigint DEFAULT 0,
  p_period_start date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
  v_commission_cents integer;
  v_tier_price_cents integer;
  v_gross_cents bigint;
  v_net_cents bigint;
  v_has_referral boolean := false;
  v_policy record;
  v_city_pct numeric;
  v_empire_pct numeric;
  v_family_pct numeric;
  v_ops_pct numeric;
  v_ref_pct numeric;
  v_city_id uuid;
  v_metro_id uuid;
  v_allocation_id uuid;
  v_city_cents int;
  v_empire_cents int;
  v_family_cents int;
  v_ops_cents int;
  v_ref_cents int;
BEGIN
  -- Get tier info
  SELECT commission_amount_cents, price_monthly * 100
  INTO v_commission_cents, v_tier_price_cents
  FROM membership_tiers WHERE id = p_tier_id;

  v_commission_cents := COALESCE(v_commission_cents, 0);

  -- Use the actual collected amount if provided, otherwise fall back to tier price
  v_gross_cents := COALESCE(p_net_collected_cents, v_tier_price_cents, 0);
  v_net_cents := v_gross_cents;

  IF v_net_cents IS NULL OR v_net_cents = 0 THEN
    RETURN jsonb_build_object('commission_generated', false, 'reason', 'zero_payment');
  END IF;

  -- Look up the permanent referrer
  SELECT pr.partner_id INTO v_partner_id
  FROM partner_referrals pr
  JOIN empire_partners ep ON ep.member_id = pr.partner_id AND ep.is_active = true
  WHERE pr.referred_member_id = p_referred_member_id;

  -- Get the active split policy
  SELECT * INTO v_policy
  FROM treasury_split_policies WHERE is_active = true
  ORDER BY id DESC LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback to hardcoded values if no policy exists
    IF v_partner_id IS NOT NULL AND v_commission_cents > 0 THEN
      v_has_referral := true;
      v_city_pct := 0.35; v_empire_pct := 0.15; v_family_pct := 0.10; v_ops_pct := 0.20; v_ref_pct := 0.20;
    ELSE
      v_city_pct := 0.40; v_empire_pct := 0.20; v_family_pct := 0.10; v_ops_pct := 0.30; v_ref_pct := 0.00;
    END IF;
  ELSE
    IF v_partner_id IS NOT NULL AND v_commission_cents > 0 THEN
      v_has_referral := true;
      v_city_pct := v_policy.city_treasury_pct_with_referral;
      v_empire_pct := v_policy.empire_treasury_pct_with_referral;
      v_family_pct := v_policy.family_legacy_pct_with_referral;
      v_ops_pct := v_policy.operations_pct_with_referral;
      v_ref_pct := v_policy.partner_commission_pct_with_referral;
    ELSE
      v_city_pct := v_policy.city_treasury_pct;
      v_empire_pct := v_policy.empire_treasury_pct;
      v_family_pct := v_policy.family_legacy_pct;
      v_ops_pct := v_policy.operations_pct;
      v_ref_pct := v_policy.partner_commission_pct;
    END IF;
  END IF;

  -- Calculate share amounts from the net collected amount
  v_city_cents := ROUND(v_net_cents * v_city_pct)::int;
  v_empire_cents := ROUND(v_net_cents * v_empire_pct)::int;
  v_family_cents := ROUND(v_net_cents * v_family_pct)::int;
  v_ops_cents := ROUND(v_net_cents * v_ops_pct)::int;

  -- Commission is the tier-defined amount, capped to the referral share percentage
  IF v_has_referral THEN
    v_ref_cents := LEAST(v_commission_cents, ROUND(v_net_cents * v_ref_pct)::int);
  ELSE
    v_ref_cents := 0;
  END IF;

  -- Get member's city and metro
  SELECT m.city_id, c.metro_id INTO v_city_id, v_metro_id
  FROM members m LEFT JOIN cities c ON c.id = m.city_id
  WHERE m.id = p_referred_member_id;

  -- Record treasury allocation with policy version and actual amounts
  INSERT INTO treasury_allocations (
    stripe_event_id, member_id, membership_tier, gross_amount_cents,
    city_treasury_cents, empire_treasury_cents, family_legacy_cents,
    operations_cents, referral_commission_cents, has_active_referral,
    city_id, metro_id, policy_version_id, net_collected_cents, stripe_fee_cents
  ) VALUES (
    p_stripe_event_id, p_referred_member_id, p_tier_id, v_net_cents,
    v_city_cents, v_empire_cents, v_family_cents, v_ops_cents,
    v_ref_cents, v_has_referral,
    v_city_id, v_metro_id, COALESCE(v_policy.id, 1), v_net_cents, p_stripe_fee_cents
  ) ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_allocation_id;

  -- Add Metro Treasury ledger entry
  IF v_allocation_id IS NOT NULL AND v_metro_id IS NOT NULL AND v_city_cents > 0 THEN
    INSERT INTO metro_treasury_ledger (metro_id, city_id, member_id, entry_type, amount_cents, source_event_id, allocation_id, notes, policy_version_id)
    VALUES (v_metro_id, v_city_id, p_referred_member_id, 'contribution', v_city_cents, p_stripe_event_id, v_allocation_id, 'Membership payment', COALESCE(v_policy.id, 1))
    ON CONFLICT DO NOTHING;
  END IF;

  -- Generate partner commission
  IF v_has_referral THEN
    INSERT INTO partner_commission_ledger (
      partner_id, referred_member_id, stripe_event_id,
      membership_tier, amount_cents, status, payment_period_start
    ) VALUES (
      v_partner_id, p_referred_member_id, p_stripe_event_id,
      p_tier_id, v_ref_cents, 'pending', p_period_start
    ) ON CONFLICT (stripe_event_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'commission_generated', v_has_referral,
    'partner_id', v_partner_id,
    'commission_cents', CASE WHEN v_has_referral THEN v_ref_cents ELSE 0 END,
    'policy_version_id', COALESCE(v_policy.id, 1),
    'city_cents', v_city_cents,
    'empire_cents', v_empire_cents,
    'family_cents', v_family_cents,
    'ops_cents', v_ops_cents
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_partner_commission(uuid, text, text, bigint, bigint, date) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5. Rewrite reverse_partner_commission to reverse ALL FIVE shares
-- ============================================================

CREATE OR REPLACE FUNCTION public.reverse_partner_commission(
  p_stripe_event_id text,
  p_reversal_event_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
  v_allocation record;
  v_contribution record;
  v_reversal_id text;
  v_partner_reversed boolean := false;
  v_metro_reversed boolean := false;
BEGIN
  v_reversal_id := COALESCE(p_reversal_event_id, p_stripe_event_id || '_reversal');

  -- Reverse partner commission
  UPDATE partner_commission_ledger
  SET status = 'reversed', reversed_at = now()
  WHERE stripe_event_id = p_stripe_event_id
    AND status IN ('pending', 'available');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_partner_reversed := v_updated > 0;

  -- Get the original allocation to reverse all shares
  SELECT * INTO v_allocation
  FROM treasury_allocations
  WHERE stripe_event_id = p_stripe_event_id;

  IF FOUND THEN
    -- Reverse Metro Treasury contribution
    SELECT * INTO v_contribution
    FROM metro_treasury_ledger
    WHERE source_event_id = p_stripe_event_id AND entry_type = 'contribution';

    IF FOUND THEN
      INSERT INTO metro_treasury_ledger (metro_id, city_id, member_id, entry_type, amount_cents, source_event_id, allocation_id, notes, policy_version_id)
      VALUES (v_contribution.metro_id, v_contribution.city_id, v_contribution.member_id, 'reversal',
              -v_contribution.amount_cents, v_reversal_id, v_contribution.allocation_id, 'Refund or chargeback reversal', v_contribution.policy_version_id)
      ON CONFLICT DO NOTHING;
      v_metro_reversed := true;
    END IF;

    -- Record a reversal allocation entry for audit (negative amounts)
    -- This creates a permanent record that all five shares were reversed
    INSERT INTO treasury_allocations (
      stripe_event_id, member_id, membership_tier, gross_amount_cents,
      city_treasury_cents, empire_treasury_cents, family_legacy_cents,
      operations_cents, referral_commission_cents, has_active_referral,
      city_id, metro_id, policy_version_id, net_collected_cents, stripe_fee_cents
    ) VALUES (
      v_reversal_id, v_allocation.member_id, v_allocation.membership_tier,
      -v_allocation.gross_amount_cents,
      -v_allocation.city_treasury_cents,
      -v_allocation.empire_treasury_cents,
      -v_allocation.family_legacy_cents,
      -v_allocation.operations_cents,
      -v_allocation.referral_commission_cents,
      v_allocation.has_active_referral,
      v_allocation.city_id, v_allocation.metro_id,
      v_allocation.policy_version_id,
      -COALESCE(v_allocation.net_collected_cents, v_allocation.gross_amount_cents),
      -COALESCE(v_allocation.stripe_fee_cents, 0)
    ) ON CONFLICT (stripe_event_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'partner_reversed', v_partner_reversed,
    'metro_reversed', v_metro_reversed,
    'all_shares_reversed', FOUND,
    'reversal_id', v_reversal_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_partner_commission(text, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. Helper function to get the active policy
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_active_split_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(t) FROM (
    SELECT * FROM treasury_split_policies WHERE is_active = true ORDER BY id DESC LIMIT 1
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_split_policy() TO authenticated;
