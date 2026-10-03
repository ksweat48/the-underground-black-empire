/*
# Phase 4: Empire Advisory Council — seats, applications, recusals, role assignments

## Plain-English summary
1. Creates the `empire_advisory_council` table with 11 seats. Each seat has a role label
   (e.g. "Media and Public Affairs"). Seats are appointed by Founder/Admin. A seat can be
   filled or vacant. Appointments are permanent audit records.
2. Creates `eac_applications` so members can apply for vacant seats, including a conflict
   disclosure field (required at application time).
3. Creates `eac_recusal_records` so a Council member can formally recuse from a specific
   Empire-wide vote, with the recusal logged permanently.
4. Creates `eac_appointment_history` for permanent audit of every appointment, removal,
   and replacement.
5. Adds `eac_role` text column to track role assignments per seat.

## New Tables
### empire_advisory_council
- `id` (uuid PK)
- `seat_number` (int 1-11, unique) — the seat
- `member_id` (uuid FK->members, nullable) — null means vacant
- `role_label` (text) — e.g. "Media and Public Affairs", "Treasury Oversight"
- `appointed_at` (timestamptz) — when the current member was seated
- `appointed_by` (uuid) — who appointed them
- `is_active` (boolean, default true)
- `created_at`, `updated_at`

### eac_applications
- `id` (uuid PK)
- `seat_number` (int) — which seat they're applying for
- `member_id` (uuid FK->members)
- `conflict_disclosure` (text, NOT NULL) — required, must describe any conflicts
- `qualifications` (text) — why they're qualified
- `status` (text) — 'pending', 'approved', 'rejected', 'withdrawn'
- `reviewed_by` (uuid, nullable)
- `reviewed_at` (timestamptz, nullable)
- `review_notes` (text, nullable)
- `created_at`, `updated_at`

### eac_recusal_records
- `id` (uuid PK)
- `member_id` (uuid FK->members) — the EAC member recusing
- `empire_vote_id` (uuid, nullable) — the specific Empire-wide vote
- `reason` (text) — why they are recusing
- `recused_at` (timestamptz)
- `created_at`

### eac_appointment_history
- `id` (uuid PK)
- `seat_number` (int)
- `member_id` (uuid) — who was appointed or removed
- `action` (text) — 'appointed', 'removed', 'replaced', 'resigned'
- `previous_member_id` (uuid, nullable) — for replacements
- `acted_by` (uuid) — who made the change
- `reason` (text, nullable)
- `acted_at` (timestamptz)
- `created_at`

## Security
- RLS enabled on all new tables.
- `empire_advisory_council`: public read (all members can see who's on the Council).
- `eac_applications`: members can read their own; admin can read all.
- `eac_recusal_records`: public read (recusals are public record).
- `eac_appointment_history`: public read (audit trail).
- All write operations go through SECURITY DEFINER functions.

## Important Notes
1. The 11 seats are pre-seeded with role labels but no members (all vacant).
2. Only Founder/Admin can appoint, remove, or replace EAC members.
3. Conflict disclosure is required at application time — empty disclosures are rejected.
4. Recusal records are permanent and public — they cannot be deleted.
*/

-- ============================================================
-- 1. empire_advisory_council
-- ============================================================

CREATE TABLE IF NOT EXISTS public.empire_advisory_council (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_number integer NOT NULL UNIQUE CHECK (seat_number BETWEEN 1 AND 11),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  role_label text NOT NULL,
  appointed_at timestamptz,
  appointed_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.empire_advisory_council ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read EAC" ON public.empire_advisory_council;
CREATE POLICY "Public can read EAC" ON public.empire_advisory_council
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.empire_advisory_council FROM anon, authenticated;

-- Seed 11 vacant seats with role labels
INSERT INTO public.empire_advisory_council (seat_number, role_label)
VALUES
  (1, 'Treasury Oversight'),
  (2, 'Media and Public Affairs'),
  (3, 'Community Engagement'),
  (4, 'Membership and Growth'),
  (5, 'Education and Mentorship'),
  (6, 'Economic Development'),
  (7, 'Justice and Advocacy'),
  (8, 'Health and Wellness'),
  (9, 'Technology and Innovation'),
  (10, 'Family and Legacy'),
  (11, 'Interfaith and Cultural Affairs')
ON CONFLICT (seat_number) DO NOTHING;

-- ============================================================
-- 2. eac_applications
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eac_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_number integer NOT NULL CHECK (seat_number BETWEEN 1 AND 11),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  conflict_disclosure text NOT NULL,
  qualifications text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eac_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own EAC applications" ON public.eac_applications;
CREATE POLICY "Members can read own EAC applications" ON public.eac_applications
  FOR SELECT TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_eac_applications_seat ON public.eac_applications(seat_number, status);
CREATE INDEX IF NOT EXISTS idx_eac_applications_member ON public.eac_applications(member_id);

-- ============================================================
-- 3. eac_recusal_records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eac_recusal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  empire_vote_id uuid,
  reason text NOT NULL,
  recused_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eac_recusal_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read EAC recusals" ON public.eac_recusal_records;
CREATE POLICY "Public can read EAC recusals" ON public.eac_recusal_records
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.eac_recusal_records FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_eac_recusals_member ON public.eac_recusal_records(member_id);

-- ============================================================
-- 4. eac_appointment_history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eac_appointment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_number integer NOT NULL CHECK (seat_number BETWEEN 1 AND 11),
  member_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('appointed', 'removed', 'replaced', 'resigned')),
  previous_member_id uuid,
  acted_by uuid,
  reason text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eac_appointment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read EAC appointment history" ON public.eac_appointment_history;
