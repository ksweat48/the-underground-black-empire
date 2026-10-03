/*
# Reform Voting Credits and Separate All Three Voting Systems

## Purpose
Fix the voting credit system so tier upgrades make sense. Previously Black Card got 10
credits (enough for all 5 initiatives x 2 cycles = 10/month), so there was no incentive
to upgrade for more credits. This migration:
1. Sets new monthly credit amounts: White 0, Black 4, Black+ 7, Black Pro 10, Arch 10, Arch Pro 10.
2. Adds a 30-credit rollover cap to both the monthly grant and initial grant functions.
3. Removes Voting Credit consumption from Empire-wide votes (cast_weighted_vote) —
   eligible members get one free ballot with Voting Power applied once.
4. Awards +25 Influence for completing a leadership election ballot (cast_leadership_ballot).
5. Updates the ledger source constraint to remove the now-unused 'vote_spend' source.

## Changes
1. membership_tiers: voting_credits updated to new values.
2. grant_monthly_voting_credits(): adds LEAST() cap so balance never exceeds 30 after grant.
3. grant_initial_voting_credits(): same 30-credit cap on initial grant.
4. cast_weighted_vote(): no longer checks/deducts voting credits; awards 25 Influence
   (up from 10) for participating; effective weight is now 1 x voting_power.
5. cast_leadership_ballot(): awards +25 Influence once per election ballot.
6. voting_credit_ledger source constraint: removes 'vote_spend', keeps the rest.

## Important Notes
1. Existing balances above 30 are NOT forcibly reduced — the cap only applies on next grant.
2. Empire-wide votes no longer require credits. The p_credits_used parameter is kept for
   backward compatibility but ignored (always treated as 1).
3. Leadership elections already did not consume credits — only the Influence award is new.
4. Metro Initiative voting (submit_initiative_ballot) is unchanged — it still costs 1 credit
   per initiative and awards +25 Influence per cycle.
*/

-- ============================================================
-- 1. Update tier voting credits
-- ============================================================
UPDATE membership_tiers SET voting_credits = 0  WHERE id = 'white';
UPDATE membership_tiers SET voting_credits = 4  WHERE id = 'black';
UPDATE membership_tiers SET voting_credits = 7  WHERE id = 'black_plus';
UPDATE membership_tiers SET voting_credits = 10 WHERE id = 'black_pro';
UPDATE membership_tiers SET voting_credits = 10 WHERE id = 'arch';
UPDATE membership_tiers SET voting_credits = 10 WHERE id = 'arch_pro';

-- ============================================================
-- 2. grant_monthly_voting_credits with 30-credit rollover cap
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_monthly_voting_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_today int := EXTRACT(DAY FROM CURRENT_DATE)::int;
  v_current_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  v_current_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_last_day_of_month int;
  v_member record;
  v_credits int;
  v_anniversary_day int;
  v_should_grant boolean;
  v_new_balance int;
BEGIN
  v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::int;

  FOR v_member IN
    SELECT m.id, m.membership_tier, m.membership_started_at,
           COALESCE(vc.balance, 0) AS balance,
           vc.last_reset_date
    FROM members m
    LEFT JOIN voting_credits vc ON vc.member_id = m.id
    WHERE m.membership_tier <> 'white'
      AND m.membership_started_at IS NOT NULL
  LOOP
    v_anniversary_day := EXTRACT(DAY FROM v_member.membership_started_at)::int;

    IF v_anniversary_day > v_last_day_of_month THEN
      v_should_grant := (v_today = v_last_day_of_month);
    ELSE
      v_should_grant := (v_today = v_anniversary_day);
    END IF;

    IF NOT v_should_grant THEN
      CONTINUE;
    END IF;

    IF v_member.last_reset_date IS NOT NULL THEN
      IF EXTRACT(MONTH FROM v_member.last_reset_date)::int = v_current_month
         AND EXTRACT(YEAR FROM v_member.last_reset_date)::int = v_current_year THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT voting_credits INTO v_credits
    FROM membership_tiers WHERE id = v_member.membership_tier;

    IF v_credits IS NULL OR v_credits <= 0 THEN
      CONTINUE;
    END IF;

    -- Cap at 30: add credits, then cap
    v_new_balance := LEAST(v_member.balance + v_credits, 30);

    IF v_member.balance = 0 AND v_member.last_reset_date IS NULL THEN
      INSERT INTO voting_credits (member_id, balance, last_reset_date, updated_at)
      VALUES (v_member.id, v_new_balance, CURRENT_DATE, now())
      ON CONFLICT (member_id) DO UPDATE
        SET balance = v_new_balance,
            last_reset_date = CURRENT_DATE,
            updated_at = now();
    ELSE
      UPDATE voting_credits
      SET balance = v_new_balance,
          last_reset_date = CURRENT_DATE,
          updated_at = now()
      WHERE member_id = v_member.id;
    END IF;

    INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
    VALUES (v_member.id, v_credits, 'monthly_grant', NULL);
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_monthly_voting_credits() TO service_role;

