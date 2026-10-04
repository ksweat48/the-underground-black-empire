/*
# Stage 4a: One release workflow for all three funds

Plain English: Metro Treasury, Empire Treasury and Family & Legacy money can now
only leave through the same four steps: Submit -> Review -> Approve (by a
different Financial Admin when one exists) -> Mark Paid (payment reference
required). Every step records who did it and when.

1. Modified table `treasury_releases`
   - `fund` (text, default 'metro'): metro | empire | family_legacy
   - `purpose` (text): what the money is for
   - `assistance_request_id` (uuid): link to a Family & Legacy request (FK added in 4b)
   - `metro_id` is now optional; required only for metro releases (check constraint)
2. New functions
   - `_fund_totals(fund)`: raised / paid out / committed / available for empire or family_legacy
   - `get_fund_balances()`: Financial Admin view of all fund totals
   - `submit_fund_release(...)`: replaces `submit_treasury_release`; blocks over-committing a fund
   - `get_release_queue(include_closed)`: Financial Admin list across all funds
3. Updated functions
   - `complete_treasury_release`: payment reference now required; re-checks funds; handles non-metro funds
4. Security
   - All functions are SECURITY DEFINER, check the financial_admin role inside,
     and are executable only by signed-in users (not visitors).
*/

ALTER TABLE treasury_releases ADD COLUMN IF NOT EXISTS fund text NOT NULL DEFAULT 'metro';
ALTER TABLE treasury_releases ADD COLUMN IF NOT EXISTS purpose text;
ALTER TABLE treasury_releases ADD COLUMN IF NOT EXISTS assistance_request_id uuid;
ALTER TABLE treasury_releases ALTER COLUMN metro_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasury_releases_fund_check') THEN
    ALTER TABLE treasury_releases ADD CONSTRAINT treasury_releases_fund_check
      CHECK (fund IN ('metro','empire','family_legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasury_releases_fund_metro_check') THEN
    ALTER TABLE treasury_releases ADD CONSTRAINT treasury_releases_fund_metro_check
      CHECK ((fund = 'metro') = (metro_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS treasury_releases_fund_status_idx ON treasury_releases (fund, status);

CREATE OR REPLACE FUNCTION public._fund_totals(p_fund text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_raised bigint; v_paid bigint; v_committed bigint;
BEGIN
  IF p_fund = 'empire' THEN
    SELECT COALESCE(sum(empire_treasury_cents), 0) INTO v_raised FROM treasury_allocations;
  ELSIF p_fund = 'family_legacy' THEN
    SELECT COALESCE(sum(family_legacy_cents), 0) INTO v_raised FROM treasury_allocations;
  ELSE
    RAISE EXCEPTION 'Unknown fund';
  END IF;
  SELECT COALESCE(sum(amount_cents) FILTER (WHERE status IN ('completed','funded')), 0),
         COALESCE(sum(amount_cents) FILTER (WHERE status IN ('submitted','under_review','approved')), 0)
  INTO v_paid, v_committed FROM treasury_releases WHERE fund = p_fund;
  RETURN jsonb_build_object('fund', p_fund, 'raised_cents', v_raised, 'paid_cents', v_paid,
    'committed_cents', v_committed, 'available_cents', GREATEST(0, v_raised - v_paid - v_committed));
END $$;

CREATE OR REPLACE FUNCTION public._release_available_cents(p_fund text, p_metro_id uuid, p_exclude uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_total bigint; v_committed bigint;
BEGIN
  IF p_fund = 'metro' THEN
    v_total := COALESCE((public.get_metro_treasury(p_metro_id)->>'available_cents')::bigint, 0);
    SELECT COALESCE(sum(amount_cents), 0) INTO v_committed FROM treasury_releases
    WHERE fund = 'metro' AND metro_id = p_metro_id AND status IN ('submitted','under_review','approved')
      AND id IS DISTINCT FROM p_exclude;
    RETURN GREATEST(0, v_total - v_committed);
  END IF;
  v_total := (public._fund_totals(p_fund)->>'available_cents')::bigint;
  SELECT COALESCE(sum(amount_cents), 0) INTO v_committed FROM treasury_releases
  WHERE id = p_exclude AND status IN ('submitted','under_review','approved');
  RETURN v_total + v_committed;
END $$;

CREATE OR REPLACE FUNCTION public.get_fund_balances()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  RETURN jsonb_build_object('empire', public._fund_totals('empire'), 'family_legacy', public._fund_totals('family_legacy'));
END $$;

DROP FUNCTION IF EXISTS public.submit_treasury_release(uuid, bigint, uuid, text);

CREATE OR REPLACE FUNCTION public.submit_fund_release(
  p_fund text, p_amount_cents bigint, p_purpose text,
  p_metro_id uuid DEFAULT NULL, p_initiative_id uuid DEFAULT NULL, p_assistance_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_available bigint;
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  IF p_fund NOT IN ('metro','empire','family_legacy') THEN RAISE EXCEPTION 'Choose a fund'; END IF;
  IF p_fund = 'metro' AND p_metro_id IS NULL THEN RAISE EXCEPTION 'Choose a metro'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF char_length(btrim(COALESCE(p_purpose, ''))) < 10 THEN RAISE EXCEPTION 'Describe the purpose (at least 10 characters)'; END IF;
  v_available := public._release_available_cents(p_fund, CASE WHEN p_fund = 'metro' THEN p_metro_id END, NULL);
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'This fund only has % available', to_char(v_available / 100.0, 'FM$999,999,990.00');
  END IF;
  INSERT INTO treasury_releases (fund, metro_id, initiative_id, assistance_request_id, amount_cents, purpose, submitted_by)
  VALUES (p_fund, CASE WHEN p_fund = 'metro' THEN p_metro_id END, p_initiative_id, p_assistance_request_id,
          p_amount_cents, btrim(p_purpose), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'fund_release_submitted', 'treasury_release', v_id,
          jsonb_build_object('fund', p_fund, 'amount_cents', p_amount_cents));
  RETURN jsonb_build_object('release_id', v_id, 'status', 'submitted');
END $$;

CREATE OR REPLACE FUNCTION public.complete_treasury_release(p_release_id uuid, p_payment_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_caller uuid := auth.uid(); v_release treasury_releases%ROWTYPE; v_ledger uuid; v_ref text := btrim(COALESCE(p_payment_reference, ''));
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  IF char_length(v_ref) < 3 THEN RAISE EXCEPTION 'A payment reference is required'; END IF;
  SELECT * INTO v_release FROM treasury_releases WHERE id = p_release_id AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Release not found or not approved yet'; END IF;
  IF v_release.amount_cents > public._release_available_cents(v_release.fund, v_release.metro_id, v_release.id) THEN
    RAISE EXCEPTION 'The fund no longer has enough available to pay this release';
  END IF;
  IF v_release.fund = 'metro' THEN
    INSERT INTO metro_treasury_ledger (metro_id, entry_type, amount_cents, notes, member_id, source_event_id)
    VALUES (v_release.metro_id, 'release', -v_release.amount_cents,
            COALESCE(v_release.purpose, 'Treasury release') || ' (ref ' || v_ref || ')', v_caller, 'release:' || v_release.id)
    RETURNING id INTO v_ledger;
  END IF;
  UPDATE treasury_releases SET status = 'completed', funded_by = v_caller, funded_at = now(),
    payment_reference = v_ref, completed_by = v_caller, completed_at = now(), ledger_entry_id = v_ledger
  WHERE id = p_release_id;
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (v_caller, 'fund_release_paid', 'treasury_release', p_release_id,
          jsonb_build_object('fund', v_release.fund, 'amount_cents', v_release.amount_cents, 'payment_reference', v_ref));
  IF v_release.fund = 'metro' THEN PERFORM public.refill_treasury_capacity(v_release.metro_id); END IF;
  RETURN jsonb_build_object('release_id', p_release_id, 'status', 'completed');
END $$;

CREATE OR REPLACE FUNCTION public.get_release_queue(p_include_closed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'fund', r.fund, 'metro_id', r.metro_id, 'metro_name', m.name,
      'initiative_id', r.initiative_id, 'assistance_request_id', r.assistance_request_id,
      'amount_cents', r.amount_cents, 'purpose', r.purpose, 'status', r.status,
      'submitted_by', r.submitted_by, 'submitted_by_name', sb.display_name, 'submitted_at', r.submitted_at,
      'review_notes', r.review_notes, 'reviewed_at', r.reviewed_at,
      'approved_by_name', ab.display_name, 'approved_at', r.approved_at,
      'payment_reference', r.payment_reference, 'completed_at', r.completed_at,
      'rejection_reason', r.rejection_reason, 'created_at', r.created_at
    ) ORDER BY r.created_at DESC)
    FROM (
      SELECT * FROM treasury_releases
      WHERE p_include_closed OR status IN ('submitted','under_review','approved')
      ORDER BY created_at DESC LIMIT 100
    ) r
    LEFT JOIN metros m ON m.id = r.metro_id
    LEFT JOIN members sb ON sb.id = r.submitted_by
    LEFT JOIN members ab ON ab.id = r.approved_by
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public._fund_totals(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._release_available_cents(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_fund_balances() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_fund_release(text, bigint, text, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_treasury_release(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_release_queue(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fund_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_fund_release(text, bigint, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_treasury_release(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_release_queue(boolean) TO authenticated;
