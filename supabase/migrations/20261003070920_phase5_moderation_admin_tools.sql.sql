/*
# Phase 5: Moderation, admin sub-roles, rate limiting, and correction tools

## Plain-English summary
1. Creates `moderation_reports` table for members to report content, listings,
   comments, or other members. Each report has a reason and status.
2. Creates `moderation_actions` table for the permanent admin action history —
   every moderation action (warn, suspend, remove, dismiss) is logged with
   actor, target, reason, and timestamp.
3. Creates `admin_sub_roles` table to assign granular admin sub-roles
   (financial_admin, moderation_admin, elections_admin, etc.) to members.
   These are checked server-side by SECURITY DEFINER functions.
4. Creates `rate_limit_log` table and `check_rate_limit()` function for
   server-side rate limiting on sensitive actions.
5. Creates `member_corrections` table for city/metro correction audit trail.
6. Creates `milestone_corrections` table for founder-only milestone corrections.
7. Creates all the SECURITY DEFINER functions for moderation actions, role
   management, city/metro corrections, and milestone corrections.

## New Tables
### moderation_reports
- `id` (uuid PK)
- `reporter_id` (uuid FK->members) — who reported
- `target_type` (text) — 'listing', 'comment', 'member', 'post'
- `target_id` (uuid) — the ID of the reported entity
- `reason` (text) — why it was reported
- `status` (text) — 'pending', 'actioned', 'dismissed'
- `actioned_by` (uuid, nullable)
- `actioned_at` (timestamptz, nullable)
- `created_at`

### moderation_actions
- `id` (uuid PK)
- `actor_id` (uuid FK->members) — the admin who acted
- `target_type` (text) — 'listing', 'comment', 'member', 'post'
- `target_id` (uuid)
- `action` (text) — 'warn', 'suspend', 'remove', 'dismiss', 'unsuspend'
- `reason` (text)
- `notes` (text, nullable)
- `acted_at` (timestamptz)
- `created_at`

### admin_sub_roles
- `id` (uuid PK)
- `member_id` (uuid FK->members)
- `sub_role` (text) — 'financial_admin', 'moderation_admin', 'elections_admin', 'partner_admin', 'correction_admin'
- `assigned_by` (uuid)
- `assigned_at` (timestamptz)
- `revoked_by` (uuid, nullable)
- `revoked_at` (timestamptz, nullable)
- `is_active` (boolean, default true)
- `created_at`

### rate_limit_log
- `id` (uuid PK)
- `member_id` (uuid)
- `action_type` (text) — 'payout', 'role_change', 'moderation', 'treasury_release'
- `acted_at` (timestamptz)
- `created_at`

### member_corrections
- `id` (uuid PK)
- `member_id` (uuid) — the member whose city/metro was corrected
- `field_corrected` (text) — 'city_id', 'metro_id', 'population_count'
- `old_value` (text)
- `new_value` (text)
- `corrected_by` (uuid)
- `reason` (text)
- `corrected_at` (timestamptz)
- `created_at`

### milestone_corrections
- `id` (uuid PK)
- `metro_id` (uuid)
- `field_corrected` (text) — 'capacity_band', 'qualified_at', 'peak_population'
- `old_value` (text)
- `new_value` (text)
- `corrected_by` (uuid) — must be a founder
- `reason` (text)
- `corrected_at` (timestamptz)
- `created_at`

## Security
- RLS on all new tables.
- `moderation_reports`: members can read their own reports; admins read all.
- `moderation_actions`: admin-only read.
- `admin_sub_roles`: admin-only read; self read.
- `rate_limit_log`: no client read (service role only).
- `member_corrections` and `milestone_corrections`: admin-only read.
- All write operations through SECURITY DEFINER functions with admin checks.
*/

-- ============================================================
-- 1. moderation_reports
-- ============================================================

CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('listing', 'comment', 'member', 'post')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'actioned', 'dismissed')),
  actioned_by uuid,
  actioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own reports" ON public.moderation_reports;
CREATE POLICY "Members can read own reports" ON public.moderation_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Members can create reports" ON public.moderation_reports;
CREATE POLICY "Members can create reports" ON public.moderation_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS idx_mod_reports_status ON public.moderation_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_reports_target ON public.moderation_reports(target_type, target_id);

