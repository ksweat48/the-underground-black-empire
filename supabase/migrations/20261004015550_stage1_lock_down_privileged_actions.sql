/*
# Stage 1: Lock down privileged actions

## Summary
Many behind-the-scenes actions (awarding Influence, granting voting credits, creating elections,
sending notifications, paying Partners, approving Treasury releases) could be triggered by any
signed-in member, and some even by logged-out visitors. This migration closes those holes.

## 1. Internal-only actions (no longer callable from the app or by visitors)
award_influence, award_verified_event_host_influence, award_verified_referral, claim_partner_referral,
complete_mission, create_election_cycle, create_notification, finalize_leadership_election,
promote_leadership_finalists, grant_initial_voting_credits, grant_monthly_voting_credits, log_audit,
verify_referral, request_partner_payout, generate_partner_commission, reverse_partner_commission,
process_grace_period_checks, refill_treasury_capacity, record_organization_vote_support (legacy voting path).
These remain usable by the database itself, scheduled jobs and server functions.

## 2. New helper
- `require_sub_role(text)`: raises "Not authorized" unless the caller holds that admin sub-role or is the Founder (full admin).

## 3. Admin-only actions and reports (now permission-checked)
- broadcast_notification (Founder only)
- get_admin_sub_roles (Founder only)
- get_moderation_queue, get_listings_for_review (Moderation Admin)
- get_pending_identity_checks, get_election_participation_stats (Elections Admin)
- get_reconciliation_runs, generate_tax_record (Financial Admin)
- correct_partner_attribution (Partner Admin; only within 7 days of the member's signup; no self-referral)

## 4. Treasury releases
- submit / review / reject / complete require Financial Admin.
- The submitter cannot approve their own release, unless the Founder is the only Financial Admin (logged in audit_log).
- Amounts must be positive.

## 5. Partners
- New columns on empire_partners: suspended_at, suspended_by, suspended_reason.
- Members can no longer set their own Stripe account or status when joining (join_partner_program handles it).
- New `admin_set_partner_status(partner, active, reason)` for Partner Admins; a reason is required to suspend.

## 6. News publishing
- Only currently active leaders (status active, term not expired) can publish, and only for cities in their own Metro.
  Admins may publish too. Former leaders lose publishing rights.
*/

-- ---------- 1. Internal-only functions ----------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'award_influence','award_verified_event_host_influence','award_verified_referral','claim_partner_referral',
      'complete_mission','create_election_cycle','create_notification','finalize_leadership_election',
      'promote_leadership_finalists','grant_initial_voting_credits','grant_monthly_voting_credits','log_audit',
      'verify_referral','request_partner_payout','generate_partner_commission','reverse_partner_commission',
      'process_grace_period_checks','refill_treasury_capacity','record_organization_vote_support')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ---------- 2. Helper ----------
