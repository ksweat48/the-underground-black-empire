/*
# Collective Level-Up Missions + Rename "Founders" to "Population"

## Changes
1. Rename founder_count columns to population_count on cities, city_progress, metro_progress
2. Replace 9 individual missions with 12 collective level-up missions
3. Update refresh_city_progress, refresh_empire_progress, refresh_metro_progress to use new column names
4. Update award_city_level_xp to award ALL empire members (not just city members) + complete collective mission
5. Update award_empire_level_xp to complete collective mission for all members
6. Remove check_and_auto_complete_missions and check_and_auto_complete_missions_for_referrer
7. Update assign_founder_number to remove calls to removed functions
8. Update verify_referral to remove calls to removed functions
*/

-- ============================================================
-- 1. RENAME COLUMNS: founder_count -> population_count
-- ============================================================

-- cities table
ALTER TABLE cities RENAME COLUMN founder_count TO population_count;

-- city_progress table
ALTER TABLE city_progress RENAME COLUMN founder_count TO population_count;

-- metro_progress table
ALTER TABLE metro_progress RENAME COLUMN founder_count TO population_count;

-- ============================================================
-- 2. REPLACE MISSIONS
-- ============================================================

-- Delete all existing individual missions
DELETE FROM member_missions;
DELETE FROM missions;

-- Insert 12 collective level-up missions
-- 6 city level-up missions (Group is the starting state, not a mission)
INSERT INTO missions (slug, title, description, xp_reward, criteria, display_order) VALUES
  ('city-tribe', 'Reach Tribe City Level', 'Help your city reach 100 members to achieve Tribe city level.', 500, 'city_tribe', 1),
  ('city-organization', 'Reach Organization City Level', 'Help your city reach 250 members to achieve Organization city level.', 750, 'city_organization', 2),
  ('city-congregation', 'Reach Congregation City Level', 'Help your city reach 1,000 members to achieve Congregation city level.', 1500, 'city_congregation', 3),
  ('city-coalition', 'Reach Coalition City Level', 'Help your city reach 2,500 members to achieve Coalition city level.', 3000, 'city_coalition', 4),
  ('city-powerhouse', 'Reach Powerhouse City Level', 'Help your city reach 5,000 members to achieve Powerhouse city level.', 5000, 'city_powerhouse', 5),
  ('city-legacy', 'Reach Legacy City Level', 'Help your city reach 10,000 members to achieve Legacy city level.', 10000, 'city_legacy', 6),
  ('empire-settlement', 'Reach Settlement Empire Level', 'Help the Empire reach 5,000 members and 20 Tribe Cities to achieve Settlement empire level.', 1000, 'empire_settlement', 7),
  ('empire-village', 'Reach Village Empire Level', 'Help the Empire reach 25,000 members and 30 Tribe Cities to achieve Village empire level.', 2500, 'empire_village', 8),
  ('empire-province', 'Reach Province Empire Level', 'Help the Empire reach 50,000 members and 40 Tribe Cities to achieve Province empire level.', 5000, 'empire_province', 9),
  ('empire-kingdom', 'Reach Kingdom Empire Level', 'Help the Empire reach 100,000 members and 50 Tribe Cities to achieve Kingdom empire level.', 10000, 'empire_kingdom', 10),
  ('empire-dominion', 'Reach Dominion Empire Level', 'Help the Empire reach 500,000 members and 100 Tribe Cities to achieve Dominion empire level.', 25000, 'empire_dominion', 11),
  ('empire-empire', 'Reach Empire Level', 'Help the Empire reach 1,000,000 members and 200 Tribe Cities to achieve the final Empire level.', 50000, 'empire_empire', 12)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    xp_reward = EXCLUDED.xp_reward,
    criteria = EXCLUDED.criteria,
    display_order = EXCLUDED.display_order;

