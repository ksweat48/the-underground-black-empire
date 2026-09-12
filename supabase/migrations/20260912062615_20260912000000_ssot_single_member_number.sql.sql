/*
# SSOT: Single Member Number

## Purpose
Consolidates `member_number` and `founder_number` into a single value per member.
For members within the founder cutoff, `founder_number` mirrors `member_number` exactly.
The city-specific `founder_numbers` table retains its per-city tracking row, but the
number stored there also uses the global member number so there is no divergence.

## Changes

### 1. Data Fix: Reconcile Existing Members
- Green (2nd completed member) has member_number=4 due to abandoned accounts
  consuming sequence values 2 and 3. Reset to 2.
- Set founder_number = member_number for all completed members.
- Clean up orphaned founder_numbers rows from deleted/abandoned accounts.

### 2. Sequence Reset
- Reset member_number_seq to match the highest member_number among completed members.

### 3. Function Update: assign_founder_number
- Sets founder_number = member_number on the members table (not a separate city number).
- The founder_numbers table row uses the global member number as its number column.
- Resuming onboarding preserves the same number (no duplicates, no gaps).

## Security
- No new tables, columns, or RLS policies.
- Existing SECURITY DEFINER functions and grants preserved.
*/

-- ==================== 1. FIX EXISTING DATA ====================

-- Set Green's member_number from 4 to 2 (the 2nd completed member)
UPDATE members
SET member_number = 2,
    founder_number = 2
WHERE email = 'greenhaggai@gmail.com'
  AND member_number = 4;

-- Ensure founder_number = member_number for all completed members
UPDATE members
SET founder_number = member_number
WHERE onboarding_complete = true
  AND member_number IS NOT NULL
  AND founder_number IS DISTINCT FROM member_number;

-- Clean up orphaned founder_numbers rows for members that no longer exist
-- or never completed onboarding
DELETE FROM founder_numbers
WHERE member_id NOT IN (
  SELECT id FROM members WHERE onboarding_complete = true
);

-- Update the city founder_numbers to match the global member_number
UPDATE founder_numbers fn
SET number = m.member_number
FROM members m
WHERE fn.member_id = m.id
  AND m.onboarding_complete = true
  AND m.member_number IS NOT NULL
  AND fn.number IS DISTINCT FROM m.member_number;

-- ==================== 2. RESET SEQUENCE ====================
-- Reset the sequence to the max member_number among completed members
DO $$
DECLARE
  v_max int;
BEGIN
  SELECT COALESCE(max(member_number), 0) INTO v_max
  FROM members
  WHERE onboarding_complete = true;
  IF v_max > 0 THEN
    PERFORM setval('member_number_seq', v_max, true);
  END IF;
END $$;

-- ==================== 3. UPDATE ASSIGN_FOUNDER_NUMBER FUNCTION ====================

CREATE OR REPLACE FUNCTION public.assign_founder_number(p_city_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_member_number int;
  v_is_founder boolean;
  v_existing_city_id uuid;
  v_existing_founder_number int;
  v_existing_fn_row record;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Load current member state
  SELECT city_id, founder_number, member_number
  INTO v_existing_city_id, v_existing_founder_number, v_member_number
  FROM members
  WHERE id = v_member_id;

  -- Already fully assigned: return existing number
  IF v_existing_city_id IS NOT NULL AND v_existing_founder_number IS NOT NULL AND v_member_number IS NOT NULL THEN
    RETURN v_member_number;
  END IF;

  -- Check for existing founder_numbers rows (from partial onboarding)
  SELECT * INTO v_existing_fn_row
  FROM founder_numbers
  WHERE member_id = v_member_id
  ORDER BY assigned_at
  LIMIT 1;

  IF v_member_number IS NULL THEN
    -- First-time member: pull next global member number
    v_member_number := nextval('member_number_seq');
  END IF;
  -- If v_member_number is already set (resume), reuse it

  v_is_founder := v_member_number <= 5000;

  -- Handle city assignment
  IF v_existing_fn_row.member_id IS NOT NULL THEN
    -- Member has a previous city assignment
    IF v_existing_fn_row.city_id = p_city_id THEN
      -- Same city: just update the number to match global member_number
      UPDATE founder_numbers
      SET number = v_member_number
      WHERE member_id = v_member_id AND city_id = p_city_id;
    ELSE
      -- Different city: remove old row, insert new one
      DELETE FROM founder_numbers WHERE member_id = v_member_id AND city_id = v_existing_fn_row.city_id;
      PERFORM public.refresh_city_progress(v_existing_fn_row.city_id);

      INSERT INTO founder_numbers (city_id, member_id, number)
      VALUES (p_city_id, v_member_id, v_member_number);
    END IF;
  ELSE
    -- No previous assignment: insert new row
    INSERT INTO founder_numbers (city_id, member_id, number)
    VALUES (p_city_id, v_member_id, v_member_number);
  END IF;

  -- Update member record: founder_number = member_number (SSOT)
  UPDATE members
  SET is_founder = v_is_founder,
      city_id = p_city_id,
      founder_number = v_member_number,
      member_number = v_member_number,
      updated_at = now()
  WHERE id = v_member_id;

  PERFORM public.refresh_city_progress(p_city_id);
  PERFORM public.refresh_empire_progress();
  PERFORM public.award_influence(
    v_member_id,
    'signup_completed',
    10,
    NULL,
    'signup_completed:' || v_member_id::text,
    'Member signup'
  );
  PERFORM public.award_influence(
    v_member_id,
    'city_selected',
    10,
    p_city_id,
    'city_selected:' || v_member_id::text,
    'City selection'
  );
  PERFORM public.verify_referral(v_member_id);
  PERFORM public.log_audit(
    v_member_id,
    'member_number_assigned',
    'city',
    p_city_id,
    jsonb_build_object(
      'member_number', v_member_number,
      'founder_number', v_member_number,
      'is_founder', v_is_founder
    )
  );

  RETURN v_member_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_founder_number(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- ==================== 4. REFRESH PROGRESS ====================
SELECT public.refresh_empire_progress();
