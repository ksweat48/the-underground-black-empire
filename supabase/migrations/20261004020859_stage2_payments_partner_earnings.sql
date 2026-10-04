/*
# Stage 2: Payments and Partner earnings

## Plain-English summary
Makes membership billing and Partner earnings follow the launch rules:
- A failed payment puts the member in "Past Due" with a 7-day grace period before dropping to White.
- Downgrades and cancellations happen at the end of the billing period and can be undone.
- Refunds reverse only the refunded amount, never twice.
- Partner earnings move Pending -> Available (after 7 days) -> Requested -> Processing -> Paid,
  with Failed payouts returning money to Available and refunds clawing back from Available
  (balance can go negative).
- Daily reconciliation compares real Stripe gross amounts and can be marked resolved by admins.

## Modified tables
1. members (system-managed columns, not writable by members)
   - past_due_since (timestamptz): when the current failed-payment period began
   - current_period_end (timestamptz): end of the current paid billing period
   - cancel_at_period_end (boolean): membership ends at period end unless undone
   - scheduled_tier (text): lower tier that starts at the next billing period
   - scheduled_previous_price_id (text): price to restore if the downgrade is undone
   - good_standing_since (timestamptz): start of continuous paid standing (not reset by grace)
2. partner_commission_ledger
   - status now also allows 'requested' and 'processing'
   - available_at defaults to 7 days after the commission was created
3. treasury_allocations
   - refunded_cents (bigint): running total refunded for that payment
4. stripe_reconciliation_runs: run date is compared using gross amounts

## New tables
- partner_balance_adjustments: negative (clawback) or positive corrections to a Partner balance
  - id, partner_id, commission_id, amount_cents, reason, source_event_id (unique), payout_id, created_at
  - RLS: Partners read their own; no client writes.

## New functions (system only unless noted)
- apply_payment_refund(original event, refund event, cumulative refunded cents)
- release_matured_partner_commissions() - daily
- process_past_due_memberships() - daily
- request_my_partner_payout() - signed-in Partner, own balance only
- start_partner_payout(payout) / complete_partner_payout(payout, transfer) / fail_partner_payout(payout, reason)
- get_payouts_for_processing() - Financial Admin
- resolve_reconciliation_run(run, notes) - Financial Admin
- get_partner_dashboard() - rewritten with all earnings states
- generate_partner_commission (6-arg) - stores real gross, Stripe fee, and net

## Security
- New table has RLS with own-row SELECT only.
- All money-moving functions are restricted to the system (service role) or checked roles.

## Notes
1. Existing pending commissions get available_at = created_at + 7 days.
2. Existing paid members get good_standing_since = membership_started_at.
*/

ALTER TABLE members ADD COLUMN IF NOT EXISTS past_due_since timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS scheduled_tier text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS scheduled_previous_price_id text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS good_standing_since timestamptz;

UPDATE members SET good_standing_since = membership_started_at
WHERE good_standing_since IS NULL AND membership_tier <> 'white' AND membership_started_at IS NOT NULL;

ALTER TABLE treasury_allocations ADD COLUMN IF NOT EXISTS refunded_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE partner_commission_ledger DROP CONSTRAINT IF EXISTS partner_commission_ledger_status_check;
ALTER TABLE partner_commission_ledger ADD CONSTRAINT partner_commission_ledger_status_check
  CHECK (status = ANY (ARRAY['pending','available','requested','processing','paid','reversed']));
ALTER TABLE partner_commission_ledger ALTER COLUMN available_at SET DEFAULT (now() + interval '7 days');
UPDATE partner_commission_ledger SET available_at = created_at + interval '7 days'
WHERE available_at IS NULL;

ALTER TABLE partner_payouts ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE partner_payouts ADD COLUMN IF NOT EXISTS processed_by uuid;

CREATE TABLE IF NOT EXISTS partner_balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES empire_partners(member_id),
  commission_id uuid REFERENCES partner_commission_ledger(id),
  amount_cents integer NOT NULL CHECK (amount_cents <> 0),
  reason text NOT NULL,
  source_event_id text UNIQUE,
  payout_id uuid REFERENCES partner_payouts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_balance_adjustments_partner_idx ON partner_balance_adjustments(partner_id);
