/*
# Count only completed onboarding members in population totals

## Purpose
Keep city and empire population totals aligned with actual members who finished onboarding.
An account currently receives a reserved city number during account creation so that its
number can be preserved if onboarding is resumed. That reservation must not make an
unfinished account appear as an active member in city or empire population totals.

## Changes
1. Modified functions
- `refresh_city_progress(city_id)`: counts only founder number rows whose member has
  `onboarding_complete = true`.
- `refresh_empire_progress()`: counts only completed members in the total population.

2. Data behavior
- Existing founder number reservations are retained.
- City and empire population totals now exclude incomplete onboarding records.
- Number preservation remains unchanged; a returning member keeps its reserved number.

## Security
- No tables, columns, or RLS policies are added or removed.
- Existing SECURITY DEFINER behavior and authenticated execute grants remain in place.

## Important notes
1. This migration changes cached population calculations only.
2. Existing cached city and empire values are refreshed for all records after the function
   definitions are replaced.
3. No member or founder number rows are deleted by this migration.
*/

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
  SELECT count(*)
  INTO v_count
  FROM founder_numbers fn
  JOIN members m ON m.id = fn.member_id
  WHERE fn.city_id = p_city_id
    AND m.onboarding_complete = true;

  v_tier := CASE
    WHEN v_count >= 10000 THEN 'legacy_city'
    WHEN v_count >= 5000 THEN 'powerhouse'
    WHEN v_count >= 2500 THEN 'coalition'
    WHEN v_count >= 1000 THEN 'congregation'
    WHEN v_count >= 250 THEN 'organization'
    WHEN v_count >= 100 THEN 'tribe'
    ELSE 'group'
  END;

  SELECT tier INTO v_old_tier FROM cities WHERE id = p_city_id;

  UPDATE cities
  SET population_count = v_count,
      tier = v_tier,
      updated_at = now()
  WHERE id = p_city_id;

  INSERT INTO city_progress (city_id, population_count, tier, updated_at)
  VALUES (p_city_id, v_count, v_tier, now())
  ON CONFLICT (city_id) DO UPDATE
  SET population_count = EXCLUDED.population_count,
      tier = EXCLUDED.tier,
      updated_at = now();

  IF v_old_tier IS NOT NULL AND v_old_tier <> v_tier THEN
    PERFORM public.award_city_level_influence(p_city_id, v_tier, v_old_tier);
  END IF;
END;
$$;

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
  v_old_tribe_count int;
  v_old_total_population int;
BEGIN
  SELECT count(*) INTO v_tribe_count
  FROM cities
  WHERE population_count >= 100;

  SELECT count(*) INTO v_total_members
  FROM members
  WHERE member_number IS NOT NULL
    AND onboarding_complete = true;

  SELECT count(*) INTO v_total_population
  FROM members
  WHERE onboarding_complete = true;

  SELECT tribe_city_count, total_population
  INTO v_old_tribe_count, v_old_total_population
  FROM empire_progress
  WHERE id = 1;

  v_old_civ := public.get_empire_civilization_level_internal(v_old_tribe_count, v_old_total_population);

  UPDATE empire_progress
  SET tribe_city_count = v_tribe_count,
      total_founders = v_total_members,
      total_population = v_total_population,
      updated_at = now()
  WHERE id = 1;

  v_new_civ := public.get_empire_civilization_level_internal(v_tribe_count, v_total_population);

  IF v_old_civ IS NOT NULL AND v_old_civ <> v_new_civ THEN
    PERFORM public.award_empire_level_influence(v_new_civ);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_city_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_empire_progress() TO authenticated;

DO $$
DECLARE
  city_record record;
BEGIN
  FOR city_record IN SELECT id FROM cities LOOP
    PERFORM public.refresh_city_progress(city_record.id);
  END LOOP;
END;
$$;

SELECT public.refresh_empire_progress();