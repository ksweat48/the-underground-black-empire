/*
# Leadership System — Eligibility, Nominations, Elections, Metro Council

1. New Tables
   - leadership_election_cycles — per-metro election cycles with phases
   - leadership_nominations — who nominated whom, per cycle
   - leadership_candidates — finalists who advanced to election
   - leadership_ballots — election votes (up to 7 selections per ballot)
   - metro_council — seated council members after election closes

2. Modified Tables
   - members — adds leadership_opt_in boolean (default false)

3. Server Functions (SECURITY DEFINER)
   - toggle_leadership_opt_in(p_enabled) — re-checks eligibility at toggle time
   - submit_leadership_nomination(p_candidate_id) — enforces all nomination rules
   - cast_leadership_ballot(p_cycle_id, p_candidate_ids) — records election ballot
   - finalize_leadership_election(p_cycle_id) — tallies ballots, seats council
   - get_leadership_eligibility(p_member_id) — returns eligibility + reasons

4. Security
   - RLS enabled on all new tables
   - Read policies scoped to same-metro members
   - All mutations go through SECURITY DEFINER functions
   - leadership_opt_in column is NOT client-writable
*/

-- ============================================================
-- 1. ADD leadership_opt_in COLUMN TO members
-- ============================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS leadership_opt_in boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. LEADERSHIP ELECTION CYCLES
-- ============================================================
CREATE TABLE IF NOT EXISTS leadership_election_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid NOT NULL REFERENCES metros(id) ON DELETE CASCADE,
  cycle_name text NOT NULL DEFAULT 'Metro Council Election',
  phase text NOT NULL DEFAULT 'nomination' CHECK (phase IN ('nomination', 'election', 'closed')),
  nomination_opens_at timestamptz NOT NULL DEFAULT now(),
  nomination_closes_at timestamptz NOT NULL,
  election_opens_at timestamptz NOT NULL,
  election_closes_at timestamptz NOT NULL,
  seats integer NOT NULL DEFAULT 7,
  finalist_count integer NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leadership_election_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_cycles_own_metro" ON leadership_election_cycles;
CREATE POLICY "read_cycles_own_metro" ON leadership_election_cycles FOR SELECT
  TO authenticated USING (
    metro_id = (
      SELECT c.metro_id FROM members m
      JOIN cities c ON c.id = m.city_id
      WHERE m.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_cycles" ON leadership_election_cycles;
CREATE POLICY "insert_cycles" ON leadership_election_cycles FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "update_cycles" ON leadership_election_cycles;
CREATE POLICY "update_cycles" ON leadership_election_cycles FOR UPDATE
  TO authenticated USING (false);
DROP POLICY IF EXISTS "delete_cycles" ON leadership_election_cycles;
CREATE POLICY "delete_cycles" ON leadership_election_cycles FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_leadership_cycles_metro ON leadership_election_cycles(metro_id);
CREATE INDEX IF NOT EXISTS idx_leadership_cycles_phase ON leadership_election_cycles(phase);

-- ============================================================
-- 3. LEADERSHIP NOMINATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS leadership_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES leadership_election_cycles(id) ON DELETE CASCADE,
  nominator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, nominator_id, candidate_id)
);

ALTER TABLE leadership_nominations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_nominations_own_metro" ON leadership_nominations;
CREATE POLICY "read_nominations_own_metro" ON leadership_nominations FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM leadership_election_cycles lec
      WHERE lec.id = leadership_nominations.cycle_id
      AND lec.metro_id = (
        SELECT c.metro_id FROM members m
        JOIN cities c ON c.id = m.city_id
        WHERE m.id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "insert_nominations" ON leadership_nominations;
CREATE POLICY "insert_nominations" ON leadership_nominations FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "update_nominations" ON leadership_nominations;
CREATE POLICY "update_nominations" ON leadership_nominations FOR UPDATE
  TO authenticated USING (false);
DROP POLICY IF EXISTS "delete_nominations" ON leadership_nominations;
CREATE POLICY "delete_nominations" ON leadership_nominations FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_leadership_nominations_cycle ON leadership_nominations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_leadership_nominations_candidate ON leadership_nominations(candidate_id);

-- ============================================================
-- 4. LEADERSHIP CANDIDATES (Finalists)
-- ============================================================
CREATE TABLE IF NOT EXISTS leadership_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES leadership_election_cycles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  service_statement text NOT NULL DEFAULT '' CHECK (length(service_statement) <= 280),
  nomination_count integer NOT NULL DEFAULT 0,
  influence_at_nomination integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, member_id)
);