-- ============================================================
-- 2. moderation_actions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('listing', 'comment', 'member', 'post')),
  target_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('warn', 'suspend', 'remove', 'dismiss', 'unsuspend')),
  reason text NOT NULL,
  notes text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read moderation actions" ON public.moderation_actions;
CREATE POLICY "Admins can read moderation actions" ON public.moderation_actions
  FOR SELECT TO authenticated USING (public.is_current_user_admin());

REVOKE INSERT, UPDATE, DELETE ON public.moderation_actions FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON public.moderation_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_actor ON public.moderation_actions(actor_id, acted_at DESC);

-- ============================================================
-- 3. admin_sub_roles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_sub_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  sub_role text NOT NULL CHECK (sub_role IN ('financial_admin', 'moderation_admin', 'elections_admin', 'partner_admin', 'correction_admin')),
  assigned_by uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid,
  revoked_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, sub_role)
);

ALTER TABLE public.admin_sub_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read sub-roles" ON public.admin_sub_roles;
CREATE POLICY "Admins can read sub-roles" ON public.admin_sub_roles
  FOR SELECT TO authenticated USING (public.is_current_user_admin() OR auth.uid() = member_id);

REVOKE INSERT, UPDATE, DELETE ON public.admin_sub_roles FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_admin_sub_roles_active ON public.admin_sub_roles(member_id, sub_role) WHERE is_active = true;

-- ============================================================
-- 4. rate_limit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('payout', 'role_change', 'moderation', 'treasury_release')),
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_log FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON public.rate_limit_log(member_id, action_type, acted_at DESC);

-- ============================================================
-- 5. member_corrections
-- ============================================================

CREATE TABLE IF NOT EXISTS public.member_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  field_corrected text NOT NULL CHECK (field_corrected IN ('city_id', 'metro_id', 'population_count')),
  old_value text,
  new_value text,
  corrected_by uuid NOT NULL,
  reason text NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read member corrections" ON public.member_corrections;
CREATE POLICY "Admins can read member corrections" ON public.member_corrections
  FOR SELECT TO authenticated USING (public.is_current_user_admin());

REVOKE INSERT, UPDATE, DELETE ON public.member_corrections FROM anon, authenticated;

-- ============================================================
-- 6. milestone_corrections
-- ============================================================

CREATE TABLE IF NOT EXISTS public.milestone_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid NOT NULL REFERENCES public.metros(id) ON DELETE CASCADE,
  field_corrected text NOT NULL CHECK (field_corrected IN ('capacity_band', 'qualified_at', 'peak_population')),
  old_value text,
  new_value text,
  corrected_by uuid NOT NULL,
  reason text NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.milestone_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read milestone corrections" ON public.milestone_corrections;
CREATE POLICY "Admins can read milestone corrections" ON public.milestone_corrections
  FOR SELECT TO authenticated USING (public.is_current_user_admin());

REVOKE INSERT, UPDATE, DELETE ON public.milestone_corrections FROM anon, authenticated;

-- ============================================================
-- 7. FUNCTION: check_rate_limit
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action_type text,
  p_max_per_hour int DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN false;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM rate_limit_log
  WHERE member_id = v_caller
    AND action_type = p_action_type
    AND acted_at > now() - interval '1 hour';

  IF v_count >= p_max_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded for action %. Max % per hour.', p_action_type, p_max_per_hour;
  END IF;

  INSERT INTO rate_limit_log (member_id, action_type) VALUES (v_caller, p_action_type);

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int) TO authenticated;

-- ============================================================
-- 8. FUNCTION: has_sub_role
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_sub_role(p_sub_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_sub_roles
    WHERE member_id = auth.uid() AND sub_role = p_sub_role AND is_active = true
  ) OR public.is_current_user_admin();
$$;

GRANT EXECUTE ON FUNCTION public.has_sub_role(text) TO authenticated;