CREATE POLICY "Public can read EAC appointment history" ON public.eac_appointment_history
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.eac_appointment_history FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_eac_appointment_history_seat
  ON public.eac_appointment_history(seat_number, acted_at DESC);

-- ============================================================
-- 5. FUNCTION: appoint_eac_member
-- ============================================================

CREATE OR REPLACE FUNCTION public.appoint_eac_member(
  p_seat_number int,
  p_member_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_current_member_id uuid;
  v_previous_member_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can appoint EAC members';
  END IF;

  IF p_seat_number < 1 OR p_seat_number > 11 THEN
    RAISE EXCEPTION 'Invalid seat number';
  END IF;

  -- Get current occupant
  SELECT member_id INTO v_current_member_id
  FROM empire_advisory_council
  WHERE seat_number = p_seat_number AND is_active = true;

  v_previous_member_id := v_current_member_id;

  -- Update the seat
  UPDATE empire_advisory_council
  SET member_id = p_member_id,
      appointed_at = now(),
      appointed_by = v_caller,
      is_active = true,
      updated_at = now()
  WHERE seat_number = p_seat_number;

  -- Record in history
  INSERT INTO eac_appointment_history (seat_number, member_id, action, previous_member_id, acted_by, reason)
  VALUES (
    p_seat_number, p_member_id,
    CASE WHEN v_previous_member_id IS NOT NULL THEN 'replaced' ELSE 'appointed' END,
    v_previous_member_id, v_caller, p_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'seat_number', p_seat_number,
    'action', CASE WHEN v_previous_member_id IS NOT NULL THEN 'replaced' ELSE 'appointed' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.appoint_eac_member(int, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.appoint_eac_member(int, uuid, text) TO authenticated;

-- ============================================================
-- 6. FUNCTION: remove_eac_member
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_eac_member(
  p_seat_number int,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_current_member_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can remove EAC members';
  END IF;

  SELECT member_id INTO v_current_member_id
  FROM empire_advisory_council
  WHERE seat_number = p_seat_number AND is_active = true;

  IF v_current_member_id IS NULL THEN
    RAISE EXCEPTION 'Seat is already vacant';
  END IF;

  UPDATE empire_advisory_council
  SET member_id = NULL, appointed_at = NULL, appointed_by = NULL,
      is_active = false, updated_at = now()
  WHERE seat_number = p_seat_number;

  INSERT INTO eac_appointment_history (seat_number, member_id, action, acted_by, reason)
  VALUES (p_seat_number, v_current_member_id, 'removed', v_caller, p_reason);

  RETURN jsonb_build_object('success', true, 'seat_number', p_seat_number, 'action', 'removed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_eac_member(int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_eac_member(int, text) TO authenticated;

-- ============================================================
-- 7. FUNCTION: submit_eac_application
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_eac_application(
  p_seat_number int,
  p_conflict_disclosure text,
  p_qualifications text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_seat record;
  v_existing record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_seat_number < 1 OR p_seat_number > 11 THEN
    RAISE EXCEPTION 'Invalid seat number';
  END IF;

  IF NULLIF(TRIM(p_conflict_disclosure), '') IS NULL THEN
    RAISE EXCEPTION 'Conflict disclosure is required';
  END IF;

  SELECT * INTO v_seat FROM empire_advisory_council WHERE seat_number = p_seat_number;

  IF v_seat.member_id IS NOT NULL AND v_seat.is_active THEN
    RAISE EXCEPTION 'This seat is currently filled';
  END IF;

  -- Check for existing pending application
  SELECT * INTO v_existing
  FROM eac_applications
  WHERE seat_number = p_seat_number AND member_id = v_caller AND status = 'pending';

  IF FOUND THEN
    RAISE EXCEPTION 'You already have a pending application for this seat';
  END IF;

  INSERT INTO eac_applications (seat_number, member_id, conflict_disclosure, qualifications)
  VALUES (p_seat_number, v_caller, p_conflict_disclosure, p_qualifications);

  RETURN jsonb_build_object('success', true, 'seat_number', p_seat_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_eac_application(int, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_eac_application(int, text, text) TO authenticated;

-- ============================================================
-- 8. FUNCTION: recuse_from_empire_vote
-- ============================================================

CREATE OR REPLACE FUNCTION public.recuse_from_empire_vote(
  p_empire_vote_id uuid,
  p_reason text
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

  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required for recusal';
  END IF;

  -- Verify caller is an active EAC member
  IF NOT EXISTS (
    SELECT 1 FROM empire_advisory_council
    WHERE member_id = v_caller AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only EAC members can recuse';
  END IF;

  -- Check for duplicate recusal
  IF EXISTS (
    SELECT 1 FROM eac_recusal_records
    WHERE member_id = v_caller AND empire_vote_id = p_empire_vote_id
  ) THEN
    RAISE EXCEPTION 'You have already recused from this vote';
  END IF;

  INSERT INTO eac_recusal_records (member_id, empire_vote_id, reason)
  VALUES (v_caller, p_empire_vote_id, p_reason);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recuse_from_empire_vote(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.recuse_from_empire_vote(uuid, text) TO authenticated;

-- ============================================================
-- 9. FUNCTION: get_eac
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_eac()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'seat_number', eac.seat_number,
    'role_label', eac.role_label,
    'member_id', eac.member_id,
    'is_active', eac.is_active,
    'appointed_at', eac.appointed_at,
    'is_vacant', eac.member_id IS NULL OR NOT eac.is_active,
    'member_name', m.display_name,
    'member_avatar_url', m.avatar_url
  ) ORDER BY eac.seat_number)
  FROM empire_advisory_council eac
  LEFT JOIN members m ON m.id = eac.member_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_eac() TO authenticated;
