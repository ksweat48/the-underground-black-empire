/*
# Partner Program Server Functions

## Purpose
Creates the SECURITY DEFINER functions that manage partner attribution, commission
generation, commission lifecycle, and payout requests. All financial mutations go
through these functions — the browser never writes to financial tables directly.

## New Functions

### join_partner_program()
- Lets any authenticated member join the free Empire Partner program.
- Creates an empire_partners row for auth.uid().
- Idempotent: returns the existing row if already a partner.
- EXECUTE granted to authenticated.

### claim_partner_referral(p_referred_member_id, p_referral_code)
- Called by the founder-onboarding edge function when a new member signs up
  with a referral code.
- Looks up which partner owns that referral_code.
- Atomically inserts into partner_referrals (UNIQUE on referred_member_id
  means the first valid referrer wins permanently).
- Self-referrals are rejected.
- EXECUTE granted to service_role only (called from edge functions).

### generate_partner_commission(p_referred_member_id, p_stripe_event_id, p_tier_id, p_period_start)
- Called by the Stripe webhook when a successful invoice.paid event arrives.
- Looks up the permanent referrer for the paying member.
- Looks up the commission_amount_cents for the tier.
- Inserts a pending commission into partner_commission_ledger.
- Duplicate stripe_event_id silently returns (idempotent).
- Returns the treasury allocation split.
- EXECUTE granted to service_role only.

### reverse_partner_commission(p_stripe_event_id)
- Called by the Stripe webhook on refund or chargeback.
- Marks the matching commission as 'reversed' with timestamp.
- Idempotent: if already reversed or no matching commission, no-op.
- EXECUTE granted to service_role only.

### get_partner_dashboard(p_partner_id)
- Returns a JSON summary: active_referrals, pending_cents, available_cents,
  lifetime_cents, paid_cents.
- EXECUTE granted to authenticated.

### request_partner_payout()
- Called by the payout edge function after Stripe Connect transfer succeeds.
- Validates the calling partner has >= $100 (10000 cents) in available balance.
- Creates a payout record and marks the matching available commissions as 'paid'.
- EXECUTE granted to service_role only (edge function handles Stripe transfer).

## Security
- All financial writes are service_role only.
- join_partner_program is the only function callable by authenticated users that
  writes to empire_partners.
- Column-level privileges on empire_partners prevent clients from changing
  stripe_connect_account_id or stripe_connect_status.

## Important Notes
1. claim_partner_referral uses INSERT ... ON CONFLICT DO NOTHING for atomic
   first-referrer-wins semantics.
2. generate_partner_commission uses ON CONFLICT (stripe_event_id) DO NOTHING
   to handle duplicate Stripe webhook deliveries.
3. All money is integer cents. No floating point anywhere.
*/

-- ============================================================
-- 1. join_partner_program
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_partner_program()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO empire_partners (member_id)
  VALUES (v_caller)
  ON CONFLICT (member_id) DO NOTHING;

  SELECT jsonb_build_object(
    'member_id', ep.member_id,
    'stripe_connect_status', ep.stripe_connect_status,
    'is_active', ep.is_active,
    'joined_at', ep.joined_at
  ) INTO v_result
  FROM empire_partners ep
  WHERE ep.member_id = v_caller;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_partner_program() FROM anon;
GRANT EXECUTE ON FUNCTION public.join_partner_program() TO authenticated;

