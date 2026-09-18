/*
# Leadership System — Remove Opt-In, Add Nominee Acceptance

## Summary
Removes the `leadership_opt_in` requirement from the nomination flow. Members who meet
eligibility requirements (city assigned, 250+ Influence, Black or higher membership) are
automatically nominatable by other members in their Metro.

When nominated, the nominee must explicitly accept their nomination before the nomination
period closes. Only accepted nominees become finalists (leadership_candidates) in the
election ballot. Declined or unanswered nominees are excluded from the election.

## Changes

1. New Table: `leadership_nominee_acceptances`
   - Tracks whether a nominated member has accepted or declined their nomination for a cycle
   - Fields: cycle_id, member_id, status ('accepted'|'declined'), accepted_at, declined_at
   - One row per member per cycle

2. Modified Function: `submit_leadership_nomination`
   - Removed the `leadership_opt_in = true` check
   - Now checks eligibility directly: city_id not null, influence >= 250, membership_tier in Black+
   - Otherwise the nomination flow is unchanged

3. New Function: `accept_leadership_nomination`
   - Called by the nominee to accept their nomination for the current cycle
   - Verifies the member has at least one nomination in the current cycle
   - Verifies the cycle is still in nomination phase
   - Inserts/updates a row in leadership_nominee_acceptances with status 'accepted'

4. New Function: `decline_leadership_nomination`
   - Called by the nominee to decline their nomination for the current cycle
   - Verifies the member has at least one nomination in the current cycle
   - Verifies the cycle is still in nomination phase
   - Inserts/updates a row in leadership_nominee_acceptances with status 'declined'

5. New Function: `promote_leadership_finalists`
   - Called when nomination phase ends to promote accepted nominees to leadership_candidates
   - Only nominees with status = 'accepted' in leadership_nominee_acceptances are promoted
   - Nominees who declined or never responded are excluded
   - Orders by nomination_count desc, influence desc, limited to finalist_count

6. Modified Function: `finalize_leadership_election`
   - Unchanged — still tallies ballots and seats council from leadership_candidates

7. Security
   - RLS enabled on leadership_nominee_acceptances
   - Read: members can see acceptances in their own metro's cycles
   - All mutations go through SECURITY DEFINER functions
   - No direct insert/update/delete from client

## Notes
- The `leadership_opt_in` column on `members` remains in the database but is no longer checked
  anywhere. It can be removed in a future cleanup migration.
- Existing toggle_leadership_opt_in function remains but is no longer called by the app.
*/

-- ============================================================
-- 1. NEW TABLE: leadership_nominee_acceptances
-- ============================================================
CREATE TABLE IF NOT EXISTS leadership_nominee_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES leadership_election_cycles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, member_id)
);

