/*
# Stage 2: payout account status check

Partners can only request a payout once their payout account is fully verified
(stored as 'verified'). This replaces an incorrect 'active' check.
*/
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
  IF v_partner.stripe_connect_status IS DISTINCT FROM 'verified' OR v_partner.stripe_connect_account_id IS NULL THEN
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