CREATE OR REPLACE FUNCTION public.require_sub_role(p_sub_role text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_sub_role(p_sub_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.require_sub_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_sub_role(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_founder()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.require_founder() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_founder() TO authenticated, service_role;

-- ---------- 3. Admin-only actions ----------
CREATE OR REPLACE FUNCTION public.broadcast_notification(p_type text, p_title text, p_body text DEFAULT NULL, p_link_url text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public.require_founder();
  IF coalesce(trim(p_title), '') = '' OR length(p_title) > 200 OR length(coalesce(p_body, '')) > 2000 THEN
    RAISE EXCEPTION 'Invalid notification';
  END IF;
  IF p_link_url IS NOT NULL AND p_link_url !~ '^/' THEN
    RAISE EXCEPTION 'Links must point inside the app';
  END IF;
  INSERT INTO notifications (member_id, type, title, body, link_url)
  SELECT id, p_type, p_title, p_body, p_link_url FROM members WHERE member_number IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_sub_roles()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_founder();
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', sr.id, 'member_id', sr.member_id, 'sub_role', sr.sub_role, 'is_active', sr.is_active,
      'assigned_at', sr.assigned_at, 'revoked_at', sr.revoked_at,
      'member_name', m.display_name, 'member_avatar_url', m.avatar_url
    ) ORDER BY sr.is_active DESC, sr.sub_role, sr.assigned_at DESC), '[]'::jsonb)
    FROM admin_sub_roles sr LEFT JOIN members m ON m.id = sr.member_id
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_moderation_queue(p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('moderation_admin');
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter_id', r.reporter_id, 'target_type', r.target_type, 'target_id', r.target_id,
      'reason', r.reason, 'status', r.status, 'created_at', r.created_at, 'reporter_name', m.display_name
    ) ORDER BY r.created_at ASC), '[]'::jsonb)
    FROM (SELECT * FROM moderation_reports WHERE status = 'pending' ORDER BY created_at ASC LIMIT least(greatest(p_limit, 1), 200)) r
    LEFT JOIN members m ON m.id = r.reporter_id
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_listings_for_review(p_status text DEFAULT 'in_review', p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, name text, category text, description text, products_services text, price_display text, external_url text, image_url text, status text, is_verified boolean, like_count integer, comment_count integer, created_at timestamptz, owner_email text, city_name text, review_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('moderation_admin');
  RETURN QUERY
  SELECT ml.id, ml.name, ml.category, ml.description, ml.products_services, ml.price_display, ml.external_url,
         ml.image_url, ml.status, ml.is_verified, ml.like_count, ml.comment_count, ml.created_at,
         m.email, c.name, ml.review_reason
  FROM market_listings ml JOIN members m ON m.id = ml.owner_id JOIN cities c ON c.id = ml.city_id
  WHERE ml.status = p_status ORDER BY ml.created_at ASC LIMIT least(greatest(p_limit, 1), 200);
END $$;

CREATE OR REPLACE FUNCTION public.get_pending_identity_checks()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('elections_admin');
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'member_id', c.member_id, 'check_type', c.check_type, 'metro_id', c.metro_id,
      'status', c.status, 'submitted_at', c.submitted_at, 'notes', c.notes,
      'member_name', m.display_name, 'member_avatar_url', m.avatar_url
    ) ORDER BY c.submitted_at ASC), '[]'::jsonb)
    FROM leader_identity_checks c LEFT JOIN members m ON m.id = c.member_id
    WHERE c.status = 'pending'
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_election_participation_stats(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cycle record; v_eligible int; v_ballots int; v_candidates int; v_nominations int;
BEGIN
  PERFORM public.require_sub_role('elections_admin');
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COUNT(DISTINCT m.id) INTO v_eligible FROM members m JOIN cities c ON c.id = m.city_id
  WHERE c.metro_id = v_cycle.metro_id AND m.membership_tier <> 'white' AND m.onboarding_complete AND m.account_status = 'active';
  SELECT COUNT(*) INTO v_ballots FROM leadership_ballots WHERE cycle_id = p_cycle_id;
  SELECT COUNT(*) INTO v_candidates FROM leadership_candidates WHERE cycle_id = p_cycle_id;
  SELECT COUNT(*) INTO v_nominations FROM leadership_nominations WHERE cycle_id = p_cycle_id;
  RETURN jsonb_build_object('cycle_id', p_cycle_id, 'metro_id', v_cycle.metro_id, 'phase', v_cycle.phase,
    'eligible_voters', v_eligible, 'ballots_cast', v_ballots,
    'participation_rate', CASE WHEN v_eligible > 0 THEN ROUND((v_ballots::numeric / v_eligible) * 100, 1) ELSE 0 END,
    'candidates', v_candidates, 'nominations', v_nominations);
END $$;

CREATE OR REPLACE FUNCTION public.get_reconciliation_runs(p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'run_date', r.run_date, 'stripe_total_cents', r.stripe_total_cents,
      'ledger_total_cents', r.ledger_total_cents, 'difference_cents', r.difference_cents, 'status', r.status,
      'resolved_by', r.resolved_by, 'resolved_at', r.resolved_at, 'resolution_notes', r.resolution_notes,
      'created_at', r.created_at,
      'discrepancies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'stripe_event_id', d.stripe_event_id, 'stripe_amount_cents', d.stripe_amount_cents,
        'ledger_amount_cents', d.ledger_amount_cents, 'difference_cents', d.difference_cents, 'notes', d.notes))
        FROM stripe_reconciliation_discrepancies d WHERE d.run_id = r.id), '[]'::jsonb)
    ) ORDER BY r.run_date DESC), '[]'::jsonb)
    FROM (SELECT * FROM stripe_reconciliation_runs ORDER BY run_date DESC LIMIT least(greatest(p_limit, 1), 200)) r
  );
END $$;