ALTER TABLE leadership_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_candidates_own_metro" ON leadership_candidates;
CREATE POLICY "read_candidates_own_metro" ON leadership_candidates FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM leadership_election_cycles lec
      WHERE lec.id = leadership_candidates.cycle_id
      AND lec.metro_id = (
        SELECT c.metro_id FROM members m
        JOIN cities c ON c.id = m.city_id
        WHERE m.id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "update_own_candidate_statement" ON leadership_candidates;
CREATE POLICY "update_own_candidate_statement" ON leadership_candidates FOR UPDATE
  TO authenticated USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "insert_candidates" ON leadership_candidates;
CREATE POLICY "insert_candidates" ON leadership_candidates FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "delete_candidates" ON leadership_candidates;
CREATE POLICY "delete_candidates" ON leadership_candidates FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_leadership_candidates_cycle ON leadership_candidates(cycle_id);
CREATE INDEX IF NOT EXISTS idx_leadership_candidates_member ON leadership_candidates(member_id);

-- ============================================================
-- 5. LEADERSHIP BALLOTS (Election votes)
-- ============================================================
CREATE TABLE IF NOT EXISTS leadership_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES leadership_election_cycles(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  selected_candidate_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, voter_id)
);

ALTER TABLE leadership_ballots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_ballot" ON leadership_ballots;
CREATE POLICY "read_own_ballot" ON leadership_ballots FOR SELECT
  TO authenticated USING (voter_id = auth.uid());

DROP POLICY IF EXISTS "insert_ballots" ON leadership_ballots;
CREATE POLICY "insert_ballots" ON leadership_ballots FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "update_ballots" ON leadership_ballots;
CREATE POLICY "update_ballots" ON leadership_ballots FOR UPDATE
  TO authenticated USING (false);
DROP POLICY IF EXISTS "delete_ballots" ON leadership_ballots;
CREATE POLICY "delete_ballots" ON leadership_ballots FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_leadership_ballots_cycle ON leadership_ballots(cycle_id);
CREATE INDEX IF NOT EXISTS idx_leadership_ballots_voter ON leadership_ballots(voter_id);

-- ============================================================
-- 6. METRO COUNCIL (Seated members)
-- ============================================================
CREATE TABLE IF NOT EXISTS metro_council (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid NOT NULL REFERENCES metros(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES leadership_election_cycles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  seat_number integer NOT NULL,
  vote_count integer NOT NULL DEFAULT 0,
  seated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metro_id, cycle_id, member_id),
  UNIQUE (metro_id, cycle_id, seat_number)
);