ALTER TABLE partner_balance_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Partners read own adjustments" ON partner_balance_adjustments;
CREATE POLICY "Partners read own adjustments" ON partner_balance_adjustments FOR SELECT
  TO authenticated USING (partner_id = auth.uid());

-- Balance helper: adjustments tied to a fully reversed commission are ignored (the reversal already removed it).
CREATE OR REPLACE FUNCTION public.partner_open_adjustments_cents(p_partner_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(a.amount_cents), 0)
  FROM partner_balance_adjustments a
  LEFT JOIN partner_commission_ledger l ON l.id = a.commission_id
  WHERE a.partner_id = p_partner_id AND a.payout_id IS NULL
    AND (l.id IS NULL OR l.status <> 'reversed');
$$;
REVOKE EXECUTE ON FUNCTION public.partner_open_adjustments_cents(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_open_adjustments_cents(uuid) TO service_role;

-- Commission generation with real gross / fee / net.
CREATE OR REPLACE FUNCTION public.generate_partner_commission(
  p_referred_member_id uuid, p_stripe_event_id text, p_tier_id text,
  p_net_collected_cents bigint DEFAULT NULL, p_stripe_fee_cents bigint DEFAULT 0,
  p_period_start date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner_id uuid;
  v_commission_cents integer;
  v_tier_price_cents integer;
  v_fee bigint := GREATEST(COALESCE(p_stripe_fee_cents, 0), 0);
  v_net bigint;
  v_gross bigint;
  v_has_referral boolean := false;
  v_policy record;
  v_city_pct numeric; v_empire_pct numeric; v_family_pct numeric; v_ops_pct numeric; v_ref_pct numeric;
  v_city_id uuid; v_metro_id uuid; v_allocation_id uuid;
  v_city int; v_empire int; v_family int; v_ops int; v_ref int;
BEGIN
  SELECT commission_amount_cents, price_monthly * 100 INTO v_commission_cents, v_tier_price_cents
  FROM membership_tiers WHERE id = p_tier_id;
  v_commission_cents := COALESCE(v_commission_cents, 0);

  v_net := COALESCE(p_net_collected_cents, v_tier_price_cents, 0);
  IF v_net <= 0 THEN
    RETURN jsonb_build_object('commission_generated', false, 'reason', 'zero_payment');
  END IF;
  v_gross := v_net + v_fee;

  SELECT pr.partner_id INTO v_partner_id
  FROM partner_referrals pr
  JOIN empire_partners ep ON ep.member_id = pr.partner_id AND ep.is_active = true
  WHERE pr.referred_member_id = p_referred_member_id;

  SELECT * INTO v_policy FROM treasury_split_policies WHERE is_active = true ORDER BY id DESC LIMIT 1;

  IF v_partner_id IS NOT NULL AND v_commission_cents > 0 THEN
    v_has_referral := true;
  END IF;

  IF v_policy.id IS NULL THEN
    IF v_has_referral THEN
      v_city_pct := 0.35; v_empire_pct := 0.15; v_family_pct := 0.10; v_ops_pct := 0.20; v_ref_pct := 0.20;
    ELSE
      v_city_pct := 0.40; v_empire_pct := 0.20; v_family_pct := 0.10; v_ops_pct := 0.30; v_ref_pct := 0;
    END IF;
  ELSIF v_has_referral THEN
    v_city_pct := v_policy.city_treasury_pct_with_referral; v_empire_pct := v_policy.empire_treasury_pct_with_referral;
    v_family_pct := v_policy.family_legacy_pct_with_referral; v_ops_pct := v_policy.operations_pct_with_referral;
    v_ref_pct := v_policy.partner_commission_pct_with_referral;
  ELSE
    v_city_pct := v_policy.city_treasury_pct; v_empire_pct := v_policy.empire_treasury_pct;
    v_family_pct := v_policy.family_legacy_pct; v_ops_pct := v_policy.operations_pct; v_ref_pct := 0;
  END IF;

  v_city := ROUND(v_net * v_city_pct)::int;
  v_empire := ROUND(v_net * v_empire_pct)::int;
  v_family := ROUND(v_net * v_family_pct)::int;
  v_ref := CASE WHEN v_has_referral THEN LEAST(v_commission_cents, ROUND(v_net * v_ref_pct)::int) ELSE 0 END;
  v_ops := (v_net - v_city - v_empire - v_family - v_ref)::int;

  SELECT m.city_id, c.metro_id INTO v_city_id, v_metro_id
  FROM members m LEFT JOIN cities c ON c.id = m.city_id WHERE m.id = p_referred_member_id;

  INSERT INTO treasury_allocations (
    stripe_event_id, member_id, membership_tier, gross_amount_cents,
    city_treasury_cents, empire_treasury_cents, family_legacy_cents, operations_cents,
    referral_commission_cents, has_active_referral, city_id, metro_id, policy_version_id,
    net_collected_cents, stripe_fee_cents
  ) VALUES (
    p_stripe_event_id, p_referred_member_id, p_tier_id, v_gross,
    v_city, v_empire, v_family, v_ops, v_ref, v_has_referral, v_city_id, v_metro_id,
    COALESCE(v_policy.id, 1), v_net, v_fee
  ) ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_allocation_id;

  IF v_allocation_id IS NULL THEN
    RETURN jsonb_build_object('commission_generated', false, 'reason', 'already_processed');
  END IF;

  IF v_metro_id IS NOT NULL AND v_city > 0 THEN
    INSERT INTO metro_treasury_ledger (metro_id, city_id, member_id, entry_type, amount_cents, source_event_id, allocation_id, notes, policy_version_id)
    VALUES (v_metro_id, v_city_id, p_referred_member_id, 'contribution', v_city, p_stripe_event_id, v_allocation_id, 'Membership payment', COALESCE(v_policy.id, 1))
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_has_referral AND v_ref > 0 THEN
    INSERT INTO partner_commission_ledger (partner_id, referred_member_id, stripe_event_id, membership_tier, amount_cents, status, payment_period_start, available_at)
    VALUES (v_partner_id, p_referred_member_id, p_stripe_event_id, p_tier_id, v_ref, 'pending', p_period_start, now() + interval '7 days')
    ON CONFLICT (stripe_event_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('commission_generated', v_has_referral, 'partner_id', v_partner_id,
    'commission_cents', v_ref, 'gross_cents', v_gross, 'net_cents', v_net, 'fee_cents', v_fee);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_partner_commission(uuid, text, text, bigint, bigint, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_partner_commission(uuid, text, text, bigint, bigint, date) TO service_role;

-- Refunds and disputes: reverse only the newly refunded portion, exactly once per refund event.
CREATE OR REPLACE FUNCTION public.apply_payment_refund(
  p_original_event_id text, p_refund_event_id text, p_total_refunded_cents bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alloc record;
  v_comm record;
  v_delta bigint;
  v_ratio numeric;
  v_new_total bigint;
  v_comm_cut int;
  v_city_cut int;
BEGIN
  SELECT * INTO v_alloc FROM treasury_allocations WHERE stripe_event_id = p_original_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'original_not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM treasury_allocations WHERE stripe_event_id = p_refund_event_id) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_applied');
  END IF;

  v_new_total := LEAST(GREATEST(p_total_refunded_cents, 0), v_alloc.gross_amount_cents);
  v_delta := v_new_total - v_alloc.refunded_cents;
  IF v_delta <= 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'nothing_new');
  END IF;

  v_ratio := v_delta::numeric / NULLIF(v_alloc.gross_amount_cents, 0);
  UPDATE treasury_allocations SET refunded_cents = v_new_total WHERE id = v_alloc.id;

  v_city_cut := ROUND(v_alloc.city_treasury_cents * v_ratio)::int;

  INSERT INTO treasury_allocations (
    stripe_event_id, member_id, membership_tier, gross_amount_cents,
    city_treasury_cents, empire_treasury_cents, family_legacy_cents, operations_cents,
    referral_commission_cents, has_active_referral, city_id, metro_id, policy_version_id,
    net_collected_cents, stripe_fee_cents
  ) VALUES (
    p_refund_event_id, v_alloc.member_id, v_alloc.membership_tier, -v_delta,
    -v_city_cut,
    -ROUND(v_alloc.empire_treasury_cents * v_ratio)::int,
    -ROUND(v_alloc.family_legacy_cents * v_ratio)::int,
    -ROUND(v_alloc.operations_cents * v_ratio)::int,
    -ROUND(v_alloc.referral_commission_cents * v_ratio)::int,
    v_alloc.has_active_referral, v_alloc.city_id, v_alloc.metro_id, v_alloc.policy_version_id,
    -ROUND(COALESCE(v_alloc.net_collected_cents, v_alloc.gross_amount_cents) * v_ratio)::bigint, 0
  );

  IF v_alloc.metro_id IS NOT NULL AND v_city_cut > 0 THEN
    INSERT INTO metro_treasury_ledger (metro_id, city_id, member_id, entry_type, amount_cents, source_event_id, allocation_id, notes, policy_version_id)
    VALUES (v_alloc.metro_id, v_alloc.city_id, v_alloc.member_id, 'reversal', -v_city_cut, p_refund_event_id, v_alloc.id, 'Refund or chargeback', v_alloc.policy_version_id)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT * INTO v_comm FROM partner_commission_ledger WHERE stripe_event_id = p_original_event_id FOR UPDATE;
  IF FOUND AND v_comm.status <> 'reversed' THEN
    IF v_new_total >= v_alloc.gross_amount_cents AND v_comm.status IN ('pending', 'available') THEN
      UPDATE partner_commission_ledger SET status = 'reversed', reversed_at = now() WHERE id = v_comm.id;
    ELSE
      v_comm_cut := ROUND(v_comm.amount_cents * v_ratio)::int;
      IF v_comm_cut > 0 THEN
        INSERT INTO partner_balance_adjustments (partner_id, commission_id, amount_cents, reason, source_event_id)
        VALUES (v_comm.partner_id, v_comm.id, -v_comm_cut, 'Refund or chargeback clawback', p_refund_event_id)
        ON CONFLICT (source_event_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('applied', true, 'refunded_delta_cents', v_delta, 'total_refunded_cents', v_new_total);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_payment_refund(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_refund(text, text, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.release_matured_partner_commissions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE partner_commission_ledger SET status = 'available'
  WHERE status = 'pending' AND COALESCE(available_at, created_at + interval '7 days') <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.release_matured_partner_commissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_matured_partner_commissions() TO service_role;

CREATE OR REPLACE FUNCTION public.process_past_due_memberships()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m record; v_count integer := 0;
BEGIN
  FOR v_m IN
    SELECT id, membership_tier FROM members
    WHERE past_due_since IS NOT NULL AND past_due_since <= now() - interval '7 days'
      AND membership_tier <> 'white'
  LOOP
    UPDATE members SET membership_tier = 'white', membership_started_at = NULL,
      good_standing_since = NULL, scheduled_tier = NULL, scheduled_previous_price_id = NULL
    WHERE id = v_m.id;
    INSERT INTO notifications (member_id, type, title, body, link_url)
    VALUES (v_m.id, 'membership_past_due_expired', 'Your membership moved to White',
      'We could not collect your payment within the 7-day grace period. Update your card any time to restore your membership.',
      '/membership');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_past_due_memberships() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_past_due_memberships() TO service_role;

-- Partner dashboard with every earnings state.
CREATE OR REPLACE FUNCTION public.get_partner_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_partner record;
  v_l record;
  v_adj bigint;
  v_active_referrals integer;
  v_open_payout record;
  v_next_available timestamptz;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_partner FROM empire_partners WHERE member_id = v_caller;
  IF NOT FOUND THEN RETURN jsonb_build_object('is_partner', false); END IF;

  SELECT
    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0) AS pending,
    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'available'), 0) AS available,
    COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('requested', 'processing')), 0) AS in_payout,
    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid,
    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'reversed'), 0) AS reversed,
    COALESCE(SUM(amount_cents) FILTER (WHERE status <> 'reversed'), 0) AS lifetime
  INTO v_l FROM partner_commission_ledger WHERE partner_id = v_caller;

  v_adj := public.partner_open_adjustments_cents(v_caller);

  SELECT MIN(available_at) INTO v_next_available
  FROM partner_commission_ledger WHERE partner_id = v_caller AND status = 'pending';

  SELECT COUNT(DISTINCT pr.referred_member_id) INTO v_active_referrals
  FROM partner_referrals pr JOIN members m ON m.id = pr.referred_member_id
  WHERE pr.partner_id = v_caller AND m.membership_tier <> 'white';

  SELECT id, status, gross_amount_cents, net_amount_cents, requested_at INTO v_open_payout
  FROM partner_payouts WHERE partner_id = v_caller AND status IN ('requested', 'processing')
  ORDER BY requested_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'is_partner', true,
    'is_active', v_partner.is_active,
    'active_referrals', v_active_referrals,
    'pending_cents', v_l.pending,
    'available_cents', v_l.available + v_adj,
    'adjustments_cents', v_adj,
    'in_payout_cents', v_l.in_payout,
    'paid_cents', v_l.paid,
    'reversed_cents', v_l.reversed,
    'lifetime_cents', v_l.lifetime,
    'next_available_at', v_next_available,
    'open_payout', CASE WHEN v_open_payout.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_open_payout.id, 'status', v_open_payout.status,
      'gross_cents', v_open_payout.gross_amount_cents, 'net_cents', v_open_payout.net_amount_cents,
      'requested_at', v_open_payout.requested_at) END,
    'recent_payouts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'net_cents', p.net_amount_cents,
      'requested_at', p.requested_at, 'completed_at', p.completed_at) ORDER BY p.requested_at DESC)
      FROM (SELECT * FROM partner_payouts WHERE partner_id = v_caller ORDER BY requested_at DESC LIMIT 5) p), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_partner_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_dashboard() TO authenticated, service_role;