DO $$ BEGIN
  IF current_setting('role', true) IS NOT NULL THEN NULL; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_tax_record(p_partner_id uuid, p_tax_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total bigint; v_count int; v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    PERFORM public.require_sub_role('financial_admin');
  END IF;
  SELECT COALESCE(SUM(net_amount_cents), 0), COUNT(*) INTO v_total, v_count
  FROM partner_payouts WHERE partner_id = p_partner_id AND status = 'completed' AND EXTRACT(YEAR FROM requested_at)::int = p_tax_year;
  IF v_total = 0 THEN RETURN jsonb_build_object('success', false, 'reason', 'no_paid_payouts_for_year'); END IF;
  INSERT INTO partner_tax_records (partner_id, tax_year, total_paid_cents, payout_count)
  VALUES (p_partner_id, p_tax_year, v_total, v_count)
  ON CONFLICT (partner_id, tax_year) DO UPDATE SET total_paid_cents = EXCLUDED.total_paid_cents, payout_count = EXCLUDED.payout_count, generated_at = now()
  RETURNING id INTO v_id;
  UPDATE partner_payouts SET tax_year = p_tax_year, tax_record_id = v_id
  WHERE partner_id = p_partner_id AND status = 'completed' AND EXTRACT(YEAR FROM requested_at)::int = p_tax_year AND tax_record_id IS NULL;
  RETURN jsonb_build_object('success', true, 'tax_record_id', v_id, 'total_paid_cents', v_total, 'payout_count', v_count, 'tax_year', p_tax_year);
END $$;

CREATE OR REPLACE FUNCTION public.correct_partner_attribution(p_referred_member_id uuid, p_corrected_partner_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_original uuid; v_correction uuid; v_signup timestamptz;
BEGIN
  PERFORM public.require_sub_role('partner_admin');
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_referred_member_id = p_corrected_partner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'self_referral');
  END IF;
  SELECT created_at INTO v_signup FROM members WHERE id = p_referred_member_id;
  IF v_signup IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'member_not_found'); END IF;
  IF v_signup < now() - interval '7 days' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'correction_window_closed');
  END IF;
  SELECT partner_id INTO v_original FROM partner_referrals WHERE referred_member_id = p_referred_member_id AND status = 'active';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'no_active_attribution'); END IF;
  IF v_original = p_corrected_partner_id THEN RETURN jsonb_build_object('success', false, 'reason', 'same_partner'); END IF;
  IF NOT EXISTS (SELECT 1 FROM empire_partners WHERE member_id = p_corrected_partner_id AND is_active) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'corrected_partner_not_active');
  END IF;
  INSERT INTO partner_attribution_corrections (referred_member_id, original_partner_id, corrected_partner_id, reason, corrected_by)
  VALUES (p_referred_member_id, v_original, p_corrected_partner_id, p_reason, auth.uid()) RETURNING id INTO v_correction;
  UPDATE partner_referrals SET status = 'superseded', superseded_by = v_correction, superseded_at = now()
  WHERE referred_member_id = p_referred_member_id AND status = 'active';
  INSERT INTO partner_referrals (partner_id, referred_member_id, referral_code, status)
  VALUES (p_corrected_partner_id, p_referred_member_id, 'CORRECTED', 'active') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'correction_id', v_correction, 'original_partner_id', v_original, 'corrected_partner_id', p_corrected_partner_id);
END $$;