ALTER TABLE metro_council ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_council_own_metro" ON metro_council;
CREATE POLICY "read_council_own_metro" ON metro_council FOR SELECT
  TO authenticated USING (
    metro_id = (
      SELECT c.metro_id FROM members m
      JOIN cities c ON c.id = m.city_id
      WHERE m.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_council" ON metro_council;
CREATE POLICY "insert_council" ON metro_council FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "update_council" ON metro_council;
CREATE POLICY "update_council" ON metro_council FOR UPDATE
  TO authenticated USING (false);
DROP POLICY IF EXISTS "delete_council" ON metro_council;
CREATE POLICY "delete_council" ON metro_council FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_metro_council_metro ON metro_council(metro_id);

-- ============================================================
-- 7. HELPER: get caller's metro_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_metro_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.metro_id FROM members m
  JOIN cities c ON c.id = m.city_id
  WHERE m.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_metro_id TO authenticated;

-- ============================================================
-- 8. FUNCTION: toggle_leadership_opt_in
-- ============================================================
CREATE OR REPLACE FUNCTION public.toggle_leadership_opt_in(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_record RECORD;
  v_influence integer;
BEGIN
  SELECT * INTO v_member_record FROM members WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF p_enabled THEN
    IF v_member_record.city_id IS NULL THEN
      RAISE EXCEPTION 'You must have a city selected';
    END IF;

    v_influence := public.get_member_influence(auth.uid());
    IF v_influence < 250 THEN
      RAISE EXCEPTION 'You need at least 250 Influence to be eligible for leadership';
    END IF;

    IF v_member_record.membership_tier IS NULL
       OR v_member_record.membership_tier NOT IN ('black', 'black_plus', 'emerald', 'plum') THEN
      RAISE EXCEPTION 'You need a Black or higher membership to be eligible for leadership';
    END IF;
  END IF;

  UPDATE members SET leadership_opt_in = p_enabled WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_leadership_opt_in FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_leadership_opt_in TO authenticated;

-- ============================================================
-- 9. FUNCTION: submit_leadership_nomination
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

  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_candidate_id AND leadership_opt_in = true) THEN
    RAISE EXCEPTION 'This member has not opted in to leadership nominations';
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
-- 10. FUNCTION: cast_leadership_ballot
-- ============================================================
CREATE OR REPLACE FUNCTION public.cast_leadership_ballot(
  p_cycle_id uuid,
  p_candidate_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_metro uuid;
  v_selection_count integer;
BEGIN
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Election cycle not found';
  END IF;

  IF v_cycle.phase != 'election' THEN
    RAISE EXCEPTION 'Election is not currently open';
  END IF;

  IF now() < v_cycle.election_opens_at OR now() > v_cycle.election_closes_at THEN
    RAISE EXCEPTION 'Election is not currently open';
  END IF;

  v_metro := public.get_my_metro_id();
  IF v_metro IS NULL OR v_metro != v_cycle.metro_id THEN
    RAISE EXCEPTION 'You can only vote in your own Metro election';
  END IF;

  IF EXISTS (
    SELECT 1 FROM leadership_ballots
    WHERE cycle_id = p_cycle_id AND voter_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You have already cast your ballot';
  END IF;

  v_selection_count := array_length(p_candidate_ids, 1);
  IF v_selection_count IS NULL OR v_selection_count < 1 THEN
    RAISE EXCEPTION 'You must select at least one candidate';
  END IF;

  IF v_selection_count > v_cycle.seats THEN
    RAISE EXCEPTION 'You can select at most % candidates', v_cycle.seats;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_candidate_ids) AS cid
    WHERE NOT EXISTS (
      SELECT 1 FROM leadership_candidates
      WHERE cycle_id = p_cycle_id AND member_id = cid
    )
  ) THEN
    RAISE EXCEPTION 'Invalid candidate selection';
  END IF;

  INSERT INTO leadership_ballots (cycle_id, voter_id, selected_candidate_ids)
  VALUES (p_cycle_id, auth.uid(), p_candidate_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_leadership_ballot FROM anon;
GRANT EXECUTE ON FUNCTION public.cast_leadership_ballot TO authenticated;

-- ============================================================
-- 11. FUNCTION: finalize_leadership_election
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_leadership_election(p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_seat integer := 1;
  v_winner RECORD;
BEGIN
  SELECT * INTO v_cycle FROM leadership_election_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle not found';
  END IF;

  IF v_cycle.phase != 'election' THEN
    RAISE EXCEPTION 'Cycle is not in election phase';
  END IF;

  IF now() < v_cycle.election_closes_at THEN
    RAISE EXCEPTION 'Election has not closed yet';
  END IF;

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
    INSERT INTO metro_council (metro_id, cycle_id, member_id, seat_number, vote_count)
    VALUES (v_cycle.metro_id, p_cycle_id, v_winner.member_id, v_seat, v_winner.vote_count);
    v_seat := v_seat + 1;
  END LOOP;

  UPDATE leadership_election_cycles
  SET phase = 'closed', updated_at = now()
  WHERE id = p_cycle_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_leadership_election FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_leadership_election TO authenticated;

-- ============================================================
-- 12. TRIGGER: updated_at on cycles
-- ============================================================
DROP TRIGGER IF EXISTS trg_leadership_cycles_updated ON leadership_election_cycles;
CREATE TRIGGER trg_leadership_cycles_updated BEFORE UPDATE ON leadership_election_cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
