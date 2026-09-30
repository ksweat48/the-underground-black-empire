/*
# Monthly Voting Credit System — Anniversary-Based Grants with Carry-Forward

## Purpose
Implements a monthly voting credit system where paid members receive their tier's
voting credits on their personal monthly anniversary date (the day of the month
they first upgraded). Credits accumulate and carry forward if unused.

## Changes

### 1. New Table: `voting_credit_ledger`
- Append-only audit ledger tracking every voting credit transaction.
- Columns: `member_id`, `amount` (positive for grants, negative for spends),
  `source` ('monthly_grant', 'initial_grant', 'vote_spend'), `reference_id`,
  `created_at`.
- RLS enabled: members can read their own ledger entries. No client-side
  inserts/updates/deletes — all writes go through SECURITY DEFINER functions.

### 2. New Function: `grant_monthly_voting_credits()`
- SECURITY DEFINER function that runs daily via pg_cron.
- Finds all paid members whose credit anniversary falls on today's day-of-month.
- Anniversary = day-of-month of `membership_started_at`.
- Handles month-length edge cases: if anniversary is 31st but current month has
  only 30 days, grants on the last day of that month so no member is skipped.
- Idempotent: checks `last_reset_date` — skips members already granted this month.
- For each eligible member: looks up tier credits from `membership_tiers`,
  adds to `voting_credits.balance`, inserts a ledger row, updates `last_reset_date`.
- Creates `voting_credits` row for members who don't have one yet.

### 3. New Function: `grant_initial_voting_credits(p_member_id)`
- SECURITY DEFINER function called after a member's first paid checkout.
- Grants the member's tier credits immediately, sets `last_reset_date` to today.
- Records the grant in the ledger with source 'initial_grant'.
- Creates `voting_credits` row if the member doesn't have one yet.
- This gives new members their first credits right away instead of waiting for
  their first anniversary to come around.

### 4. Updated Function: `cast_weighted_vote`
- Now inserts a row into `voting_credit_ledger` with source 'vote_spend' and
  negative amount when it decrements the credit balance.
- Otherwise unchanged: same validation, same influence award, same return value.

### 5. RLS Policies on `voting_credit_ledger`
- SELECT: members can read their own ledger entries (auth.uid() = member_id).
- No INSERT/UPDATE/DELETE policies — all writes go through SECURITY DEFINER
  functions that bypass RLS.

### 6. Grants
- EXECUTE on `grant_monthly_voting_credits()` granted to `service_role` (for pg_cron).
- EXECUTE on `grant_initial_voting_credits(uuid)` granted to `service_role` (for webhook).

## Important Notes
1. Credits accumulate and carry forward — unused credits are never lost.
2. The daily pg_cron job runs at midnight UTC and grants only to members whose
   anniversary falls on that day.
3. New paid members get initial credits immediately on checkout via the webhook.
4. The `voting_credit_ledger` provides a full audit trail of every credit grant
   and spend.
5. White (free) tier members get 0 credits and are skipped by the grant function.
*/

-- ============================================================
-- 1. Create voting_credit_ledger table
-- ============================================================

CREATE TABLE IF NOT EXISTS voting_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  source text NOT NULL CHECK (source IN ('monthly_grant', 'initial_grant', 'vote_spend')),
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE voting_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_credit_ledger" ON voting_credit_ledger;
CREATE POLICY "select_own_credit_ledger" ON voting_credit_ledger
  FOR SELECT TO authenticated
  USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_voting_credit_ledger_member
  ON voting_credit_ledger(member_id, created_at DESC);