-- ============================================================
-- 2. claim_partner_referral
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_partner_referral(
  p_referred_member_id uuid,
  p_referral_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_member_id uuid;
BEGIN
  -- Find which member owns this referral code
  SELECT id INTO v_partner_member_id
  FROM members
  WHERE referral_code = p_referral_code;

  IF v_partner_member_id IS NULL THEN
    RETURN false;
  END IF;

  -- Reject self-referrals
  IF v_partner_member_id = p_referred_member_id THEN
    RETURN false;
  END IF;

  -- Only attribute if the referrer is an active partner
  IF NOT EXISTS (
    SELECT 1 FROM empire_partners
    WHERE member_id = v_partner_member_id AND is_active = true
  ) THEN
    RETURN false;
  END IF;

  -- Atomic first-referrer-wins: UNIQUE on referred_member_id
  INSERT INTO partner_referrals (partner_id, referred_member_id, referral_code)
  VALUES (v_partner_member_id, p_referred_member_id, p_referral_code)
  ON CONFLICT (referred_member_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_partner_referral(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_partner_referral(uuid, text) FROM authenticated;

-- ============================================================
-- 3. generate_partner_commission
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_partner_commission(
  p_referred_member_id uuid,
  p_stripe_event_id text,
  p_tier_id text,
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
  v_gross_cents integer;
  v_has_referral boolean := false;
  v_city_pct numeric;
  v_empire_pct numeric;
  v_family_pct numeric;
  v_ops_pct numeric;
  v_ref_pct numeric;
BEGIN
  -- Look up commission amount for this tier
  SELECT commission_amount_cents INTO v_commission_cents
  FROM membership_tiers WHERE id = p_tier_id;

  IF v_commission_cents IS NULL THEN
    v_commission_cents := 0;
  END IF;

  -- Look up the permanent referrer
  SELECT pr.partner_id INTO v_partner_id
  FROM partner_referrals pr
  JOIN empire_partners ep ON ep.member_id = pr.partner_id AND ep.is_active = true
  WHERE pr.referred_member_id = p_referred_member_id;

  -- Get gross payment amount (tier price in cents)
  SELECT price_monthly * 100 INTO v_gross_cents
  FROM membership_tiers WHERE id = p_tier_id;

  IF v_gross_cents IS NULL OR v_gross_cents = 0 THEN
    RETURN jsonb_build_object('commission_generated', false, 'reason', 'free_tier');
  END IF;

  -- Determine allocation percentages
  IF v_partner_id IS NOT NULL AND v_commission_cents > 0 THEN
    v_has_referral := true;
    v_city_pct   := 0.35;
    v_empire_pct := 0.15;
    v_family_pct := 0.10;
    v_ops_pct    := 0.20;
    v_ref_pct    := 0.20;
  ELSE
    v_city_pct   := 0.40;
    v_empire_pct := 0.20;
    v_family_pct := 0.10;
    v_ops_pct    := 0.30;
    v_ref_pct    := 0.00;
  END IF;

  -- Record treasury allocation (idempotent via stripe_event_id UNIQUE)
  INSERT INTO treasury_allocations (
    stripe_event_id, member_id, membership_tier, gross_amount_cents,
    city_treasury_cents, empire_treasury_cents, family_legacy_cents,
    operations_cents, referral_commission_cents, has_active_referral
  ) VALUES (
    p_stripe_event_id, p_referred_member_id, p_tier_id, v_gross_cents,
    ROUND(v_gross_cents * v_city_pct)::int,
    ROUND(v_gross_cents * v_empire_pct)::int,
    ROUND(v_gross_cents * v_family_pct)::int,
    ROUND(v_gross_cents * v_ops_pct)::int,
    CASE WHEN v_has_referral THEN v_commission_cents ELSE 0 END,
    v_has_referral
  ) ON CONFLICT (stripe_event_id) DO NOTHING;

  -- Generate commission if there is an active referrer
  IF v_has_referral THEN
    INSERT INTO partner_commission_ledger (
      partner_id, referred_member_id, stripe_event_id,
      membership_tier, amount_cents, status, payment_period_start
    ) VALUES (
      v_partner_id, p_referred_member_id, p_stripe_event_id,
      p_tier_id, v_commission_cents, 'pending', p_period_start
    ) ON CONFLICT (stripe_event_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'commission_generated', v_has_referral,
    'partner_id', v_partner_id,
    'commission_cents', CASE WHEN v_has_referral THEN v_commission_cents ELSE 0 END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_partner_commission(uuid, text, text, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_partner_commission(uuid, text, text, date) FROM authenticated;

-- ============================================================
-- 4. reverse_partner_commission
-- ============================================================

CREATE OR REPLACE FUNCTION public.reverse_partner_commission(
  p_stripe_event_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE partner_commission_ledger
  SET status = 'reversed', reversed_at = now()
  WHERE stripe_event_id = p_stripe_event_id
    AND status IN ('pending', 'available');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_partner_commission(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_partner_commission(text) FROM authenticated;

-- ============================================================
-- 5. get_partner_dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_partner_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_pending_cents bigint;
  v_available_cents bigint;
  v_paid_cents bigint;
  v_lifetime_cents bigint;
  v_active_referrals integer;
  v_partner_exists boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(SELECT 1 FROM empire_partners WHERE member_id = v_caller)
    INTO v_partner_exists;

  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object('is_partner', false);
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'available' THEN amount_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status IN ('available', 'paid', 'pending') THEN amount_cents ELSE 0 END), 0)
  INTO v_pending_cents, v_available_cents, v_paid_cents, v_lifetime_cents
  FROM partner_commission_ledger
  WHERE partner_id = v_caller;

  SELECT COUNT(DISTINCT pr.referred_member_id)
  INTO v_active_referrals
  FROM partner_referrals pr
  JOIN members m ON m.id = pr.referred_member_id
  WHERE pr.partner_id = v_caller
    AND m.membership_tier <> 'white';

  RETURN jsonb_build_object(
    'is_partner', true,
    'active_referrals', v_active_referrals,
    'pending_cents', v_pending_cents,
    'available_cents', v_available_cents,
    'paid_cents', v_paid_cents,
    'lifetime_cents', v_lifetime_cents
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_partner_dashboard() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_partner_dashboard() TO authenticated;

-- ============================================================
-- 6. request_partner_payout (called by edge function after transfer)
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_partner_payout(
  p_partner_id uuid,
  p_stripe_transfer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available_cents bigint;
  v_fee_cents integer;
  v_net_cents integer;
  v_payout_id uuid;
BEGIN
  -- Calculate available balance
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_available_cents
  FROM partner_commission_ledger
  WHERE partner_id = p_partner_id AND status = 'available';

  IF v_available_cents < 10000 THEN
    RAISE EXCEPTION 'Minimum payout balance is $100. Current available: $%', (v_available_cents / 100.0)::numeric(10,2);
  END IF;

  -- Calculate fee (3%)
  v_fee_cents := ROUND(v_available_cents * 0.03)::int;
  v_net_cents := v_available_cents::int - v_fee_cents;

  -- Create payout record
  INSERT INTO partner_payouts (partner_id, gross_amount_cents, fee_cents, net_amount_cents, status, stripe_transfer_id)
  VALUES (p_partner_id, v_available_cents::int, v_fee_cents, v_net_cents, 'processing', p_stripe_transfer_id)
  RETURNING id INTO v_payout_id;

  -- Mark all available commissions as paid
  UPDATE partner_commission_ledger
  SET status = 'paid', paid_at = now(), payout_id = v_payout_id
  WHERE partner_id = p_partner_id AND status = 'available';

  RETURN jsonb_build_object(
    'payout_id', v_payout_id,
    'gross_cents', v_available_cents,
    'fee_cents', v_fee_cents,
    'net_cents', v_net_cents
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_partner_payout(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_partner_payout(uuid, text) FROM authenticated;

-- ============================================================
-- 7. Lock down financial columns on empire_partners
-- ============================================================

REVOKE UPDATE ON empire_partners FROM authenticated;
GRANT UPDATE (is_active) ON empire_partners TO authenticated;

-- ============================================================
-- 8. Update change_membership_tier to handle new tier IDs
-- ============================================================

CREATE OR REPLACE FUNCTION public.change_membership_tier(target_tier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_tier_exists boolean;
  v_current_tier text;
  v_membership_started_at timestamptz;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(SELECT 1 FROM membership_tiers WHERE id = target_tier)
    INTO v_tier_exists;
  IF NOT v_tier_exists THEN
    RAISE EXCEPTION 'Invalid membership tier: %', target_tier;
  END IF;

  SELECT membership_tier, membership_started_at
    INTO v_current_tier, v_membership_started_at
  FROM members
  WHERE id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member record not found';
  END IF;

  IF v_current_tier = target_tier THEN
    RETURN target_tier;
  END IF;

  IF target_tier = 'white' THEN
    UPDATE members
      SET membership_tier = 'white',
          membership_started_at = NULL,
          stripe_subscription_status = 'canceled'
      WHERE id = caller_id;
  ELSE
    UPDATE members
      SET membership_tier = target_tier,
          membership_started_at = COALESCE(v_membership_started_at, now())
      WHERE id = caller_id;
  END IF;

  RETURN target_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_membership_tier(text) TO authenticated;