-- Partner asks for a payout of their own available balance; paid out in the monthly payout run.
CREATE OR REPLACE FUNCTION public.request_my_partner_payout()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_partner record;
  v_available bigint;
  v_adj bigint;
  v_total bigint;
  v_fee int;
  v_payout_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.check_rate_limit('payout_request', 3);

  SELECT * INTO v_partner FROM empire_partners WHERE member_id = v_caller FOR UPDATE;
  IF NOT FOUND OR NOT v_partner.is_active THEN
    RAISE EXCEPTION 'Your Partner account is not active';
  END IF;
  IF v_partner.stripe_connect_status IS DISTINCT FROM 'active' OR v_partner.stripe_connect_account_id IS NULL THEN
    RAISE EXCEPTION 'Finish payout setup before requesting a payout';
  END IF;
  IF EXISTS (SELECT 1 FROM partner_payouts WHERE partner_id = v_caller AND status IN ('requested', 'processing')) THEN
    RAISE EXCEPTION 'You already have a payout in progress';
  END IF;

  PERFORM public.release_matured_partner_commissions();

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_available
  FROM partner_commission_ledger WHERE partner_id = v_caller AND status = 'available';
  v_adj := public.partner_open_adjustments_cents(v_caller);
  v_total := v_available + v_adj;

  IF v_total < 10000 THEN
    RAISE EXCEPTION 'Minimum payout is $100';
  END IF;

  v_fee := ROUND(v_total * 0.03)::int;
  INSERT INTO partner_payouts (partner_id, gross_amount_cents, fee_cents, net_amount_cents, status, requested_at)
  VALUES (v_caller, v_total::int, v_fee, (v_total - v_fee)::int, 'requested', now())
  RETURNING id INTO v_payout_id;

  UPDATE partner_commission_ledger SET status = 'requested', payout_id = v_payout_id
  WHERE partner_id = v_caller AND status = 'available';

  UPDATE partner_balance_adjustments a SET payout_id = v_payout_id
  WHERE a.partner_id = v_caller AND a.payout_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM partner_commission_ledger l WHERE l.id = a.commission_id AND l.status = 'reversed');

  RETURN jsonb_build_object('payout_id', v_payout_id, 'gross_cents', v_total, 'fee_cents', v_fee, 'net_cents', v_total - v_fee);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_my_partner_payout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_my_partner_payout() TO authenticated, service_role;