-- ============================================================
-- 3. grant_initial_voting_credits with 30-credit cap
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_initial_voting_credits(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tier text;
  v_credits int;
  v_current_balance int;
  v_last_reset date;
  v_new_balance int;
BEGIN
  SELECT membership_tier INTO v_tier FROM members WHERE id = p_member_id;
  IF v_tier IS NULL OR v_tier = 'white' THEN
    RETURN;
  END IF;

  SELECT voting_credits INTO v_credits
  FROM membership_tiers WHERE id = v_tier;
  IF v_credits IS NULL OR v_credits <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(balance, 0), last_reset_date
    INTO v_current_balance, v_last_reset
  FROM voting_credits WHERE member_id = p_member_id;

  IF v_last_reset IS NOT NULL THEN
    RETURN;
  END IF;

  v_new_balance := LEAST(COALESCE(v_current_balance, 0) + v_credits, 30);

  IF v_current_balance IS NULL THEN
    INSERT INTO voting_credits (member_id, balance, last_reset_date, updated_at)
    VALUES (p_member_id, v_new_balance, CURRENT_DATE, now())
    ON CONFLICT (member_id) DO UPDATE
      SET balance = v_new_balance,
          last_reset_date = CURRENT_DATE,
          updated_at = now();
  ELSE
    UPDATE voting_credits
    SET balance = v_new_balance,
        last_reset_date = CURRENT_DATE,
        updated_at = now()
    WHERE member_id = p_member_id;
  END IF;

  INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
  VALUES (p_member_id, v_credits, 'initial_grant', NULL);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_initial_voting_credits(uuid) TO service_role;

-- ============================================================
-- 4. cast_weighted_vote — no longer consumes credits
--    Empire-wide votes are free; one ballot, VP applies once
-- ============================================================
CREATE OR REPLACE FUNCTION public.cast_weighted_vote(p_vote_id uuid, p_choice text, p_credits_used integer DEFAULT 1)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_member_id uuid := auth.uid();
  v_vote record;
  v_vp numeric(5,2);
  v_effective_weight numeric(10,2);
  v_new_record_id uuid;
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_vote FROM votes WHERE id = p_vote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vote not found';
  END IF;
  IF v_vote.status <> 'active' THEN
    RAISE EXCEPTION 'This vote is not currently active';
  END IF;
  IF now() < v_vote.opens_at OR now() > v_vote.closes_at THEN
    RAISE EXCEPTION 'This vote is not within its voting window';
  END IF;

  IF EXISTS (SELECT 1 FROM vote_records WHERE vote_id = p_vote_id AND member_id = v_member_id) THEN
    RAISE EXCEPTION 'You have already voted on this ballot';
  END IF;

  -- No credit check or deduction — Empire-wide votes are free
  v_vp := public.get_member_voting_power(v_member_id);
  v_effective_weight := v_vp;

  INSERT INTO vote_records (vote_id, member_id, choice, credits_used, voting_power, effective_weight, voted_at, influence_awarded)
  VALUES (p_vote_id, v_member_id, p_choice, 0, v_vp, v_effective_weight, now(), true)
  RETURNING id INTO v_new_record_id;

  v_idem_key := 'ballot_participation:' || p_vote_id::text || ':' || v_member_id::text;
  PERFORM public.award_influence(v_member_id, 'ballot_participation', 25, p_vote_id, v_idem_key, 'Awarded for casting an Empire-wide vote');

  RETURN v_effective_weight;
END;
$function$;

-- ============================================================
-- 5. cast_leadership_ballot — award +25 Influence
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
  v_idem_key text;
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

  -- Award +25 Influence once for participating in the election
  v_idem_key := 'leadership_ballot:' || p_cycle_id::text || ':' || auth.uid()::text;
  PERFORM public.award_influence(auth.uid(), 'leadership_ballot', 25, p_cycle_id,
    v_idem_key, 'Completed a Metro leadership election ballot');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_leadership_ballot(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.cast_leadership_ballot(uuid, uuid[]) TO authenticated;

-- ============================================================
-- 6. Update ledger source constraint — remove 'vote_spend'
-- ============================================================
ALTER TABLE voting_credit_ledger DROP CONSTRAINT IF EXISTS voting_credit_ledger_source_check;
ALTER TABLE voting_credit_ledger ADD CONSTRAINT voting_credit_ledger_source_check
  CHECK (source = ANY (ARRAY['monthly_grant','initial_grant','initiative_vote_spend','initiative_vote_refund']));