-- ============================================================
-- 9. FUNCTION: assign_sub_role
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_sub_role(
  p_member_id uuid,
  p_sub_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can assign sub-roles';
  END IF;

  PERFORM public.check_rate_limit('role_change', 20);

  INSERT INTO admin_sub_roles (member_id, sub_role, assigned_by)
  VALUES (p_member_id, p_sub_role, v_caller)
  ON CONFLICT (member_id, sub_role) DO UPDATE
    SET is_active = true, revoked_by = NULL, revoked_at = NULL, assigned_by = v_caller, assigned_at = now();

  RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'sub_role', p_sub_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_sub_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_sub_role(uuid, text) TO authenticated;

-- ============================================================
-- 10. FUNCTION: revoke_sub_role
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_sub_role(
  p_member_id uuid,
  p_sub_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can revoke sub-roles';
  END IF;

  PERFORM public.check_rate_limit('role_change', 20);

  UPDATE admin_sub_roles
  SET is_active = false, revoked_by = v_caller, revoked_at = now()
  WHERE member_id = p_member_id AND sub_role = p_sub_role AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-role not found or already revoked';
  END IF;

  RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'sub_role', p_sub_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_sub_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_sub_role(uuid, text) TO authenticated;

-- ============================================================
-- 11. FUNCTION: take_moderation_action
-- ============================================================

CREATE OR REPLACE FUNCTION public.take_moderation_action(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_report_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_current_user_admin() OR public.has_sub_role('moderation_admin')) THEN
    RAISE EXCEPTION 'Only admins or moderation admins can take moderation actions';
  END IF;

  PERFORM public.check_rate_limit('moderation', 30);

  INSERT INTO moderation_actions (actor_id, target_type, target_id, action, reason, notes)
  VALUES (v_caller, p_target_type, p_target_id, p_action, p_reason, p_notes);

  -- If a report was linked, mark it actioned or dismissed
  IF p_report_id IS NOT NULL THEN
    UPDATE moderation_reports
    SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'actioned' END,
        actioned_by = v_caller, actioned_at = now()
    WHERE id = p_report_id;
  END IF;

  -- If suspending a member, update their account_status
  IF p_action = 'suspend' AND p_target_type = 'member' THEN
    UPDATE members SET account_status = 'suspended' WHERE id = p_target_id;
  ELSIF p_action = 'unsuspend' AND p_target_type = 'member' THEN
    UPDATE members SET account_status = 'active' WHERE id = p_target_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'action', p_action, 'target_type', p_target_type);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.take_moderation_action(text, uuid, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.take_moderation_action(text, uuid, text, text, text, uuid) TO authenticated;

-- ============================================================
-- 12. FUNCTION: get_moderation_queue
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_moderation_queue(p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'reporter_id', r.reporter_id,
    'target_type', r.target_type,
    'target_id', r.target_id,
    'reason', r.reason,
    'status', r.status,
    'created_at', r.created_at,
    'reporter_name', m.display_name
  ) ORDER BY r.created_at ASC), '[]'::jsonb)
  FROM (
    SELECT * FROM moderation_reports WHERE status = 'pending' ORDER BY created_at ASC LIMIT p_limit
  ) r
  LEFT JOIN members m ON m.id = r.reporter_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_moderation_queue(int) TO authenticated;

-- ============================================================
-- 13. FUNCTION: correct_member_city
-- ============================================================

