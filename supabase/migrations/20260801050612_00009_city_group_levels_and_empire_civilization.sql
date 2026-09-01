/*
# City Group Levels and Empire Civilization Levels

## Purpose
Replaces the old 3-tier city system (settlement | outpost | tribe) with a 7-level
city group system, and introduces a separate Empire civilization level concept.

## Changes

### 1. City tier system updated (7 group levels)
Old tiers: settlement (0), outpost (10), tribe (100)
New tiers: group (1), tribe (100), organization (250), congregation (1000),
           coalition (2500), powerhouse (5000), legacy_city (10000)

- `cities.tier` default changed from 'settlement' to 'group'
- `city_progress.tier` default changed from 'settlement' to 'group'
- All existing rows with tier='settlement' updated to 'group'
- All existing rows with tier='outpost' updated to 'tribe' (since outpost was 10+ founders,
  and the new system has no outpost level for cities — 10+ founders is still 'group' until 100)

### 2. refresh_city_progress function updated
- New tier thresholds: group (1-99), tribe (100-249), organization (250-999),
  congregation (1000-2499), coalition (2500-4999), powerhouse (5000-9999), legacy_city (10000+)

### 3. Founder capacity raised
- `assign_founder_number` capacity check raised from 100 to 10000

### 4. Mission seeds updated
- 'city-outpost' mission (reach 10 founders) replaced with 'city-tribe' (reach 100 founders)
  since the new system no longer has an outpost tier for cities
- 'city-tribe' mission updated to 'city-organization' (reach 250 founders)
- New missions added for higher group levels

### 5. check_and_auto_complete_missions updated
- References to 'city-outpost' replaced with appropriate new mission slugs
- 'city-tribe' check now uses founder_count >= 100 (Tribe status)

## Security
- No RLS policy changes — all existing policies remain in place
- All functions remain SECURITY DEFINER with search_path = 'public'

## Important Notes
1. This migration is idempotent — safe to re-run.
2. The Empire civilization level is a frontend-only concept derived from
   tribe_city_count and total_founders; no database column stores it.
3. The old 'outpost' tier value for cities no longer exists in the new system.
4. Existing cities with 10-99 founders (formerly 'outpost') become 'group' —
   this is correct since they haven't reached the 100-founder Tribe threshold.
*/

-- ==================== UPDATE TIER DEFAULTS ====================
ALTER TABLE cities ALTER COLUMN tier SET DEFAULT 'group';
ALTER TABLE city_progress ALTER COLUMN tier SET DEFAULT 'group';

-- ==================== MIGRATE EXISTING TIER VALUES ====================
-- 'settlement' (0 founders) -> 'group'
UPDATE cities SET tier = 'group' WHERE tier = 'settlement';
UPDATE city_progress SET tier = 'group' WHERE tier = 'settlement';

-- 'outpost' (10-99 founders) -> 'group' (hasn't reached 100-founder Tribe threshold yet)
UPDATE cities SET tier = 'group' WHERE tier = 'outpost';
UPDATE city_progress SET tier = 'group' WHERE tier = 'outpost';

-- 'tribe' (100+ founders) stays 'tribe' — no change needed

-- ==================== UPDATE REFRESH_CITY_PROGRESS ====================
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

  -- Update city record
  UPDATE cities SET founder_count = v_count, tier = v_tier, updated_at = now()
  WHERE id = p_city_id;

  -- Upsert city_progress
  INSERT INTO city_progress (city_id, founder_count, tier, updated_at)
  VALUES (p_city_id, v_count, v_tier, now())
  ON CONFLICT (city_id) DO UPDATE
  SET founder_count = EXCLUDED.founder_count,
      tier = EXCLUDED.tier,
      updated_at = now();
END;
$$;

-- ==================== UPDATE ASSIGN_FOUNDER_NUMBER (capacity 10000) ====================
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

  IF v_current_count >= 10000 THEN
    RAISE EXCEPTION 'This city has reached its founder capacity (10000)' USING ERRCODE = 'P0003';
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

-- ==================== UPDATE MISSION SEEDS ====================
-- Remove old 'city-outpost' mission (reach 10 founders) — no longer a tier
DELETE FROM missions WHERE slug = 'city-outpost';

-- Update 'city-tribe' to be the 100-founder milestone (it already is, but ensure criteria matches)
UPDATE missions
SET title = 'Reach Tribe Status',
    description = 'Help your city reach 100 founders and achieve Tribe status.',
    xp_reward = 500,
    criteria = 'city_tribe',
    display_order = 4
WHERE slug = 'city-tribe';

-- The old 'city-tribe' mission was for reaching 100 founders and achieving Tribe status.
-- We need to add new missions for the higher group levels.
-- Use ON CONFLICT to make this idempotent.
INSERT INTO missions (slug, title, description, xp_reward, criteria, display_order) VALUES
  ('city-organization', 'Reach Organization Status', 'Help your city reach 250 founders and achieve Organization status.', 750, 'city_organization', 6),
  ('city-congregation', 'Reach Congregation Status', 'Help your city reach 1,000 founders and achieve Congregation status.', 1500, 'city_congregation', 7),
  ('city-coalition', 'Reach Coalition Status', 'Help your city reach 2,500 founders and achieve Coalition status.', 3000, 'city_coalition', 8),
  ('city-powerhouse', 'Reach Powerhouse Status', 'Help your city reach 5,000 founders and achieve Powerhouse status.', 5000, 'city_powerhouse', 9),
  ('city-legacy', 'Legacy City Status', 'Help your city reach 10,000 founders — the highest honor.', 10000, 'city_legacy', 10)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    xp_reward = EXCLUDED.xp_reward,
    criteria = EXCLUDED.criteria,
    display_order = EXCLUDED.display_order;

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

  IF v_is_founder IS NULL THEN
    RETURN;
  END IF;

  IF v_city_id IS NOT NULL THEN
    SELECT founder_count, tier INTO v_city_founder_count, v_city_tier
    FROM cities WHERE id = v_city_id;
  END IF;

  SELECT count(*) INTO v_verified_referrals
  FROM referrals
  WHERE referring_member_id = p_member_id AND status = 'verified';

  IF v_is_founder AND v_city_id IS NOT NULL THEN
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

-- ==================== REFRESH ALL CITY PROGRESS ====================
-- Recalculate tier for all existing cities based on current founder counts
DO $$
DECLARE
  v_city RECORD;
BEGIN
  FOR v_city IN SELECT id FROM cities LOOP
    PERFORM public.refresh_city_progress(v_city.id);
  END LOOP;
  PERFORM public.refresh_empire_progress();
END $$;

-- ==================== GRANT EXECUTE (re-grant since functions were recreated) ====================
GRANT EXECUTE ON FUNCTION public.refresh_city_progress TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_founder_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_auto_complete_missions TO authenticated;