-- ============================================================
-- 2. grant_monthly_voting_credits function
-- Runs daily via pg_cron. Grants credits to members whose
-- anniversary falls on today's day-of-month.
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
BEGIN
  -- Get the last day of the current month
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

    -- Determine if today is this member's anniversary
    -- If anniversary day > last day of current month, use last day of month
    IF v_anniversary_day > v_last_day_of_month THEN
      v_should_grant := (v_today = v_last_day_of_month);
    ELSE
      v_should_grant := (v_today = v_anniversary_day);
    END IF;

    IF NOT v_should_grant THEN
      CONTINUE;
    END IF;

    -- Idempotency: skip if already granted this month
    IF v_member.last_reset_date IS NOT NULL THEN
      IF EXTRACT(MONTH FROM v_member.last_reset_date)::int = v_current_month
         AND EXTRACT(YEAR FROM v_member.last_reset_date)::int = v_current_year THEN
        CONTINUE;
      END IF;
    END IF;

    -- Look up tier credits
    SELECT voting_credits INTO v_credits
    FROM membership_tiers WHERE id = v_member.membership_tier;

    IF v_credits IS NULL OR v_credits <= 0 THEN
      CONTINUE;
    END IF;

    -- Create voting_credits row if it doesn't exist
    IF v_member.balance = 0 AND v_member.last_reset_date IS NULL THEN
      INSERT INTO voting_credits (member_id, balance, last_reset_date, updated_at)
      VALUES (v_member.id, v_credits, CURRENT_DATE, now())
      ON CONFLICT (member_id) DO UPDATE
        SET balance = voting_credits.balance + v_credits,
            last_reset_date = CURRENT_DATE,
            updated_at = now();
    ELSE
      UPDATE voting_credits
      SET balance = balance + v_credits,
          last_reset_date = CURRENT_DATE,
          updated_at = now()
      WHERE member_id = v_member.id;
    END IF;

    -- Record in ledger
    INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
    VALUES (v_member.id, v_credits, 'monthly_grant', NULL);
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_monthly_voting_credits() TO service_role;

-- ============================================================
-- 3. grant_initial_voting_credits function
-- Called after a member's first paid checkout to grant credits
-- immediately rather than waiting for their first anniversary.
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

  -- If member already has a last_reset date, they've already received
  -- an initial grant — don't double-grant
  IF v_last_reset IS NOT NULL THEN
    RETURN;
  END IF;

  -- Create or update voting_credits row
  IF v_current_balance IS NULL THEN
    INSERT INTO voting_credits (member_id, balance, last_reset_date, updated_at)
    VALUES (p_member_id, v_credits, CURRENT_DATE, now())
    ON CONFLICT (member_id) DO UPDATE
      SET balance = voting_credits.balance + v_credits,
          last_reset_date = CURRENT_DATE,
          updated_at = now();
  ELSE
    UPDATE voting_credits
    SET balance = balance + v_credits,
        last_reset_date = CURRENT_DATE,
        updated_at = now()
    WHERE member_id = p_member_id;
  END IF;

  -- Record in ledger
  INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
  VALUES (p_member_id, v_credits, 'initial_grant', NULL);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_initial_voting_credits(uuid) TO service_role;

-- ============================================================
-- 4. Update cast_weighted_vote to record credit spend in ledger
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
  v_credit_balance int;
  v_new_record_id uuid;
  v_idem_key text;
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

  INSERT INTO vote_records (vote_id, member_id, choice, credits_used, voting_power, effective_weight, voted_at, influence_awarded)
  VALUES (p_vote_id, v_member_id, p_choice, p_credits_used, v_vp, v_effective_weight, now(), true)
  RETURNING id INTO v_new_record_id;

  UPDATE voting_credits
  SET balance = balance - p_credits_used, updated_at = now()
  WHERE member_id = v_member_id;

  -- Record the credit spend in the ledger
  INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
  VALUES (v_member_id, -p_credits_used, 'vote_spend', v_new_record_id);

  v_idem_key := 'ballot_participation:' || p_vote_id::text || ':' || v_member_id::text;
  PERFORM public.award_influence(v_member_id, 'ballot_participation', 10, p_vote_id, v_idem_key, 'Awarded for casting a vote');

  RETURN v_effective_weight;
END;
$function$;