-- ============================================================
-- 3. UPDATE REFRESH_CITY_PROGRESS (use population_count)
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_city_progress(
  p_city_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count int;
  v_tier text;
  v_old_tier text;
BEGIN
  SELECT count(*) INTO v_count FROM founder_numbers WHERE city_id = p_city_id;

  v_tier := CASE
    WHEN v_count >= 10000 THEN 'legacy_city'
    WHEN v_count >= 5000 THEN 'powerhouse'
    WHEN v_count >= 2500 THEN 'coalition'
    WHEN v_count >= 1000 THEN 'congregation'
    WHEN v_count >= 250 THEN 'organization'
    WHEN v_count >= 100 THEN 'tribe'
    ELSE 'group'
  END;

  -- Get old tier before updating
  SELECT tier INTO v_old_tier FROM cities WHERE id = p_city_id;

  -- Update city record
  UPDATE cities SET population_count = v_count, tier = v_tier, updated_at = now()
  WHERE id = p_city_id;

  -- Upsert city_progress
  INSERT INTO city_progress (city_id, population_count, tier, updated_at)
  VALUES (p_city_id, v_count, v_tier, now())
  ON CONFLICT (city_id) DO UPDATE
  SET population_count = EXCLUDED.population_count,
      tier = EXCLUDED.tier,
      updated_at = now();

  -- If tier changed, award XP to all empire members and complete collective mission
  IF v_old_tier IS NOT NULL AND v_old_tier <> v_tier THEN
    PERFORM public.award_city_level_xp(p_city_id, v_tier, v_old_tier);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_city_progress TO authenticated;

-- ============================================================
-- 4. UPDATE REFRESH_EMPIRE_PROGRESS (use population_count)
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_empire_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tribe_count int;
  v_total_members int;
  v_total_population int;
  v_old_civ text;
  v_new_civ text;
BEGIN
  -- Tribe Cities = any city that has reached Tribe or higher (population_count >= 100)
  SELECT count(*) INTO v_tribe_count
  FROM cities
  WHERE population_count >= 100;

  -- Total members with assigned numbers (preserved for backward compat)
  SELECT count(*) INTO v_total_members FROM members WHERE member_number IS NOT NULL;

  -- Total population = ALL members
  SELECT count(*) INTO v_total_population FROM members;

  -- Get old civilization level before updating
  SELECT COALESCE(
    (SELECT total_population FROM empire_progress WHERE id = 1), 0
  ) INTO v_old_civ;
  -- We need the actual old civ level, not just population
  -- Store old tribe_city_count and total_population to compute old civ level
  DECLARE
    v_old_tribe_count int;
    v_old_total_population int;
  BEGIN
    SELECT tribe_city_count, total_population INTO v_old_tribe_count, v_old_total_population
    FROM empire_progress WHERE id = 1;

    v_old_civ := public.get_empire_civilization_level_internal(v_old_tribe_count, v_old_total_population);
  END;

  UPDATE empire_progress
  SET tribe_city_count = v_tribe_count,
      total_founders = v_total_members,
      total_population = v_total_population,
      updated_at = now()
  WHERE id = 1;

  -- Compute new civ level
  v_new_civ := public.get_empire_civilization_level_internal(v_tribe_count, v_total_population);

  -- If civilization level changed, award XP to all members and complete collective mission
  IF v_old_civ IS NOT NULL AND v_old_civ <> v_new_civ THEN
    PERFORM public.award_empire_level_xp(v_new_civ);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_empire_progress TO authenticated;

-- ============================================================
-- 5. HELPER: get_empire_civilization_level_internal
-- (used by refresh_empire_progress to detect level changes)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_empire_civilization_level_internal(
  p_tribe_city_count int,
  p_total_population int
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_total_population >= 1000000 AND p_tribe_city_count >= 200 THEN
    RETURN 'empire';
  ELSIF p_total_population >= 500000 AND p_tribe_city_count >= 100 THEN
    RETURN 'dominion';
  ELSIF p_total_population >= 100000 AND p_tribe_city_count >= 50 THEN
    RETURN 'kingdom';
  ELSIF p_total_population >= 50000 AND p_tribe_city_count >= 40 THEN
    RETURN 'province';
  ELSIF p_total_population >= 25000 AND p_tribe_city_count >= 30 THEN
    RETURN 'village';
  ELSIF p_total_population >= 5000 AND p_tribe_city_count >= 20 THEN
    RETURN 'settlement';
  ELSIF p_total_population >= 1000 AND p_tribe_city_count >= 10 THEN
    RETURN 'outpost';
  ELSE
    RETURN 'outpost';
  END IF;
END;
$$;

-- ============================================================
-- 6. UPDATE REFRESH_METRO_PROGRESS (use population_count)
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_metro_progress(
  p_metro_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_population_count int;
  v_city_count int;
BEGIN
  SELECT COALESCE(sum(population_count), 0) INTO v_population_count
  FROM cities WHERE metro_id = p_metro_id AND canonical_status = 'active';

  SELECT count(*) INTO v_city_count
  FROM cities WHERE metro_id = p_metro_id AND canonical_status = 'active';

  INSERT INTO metro_progress (metro_id, population_count, member_count, city_count, updated_at)
  VALUES (p_metro_id, v_population_count, 0, v_city_count, now())
  ON CONFLICT (metro_id) DO UPDATE SET
    population_count = EXCLUDED.population_count,
    city_count = EXCLUDED.city_count,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_metro_progress TO authenticated;

-- ============================================================
-- 7. UPDATE AWARD_CITY_LEVEL_XP
--    Now awards to ALL empire members (not just city members)
--    and completes the corresponding city level mission for each member
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_city_level_xp(
  p_city_id uuid,
  p_new_tier text,
  p_old_tier text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member record;
  v_idem_key text;
  v_mission_slug text;
BEGIN
  v_idem_key := 'city_level_upgrade:' || p_city_id::text || ':' || p_new_tier;

  -- Map tier to mission slug
  v_mission_slug := CASE p_new_tier
    WHEN 'tribe' THEN 'city-tribe'
    WHEN 'organization' THEN 'city-organization'
    WHEN 'congregation' THEN 'city-congregation'
    WHEN 'coalition' THEN 'city-coalition'
    WHEN 'powerhouse' THEN 'city-powerhouse'
    WHEN 'legacy_city' THEN 'city-legacy'
    ELSE NULL
  END;

  -- Award XP to ALL empire members
  FOR v_member IN SELECT id FROM members LOOP
    PERFORM public.award_xp(
      v_member.id,
      'city_level_upgrade',
      50,
      p_city_id,
      v_idem_key || ':' || v_member.id::text,
      'City advanced to ' || p_new_tier
    );

    -- Complete the collective city level mission for each member
    IF v_mission_slug IS NOT NULL THEN
      PERFORM public.complete_mission(v_member.id, v_mission_slug);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_city_level_xp(uuid, text, text) TO authenticated;

-- ============================================================
-- 8. UPDATE AWARD_EMPIRE_LEVEL_XP
--    Now also completes the corresponding empire level mission for each member
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_empire_level_xp(
  p_new_civilization_level text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member record;
  v_idem_key text;
  v_mission_slug text;
BEGIN
  v_idem_key := 'empire_level_upgrade:' || p_new_civilization_level;

  -- Map civilization level to mission slug
  v_mission_slug := CASE p_new_civilization_level
    WHEN 'settlement' THEN 'empire-settlement'
    WHEN 'village' THEN 'empire-village'
    WHEN 'province' THEN 'empire-province'
    WHEN 'kingdom' THEN 'empire-kingdom'
    WHEN 'dominion' THEN 'empire-dominion'
    WHEN 'empire' THEN 'empire-empire'
    ELSE NULL
  END;

  -- Award XP to all members
  FOR v_member IN SELECT id FROM members LOOP
    PERFORM public.award_xp(
      v_member.id,
      'empire_level_upgrade',
      100,
      NULL,
      v_idem_key || ':' || v_member.id::text,
      'Empire advanced to ' || p_new_civilization_level
    );

    -- Complete the collective empire level mission for each member
    IF v_mission_slug IS NOT NULL THEN
      PERFORM public.complete_mission(v_member.id, v_mission_slug);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_empire_level_xp(text) TO authenticated;

-- ============================================================
-- 9. REMOVE OLD AUTO-COMPLETE FUNCTIONS
-- ============================================================

DROP FUNCTION IF EXISTS public.check_and_auto_complete_missions(uuid);
DROP FUNCTION IF EXISTS public.check_and_auto_complete_missions_for_referrer(uuid);

-- ============================================================
-- 10. UPDATE ASSIGN_FOUNDER_NUMBER
--     Remove calls to deleted auto-complete functions
-- ============================================================

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

  -- SSOT XP rewards: signup = 10 XP, city selection = 10 XP
  PERFORM public.award_xp(v_member_id, 'signup_completed', 10, NULL, 'signup_completed:' || v_member_id::text, 'Member signup');
  PERFORM public.award_xp(v_member_id, 'city_selected', 10, p_city_id, 'city_selected:' || v_member_id::text, 'City selection');

  PERFORM public.verify_referral(v_member_id);

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

-- ============================================================
-- 11. REFRESH ALL PROGRESS
-- ============================================================

DO $$
DECLARE
  v_city RECORD;
BEGIN
  FOR v_city IN SELECT id FROM cities LOOP
    PERFORM public.refresh_city_progress(v_city.id);
  END LOOP;
  PERFORM public.refresh_empire_progress();
END $$;
