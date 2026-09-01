/*
# Redefine Founder Status: First 5000 Members Globally

Redefines "founder" from "anyone who joins a city" to "one of the first 5000
members globally." Everyone who joins picks a city and gets a city member number,
but only the first 5000 members across the entire empire carry the Founder title.
*/

-- ==================== ADD MEMBER_NUMBER COLUMN ====================
ALTER TABLE members ADD COLUMN IF NOT EXISTS member_number int;
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(member_number);

-- ==================== CREATE SEQUENCE ====================
CREATE SEQUENCE IF NOT EXISTS member_number_seq START 1;

-- ==================== BACKFILL EXISTING MEMBERS ====================
DO $$
DECLARE
  v_member RECORD;
  v_num int;
BEGIN
  FOR v_member IN
    SELECT id FROM members WHERE member_number IS NULL ORDER BY created_at
  LOOP
    v_num := nextval('member_number_seq');
    UPDATE members SET member_number = v_num WHERE id = v_member.id;
  END LOOP;
END $$;

-- Ensure sequence is ahead of max member_number
DO $$
DECLARE
  v_max int;
BEGIN
  SELECT COALESCE(max(member_number), 0) INTO v_max FROM members;
  IF v_max > 0 THEN
    PERFORM setval('member_number_seq', v_max);
  END IF;
END $$;

-- ==================== UPDATE IS_FOUNDER FOR EXISTING MEMBERS ====================
UPDATE members SET is_founder = (member_number <= 5000)
WHERE member_number IS NOT NULL;

-- ==================== UPDATE ASSIGN_FOUNDER_NUMBER ====================
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
  v_member_number int;
  v_is_founder boolean;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
  IF FOUND THEN
    SELECT number INTO v_next_number FROM founder_numbers
    WHERE member_id = v_member_id AND city_id = p_city_id;
    RETURN v_next_number;
  END IF;

  SELECT count(*) INTO v_current_count FROM founder_numbers WHERE city_id = p_city_id;

  IF v_current_count >= 10000 THEN
    RAISE EXCEPTION 'This city has reached its capacity (10000)' USING ERRCODE = 'P0003';
  END IF;

  SELECT COALESCE(max(number), 0) + 1 INTO v_next_number
  FROM founder_numbers WHERE city_id = p_city_id;

  v_member_number := nextval('member_number_seq');
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

  PERFORM public.award_xp(v_member_id, 100, 'member_signup', NULL, 'Member signup bonus');
  PERFORM public.award_xp(v_member_id, 25, 'city_selection', NULL, 'City selection bonus');

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

-- ==================== UPDATE REFRESH_EMPIRE_PROGRESS ====================
CREATE OR REPLACE FUNCTION public.refresh_empire_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tribe_count int;
  v_total_members int;
BEGIN
  SELECT count(*) INTO v_tribe_count FROM cities WHERE tier = 'tribe';
  SELECT count(*) INTO v_total_members FROM members WHERE member_number IS NOT NULL;

  UPDATE empire_progress
  SET tribe_city_count = v_tribe_count,
      total_founders = v_total_members,
      updated_at = now()
  WHERE id = 1;
END;
$$;

-- ==================== UPDATE CHECK_AND_AUTO_COMPLETE_MISSIONS ====================
CREATE OR REPLACE FUNCTION public.check_and_auto_complete_missions(
  p_member_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_founder boolean;
  v_city_id uuid;
  v_city_founder_count int;
  v_city_tier text;
  v_verified_referrals int;
BEGIN
  SELECT is_founder, city_id INTO v_is_founder, v_city_id
  FROM members WHERE id = p_member_id;

  IF v_city_id IS NULL THEN
    RETURN;
  END IF;

  SELECT founder_count, tier INTO v_city_founder_count, v_city_tier
  FROM cities WHERE id = v_city_id;

  SELECT count(*) INTO v_verified_referrals
  FROM referrals
  WHERE referring_member_id = p_member_id AND status = 'verified';

  IF v_city_id IS NOT NULL THEN
    PERFORM public.complete_mission(p_member_id, 'signup');
  END IF;

  IF v_verified_referrals >= 1 THEN
    PERFORM public.complete_mission(p_member_id, 'first-referral');
  END IF;

  IF v_verified_referrals >= 5 THEN
    PERFORM public.complete_mission(p_member_id, 'five-referrals');
  END IF;

  IF v_city_founder_count IS NOT NULL AND v_city_founder_count >= 100 THEN
    PERFORM public.complete_mission(p_member_id, 'city-tribe');
  END IF;

  IF v_city_founder_count IS NOT NULL AND v_city_founder_count >= 250 THEN
    PERFORM public.complete_mission(p_member_id, 'city-organization');
  END IF;

  IF v_city_founder_count IS NOT NULL AND v_city_founder_count >= 1000 THEN
    PERFORM public.complete_mission(p_member_id, 'city-congregation');
  END IF;

  IF v_city_founder_count IS NOT NULL AND v_city_founder_count >= 2500 THEN
    PERFORM public.complete_mission(p_member_id, 'city-coalition');
  END IF;

  IF v_city_founder_count IS NOT NULL AND v_city_founder_count >= 5000 THEN
    PERFORM public.complete_mission(p_member_id, 'city-powerhouse');
  END IF;

  IF v_city_founder_count IS NOT NULL AND v_city_founder_count >= 10000 THEN
    PERFORM public.complete_mission(p_member_id, 'city-legacy');
  END IF;
END;
$$;

-- ==================== REFRESH EMPIRE PROGRESS ====================
SELECT public.refresh_empire_progress();

-- ==================== GRANT EXECUTE ====================
GRANT EXECUTE ON FUNCTION public.assign_founder_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_empire_progress TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_auto_complete_missions TO authenticated;