-- Monthly payout run helpers (Financial Admin via the payout edge function).
CREATE OR REPLACE FUNCTION public.get_payouts_for_processing()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    PERFORM public.require_sub_role('financial_admin');
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', p.id, 'partner_id', p.partner_id, 'display_name', m.display_name,
    'status', p.status, 'gross_cents', p.gross_amount_cents, 'fee_cents', p.fee_cents,
    'net_cents', p.net_amount_cents, 'requested_at', p.requested_at, 'completed_at', p.completed_at,
    'failure_reason', p.failure_reason) ORDER BY p.requested_at DESC)
    FROM (SELECT * FROM partner_payouts ORDER BY requested_at DESC LIMIT 100) p
    LEFT JOIN members m ON m.id = p.partner_id), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_payouts_for_processing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payouts_for_processing() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_partner_payout(p_payout_id uuid, p_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p record; v_acct text; v_active boolean;
BEGIN
  UPDATE partner_payouts SET status = 'processing', processed_by = p_admin_id
  WHERE id = p_payout_id AND status = 'requested'
  RETURNING * INTO v_p;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE partner_commission_ledger SET status = 'processing' WHERE payout_id = p_payout_id AND status = 'requested';
  SELECT stripe_connect_account_id, is_active INTO v_acct, v_active FROM empire_partners WHERE member_id = v_p.partner_id;
  RETURN jsonb_build_object('id', v_p.id, 'partner_id', v_p.partner_id, 'net_cents', v_p.net_amount_cents,
    'gross_cents', v_p.gross_amount_cents, 'fee_cents', v_p.fee_cents, 'account_id', v_acct, 'partner_active', v_active);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_partner_payout(p_payout_id uuid, p_transfer_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid; v_net int;
BEGIN
  UPDATE partner_payouts SET status = 'completed', stripe_transfer_id = p_transfer_id, completed_at = now(),
    tax_year = EXTRACT(YEAR FROM now())::int
  WHERE id = p_payout_id AND status = 'processing'
  RETURNING partner_id, net_amount_cents INTO v_partner, v_net;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE partner_commission_ledger SET status = 'paid', paid_at = now() WHERE payout_id = p_payout_id AND status = 'processing';
  INSERT INTO notifications (member_id, type, title, body, link_url)
  VALUES (v_partner, 'partner_payout_paid', 'Your Partner payout was sent',
    '$' || to_char(v_net / 100.0, 'FM999,999,990.00') || ' is on its way to your payout account.', '/profile');
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_partner_payout(p_payout_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid;
BEGIN
  UPDATE partner_payouts SET status = 'failed', failure_reason = left(COALESCE(p_reason, 'Payout failed'), 300)
  WHERE id = p_payout_id AND status IN ('requested', 'processing')
  RETURNING partner_id INTO v_partner;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE partner_commission_ledger SET status = 'available', payout_id = NULL
  WHERE payout_id = p_payout_id AND status IN ('requested', 'processing');
  UPDATE partner_balance_adjustments SET payout_id = NULL WHERE payout_id = p_payout_id;
  INSERT INTO notifications (member_id, type, title, body, link_url)
  VALUES (v_partner, 'partner_payout_failed', 'Your Partner payout did not go through',
    'Your balance is back in Available. Check your payout account and request again.', '/profile');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_partner_payout(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_partner_payout(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_partner_payout(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_partner_payout(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_partner_payout(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_partner_payout(uuid, text) TO service_role;

-- Old direct payout path is retired.
REVOKE EXECUTE ON FUNCTION public.request_partner_payout(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- Reconciliation compares Stripe gross with recorded gross.
CREATE OR REPLACE FUNCTION public.run_daily_reconciliation(p_run_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stripe bigint; v_ledger bigint; v_diff bigint; v_run_id uuid; v_e record;
BEGIN
  SELECT COALESCE(SUM(amount_total), 0) INTO v_stripe FROM stripe_payment_events
  WHERE event_type = 'invoice.paid' AND created_at::date = p_run_date AND COALESCE(amount_total, 0) > 0;

  SELECT COALESCE(SUM(a.gross_amount_cents), 0) INTO v_ledger
  FROM treasury_allocations a
  JOIN stripe_payment_events e ON e.stripe_event_id = a.stripe_event_id
  WHERE e.event_type = 'invoice.paid' AND e.created_at::date = p_run_date AND a.gross_amount_cents > 0;

  v_diff := v_stripe - v_ledger;

  INSERT INTO stripe_reconciliation_runs (run_date, stripe_total_cents, ledger_total_cents, difference_cents, status)
  VALUES (p_run_date, v_stripe, v_ledger, v_diff, CASE WHEN v_diff = 0 THEN 'balanced' ELSE 'discrepancy' END)
  ON CONFLICT (run_date) DO UPDATE SET
    stripe_total_cents = EXCLUDED.stripe_total_cents, ledger_total_cents = EXCLUDED.ledger_total_cents,
    difference_cents = EXCLUDED.difference_cents,
    status = CASE WHEN stripe_reconciliation_runs.status = 'resolved' AND EXCLUDED.difference_cents = stripe_reconciliation_runs.difference_cents
      THEN 'resolved' WHEN EXCLUDED.difference_cents = 0 THEN 'balanced' ELSE 'discrepancy' END
  RETURNING id INTO v_run_id;

  IF v_diff <> 0 THEN
    FOR v_e IN
      SELECT e.stripe_event_id, e.amount_total, COALESCE(a.gross_amount_cents, 0) AS ledger
      FROM stripe_payment_events e LEFT JOIN treasury_allocations a ON a.stripe_event_id = e.stripe_event_id
      WHERE e.event_type = 'invoice.paid' AND e.created_at::date = p_run_date
        AND COALESCE(e.amount_total, 0) > 0 AND COALESCE(a.gross_amount_cents, 0) <> e.amount_total
    LOOP
      INSERT INTO stripe_reconciliation_discrepancies (run_id, stripe_event_id, stripe_amount_cents, ledger_amount_cents, difference_cents, notes)
      VALUES (v_run_id, v_e.stripe_event_id, v_e.amount_total, v_e.ledger, v_e.amount_total - v_e.ledger,
        CASE WHEN v_e.ledger = 0 THEN 'Payment with no matching allocation' ELSE 'Recorded amount differs from Stripe' END)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('run_id', v_run_id, 'difference_cents', v_diff);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.run_daily_reconciliation(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_reconciliation(date) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_reconciliation_run(p_run_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  IF p_notes IS NULL OR length(trim(p_notes)) < 5 THEN
    RAISE EXCEPTION 'A resolution note is required';
  END IF;
  UPDATE stripe_reconciliation_runs SET status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
    resolution_notes = left(trim(p_notes), 1000)
  WHERE id = p_run_id AND status = 'discrepancy';
  IF NOT FOUND THEN RAISE EXCEPTION 'This run does not need resolving'; END IF;
  INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'reconciliation_resolved', 'stripe_reconciliation_run', p_run_id::text, jsonb_build_object('notes', left(trim(p_notes), 1000)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_reconciliation_run(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_reconciliation_run(uuid, text) TO authenticated;

-- Upgrades mid-month: add the credit difference immediately (capped at 30).
CREATE OR REPLACE FUNCTION public.grant_upgrade_voting_credits(p_member_id uuid, p_old_tier text, p_new_tier text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old int; v_new int; v_diff int; v_bal int;
BEGIN
  SELECT COALESCE(voting_credits, 0) INTO v_old FROM membership_tiers WHERE id = p_old_tier;
  SELECT COALESCE(voting_credits, 0) INTO v_new FROM membership_tiers WHERE id = p_new_tier;
  v_diff := COALESCE(v_new, 0) - COALESCE(v_old, 0);
  IF v_diff <= 0 THEN RETURN 0; END IF;

  INSERT INTO voting_credits (member_id, balance, last_reset_date, updated_at)
  VALUES (p_member_id, 0, CURRENT_DATE, now()) ON CONFLICT (member_id) DO NOTHING;

  UPDATE voting_credits SET balance = LEAST(balance + v_diff, 30), updated_at = now(),
    last_reset_date = COALESCE(last_reset_date, CURRENT_DATE)
  WHERE member_id = p_member_id RETURNING balance INTO v_bal;

  INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
  VALUES (p_member_id, v_diff, 'upgrade_grant', NULL);
  RETURN v_diff;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.grant_upgrade_voting_credits(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_upgrade_voting_credits(uuid, text, text) TO service_role;

-- Daily jobs
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('partner_commissions_release_daily', 'past_due_memberships_daily', 'reconciliation_daily');
  PERFORM cron.schedule('partner_commissions_release_daily', '15 0 * * *', 'SELECT public.release_matured_partner_commissions();');
  PERFORM cron.schedule('past_due_memberships_daily', '30 0 * * *', 'SELECT public.process_past_due_memberships();');
  PERFORM cron.schedule('reconciliation_daily', '45 0 * * *', 'SELECT public.run_daily_reconciliation(CURRENT_DATE - 1);');
END $$;
