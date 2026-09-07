/*
# Refresh Kennesaw Cached Population Count

## Context
A test user (greenhaggai@gmail.com) was deleted, but the cached population_count
on cities and city_progress for Kennesaw, GA was not refreshed. This migration
recalculates the cached values by calling the existing refresh functions.

## Changes
1. Call refresh_city_progress for Kennesaw (city_id: 67b6b944-71f4-46e0-a6ff-c9f5c40ecb77)
2. Call refresh_metro_progress for the associated metro
3. Call refresh_empire_progress to update empire-wide totals

## Notes
- This is a one-time data fix, not a schema change.
- The refresh functions are idempotent and safe to call.
*/

DO $$
DECLARE
  v_city_id uuid := '67b6b944-71f4-46e0-a6ff-c9f5c40ecb77';
  v_metro_id uuid;
BEGIN
  -- Refresh city progress (updates cities.population_count, cities.tier, city_progress)
  PERFORM public.refresh_city_progress(v_city_id);

  -- Get the metro_id for Kennesaw and refresh metro progress
  SELECT metro_id INTO v_metro_id FROM cities WHERE id = v_city_id;
  IF v_metro_id IS NOT NULL THEN
    PERFORM public.refresh_metro_progress(v_metro_id);
  END IF;

  -- Refresh empire-wide progress
  PERFORM public.refresh_empire_progress();
END $$;