-- ---------- 4. Treasury releases ----------
CREATE OR REPLACE FUNCTION public.submit_treasury_release(p_metro_id uuid, p_amount_cents bigint, p_initiative_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_available bigint;
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  v_available := (public.get_metro_treasury(p_metro_id)->>'available_cents')::bigint;
  IF p_amount_cents > coalesce(v_available, 0) THEN
    RAISE EXCEPTION 'Release amount ($%) exceeds available Treasury ($%)', (p_amount_cents / 100.0), (coalesce(v_available, 0) / 100.0);
  END IF;
  INSERT INTO treasury_releases (metro_id, initiative_id, amount_cents, submitted_by, review_notes)
  VALUES (p_metro_id, p_initiative_id, p_amount_cents, auth.uid(), p_notes) RETURNING id INTO v_id;
  RETURN jsonb_build_object('release_id', v_id, 'status', 'submitted', 'amount_cents', p_amount_cents);
END $$;

CREATE OR REPLACE FUNCTION public.review_treasury_release(p_release_id uuid, p_review_notes text DEFAULT NULL, p_approve boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_release record; v_other_admins int;
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  SELECT * INTO v_release FROM treasury_releases WHERE id = p_release_id AND status IN ('submitted', 'under_review') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Release not found or not awaiting review'; END IF;

  IF p_approve AND v_release.submitted_by = v_caller THEN
    SELECT count(*) INTO v_other_admins FROM (
      SELECT member_id FROM admin_sub_roles WHERE sub_role = 'financial_admin' AND is_active AND member_id <> v_caller
      UNION SELECT id FROM members WHERE is_admin AND id <> v_caller
    ) x;
    IF v_other_admins > 0 OR NOT public.is_current_user_admin() THEN
      RAISE EXCEPTION 'A different Financial Admin must approve this release';
    END IF;
    INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (v_caller, 'treasury_release_self_approved_sole_admin', 'treasury_release', p_release_id,
            jsonb_build_object('amount_cents', v_release.amount_cents));
  END IF;

  IF p_approve THEN
    UPDATE treasury_releases SET status = 'approved', reviewed_by = v_caller, reviewed_at = now(),
      review_notes = coalesce(p_review_notes, review_notes), approved_by = v_caller, approved_at = now()
    WHERE id = p_release_id;
  ELSE
    UPDATE treasury_releases SET status = 'under_review', reviewed_by = v_caller, reviewed_at = now(),
      review_notes = coalesce(p_review_notes, review_notes)
    WHERE id = p_release_id;
  END IF;
  RETURN jsonb_build_object('release_id', p_release_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'under_review' END);
END $$;

CREATE OR REPLACE FUNCTION public.reject_treasury_release(p_release_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE treasury_releases SET status = 'rejected', rejection_reason = p_reason,
    reviewed_by = COALESCE(reviewed_by, v_caller), reviewed_at = COALESCE(reviewed_at, now())
  WHERE id = p_release_id AND status IN ('submitted', 'under_review', 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Release not found or already completed'; END IF;
  RETURN jsonb_build_object('release_id', p_release_id, 'status', 'rejected');
END $$;

CREATE OR REPLACE FUNCTION public.complete_treasury_release(p_release_id uuid, p_payment_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_release record; v_ledger uuid;
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  SELECT * INTO v_release FROM treasury_releases WHERE id = p_release_id AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Release not found or not in approved status'; END IF;
  INSERT INTO metro_treasury_ledger (metro_id, entry_type, amount_cents, notes, policy_version_id)
  VALUES (v_release.metro_id, 'release', -v_release.amount_cents,
          COALESCE('Treasury release: ' || p_payment_reference, 'Treasury release'), NULL)
  RETURNING id INTO v_ledger;
  UPDATE treasury_releases SET status = 'completed', funded_by = v_caller, funded_at = now(),
    payment_reference = p_payment_reference, completed_by = v_caller, completed_at = now(), ledger_entry_id = v_ledger
  WHERE id = p_release_id;
  PERFORM public.refill_treasury_capacity(v_release.metro_id);
  RETURN jsonb_build_object('release_id', p_release_id, 'status', 'completed', 'ledger_entry_id', v_ledger);
END $$;

-- ---------- 5. Partners ----------
ALTER TABLE empire_partners ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE empire_partners ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES members(id);
ALTER TABLE empire_partners ADD COLUMN IF NOT EXISTS suspended_reason text;

REVOKE INSERT, UPDATE ON empire_partners FROM anon, authenticated;
GRANT INSERT (member_id) ON empire_partners TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_partner_status(p_partner_id uuid, p_active boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('partner_admin');
  IF NOT p_active AND coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to suspend a Partner'; END IF;
  UPDATE empire_partners SET is_active = p_active,
    suspended_at = CASE WHEN p_active THEN NULL ELSE now() END,
    suspended_by = CASE WHEN p_active THEN NULL ELSE auth.uid() END,
    suspended_reason = CASE WHEN p_active THEN NULL ELSE p_reason END,
    updated_at = now()
  WHERE member_id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), CASE WHEN p_active THEN 'partner_reinstated' ELSE 'partner_suspended' END, 'partner', p_partner_id,
          jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('success', true, 'is_active', p_active);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, boolean, text) TO authenticated;

-- ---------- 6. News publishing ----------
CREATE OR REPLACE FUNCTION public.can_publish_news_for_city(p_city_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_current_user_admin() OR EXISTS (
    SELECT 1 FROM metro_council mc JOIN cities c ON c.metro_id = mc.metro_id
    WHERE mc.member_id = auth.uid() AND c.id = p_city_id
      AND mc.council_member_status IN ('active', 'grace_period')
      AND (mc.term_ends_at IS NULL OR mc.term_ends_at > now())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_publish_news_for_city(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_publish_news_for_city(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_current_user_seated_council_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM metro_council WHERE member_id = auth.uid()
      AND council_member_status IN ('active', 'grace_period')
      AND (term_ends_at IS NULL OR term_ends_at > now())
  );
$$;

DROP POLICY IF EXISTS "insert_empire_news_as_council_member" ON local_news;
CREATE POLICY "insert_empire_news_as_council_member" ON local_news FOR INSERT TO authenticated
WITH CHECK (auth.uid() = author_id AND status = 'approved' AND public.can_publish_news_for_city(city_id));

DROP POLICY IF EXISTS "update_own_empire_news" ON local_news;
CREATE POLICY "update_own_empire_news" ON local_news FOR UPDATE TO authenticated
USING (auth.uid() = author_id AND public.can_publish_news_for_city(city_id))
WITH CHECK (auth.uid() = author_id AND status = 'approved' AND public.can_publish_news_for_city(city_id));
