/*
# Phase 4: Empire-wide initiatives with EAC approval

## Summary
Creates Empire-wide initiatives that require 7 of 11 EAC members to approve,
followed by a 7-day member voting window with Yes/No ballots.
Influence (+25) awarded once per ballot. No Initiative Voting Credits consumed.
*/

-- ============================================================
-- 1. empire_initiatives
-- ============================================================

CREATE TABLE IF NOT EXISTS public.empire_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'policy'
    CHECK (category IN ('policy', 'structural', 'direction', 'emergency')),
  status text NOT NULL DEFAULT 'eac_review'
    CHECK (status IN ('eac_review', 'eac_rejected', 'member_voting', 'passed', 'failed', 'cancelled')),
  created_by uuid NOT NULL REFERENCES public.members(id),
  eac_review_opens_at timestamptz NOT NULL DEFAULT now(),
  eac_review_closes_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  member_voting_opens_at timestamptz,
  member_voting_closes_at timestamptz,
  finalized_at timestamptz,
  yes_votes integer NOT NULL DEFAULT 0,
  no_votes integer NOT NULL DEFAULT 0,
  eac_approvals integer NOT NULL DEFAULT 0,
  eac_rejections integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.empire_initiatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read empire initiatives" ON public.empire_initiatives;
CREATE POLICY "Public can read empire initiatives" ON public.empire_initiatives
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.empire_initiatives FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_empire_initiatives_status ON public.empire_initiatives(status, created_at DESC);

-- ============================================================
-- 2. empire_initiative_ballots
-- ============================================================

CREATE TABLE IF NOT EXISTS public.empire_initiative_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES public.empire_initiatives(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.members(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('yes', 'no')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiative_id, voter_id)
);

ALTER TABLE public.empire_initiative_ballots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own empire ballots" ON public.empire_initiative_ballots;
CREATE POLICY "Members can read own empire ballots" ON public.empire_initiative_ballots
  FOR SELECT TO authenticated USING (auth.uid() = voter_id);

CREATE INDEX IF NOT EXISTS idx_empire_ballots_initiative ON public.empire_initiative_ballots(initiative_id);

-- ============================================================
-- 3. eac_votes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eac_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES public.empire_initiatives(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.members(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('approve', 'reject')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiative_id, voter_id)
);

ALTER TABLE public.eac_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read EAC votes" ON public.eac_votes;
CREATE POLICY "Public can read EAC votes" ON public.eac_votes
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_eac_votes_initiative ON public.eac_votes(initiative_id);

