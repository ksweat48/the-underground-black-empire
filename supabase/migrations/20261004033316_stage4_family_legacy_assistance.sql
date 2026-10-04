/*
# Stage 4b: Family & Legacy assistance program

Plain English: Eligible members can ask the Family & Legacy Fund for help.
A Financial Admin reviews each request. Approving it creates a Family & Legacy
release that still goes through the shared approve + pay steps. The member is
notified at each decision. This is NOT insurance and nothing is guaranteed.

Eligibility (checked on the server):
  1. Membership level Black Pro, Arch or Arch Pro
  2. Account active and payments current
  3. Identity verified
  4. At least 90 days of continuous good standing
  5. Only one open request at a time

1. New table `family_assistance_requests`
   - id, member_id (defaults to the signed-in member), category, amount_requested_cents,
     description, status (submitted | approved | denied | paid | withdrawn),
     approved_amount_cents, decision_notes, release_id, reviewed_by, reviewed_at,
     created_at, updated_at
2. New functions
   - get_family_legacy_eligibility(), submit_family_assistance_request(...),
     withdraw_family_assistance_request(id), get_family_legacy_fund() (public totals),
     admin_list_family_assistance_requests(include_closed),
     admin_decide_family_assistance_request(id, approve, amount, notes)
3. Updated functions
   - complete_treasury_release / reject_treasury_release now update the linked request and notify the member
4. Security
   - RLS on; members can only read their own requests; Financial Admins read all.
   - No direct insert/update/delete: every change goes through the checked functions above.
*/

