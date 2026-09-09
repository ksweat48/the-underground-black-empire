/*
# Preserve Member Number When Onboarding Is Resumed

## Purpose
Fixes a bug where a member who partially completed onboarding (got assigned a
member_number and founder_number) but did NOT finish the full flow would, upon
returning and re-running `assign_founder_number`, consume a NEW member_number
from the global sequence — resulting in the member holding two numbers and the
old one being "wasted."

## Root Cause
The `assign_founder_number` function checked whether the member already had a
row in `founder_numbers` for the SAME city and returned early if so. But it did
NOT check whether the member already had a `member_number` assigned. If the
member picked a DIFFERENT city on resume (or if the early-return path was
bypassed), `nextval('member_number_seq')` ran again and assigned a brand new
global member_number, leaving the old one orphaned.

## Changes
1. `assign_founder_number` now checks if the member already has a
   `member_number`. If so, it REUSES that number instead of calling
   `nextval`. This guarantees a member keeps the same global number forever,
   regardless of how many times they restart onboarding or change cities.
2. The city-level `founder_numbers` early-return is preserved (member keeps
   their same city number if they pick the same city).
3. If the member picks a DIFFERENT city, the old `founder_numbers` row is
   deleted and a new one is inserted with the next city-level number, but the
   global `member_number` stays the same.

## Security
- No new RLS policies needed; the function is SECURITY DEFINER and already
  restricted to authenticated users via GRANT EXECUTE.
- No schema changes; only the function body changes.
*/

CREATE OR REPLACE FUNCTION public.assign_founder_number(p_city_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_next_number int;
  v_current_count int;
  v_member_number int;
  v_is_founder boolean;
  v_existing_city_id uuid;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Check if member already has a founder_numbers row for THIS city
  PERFORM 1 FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
  IF FOUND THEN
    SELECT number INTO v_next_number FROM founder_numbers
    WHERE member_id = v_member_id AND city_id = p_city_id;
    RETURN v_next_number;
  END IF;

  -- Member is picking a NEW city. Check if they already have a member_number
  -- from a previous onboarding attempt. If so, reuse it.
  SELECT member_number INTO v_member_number FROM members WHERE id = v_member_id;

  IF v_member_number IS NOT NULL THEN
    -- Reuse the existing global member_number; do NOT call nextval again
    v_is_founder := v_member_number <= 5000;

    -- Remove the old city assignment if one exists
    SELECT city_id INTO v_existing_city_id FROM members WHERE id = v_member_id;
    IF v_existing_city_id IS NOT NULL AND v_existing_city_id <> p_city_id THEN
      DELETE FROM founder_numbers WHERE member_id = v_member_id AND city_id = v_existing_city_id;
      PERFORM public.refresh_city_progress(v_existing_city_id);
    END IF;
  ELSE
    -- First-time member: pull the next global member_number from the sequence
    v_member_number := nextval('member_number_seq');
    v_is_founder := v_member_number <= 5000;
  END IF;

  -- City capacity check
  SELECT count(*) INTO v_current_count FROM founder_numbers WHERE city_id = p_city_id;
  IF v_current_count >= 10000 THEN
    RAISE EXCEPTION 'This city has reached its capacity (10000)' USING ERRCODE = 'P0003';
  END IF;

  -- Next city-level number
  SELECT COALESCE(max(number), 0) + 1 INTO v_next_number
  FROM founder_numbers WHERE city_id = p_city_id;

  INSERT INTO founder_numbers (city_id, member_id, number)
  VALUES (p_city_id, v_member_id, v_next_number);

  UPDATE members
  SET is_founder = v_is_founder,
      city_id = p_city_id,
      founder_number = v_next_number,
      member_number = v_member_number,
      updated_at = now()
  WHERE id = v_member_id;

  PERFORM public.refresh_city_progress(p_city_id);
  PERFORM public.refresh_empire_progress();

  -- SSOT XP rewards: signup = 10 XP, city selection = 10 XP
  PERFORM public.award_xp(v_member_id, 'signup_completed', 10, NULL, 'signup_completed:' || v_member_id::text, 'Member signup');
  PERFORM public.award_xp(v_member_id, 'city_selected', 10, p_city_id, 'city_selected:' || v_member_id::text, 'City selection');

  PERFORM public.verify_referral(v_member_id);
  PERFORM public.check_and_auto_complete_missions(v_member_id);
  PERFORM public.check_and_auto_complete_missions_for_referrer(v_member_id);

  PERFORM public.log_audit(
    v_member_id,
    'member_number_assigned',
    'city',
    p_city_id,
    jsonb_build_object('member_number', v_member_number, 'city_number', v_next_number, 'is_founder', v_is_founder)
  );

  RETURN v_next_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_founder_number(uuid) TO authenticated;
