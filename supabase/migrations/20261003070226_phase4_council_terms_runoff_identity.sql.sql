/*
# Phase 4: Council terms, grace period, identity checks, runoff, recurring cycles

## Summary
Adds 6-month terms, grace period, identity checks, runoff handling, and recurring
election cycles to the leadership system. See migration body for details.
*/

-- ============================================================
-- 1. Add columns to leadership_election_cycles
-- ============================================================

ALTER TABLE public.leadership_election_cycles
  ADD COLUMN IF NOT EXISTS runoff_phase boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS runoff_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS runoff_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_cycle_id uuid REFERENCES public.leadership_election_cycles(id);

-- Update the phase constraint to include 'runoff'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'leadership_election_cycles'
    AND constraint_name = 'leadership_election_cycles_phase_check'
  ) THEN
    ALTER TABLE public.leadership_election_cycles DROP CONSTRAINT leadership_election_cycles_phase_check;
  END IF;
END $$;

ALTER TABLE public.leadership_election_cycles
  ADD CONSTRAINT leadership_election_cycles_phase_check
  CHECK (phase IN ('nomination', 'election', 'runoff', 'closed'));

-- ============================================================
-- 2. Add term columns to metro_council
-- ============================================================

ALTER TABLE public.metro_council
  ADD COLUMN IF NOT EXISTS term_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS term_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_eligible_for_reelection boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS council_member_status text NOT NULL DEFAULT 'active'
    CHECK (council_member_status IN ('active', 'grace_period', 'removed', 'resigned', 'term_expired')),
  ADD COLUMN IF NOT EXISTS grace_period_started_at timestamptz;

-- ============================================================
-- 3. council_action_history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.council_action_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid REFERENCES public.metros(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('resigned', 'removed', 'term_expired', 'grace_started', 'grace_ended', 'reelected')),
  acted_by uuid,
  reason text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.council_action_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read council action history" ON public.council_action_history;