CREATE TABLE IF NOT EXISTS family_assistance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('bereavement','medical','housing','education','emergency','other')),
  amount_requested_cents bigint NOT NULL CHECK (amount_requested_cents > 0 AND amount_requested_cents <= 1000000),
  description text NOT NULL CHECK (char_length(description) BETWEEN 30 AND 3000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','denied','paid','withdrawn')),
  approved_amount_cents bigint,
  decision_notes text,
  release_id uuid REFERENCES treasury_releases(id),
  reviewed_by uuid REFERENCES members(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_assistance_requests_member_idx ON family_assistance_requests (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS family_assistance_requests_status_idx ON family_assistance_requests (status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasury_releases_assistance_request_fkey') THEN
    ALTER TABLE treasury_releases ADD CONSTRAINT treasury_releases_assistance_request_fkey
      FOREIGN KEY (assistance_request_id) REFERENCES family_assistance_requests(id);
  END IF;
END $$;

ALTER TABLE family_assistance_requests ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON family_assistance_requests FROM anon, authenticated;

DROP POLICY IF EXISTS "Members read own assistance requests" ON family_assistance_requests;
CREATE POLICY "Members read own assistance requests" ON family_assistance_requests FOR SELECT
TO authenticated USING (member_id = auth.uid() OR public.has_sub_role('financial_admin'));

CREATE OR REPLACE FUNCTION public.get_family_legacy_eligibility()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_m members%ROWTYPE; v_reasons text[] := '{}'; v_days int;
BEGIN
  SELECT * INTO v_m FROM members WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_m.membership_tier NOT IN ('black_pro','arch','arch_pro') THEN
    v_reasons := v_reasons || 'Requires Black Pro, Arch or Arch Pro membership';
  END IF;
  IF v_m.account_status <> 'active' OR COALESCE(v_m.stripe_subscription_status, '') NOT IN ('active','trialing') THEN
    v_reasons := v_reasons || 'Membership payments must be current';
  END IF;
  IF NOT public.is_identity_verified(v_m.id) THEN
    v_reasons := v_reasons || 'Verify your identity on your profile';
  END IF;
  v_days := CASE WHEN v_m.good_standing_since IS NULL THEN 0 ELSE (now()::date - v_m.good_standing_since::date) END;
  IF v_days < 90 THEN
    v_reasons := v_reasons || ('Requires 90 days of continuous good standing (' || v_days || ' so far)');
  END IF;
  IF EXISTS (SELECT 1 FROM family_assistance_requests WHERE member_id = v_m.id AND status IN ('submitted','approved')) THEN
    v_reasons := v_reasons || 'You already have an open request';
  END IF;
  RETURN jsonb_build_object('eligible', cardinality(v_reasons) = 0, 'reasons', to_jsonb(v_reasons), 'good_standing_days', v_days);
END $$;

CREATE OR REPLACE FUNCTION public.submit_family_assistance_request(p_category text, p_amount_cents bigint, p_description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_elig jsonb; v_id uuid;
BEGIN
  v_elig := public.get_family_legacy_eligibility();
  IF NOT (v_elig->>'eligible')::boolean THEN RAISE EXCEPTION 'Not eligible: %', v_elig->'reasons'->>0; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 100 OR p_amount_cents > 1000000 THEN
    RAISE EXCEPTION 'Amount must be between $1 and $10,000';
  END IF;
  IF char_length(btrim(COALESCE(p_description, ''))) < 30 THEN
    RAISE EXCEPTION 'Please describe your situation (at least 30 characters)';
  END IF;
  INSERT INTO family_assistance_requests (member_id, category, amount_requested_cents, description)
  VALUES (auth.uid(), p_category, p_amount_cents, btrim(p_description)) RETURNING id INTO v_id;
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'family_assistance_requested', 'family_assistance_request', v_id,
          jsonb_build_object('category', p_category, 'amount_cents', p_amount_cents));
  RETURN jsonb_build_object('request_id', v_id, 'status', 'submitted');
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_family_assistance_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE family_assistance_requests SET status = 'withdrawn', updated_at = now()
  WHERE id = p_request_id AND member_id = auth.uid() AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only requests still awaiting review can be withdrawn'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_family_legacy_fund()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb := public._fund_totals('family_legacy');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN jsonb_build_object(
    'raised_cents', v->'raised_cents', 'paid_cents', v->'paid_cents', 'available_cents', v->'available_cents',
    'families_helped', (SELECT count(DISTINCT member_id) FROM family_assistance_requests WHERE status = 'paid'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_family_assistance_requests(p_include_closed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'member_id', r.member_id, 'display_name', m.display_name, 'membership_tier', m.membership_tier,
      'identity_verified', public.is_identity_verified(r.member_id),
      'good_standing_days', CASE WHEN m.good_standing_since IS NULL THEN 0 ELSE now()::date - m.good_standing_since::date END,
      'category', r.category, 'amount_requested_cents', r.amount_requested_cents, 'description', r.description,
      'status', r.status, 'approved_amount_cents', r.approved_amount_cents, 'decision_notes', r.decision_notes,
      'release_id', r.release_id, 'reviewed_at', r.reviewed_at, 'created_at', r.created_at
    ) ORDER BY r.created_at DESC)
    FROM (SELECT * FROM family_assistance_requests
          WHERE p_include_closed OR status IN ('submitted','approved')
          ORDER BY created_at DESC LIMIT 100) r
    JOIN members m ON m.id = r.member_id
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_family_assistance_request(
  p_request_id uuid, p_approve boolean, p_amount_cents bigint DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_req family_assistance_requests%ROWTYPE; v_amount bigint; v_release jsonb; v_notes text := btrim(COALESCE(p_notes, ''));
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  SELECT * INTO v_req FROM family_assistance_requests WHERE id = p_request_id AND status = 'submitted' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already decided'; END IF;
  IF v_req.member_id = auth.uid() THEN RAISE EXCEPTION 'You cannot decide your own request'; END IF;

  IF NOT p_approve THEN
    IF char_length(v_notes) < 5 THEN RAISE EXCEPTION 'Add a short reason for the member'; END IF;
    UPDATE family_assistance_requests SET status = 'denied', decision_notes = v_notes,
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_request_id;
    PERFORM public.create_notification(v_req.member_id, 'family_assistance', 'Assistance request update',
      'Your Family & Legacy request was not approved. ' || v_notes, '/membership');
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  v_amount := COALESCE(p_amount_cents, v_req.amount_requested_cents);
  IF v_amount <= 0 OR v_amount > v_req.amount_requested_cents THEN
    RAISE EXCEPTION 'Approved amount must be between $0.01 and the requested amount';
  END IF;
  v_release := public.submit_fund_release('family_legacy', v_amount,
    'Family & Legacy assistance (' || v_req.category || ') for ' ||
    COALESCE((SELECT display_name FROM members WHERE id = v_req.member_id), 'member'),
    NULL, NULL, p_request_id);
  UPDATE family_assistance_requests SET status = 'approved', approved_amount_cents = v_amount,
    decision_notes = NULLIF(v_notes, ''), release_id = (v_release->>'release_id')::uuid,
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_request_id;
  PERFORM public.create_notification(v_req.member_id, 'family_assistance', 'Assistance request approved',
    'Your Family & Legacy request was approved for ' || to_char(v_amount / 100.0, 'FM$999,999,990.00') ||
    '. Payment will be sent after final sign-off.', '/membership');
  RETURN jsonb_build_object('status', 'approved', 'release_id', v_release->>'release_id');
END $$;

CREATE OR REPLACE FUNCTION public._sync_assistance_from_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_member uuid;
BEGIN
  IF NEW.assistance_request_id IS NULL OR NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'completed' THEN
    UPDATE family_assistance_requests SET status = 'paid', updated_at = now()
    WHERE id = NEW.assistance_request_id AND status = 'approved' RETURNING member_id INTO v_member;
    IF v_member IS NOT NULL THEN
      PERFORM public.create_notification(v_member, 'family_assistance', 'Assistance payment sent',
        'Your Family & Legacy payment of ' || to_char(NEW.amount_cents / 100.0, 'FM$999,999,990.00') || ' has been sent.', '/membership');
    END IF;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE family_assistance_requests SET status = 'denied',
      decision_notes = COALESCE(NEW.rejection_reason, decision_notes), updated_at = now()
    WHERE id = NEW.assistance_request_id AND status = 'approved' RETURNING member_id INTO v_member;
    IF v_member IS NOT NULL THEN
      PERFORM public.create_notification(v_member, 'family_assistance', 'Assistance request update',
        'Your Family & Legacy payment did not pass final sign-off. ' || COALESCE(NEW.rejection_reason, ''), '/membership');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS treasury_release_assistance_sync ON treasury_releases;
CREATE TRIGGER treasury_release_assistance_sync AFTER UPDATE OF status ON treasury_releases
FOR EACH ROW EXECUTE FUNCTION public._sync_assistance_from_release();

REVOKE ALL ON FUNCTION public._sync_assistance_from_release() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_family_legacy_eligibility() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_family_assistance_request(text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_family_assistance_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_family_legacy_fund() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_family_assistance_requests(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_decide_family_assistance_request(uuid, boolean, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_family_legacy_eligibility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_family_assistance_request(text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_family_assistance_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_legacy_fund() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_family_assistance_requests(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_family_assistance_request(uuid, boolean, bigint, text) TO authenticated;
