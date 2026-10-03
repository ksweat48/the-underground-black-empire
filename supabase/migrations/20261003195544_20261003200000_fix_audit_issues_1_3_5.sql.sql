/*
# Fix Audit Issues 1, 3, and 5

## Issue 1 — CRITICAL: cast_empire_ballot calls award_influence with wrong argument order
The call `award_influence(v_caller, 25, 'empire_ballot', p_initiative_id::text)` passes
25 (integer) into p_event_type (text) and 'empire_ballot' (text) into p_amount (integer),
which fails and rolls back the entire vote transaction. Fixed by using named parameters
in the correct order matching the award_influence signature:
(p_member_id uuid, p_event_type text, p_amount integer, p_reference_id uuid, p_idempotency_key text, p_notes text)

## Issue 3 — LOW: notify_election_phase_change and notify_tier_change never triggered
Added database triggers:
- `trg_election_phase_change_notify` on leadership_election_cycles AFTER UPDATE
  when phase changes, calls notify_election_phase_change.
- `trg_membership_tier_change_notify` on members AFTER UPDATE
  when membership_tier changes, calls notify_tier_change.

## Issue 5 — LOW: get_status_title DB function disagrees with profile page
The DB function used influence thresholds (Pioneer/Advocate/Organizer/etc.) while
the profile page uses Level thresholds (Advocate/Champion/Steward/Guardian/Vanguard/Luminary).
Rewrote get_status_title to use the same Level-based system as the frontend.
Since the DB function needs to compute Level from influence, it uses the same
LEVEL_THRESHOLDS array (0, 250, 750, 1500, ...) and maps levels to the same titles.
*/

-- ============================================================
-- FIX 1: Recreate cast_empire_ballot with correct award_influence call
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

  -- Fixed: use named parameters in the correct order
  PERFORM public.award_influence(
    p_member_id := v_caller,
    p_event_type := 'empire_ballot',
    p_amount := 25,
    p_reference_id := NULL,
    p_idempotency_key := p_initiative_id::text
  );

  RETURN jsonb_build_object('status', 'voted', 'vote', p_vote);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_empire_ballot(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cast_empire_ballot(uuid, text) TO authenticated;

-- ============================================================
-- FIX 3a: Trigger for election phase change notifications
-- ============================================================

DROP TRIGGER IF EXISTS trg_election_phase_change_notify ON public.leadership_election_cycles;

CREATE OR REPLACE FUNCTION public.trigger_election_phase_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.phase IS DISTINCT FROM NEW.phase THEN
    PERFORM public.notify_election_phase_change(NEW.metro_id, NEW.phase, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_election_phase_notify() FROM anon;
GRANT EXECUTE ON FUNCTION public.trigger_election_phase_notify() TO authenticated;

CREATE TRIGGER trg_election_phase_change_notify
  AFTER UPDATE ON public.leadership_election_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_election_phase_notify();

-- ============================================================
-- FIX 3b: Trigger for membership tier change notifications
-- ============================================================

DROP TRIGGER IF EXISTS trg_membership_tier_change_notify ON public.members;

CREATE OR REPLACE FUNCTION public.trigger_tier_change_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.membership_tier IS DISTINCT FROM NEW.membership_tier THEN
    PERFORM public.notify_tier_change(NEW.id, OLD.membership_tier, NEW.membership_tier);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_tier_change_notify() FROM anon;
GRANT EXECUTE ON FUNCTION public.trigger_tier_change_notify() TO authenticated;

CREATE TRIGGER trg_membership_tier_change_notify
  AFTER UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_tier_change_notify();

-- ============================================================
-- FIX 5: Rewrite get_status_title to match the frontend profile page
-- Frontend uses Level thresholds: Advocate (L1), Champion (L6), Steward (L11),
-- Guardian (L16), Vanguard (L21), Luminary (L26)
-- Level is derived from Influence using the same thresholds as progression-rules.ts
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_status_title(p_member_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_influence integer;
  v_level int;
BEGIN
  v_influence := public.get_member_influence(p_member_id);

  -- Compute level from influence using the same thresholds as the frontend
  -- LEVEL_THRESHOLDS: [0, 250, 750, 1500, 2500, 4000, 6000, 8500, 11500, 15000,
  --   19000, 23500, 28500, 34000, 40000, 46500, 53500, 61000, 69000, 77500,
  --   86500, 96000, 106000, 116500, 127500, 139000, 151000, ...]
  -- Level 1 = 0, Level 6 = 4000, Level 11 = 19000, Level 16 = 46500,
  -- Level 21 = 86500, Level 26 = 139000

  IF v_influence < 250 THEN
    v_level := 1;
  ELSIF v_influence < 750 THEN
    v_level := 2;
  ELSIF v_influence < 1500 THEN
    v_level := 3;
  ELSIF v_influence < 2500 THEN
    v_level := 4;
  ELSIF v_influence < 4000 THEN
    v_level := 5;
  ELSIF v_influence < 6000 THEN
    v_level := 6;
  ELSIF v_influence < 8500 THEN
    v_level := 7;
  ELSIF v_influence < 11500 THEN
    v_level := 8;
  ELSIF v_influence < 15000 THEN
    v_level := 9;
  ELSIF v_influence < 19000 THEN
    v_level := 10;
  ELSIF v_influence < 23500 THEN
    v_level := 11;
  ELSIF v_influence < 28500 THEN
    v_level := 12;
  ELSIF v_influence < 34000 THEN
    v_level := 13;
  ELSIF v_influence < 40000 THEN
    v_level := 14;
  ELSIF v_influence < 46500 THEN
    v_level := 15;
  ELSIF v_influence < 53500 THEN
    v_level := 16;
  ELSIF v_influence < 61000 THEN
    v_level := 17;
  ELSIF v_influence < 69000 THEN
    v_level := 18;
  ELSIF v_influence < 77500 THEN
    v_level := 19;
  ELSIF v_influence < 86500 THEN
    v_level := 20;
  ELSIF v_influence < 96000 THEN
    v_level := 21;
  ELSIF v_influence < 106000 THEN
    v_level := 22;
  ELSIF v_influence < 116500 THEN
    v_level := 23;
  ELSIF v_influence < 127500 THEN
    v_level := 24;
  ELSIF v_influence < 139000 THEN
    v_level := 25;
  ELSE
    v_level := 26;
  END IF;

  -- Map level to title, matching the frontend STATUS_TIERS
  IF v_level >= 26 THEN
    RETURN 'Luminary';
  ELSIF v_level >= 21 THEN
    RETURN 'Vanguard';
  ELSIF v_level >= 16 THEN
    RETURN 'Guardian';
  ELSIF v_level >= 11 THEN
    RETURN 'Steward';
  ELSIF v_level >= 6 THEN
    RETURN 'Champion';
  ELSE
    RETURN 'Advocate';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_status_title(uuid) TO authenticated;