CREATE POLICY "Public can read council action history" ON public.council_action_history
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.council_action_history FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_council_action_history_metro
  ON public.council_action_history(metro_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_council_action_history_member
  ON public.council_action_history(member_id);

-- ============================================================
-- 4. leader_identity_checks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leader_identity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  check_type text NOT NULL CHECK (check_type IN ('metro_council', 'eac')),
  metro_id uuid REFERENCES public.metros(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'more_info_requested')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  identity_document_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leader_identity_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own identity checks" ON public.leader_identity_checks;
CREATE POLICY "Members can read own identity checks" ON public.leader_identity_checks
  FOR SELECT TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_identity_checks_status ON public.leader_identity_checks(status, check_type);
CREATE INDEX IF NOT EXISTS idx_identity_checks_member ON public.leader_identity_checks(member_id);

-- ============================================================
-- 5. Drop old finalize function (return type change)
-- ============================================================

DROP FUNCTION IF EXISTS public.finalize_leadership_election(uuid);

-- ============================================================
-- 6. FUNCTION: create_election_cycle
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_election_cycle(
  p_metro_id uuid,
  p_nomination_days int DEFAULT 14,
  p_election_days int DEFAULT 7,
  p_is_recurring boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_id uuid;
  v_nomination_opens timestamptz := now();
  v_nomination_closes timestamptz;
  v_election_opens timestamptz;
  v_election_closes timestamptz;
BEGIN
  v_nomination_closes := v_nomination_opens + (p_nomination_days || ' days')::interval;
  v_election_opens := v_nomination_closes;
  v_election_closes := v_election_opens + (p_election_days || ' days')::interval;

  INSERT INTO leadership_election_cycles (
    metro_id, phase,
    nomination_opens_at, nomination_closes_at,
    election_opens_at, election_closes_at,
    is_recurring
  ) VALUES (
    p_metro_id, 'nomination',
    v_nomination_opens, v_nomination_closes,
    v_election_opens, v_election_closes,
    p_is_recurring
  )
  RETURNING id INTO v_cycle_id;

  RETURN jsonb_build_object(
    'cycle_id', v_cycle_id,
    'metro_id', p_metro_id,
    'nomination_opens_at', v_nomination_opens,
    'nomination_closes_at', v_nomination_closes,
    'election_opens_at', v_election_opens,
    'election_closes_at', v_election_closes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_election_cycle(uuid, int, int, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_election_cycle(uuid, int, int, boolean) TO authenticated;

-- ============================================================
-- 7. FUNCTION: finalize_leadership_election WITH RUNOFF
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_leadership_election(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_seat integer := 1;
  v_winner RECORD;
  v_cutoff_vote_count integer;
  v_tied_count integer;
  v_term_end timestamptz;
BEGIN
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle not found';
  END IF;

  IF v_cycle.phase NOT IN ('election', 'runoff') THEN
    RAISE EXCEPTION 'Cycle is not in election or runoff phase';
  END IF;

  IF v_cycle.phase = 'election' AND now() < v_cycle.election_closes_at THEN
    RAISE EXCEPTION 'Election has not closed yet';
  END IF;

  IF v_cycle.phase = 'runoff' AND now() < v_cycle.runoff_closes_at THEN
    RAISE EXCEPTION 'Runoff has not closed yet';
  END IF;

  -- Calculate the vote count at the cutoff seat
  SELECT vote_count INTO v_cutoff_vote_count
  FROM (
    SELECT lc.member_id, COUNT(*) AS vote_count,
           ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, lc.influence_at_nomination DESC) AS rn
    FROM leadership_ballots lb
    CROSS JOIN unnest(lb.selected_candidate_ids) AS candidate_id
    JOIN leadership_candidates lc ON lc.member_id = candidate_id AND lc.cycle_id = p_cycle_id
    WHERE lb.cycle_id = p_cycle_id
    GROUP BY lc.member_id
  ) ranked
  WHERE rn = v_cycle.seats;

  -- Check if there's a tie at the cutoff
  SELECT COUNT(*) INTO v_tied_count
  FROM (
    SELECT lc.member_id, COUNT(*) AS vote_count
    FROM leadership_ballots lb
    CROSS JOIN unnest(lb.selected_candidate_ids) AS candidate_id
    JOIN leadership_candidates lc ON lc.member_id = candidate_id AND lc.cycle_id = p_cycle_id
    WHERE lb.cycle_id = p_cycle_id
    GROUP BY lc.member_id
    HAVING COUNT(*) = v_cutoff_vote_count
  ) tied;

  -- If tie at cutoff and not already in runoff, trigger runoff
  IF v_tied_count > 1 AND v_cycle.phase = 'election' THEN
    UPDATE leadership_election_cycles
    SET phase = 'runoff',
        runoff_phase = true,
        runoff_opens_at = now(),
        runoff_closes_at = now() + interval '3 days',
        updated_at = now()
    WHERE id = p_cycle_id;

    RETURN jsonb_build_object(
      'status', 'runoff_triggered',
      'tied_count', v_tied_count,
      'cutoff_vote_count', v_cutoff_vote_count
    );
  END IF;

  -- Seat the winners
  v_term_end := now() + interval '6 months';

  FOR v_winner IN
    SELECT lc.member_id, COUNT(*) AS vote_count
    FROM leadership_ballots lb
    CROSS JOIN unnest(lb.selected_candidate_ids) AS candidate_id
    JOIN leadership_candidates lc ON lc.member_id = candidate_id AND lc.cycle_id = p_cycle_id
    WHERE lb.cycle_id = p_cycle_id
    GROUP BY lc.member_id
    ORDER BY vote_count DESC, lc.influence_at_nomination DESC
    LIMIT v_cycle.seats
  LOOP
    INSERT INTO metro_council (
      metro_id, cycle_id, member_id, seat_number, vote_count,
      term_starts_at, term_ends_at, is_eligible_for_reelection, council_member_status
    ) VALUES (
      v_cycle.metro_id, p_cycle_id, v_winner.member_id, v_seat, v_winner.vote_count,
      now(), v_term_end, true, 'active'
    );
    v_seat := v_seat + 1;
  END LOOP;

  UPDATE leadership_election_cycles
  SET phase = 'closed', updated_at = now()
  WHERE id = p_cycle_id;

  RETURN jsonb_build_object(
    'status', 'completed',
    'seats_filled', v_seat - 1,
    'term_ends_at', v_term_end
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_leadership_election(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_leadership_election(uuid) TO authenticated;

-- ============================================================
-- 8. FUNCTION: resign_council_seat
-- ============================================================

CREATE OR REPLACE FUNCTION public.resign_council_seat(p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_council record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_council
  FROM metro_council
  WHERE member_id = v_caller AND council_member_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not an active council member';
  END IF;

  UPDATE metro_council
  SET council_member_status = 'resigned'
  WHERE member_id = v_caller AND council_member_status = 'active';

  INSERT INTO council_action_history (metro_id, member_id, action, reason)
  VALUES (v_council.metro_id, v_caller, 'resigned', p_reason);

  RETURN jsonb_build_object('success', true, 'action', 'resigned');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resign_council_seat(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resign_council_seat(text) TO authenticated;

-- ============================================================
-- 9. FUNCTION: remove_council_member
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_council_member(
  p_member_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_council record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can remove council members';
  END IF;

  SELECT * INTO v_council
  FROM metro_council
  WHERE member_id = p_member_id AND council_member_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member is not an active council member';
  END IF;

  UPDATE metro_council
  SET council_member_status = 'removed'
  WHERE member_id = p_member_id AND council_member_status = 'active';

  INSERT INTO council_action_history (metro_id, member_id, action, acted_by, reason)
  VALUES (v_council.metro_id, p_member_id, 'removed', v_caller, p_reason);

  RETURN jsonb_build_object('success', true, 'action', 'removed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_council_member(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_council_member(uuid, text) TO authenticated;

-- ============================================================
-- 10. FUNCTION: process_grace_period_checks
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_grace_period_checks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member record;
  v_results jsonb[];
  v_influence integer;
  v_tier text;
  v_city_id uuid;
BEGIN
  FOR v_member IN
    SELECT mc.id, mc.member_id, mc.metro_id, mc.council_member_status, mc.grace_period_started_at
    FROM metro_council mc
    WHERE mc.council_member_status IN ('active', 'grace_period')
  LOOP
    v_influence := 0;
    v_tier := NULL;
    v_city_id := NULL;

    SELECT membership_tier, city_id INTO v_tier, v_city_id
    FROM members WHERE id = v_member.member_id;

    v_influence := public.get_member_influence(v_member.member_id);

    IF v_influence < 250 OR v_tier IS NULL OR v_tier = 'white' OR v_city_id IS NULL THEN
      IF v_member.council_member_status = 'active' THEN
        UPDATE metro_council
        SET council_member_status = 'grace_period', grace_period_started_at = now()
        WHERE id = v_member.id;

        INSERT INTO council_action_history (metro_id, member_id, action, reason)
        VALUES (v_member.metro_id, v_member.member_id, 'grace_started',
                'Dropped below eligibility requirements');

        v_results := array_append(v_results, jsonb_build_object(
          'member_id', v_member.member_id, 'action', 'grace_started'
        ));
      ELSIF v_member.council_member_status = 'grace_period' AND v_member.grace_period_started_at IS NOT NULL THEN
        IF now() - v_member.grace_period_started_at > interval '30 days' THEN
          UPDATE metro_council
          SET council_member_status = 'removed'
          WHERE id = v_member.id;

          INSERT INTO council_action_history (metro_id, member_id, action, reason)
          VALUES (v_member.metro_id, v_member.member_id, 'removed',
                  'Grace period expired without regaining eligibility');

          v_results := array_append(v_results, jsonb_build_object(
            'member_id', v_member.member_id, 'action', 'grace_expired_removed'
          ));
        END IF;
      END IF;
    ELSIF v_member.council_member_status = 'grace_period' THEN
      UPDATE metro_council
      SET council_member_status = 'active', grace_period_started_at = NULL
      WHERE id = v_member.id;

      INSERT INTO council_action_history (metro_id, member_id, action, reason)
      VALUES (v_member.metro_id, v_member.member_id, 'grace_ended',
              'Regained eligibility requirements');

      v_results := array_append(v_results, jsonb_build_object(
        'member_id', v_member.member_id, 'action', 'grace_ended'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('processed', array_length(v_results, 1) > 0, 'results', to_jsonb(v_results));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_grace_period_checks() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 11. FUNCTION: submit_identity_check
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_identity_check(
  p_member_id uuid,
  p_check_type text,
  p_metro_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_check_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can queue identity checks';
  END IF;

  INSERT INTO leader_identity_checks (member_id, check_type, metro_id, submitted_at)
  VALUES (p_member_id, p_check_type, p_metro_id, now())
  RETURNING id INTO v_check_id;

  RETURN jsonb_build_object('check_id', v_check_id, 'status', 'pending');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_identity_check(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_identity_check(uuid, text, uuid) TO authenticated;

-- ============================================================
-- 12. FUNCTION: review_identity_check
-- ============================================================

CREATE OR REPLACE FUNCTION public.review_identity_check(
  p_check_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
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
    RAISE EXCEPTION 'Only admins can review identity checks';
  END IF;

  IF p_status NOT IN ('verified', 'rejected', 'more_info_requested') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE leader_identity_checks
  SET status = p_status, reviewed_by = v_caller, reviewed_at = now(), notes = p_notes
  WHERE id = p_check_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity check not found or already reviewed';
  END IF;

  RETURN jsonb_build_object('check_id', p_check_id, 'status', p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_identity_check(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_identity_check(uuid, text, text) TO authenticated;

-- ============================================================
-- 13. FUNCTION: get_pending_identity_checks
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pending_identity_checks()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'member_id', c.member_id,
    'check_type', c.check_type,
    'metro_id', c.metro_id,
    'status', c.status,
    'submitted_at', c.submitted_at,
    'notes', c.notes,
    'member_name', m.display_name,
    'member_avatar_url', m.avatar_url
  ) ORDER BY c.submitted_at ASC), '[]'::jsonb)
  FROM leader_identity_checks c
  LEFT JOIN members m ON m.id = c.member_id
  WHERE c.status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_identity_checks() TO authenticated;
