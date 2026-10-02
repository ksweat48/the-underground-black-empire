/*
# Qualified Metro progression, permanent Treasury capacity, and removal of city levels

## Plain-English summary
- Cities no longer have levels. A city only tracks its active member population.
- Each Metro's population is the sum of its cities. When a Metro first reaches 100 active
  members it becomes Qualified forever. Its Treasury capacity band only ever goes up.
- The Empire stage is based on the number of Qualified Metros and never goes down:
  Outpost 0, Settlement 1, Village 3, Province 5, Kingdom 10, Dominion 25, Empire 50.
- The 50 Influence reward for city growth is removed completely. The 100 Influence reward for
  Empire stage advances remains and is only given once per stage, to active members.

## 1. New helper functions
- `treasury_capacity_band(population)`: 0..6 from population bands
  (0-99, 100-249, 250-499, 500-999, 1000-2499, 2500-4999, 5000+).
- `treasury_capacity_cents(band)`: 0, $5k, $10k, $25k, $50k, $100k, NULL (= no cap).
- `empire_stage_for_qualified_metros(count)` and `empire_stage_rank(stage)`.

## 2. Rewritten functions
- `refresh_city_progress`: counts active members only, no tier, then refreshes its Metro.
- `refresh_metro_progress`: updates population, sets qualification and capacity (upward only),
  logs milestone events, refreshes the Empire when a Metro newly qualifies.
- `refresh_empire_progress`: counts Qualified Metros, only ever raises `highest_stage`.
- `award_empire_level_influence`: active members only.

## 3. Removed
- `award_city_level_influence` and `get_empire_civilization_level_internal` (no longer used).

## 4. Security
- All functions are SECURITY DEFINER with fixed search_path; internal ones are not executable
  by anon/authenticated. `refresh_empire_progress` keeps its existing authenticated grant.
*/

