/*
# Retain Existing City Assignment During Onboarding Resume

## Purpose
Ensures a member who already has a city-level number cannot create a second
city assignment by submitting onboarding again with a different city.

## Changes
- Updates `assign_founder_number` so an existing member with a `city_id`,
  `founder_number`, and `member_number` always receives the original
  founder_number and city assignment.
- Reuses the existing global `member_number` for members who have a number but
  do not yet have a city assignment.
- Removes the prior behavior that deleted an existing founder_numbers row when
  a different city was submitted.

## Security and Data Safety
- No schema changes or new policies.
- Existing SECURITY DEFINER and authenticated EXECUTE restrictions remain.
- No user data is deleted; existing number assignments are retained.
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
  v_existing_founder_number int;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- A completed city assignment is permanent and idempotent.
  SELECT city_id, founder_number, member_number
  INTO v_existing_city_id, v_existing_founder_number, v_member_number
  FROM members
  WHERE id = v_member_id;

  IF v_existing_city_id IS NOT NULL AND v_existing_founder_number IS NOT NULL THEN
    RETURN v_existing_founder_number;
  END IF;

  -- Preserve an existing city-level row if one exists.
  SELECT number INTO v_next_number
  FROM founder_numbers
  WHERE member_id = v_member_id
  ORDER BY assigned_at
  LIMIT 1;

  IF v_next_number IS NOT NULL THEN
    SELECT city_id INTO v_existing_city_id
    FROM founder_numbers
    WHERE member_id = v_member_id
    ORDER BY assigned_at
    LIMIT 1;

    UPDATE members
    SET city_id = v_existing_city_id,
        founder_number = v_next_number,
        updated_at = now()
    WHERE id = v_member_id;
    RETURN v_next_number;
  END IF;

  SELECT count(*) INTO v_current_count FROM founder_numbers WHERE city_id = p_city_id;
  IF v_current_count >= 10000 THEN
    RAISE EXCEPTION 'This city has reached its capacity (10000)' USING ERRCODE = 'P0003';
  END IF;

  SELECT COALESCE(max(number), 0) + 1 INTO v_next_number
  FROM founder_numbers WHERE city_id = p_city_id;

  IF v_member_number IS NULL THEN
    v_member_number := nextval('member_number_seq');
  END IF;
  v_is_founder := v_member_number <= 5000;

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