ALTER TABLE leadership_nominee_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_acceptances_own_metro" ON leadership_nominee_acceptances;
CREATE POLICY "read_acceptances_own_metro" ON leadership_nominee_acceptances FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM leadership_election_cycles lec
      WHERE lec.id = leadership_nominee_acceptances.cycle_id
      AND lec.metro_id = (
        SELECT c.metro_id FROM members m
        JOIN cities c ON c.id = m.city_id
        WHERE m.id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "insert_acceptances" ON leadership_nominee_acceptances;
CREATE POLICY "insert_acceptances" ON leadership_nominee_acceptances FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_acceptances" ON leadership_nominee_acceptances;
CREATE POLICY "update_acceptances" ON leadership_nominee_acceptances FOR UPDATE
  TO authenticated USING (false);

DROP POLICY IF EXISTS "delete_acceptances" ON leadership_nominee_acceptances;
CREATE POLICY "delete_acceptances" ON leadership_nominee_acceptances FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_nominee_acceptances_cycle ON leadership_nominee_acceptances(cycle_id);
CREATE INDEX IF NOT EXISTS idx_nominee_acceptances_member ON leadership_nominee_acceptances(member_id);
CREATE INDEX IF NOT EXISTS idx_nominee_acceptances_status ON leadership_nominee_acceptances(status);

-- ============================================================
-- 2. MODIFIED FUNCTION: submit_leadership_nomination
--    Removed opt_in check, added eligibility check
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_leadership_nomination(p_candidate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_nominator_metro uuid;
  v_candidate_metro uuid;
  v_existing_nominations integer;
  v_candidate RECORD;
  v_candidate_influence integer;
BEGIN
  IF p_candidate_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot nominate yourself';
  END IF;

  v_nominator_metro := public.get_my_metro_id();
  IF v_nominator_metro IS NULL THEN
    RAISE EXCEPTION 'You must have a city selected to nominate';
  END IF;

  SELECT c.metro_id INTO v_candidate_metro
  FROM members m JOIN cities c ON c.id = m.city_id
  WHERE m.id = p_candidate_id;

  IF v_candidate_metro IS NULL THEN
    RAISE EXCEPTION 'Candidate does not have a city';
  END IF;

  IF v_nominator_metro != v_candidate_metro THEN
    RAISE EXCEPTION 'You can only nominate members in your own Metro';
  END IF;

  -- Check eligibility directly instead of opt_in
  SELECT * INTO v_candidate FROM members WHERE id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found';
  END IF;

  IF v_candidate.city_id IS NULL THEN
    RAISE EXCEPTION 'This member is not eligible for leadership (no city assigned)';
  END IF;

  IF v_candidate.membership_tier IS NULL
     OR v_candidate.membership_tier NOT IN ('black', 'black_plus', 'emerald', 'plum') THEN
    RAISE EXCEPTION 'This member is not eligible for leadership (requires Black or higher membership)';
  END IF;

  v_candidate_influence := public.get_member_influence(p_candidate_id);
  IF v_candidate_influence < 250 THEN
    RAISE EXCEPTION 'This member is not eligible for leadership (requires 250+ Influence)';
  END IF;

  SELECT * INTO v_cycle FROM leadership_election_cycles
  WHERE metro_id = v_nominator_metro
  AND phase = 'nomination'
  AND now() >= nomination_opens_at
  AND now() <= nomination_closes_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active nomination period for your Metro';
  END IF;

  IF EXISTS (
    SELECT 1 FROM leadership_nominations
    WHERE cycle_id = v_cycle.id AND nominator_id = auth.uid() AND candidate_id = p_candidate_id
  ) THEN
    RAISE EXCEPTION 'You have already nominated this member';
  END IF;

  SELECT COUNT(*) INTO v_existing_nominations
  FROM leadership_nominations
  WHERE cycle_id = v_cycle.id AND nominator_id = auth.uid();

  IF v_existing_nominations >= 3 THEN
    RAISE EXCEPTION 'You have used all 3 nominations for this cycle';
  END IF;

  INSERT INTO leadership_nominations (cycle_id, nominator_id, candidate_id)
  VALUES (v_cycle.id, auth.uid(), p_candidate_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_leadership_nomination FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_leadership_nomination TO authenticated;

-- ============================================================
-- 3. NEW FUNCTION: accept_leadership_nomination
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_leadership_nomination(p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_my_metro uuid;
  v_has_nominations boolean;
BEGIN
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Election cycle not found';
  END IF;

  IF v_cycle.phase != 'nomination' THEN
    RAISE EXCEPTION 'Nomination period is not active';
  END IF;

  IF now() > v_cycle.nomination_closes_at THEN
    RAISE EXCEPTION 'Nomination period has closed';
  END IF;

  v_my_metro := public.get_my_metro_id();
  IF v_my_metro IS NULL OR v_my_metro != v_cycle.metro_id THEN
    RAISE EXCEPTION 'You can only accept nominations in your own Metro';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM leadership_nominations
    WHERE cycle_id = p_cycle_id AND candidate_id = auth.uid()
  ) INTO v_has_nominations;

  IF NOT v_has_nominations THEN
    RAISE EXCEPTION 'You have not been nominated for this cycle';
  END IF;

  INSERT INTO leadership_nominee_acceptances (cycle_id, member_id, status, accepted_at)
  VALUES (p_cycle_id, auth.uid(), 'accepted', now())
  ON CONFLICT (cycle_id, member_id)
  DO UPDATE SET status = 'accepted', accepted_at = now(), declined_at = NULL, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_leadership_nomination FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_leadership_nomination TO authenticated;

-- ============================================================
-- 4. NEW FUNCTION: decline_leadership_nomination
-- ============================================================
CREATE OR REPLACE FUNCTION public.decline_leadership_nomination(p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_my_metro uuid;
  v_has_nominations boolean;
BEGIN
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Election cycle not found';
  END IF;

  IF v_cycle.phase != 'nomination' THEN
    RAISE EXCEPTION 'Nomination period is not active';
  END IF;

  IF now() > v_cycle.nomination_closes_at THEN
    RAISE EXCEPTION 'Nomination period has closed';
  END IF;

  v_my_metro := public.get_my_metro_id();
  IF v_my_metro IS NULL OR v_my_metro != v_cycle.metro_id THEN
    RAISE EXCEPTION 'You can only decline nominations in your own Metro';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM leadership_nominations
    WHERE cycle_id = p_cycle_id AND candidate_id = auth.uid()
  ) INTO v_has_nominations;

  IF NOT v_has_nominations THEN
    RAISE EXCEPTION 'You have not been nominated for this cycle';
  END IF;

  INSERT INTO leadership_nominee_acceptances (cycle_id, member_id, status, declined_at)
  VALUES (p_cycle_id, auth.uid(), 'declined', now())
  ON CONFLICT (cycle_id, member_id)
  DO UPDATE SET status = 'declined', declined_at = now(), accepted_at = NULL, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_leadership_nomination FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_leadership_nomination TO authenticated;

-- ============================================================
-- 5. NEW FUNCTION: promote_leadership_finalists
--    Promotes only accepted nominees to leadership_candidates
--    Called when nomination phase ends (before election phase starts)
-- ============================================================
CREATE OR REPLACE FUNCTION public.promote_leadership_finalists(p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_nominee RECORD;
BEGIN
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle not found';
  END IF;

  -- Only run during transition from nomination to election
  IF v_cycle.phase NOT IN ('nomination', 'election') THEN
    RAISE EXCEPTION 'Cycle is not in nomination or election phase';
  END IF;

  -- Clear any existing candidates for this cycle (idempotent)
  DELETE FROM leadership_candidates WHERE cycle_id = p_cycle_id;

  -- Promote accepted nominees only
  FOR v_nominee IN
    SELECT ln.candidate_id AS member_id,
           COUNT(*) AS nomination_count,
           public.get_member_influence(ln.candidate_id) AS influence
    FROM leadership_nominations ln
    JOIN leadership_nominee_acceptances lna
      ON lna.cycle_id = ln.cycle_id AND lna.member_id = ln.candidate_id
    WHERE ln.cycle_id = p_cycle_id
      AND lna.status = 'accepted'
    GROUP BY ln.candidate_id
    ORDER BY nomination_count DESC, influence DESC
    LIMIT v_cycle.finalist_count
  LOOP
    INSERT INTO leadership_candidates (cycle_id, member_id, service_statement, nomination_count, influence_at_nomination)
    VALUES (p_cycle_id, v_nominee.member_id, '', v_nominee.nomination_count, v_nominee.influence)
    ON CONFLICT (cycle_id, member_id) DO UPDATE
      SET nomination_count = v_nominee.nomination_count,
          influence_at_nomination = v_nominee.influence;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_leadership_finalists FROM anon;
GRANT EXECUTE ON FUNCTION public.promote_leadership_finalists TO authenticated;

-- ============================================================
-- 6. TRIGGER: updated_at on nominee_acceptances
-- ============================================================
DROP TRIGGER IF EXISTS trg_nominee_acceptances_updated ON leadership_nominee_acceptances;
CREATE TRIGGER trg_nominee_acceptances_updated BEFORE UPDATE ON leadership_nominee_acceptances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