CREATE OR REPLACE FUNCTION public.treasury_capacity_band(p_population int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_population >= 5000 THEN 6
    WHEN p_population >= 2500 THEN 5
    WHEN p_population >= 1000 THEN 4
    WHEN p_population >= 500 THEN 3
    WHEN p_population >= 250 THEN 2
    WHEN p_population >= 100 THEN 1
    ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.treasury_capacity_cents(p_band int)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_band
    WHEN 0 THEN 0::bigint
    WHEN 1 THEN 500000::bigint
    WHEN 2 THEN 1000000::bigint
    WHEN 3 THEN 2500000::bigint
    WHEN 4 THEN 5000000::bigint
    WHEN 5 THEN 10000000::bigint
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.treasury_band_threshold(p_band int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_band WHEN 0 THEN 0 WHEN 1 THEN 100 WHEN 2 THEN 250 WHEN 3 THEN 500
    WHEN 4 THEN 1000 WHEN 5 THEN 2500 WHEN 6 THEN 5000 ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.empire_stage_rank(p_stage text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_stage WHEN 'outpost' THEN 0 WHEN 'settlement' THEN 1 WHEN 'village' THEN 2
    WHEN 'province' THEN 3 WHEN 'kingdom' THEN 4 WHEN 'dominion' THEN 5 WHEN 'empire' THEN 6
    ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.empire_stage_for_qualified_metros(p_count int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_count >= 50 THEN 'empire'
    WHEN p_count >= 25 THEN 'dominion'
    WHEN p_count >= 10 THEN 'kingdom'
    WHEN p_count >= 5 THEN 'province'
    WHEN p_count >= 3 THEN 'village'
    WHEN p_count >= 1 THEN 'settlement'
    ELSE 'outpost' END;
$$;

CREATE OR REPLACE FUNCTION public.award_empire_level_influence(p_new_civilization_level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member record;
  v_idem_key text := 'empire_level_upgrade:' || p_new_civilization_level;
  v_mission_slug text;
BEGIN
  v_mission_slug := CASE p_new_civilization_level
    WHEN 'settlement' THEN 'empire-settlement'
    WHEN 'village' THEN 'empire-village'
    WHEN 'province' THEN 'empire-province'
    WHEN 'kingdom' THEN 'empire-kingdom'
    WHEN 'dominion' THEN 'empire-dominion'
    WHEN 'empire' THEN 'empire-empire'
    ELSE NULL END;

  FOR v_member IN
    SELECT id FROM members WHERE onboarding_complete = true AND account_status = 'active'
  LOOP
    PERFORM public.award_influence(
      v_member.id, 'empire_level_upgrade', 100, NULL,
      v_idem_key || ':' || v_member.id::text,
      'The Empire advanced to ' || initcap(p_new_civilization_level)
    );
    IF v_mission_slug IS NOT NULL THEN
      PERFORM public.complete_mission(v_member.id, v_mission_slug);
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_empire_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qualified int;
  v_total_members int;
  v_total_population int;
  v_current_stage text;
  v_target_stage text;
  v_stage text;
BEGIN
  SELECT count(*) INTO v_qualified FROM metro_milestones WHERE qualified_at IS NOT NULL;

  SELECT count(*) INTO v_total_population
  FROM members WHERE onboarding_complete = true AND account_status = 'active';

  SELECT count(*) INTO v_total_members
  FROM members WHERE onboarding_complete = true AND account_status = 'active' AND member_number IS NOT NULL;

  SELECT highest_stage INTO v_current_stage FROM empire_progress WHERE id = 1 FOR UPDATE;
  v_target_stage := public.empire_stage_for_qualified_metros(v_qualified);

  UPDATE empire_progress
  SET qualified_metro_count = v_qualified,
      total_founders = v_total_members,
      total_population = v_total_population,
      updated_at = now()
  WHERE id = 1;

  IF public.empire_stage_rank(v_target_stage) > public.empire_stage_rank(COALESCE(v_current_stage, 'outpost')) THEN
    UPDATE empire_progress
    SET highest_stage = v_target_stage, stage_reached_at = now()
    WHERE id = 1;

    FOREACH v_stage IN ARRAY ARRAY['settlement','village','province','kingdom','dominion','empire'] LOOP
      IF public.empire_stage_rank(v_stage) > public.empire_stage_rank(COALESCE(v_current_stage, 'outpost'))
         AND public.empire_stage_rank(v_stage) <= public.empire_stage_rank(v_target_stage) THEN
        INSERT INTO empire_stage_history (stage, reached_at, qualified_metro_count)
        VALUES (v_stage, now(), v_qualified)
        ON CONFLICT (stage) DO NOTHING;
        PERFORM public.award_empire_level_influence(v_stage);
      END IF;
    END LOOP;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_metro_progress(p_metro_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_population int;
  v_city_count int;
  v_ms record;
  v_band int;
  v_newly_qualified boolean := false;
BEGIN
  SELECT COALESCE(sum(population_count), 0) INTO v_population
  FROM cities WHERE metro_id = p_metro_id AND canonical_status = 'active';

  SELECT count(*) INTO v_city_count
  FROM cities WHERE metro_id = p_metro_id AND canonical_status = 'active' AND population_count > 0;

  INSERT INTO metro_progress (metro_id, population_count, member_count, city_count, updated_at)
  VALUES (p_metro_id, v_population, v_population, v_city_count, now())
  ON CONFLICT (metro_id) DO UPDATE SET
    population_count = EXCLUDED.population_count,
    member_count = EXCLUDED.member_count,
    city_count = EXCLUDED.city_count,
    updated_at = now();

  INSERT INTO metro_milestones (metro_id) VALUES (p_metro_id) ON CONFLICT (metro_id) DO NOTHING;
  SELECT * INTO v_ms FROM metro_milestones WHERE metro_id = p_metro_id FOR UPDATE;

  v_band := public.treasury_capacity_band(v_population);

  IF v_ms.qualified_at IS NULL AND v_population >= 100 THEN
    v_newly_qualified := true;
    UPDATE metro_milestones SET qualified_at = now() WHERE metro_id = p_metro_id;
    INSERT INTO metro_milestone_events (metro_id, event_type, capacity_band, population_at_event)
    VALUES (p_metro_id, 'qualified', v_band, v_population);
  END IF;

  IF v_band > v_ms.capacity_band THEN
    UPDATE metro_milestones
    SET capacity_band = v_band, capacity_unlocked_at = now()
    WHERE metro_id = p_metro_id;
    INSERT INTO metro_milestone_events (metro_id, event_type, capacity_band, population_at_event)
    VALUES (p_metro_id, 'capacity_unlocked', v_band, v_population);
  END IF;

  UPDATE metro_milestones
  SET peak_population = GREATEST(peak_population, v_population), updated_at = now()
  WHERE metro_id = p_metro_id;

  IF v_newly_qualified THEN
    PERFORM public.refresh_empire_progress();
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_city_progress(p_city_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_metro_id uuid;
BEGIN
  SELECT count(*) INTO v_count
  FROM founder_numbers fn
  JOIN members m ON m.id = fn.member_id
  WHERE fn.city_id = p_city_id
    AND m.onboarding_complete = true
    AND m.account_status = 'active';

  UPDATE cities
  SET population_count = v_count, updated_at = now()
  WHERE id = p_city_id
  RETURNING metro_id INTO v_metro_id;

  INSERT INTO city_progress (city_id, population_count, updated_at)
  VALUES (p_city_id, v_count, now())
  ON CONFLICT (city_id) DO UPDATE
  SET population_count = EXCLUDED.population_count, updated_at = now();

  IF v_metro_id IS NOT NULL THEN
    PERFORM public.refresh_metro_progress(v_metro_id);
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.award_city_level_influence(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_empire_civilization_level_internal(int, int);

REVOKE EXECUTE ON FUNCTION public.award_empire_level_influence(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_metro_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_city_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_empire_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_empire_progress() TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM cities WHERE population_count > 0 OR id IN (SELECT city_id FROM founder_numbers) LOOP
    PERFORM public.refresh_city_progress(r.id);
  END LOOP;
  FOR r IN SELECT id FROM metros LOOP
    PERFORM public.refresh_metro_progress(r.id);
  END LOOP;
  PERFORM public.refresh_empire_progress();
END $$;