-- ============================================================
-- 4. FUNCTION: create_empire_initiative
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_empire_initiative(
  p_title text,
  p_description text,
  p_category text DEFAULT 'policy'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_initiative_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can create Empire-wide initiatives';
  END IF;

  IF NULLIF(TRIM(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  INSERT INTO empire_initiatives (title, description, category, created_by)
  VALUES (p_title, p_description, p_category, v_caller)
  RETURNING id INTO v_initiative_id;

  RETURN jsonb_build_object('initiative_id', v_initiative_id, 'status', 'eac_review');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_empire_initiative(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_empire_initiative(text, text, text) TO authenticated;

-- ============================================================
-- 5. FUNCTION: cast_eac_vote
-- ============================================================

CREATE OR REPLACE FUNCTION public.cast_eac_vote(
  p_initiative_id uuid,
  p_vote text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_initiative record;
  v_approvals int;
  v_rejections int;
  v_active_eac_count int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_vote NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Vote must be approve or reject';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM empire_advisory_council
    WHERE member_id = v_caller AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only EAC members can vote on initiatives';
  END IF;

  IF EXISTS (
    SELECT 1 FROM eac_recusal_records
    WHERE member_id = v_caller AND empire_vote_id = p_initiative_id
  ) THEN
    RAISE EXCEPTION 'You have recused from this vote';
  END IF;

  SELECT * INTO v_initiative FROM empire_initiatives WHERE id = p_initiative_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initiative not found';
  END IF;

  IF v_initiative.status != 'eac_review' THEN
    RAISE EXCEPTION 'Initiative is not in EAC review phase';
  END IF;

  INSERT INTO eac_votes (initiative_id, voter_id, vote, notes)
  VALUES (p_initiative_id, v_caller, p_vote, p_notes)
  ON CONFLICT (initiative_id, voter_id) DO UPDATE
    SET vote = EXCLUDED.vote, notes = EXCLUDED.notes;

  SELECT
    COUNT(*) FILTER (WHERE vote = 'approve'),
    COUNT(*) FILTER (WHERE vote = 'reject')
  INTO v_approvals, v_rejections
  FROM eac_votes WHERE initiative_id = p_initiative_id;

  SELECT COUNT(*) INTO v_active_eac_count
  FROM empire_advisory_council eac
  WHERE eac.is_active = true
    AND eac.member_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM eac_recusal_records er
      WHERE er.member_id = eac.member_id AND er.empire_vote_id = p_initiative_id
    );

  UPDATE empire_initiatives
  SET eac_approvals = v_approvals, eac_rejections = v_rejections
  WHERE id = p_initiative_id;

  IF v_approvals >= 7 THEN
    UPDATE empire_initiatives
    SET status = 'member_voting',
        member_voting_opens_at = now(),
        member_voting_closes_at = now() + interval '7 days'
    WHERE id = p_initiative_id;

    RETURN jsonb_build_object('status', 'member_voting', 'eac_approvals', v_approvals);
  ELSIF v_rejections > v_active_eac_count - 7 THEN
    UPDATE empire_initiatives
    SET status = 'eac_rejected', finalized_at = now()
    WHERE id = p_initiative_id;

    RETURN jsonb_build_object('status', 'eac_rejected', 'eac_rejections', v_rejections);
  END IF;

  RETURN jsonb_build_object('status', 'eac_review', 'approvals', v_approvals, 'rejections', v_rejections);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_eac_vote(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cast_eac_vote(uuid, text, text) TO authenticated;

-- ============================================================
-- 6. FUNCTION: cast_empire_ballot
-- ============================================================

CREATE OR REPLACE FUNCTION public.cast_empire_ballot(
  p_initiative_id uuid,
  p_vote text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_initiative record;
  v_tier text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_vote NOT IN ('yes', 'no') THEN
    RAISE EXCEPTION 'Vote must be yes or no';
  END IF;

  SELECT * INTO v_initiative FROM empire_initiatives WHERE id = p_initiative_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initiative not found';
  END IF;

  IF v_initiative.status != 'member_voting' THEN
    RAISE EXCEPTION 'Initiative is not in member voting phase';
  END IF;

  IF now() < v_initiative.member_voting_opens_at OR now() > v_initiative.member_voting_closes_at THEN
    RAISE EXCEPTION 'Voting is not currently open';
  END IF;

  SELECT membership_tier INTO v_tier FROM members WHERE id = v_caller;
  IF v_tier IS NULL OR v_tier = 'white' THEN
    RAISE EXCEPTION 'Black Card or higher membership required to vote';
  END IF;

  IF EXISTS (
    SELECT 1 FROM empire_initiative_ballots
    WHERE initiative_id = p_initiative_id AND voter_id = v_caller
  ) THEN
    RAISE EXCEPTION 'You have already cast your ballot';
  END IF;

  INSERT INTO empire_initiative_ballots (initiative_id, voter_id, vote)
  VALUES (p_initiative_id, v_caller, p_vote);

  IF p_vote = 'yes' THEN
    UPDATE empire_initiatives SET yes_votes = yes_votes + 1 WHERE id = p_initiative_id;
  ELSE
    UPDATE empire_initiatives SET no_votes = no_votes + 1 WHERE id = p_initiative_id;
  END IF;

  PERFORM public.award_influence(v_caller, 25, 'empire_ballot', p_initiative_id::text);

  RETURN jsonb_build_object('status', 'voted', 'vote', p_vote);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_empire_ballot(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cast_empire_ballot(uuid, text) TO authenticated;

-- ============================================================
-- 7. FUNCTION: finalize_empire_initiative
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_empire_initiative(p_initiative_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initiative record;
  v_caller uuid := auth.uid();
  v_result text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_initiative FROM empire_initiatives WHERE id = p_initiative_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initiative not found';
  END IF;

  IF v_initiative.status != 'member_voting' THEN
    RAISE EXCEPTION 'Initiative is not in member voting phase';
  END IF;

  IF now() < v_initiative.member_voting_closes_at THEN
    RAISE EXCEPTION 'Voting has not closed yet';
  END IF;

  v_result := CASE WHEN v_initiative.yes_votes > v_initiative.no_votes THEN 'passed' ELSE 'failed' END;

  UPDATE empire_initiatives
  SET status = v_result, finalized_at = now()
  WHERE id = p_initiative_id;

  RETURN jsonb_build_object(
    'initiative_id', p_initiative_id,
    'result', v_result,
    'yes_votes', v_initiative.yes_votes,
    'no_votes', v_initiative.no_votes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_empire_initiative(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_empire_initiative(uuid) TO authenticated;

-- ============================================================
-- 8. FUNCTION: get_empire_initiatives
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_empire_initiatives(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'title', i.title,
    'description', i.description,
    'category', i.category,
    'status', i.status,
    'eac_approvals', i.eac_approvals,
    'eac_rejections', i.eac_rejections,
    'yes_votes', i.yes_votes,
    'no_votes', i.no_votes,
    'eac_review_opens_at', i.eac_review_opens_at,
    'eac_review_closes_at', i.eac_review_closes_at,
    'member_voting_opens_at', i.member_voting_opens_at,
    'member_voting_closes_at', i.member_voting_closes_at,
    'finalized_at', i.finalized_at,
    'created_at', i.created_at,
    'eac_votes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'voter_id', ev.voter_id,
        'vote', ev.vote,
        'notes', ev.notes,
        'member_name', m.display_name,
        'created_at', ev.created_at
      ))
      FROM eac_votes ev
      LEFT JOIN members m ON m.id = ev.voter_id
      WHERE ev.initiative_id = i.id
    ), '[]'::jsonb)
  ) ORDER BY i.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM empire_initiatives ORDER BY created_at DESC LIMIT p_limit
  ) i;
$$;

GRANT EXECUTE ON FUNCTION public.get_empire_initiatives(int) TO authenticated;
