/*
# Update assign_founder_number to refresh metro progress

## Purpose
Adds metro progress refresh to the founder number assignment flow.
After a city's progress is refreshed, the metro's progress is also refreshed.

## Changes
- assign_founder_number now calls refresh_metro_progress after refresh_city_progress
*/

CREATE OR REPLACE FUNCTION public.assign_founder_number(
  p_city_id uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_next_number int;
  v_current_count int;
  v_metro_id uuid;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
  IF FOUND THEN
    SELECT number INTO v_next_number FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
    RETURN v_next_number;
  END IF;

  SELECT count(*) INTO v_current_count FROM founder_numbers WHERE city_id = p_city_id;

  IF v_current_count >= 100 THEN
    RAISE EXCEPTION 'This city has reached its founder capacity (100)' USING ERRCODE = 'P0003';
  END IF;

  SELECT COALESCE(max(number), 0) + 1 INTO v_next_number
  FROM founder_numbers WHERE city_id = p_city_id;

  INSERT INTO founder_numbers (city_id, member_id, number)
  VALUES (p_city_id, v_member_id, v_next_number);

  UPDATE members
  SET is_founder = true,
      city_id = p_city_id,
      founder_number = v_next_number,
      updated_at = now()
  WHERE id = v_member_id;

  PERFORM public.refresh_city_progress(p_city_id);
  PERFORM public.refresh_empire_progress();

  -- Refresh metro progress
  SELECT metro_id INTO v_metro_id FROM cities WHERE id = p_city_id;
  IF v_metro_id IS NOT NULL THEN
    PERFORM public.refresh_metro_progress(v_metro_id);
  END IF;

  PERFORM public.award_xp(v_member_id, 100, 'founder_signup', NULL, 'Founder signup bonus');
  PERFORM public.award_xp(v_member_id, 25, 'city_selection', NULL, 'City selection bonus');

  PERFORM public.verify_referral(v_member_id);
  PERFORM public.check_and_auto_complete_missions(v_member_id);
  PERFORM public.check_and_auto_complete_missions_for_referrer(v_member_id);

  PERFORM public.log_audit(
    v_member_id,
    'founder_number_assigned',
    'city',
    p_city_id,
    jsonb_build_object('founder_number', v_next_number)
  );

  RETURN v_next_number;
END;
$$;
