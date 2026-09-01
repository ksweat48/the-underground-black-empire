/*
# Voting Power System

## Purpose
Implements the full Voting Power (VP) economy using the existing
voting_credits balance table:
  - Members earn XP → raises Level → increases VP
  - Members earn Influence → increases VP
  - Members own Voting Credits (existing balance-based voting_credits table)
  - VP × Credits Used = Effective Voting Weight on a ballot
  - Votes are final (no changes after submission)
  - Credits are consumed on submission (balance decremented)
  - 100-credit cap per member per ballot

## Modified Tables

### vote_records (extended with weighted vote columns)
  - `credits_used` (int, NOT NULL DEFAULT 1)
  - `voting_power` (numeric(5,2), NOT NULL DEFAULT 1.00) — VP snapshot at cast time
  - `effective_weight` (numeric(10,2), NOT NULL DEFAULT 1.00) — credits_used × voting_power
  - `voted_at` (timestamptz, NOT NULL DEFAULT now())
  - Old INSERT policy removed — votes must go through cast_weighted_vote RPC.

## New Functions

### get_member_voting_power(p_member_id)
  SECURITY DEFINER. VP = 1.00 + level_bonus + influence_bonus, capped at 2.50
    level_bonus = (level - 1) × 0.05, capped at 0.75
    influence_bonus = FLOOR(influence / 10) × 0.01, capped at 0.75

### cast_weighted_vote(p_vote_id, p_choice, p_credits_used)
  SECURITY DEFINER. The ONLY way to vote. Enforces:
    1. Vote is active and within date window
    2. Member has not already voted (UNIQUE constraint)
    3. Credits between 1 and 100
    4. Member has enough credits (checks voting_credits.balance)
    5. Computes VP at cast time, stores effective_weight
    6. Inserts vote_record AND decrements credit balance atomically
    7. Awards Influence (+1) for casting a vote

## Security
  - vote_records: Old INSERT policy removed. SELECT own rows only.
  - voting_credits: Existing policies preserved. UPDATE policy tightened
    to prevent direct balance manipulation by removing it — balance
    changes now only happen through cast_weighted_vote RPC.
  - All functions are SECURITY DEFINER, callable by authenticated only.

## Important Notes
  1. Votes are FINAL. Credits are consumed on submission.
  2. VP is snapshotted at cast time.
  3. Buying credits NEVER awards XP, Influence, or Level.
  4. The 100-credit cap is enforced server-side.
  5. Influence (+1) is awarded for casting a vote, wiring up the
     previously-empty influence_ledger.
*/

-- ============================================================
-- EXTEND vote_records WITH WEIGHTED VOTE COLUMNS
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vote_records' AND column_name = 'credits_used'
  ) THEN
    ALTER TABLE vote_records ADD COLUMN credits_used int NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vote_records' AND column_name = 'voting_power'
  ) THEN
    ALTER TABLE vote_records ADD COLUMN voting_power numeric(5,2) NOT NULL DEFAULT 1.00;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vote_records' AND column_name = 'effective_weight'
  ) THEN
    ALTER TABLE vote_records ADD COLUMN effective_weight numeric(10,2) NOT NULL DEFAULT 1.00;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vote_records' AND column_name = 'voted_at'
  ) THEN
    ALTER TABLE vote_records ADD COLUMN voted_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Remove old INSERT policy — votes must go through cast_weighted_vote RPC
DROP POLICY IF EXISTS "insert_vote_records" ON vote_records;

-- Remove UPDATE policy on voting_credits — balance changes only via RPC
DROP POLICY IF EXISTS "update_own_voting_credits" ON voting_credits;

-- ============================================================
-- GET MEMBER VOTING POWER
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_voting_power(
  p_member_id uuid
) RETURNS numeric(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_xp int;
  v_total_influence int;
  v_level int;
  v_level_bonus numeric(5,2);
  v_influence_bonus numeric(5,2);
  v_vp numeric(5,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_xp
  FROM xp_ledger WHERE member_id = p_member_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_influence
  FROM influence_ledger WHERE member_id = p_member_id;

  v_level := 1;
  IF v_total_xp >= 1000 THEN v_level := 5;
  ELSIF v_total_xp >= 500 THEN v_level := 4;
  ELSIF v_total_xp >= 250 THEN v_level := 3;
  ELSIF v_total_xp >= 100 THEN v_level := 2;
  END IF;

  v_level_bonus := LEAST(0.75, (v_level - 1) * 0.05);
  v_influence_bonus := LEAST(0.75, FLOOR(v_total_influence / 10) * 0.01);
  v_vp := LEAST(2.50, 1.00 + v_level_bonus + v_influence_bonus);

  RETURN v_vp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_voting_power TO authenticated;

-- ============================================================
-- GET MEMBER CREDIT BALANCE
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_credits(
  p_member_id uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_balance int;
BEGIN
  SELECT COALESCE(balance, 0) INTO v_balance
  FROM voting_credits WHERE member_id = p_member_id;
  RETURN v_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_credits TO authenticated;

-- ============================================================
-- CAST WEIGHTED VOTE (the only way to vote)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cast_weighted_vote(
  p_vote_id uuid,
  p_choice text,
  p_credits_used int DEFAULT 1
) RETURNS numeric(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_vote record;
  v_vp numeric(5,2);
  v_effective_weight numeric(10,2);
  v_credit_balance int;
  v_new_record_id uuid;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_credits_used < 1 OR p_credits_used > 100 THEN
    RAISE EXCEPTION 'Credits used must be between 1 and 100';
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

  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM voting_credits WHERE member_id = v_member_id;
  IF v_credit_balance IS NULL OR v_credit_balance < p_credits_used THEN
    RAISE EXCEPTION 'Insufficient voting credits';
  END IF;

  v_vp := public.get_member_voting_power(v_member_id);
  v_effective_weight := p_credits_used * v_vp;

  INSERT INTO vote_records (vote_id, member_id, choice, credits_used, voting_power, effective_weight, voted_at)
  VALUES (p_vote_id, v_member_id, p_choice, p_credits_used, v_vp, v_effective_weight, now())
  RETURNING id INTO v_new_record_id;

  -- Decrement credit balance
  UPDATE voting_credits
  SET balance = balance - p_credits_used, updated_at = now()
  WHERE member_id = v_member_id;

  -- Award Influence for voting
  INSERT INTO influence_ledger (member_id, amount, source, reference_id, notes)
  VALUES (v_member_id, 1, 'vote_cast', v_new_record_id, 'Awarded for casting a vote');

  RETURN v_effective_weight;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_weighted_vote TO authenticated;

-- ============================================================
-- ENSURE EVERY MEMBER HAS A VOTING_CREDITS ROW
-- ============================================================

INSERT INTO voting_credits (member_id, balance, last_reset_date, updated_at)
  SELECT m.id, 10, CURRENT_DATE, now()
  FROM members m
  WHERE NOT EXISTS (SELECT 1 FROM voting_credits vc WHERE vc.member_id = m.id);