CREATE OR REPLACE FUNCTION public.correct_member_city(
  p_member_id uuid,
  p_new_city_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old_city_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_current_user_admin() OR public.has_sub_role('correction_admin')) THEN
    RAISE EXCEPTION 'Only admins can correct member cities';
  END IF;

  SELECT city_id INTO v_old_city_id FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  INSERT INTO member_corrections (member_id, field_corrected, old_value, new_value, corrected_by, reason)
  VALUES (p_member_id, 'city_id', v_old_city_id::text, p_new_city_id::text, v_caller, p_reason);

  UPDATE members SET city_id = p_new_city_id WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true, 'old_city_id', v_old_city_id, 'new_city_id', p_new_city_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.correct_member_city(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.correct_member_city(uuid, uuid, text) TO authenticated;

-- ============================================================
-- 14. FUNCTION: correct_milestone
-- ============================================================

CREATE OR REPLACE FUNCTION public.correct_milestone(
  p_metro_id uuid,
  p_field text,
  p_new_value text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old_value text;
  v_is_founder boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only founders can correct milestones
  SELECT is_founder INTO v_is_founder FROM members WHERE id = v_caller;
  IF NOT COALESCE(v_is_founder, false) THEN
    RAISE EXCEPTION 'Only Founders can correct milestones';
  END IF;

  IF p_field = 'capacity_band' THEN
    SELECT capacity_band::text INTO v_old_value FROM metro_milestones WHERE metro_id = p_metro_id;
    UPDATE metro_milestones SET capacity_band = p_new_value::int WHERE metro_id = p_metro_id;
  ELSIF p_field = 'peak_population' THEN
    SELECT peak_population::text INTO v_old_value FROM metro_milestones WHERE metro_id = p_metro_id;
    UPDATE metro_milestones SET peak_population = p_new_value::int WHERE metro_id = p_metro_id;
  ELSE
    RAISE EXCEPTION 'Invalid field for milestone correction: %', p_field;
  END IF;

  INSERT INTO milestone_corrections (metro_id, field_corrected, old_value, new_value, corrected_by, reason)
  VALUES (p_metro_id, p_field, v_old_value, p_new_value, v_caller, p_reason);

  RETURN jsonb_build_object('success', true, 'field', p_field, 'old_value', v_old_value, 'new_value', p_new_value);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.correct_milestone(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.correct_milestone(uuid, text, text, text) TO authenticated;

-- ============================================================
-- 15. FUNCTION: get_admin_sub_roles
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_sub_roles()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sr.id,
    'member_id', sr.member_id,
    'sub_role', sr.sub_role,
    'is_active', sr.is_active,
    'assigned_at', sr.assigned_at,
    'revoked_at', sr.revoked_at,
    'member_name', m.display_name,
    'member_avatar_url', m.avatar_url
  ) ORDER BY sr.is_active DESC, sr.sub_role, sr.assigned_at DESC), '[]'::jsonb)
  FROM admin_sub_roles sr
  LEFT JOIN members m ON m.id = sr.member_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_sub_roles() TO authenticated;

-- ============================================================
-- 16. FUNCTION: cancel_election_cycle
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_election_cycle(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_current_user_admin() OR public.has_sub_role('elections_admin')) THEN
    RAISE EXCEPTION 'Only admins can cancel election cycles';
  END IF;

  UPDATE leadership_election_cycles
  SET phase = 'closed', updated_at = now()
  WHERE id = p_cycle_id AND phase IN ('nomination', 'election', 'runoff');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle not found or already closed';
  END IF;

  RETURN jsonb_build_object('success', true, 'cycle_id', p_cycle_id, 'status', 'cancelled');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_election_cycle(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_election_cycle(uuid) TO authenticated;

-- ============================================================
-- 17. FUNCTION: get_election_participation_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_election_participation_stats(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle record;
  v_eligible_voters int;
  v_ballots_cast int;
  v_candidates int;
  v_nominations int;
BEGIN
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(DISTINCT m.id) INTO v_eligible_voters
  FROM members m
  JOIN cities c ON c.id = m.city_id
  WHERE c.metro_id = v_cycle.metro_id
    AND m.membership_tier <> 'white'
    AND m.onboarding_complete = true
    AND m.account_status = 'active';

  SELECT COUNT(*) INTO v_ballots_cast
  FROM leadership_ballots WHERE cycle_id = p_cycle_id;

  SELECT COUNT(*) INTO v_candidates
  FROM leadership_candidates WHERE cycle_id = p_cycle_id;

  SELECT COUNT(*) INTO v_nominations
  FROM leadership_nominations WHERE cycle_id = p_cycle_id;

  RETURN jsonb_build_object(
    'cycle_id', p_cycle_id,
    'metro_id', v_cycle.metro_id,
    'phase', v_cycle.phase,
    'eligible_voters', v_eligible_voters,
    'ballots_cast', v_ballots_cast,
    'participation_rate', CASE WHEN v_eligible_voters > 0 THEN ROUND((v_ballots_cast::numeric / v_eligible_voters) * 100, 1) ELSE 0 END,
    'candidates', v_candidates,
    'nominations', v_nominations
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_election_participation_stats(uuid) TO authenticated;
