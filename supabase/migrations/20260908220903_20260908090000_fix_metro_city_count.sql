/*
# Count only established cities in metro progress

1. Changes
- Updates `refresh_metro_progress` to use the current population fields on `cities`.
- `metro_progress.city_count` now counts only active cities with at least one member.
- `metro_progress.population_count` now sums member populations across active cities.

2. Modified Functions
- `public.refresh_metro_progress(uuid)` now uses `population_count > 0` for the city total.

3. Security
- Preserves the existing SECURITY DEFINER setting, fixed `public` search path, and authenticated EXECUTE grant.
- No tables, columns, or row-level security policies are changed.

4. Notes
- Existing metro totals are recalculated immediately for every metro.
*/

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
  FROM cities
  WHERE metro_id = p_metro_id
    AND canonical_status = 'active';

  SELECT count(*) INTO v_city_count
  FROM cities
  WHERE metro_id = p_metro_id
    AND canonical_status = 'active'
    AND population_count > 0;

  INSERT INTO metro_progress (metro_id, population_count, member_count, city_count, updated_at)
  VALUES (p_metro_id, v_population_count, v_population_count, v_city_count, now())
  ON CONFLICT (metro_id) DO UPDATE SET
    population_count = EXCLUDED.population_count,
    member_count = EXCLUDED.member_count,
    city_count = EXCLUDED.city_count,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_metro_progress TO authenticated;

DO $$
DECLARE
  metro_record record;
BEGIN
  FOR metro_record IN SELECT id FROM metros LOOP
    PERFORM public.refresh_metro_progress(metro_record.id);
  END LOOP;
END $$;