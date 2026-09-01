/*
# Empire Civilization Progression: Population + Geography Only

## Purpose
Redefines Empire civilization advancement to use only two measurements:
  1. Total Population (all members)
  2. Tribe City Count (cities at Tribe tier or higher — founder_count >= 100)

Removes all references to money, voting, initiatives, legacy enrollment, and
governance from the Empire advancement calculation. Those features may exist
as city-level features unlocked at certain civilization levels, but they do
NOT gate Empire progression.

## Changes

### 1. empire_progress table
- Adds `total_population` column (int, default 0) — counts ALL members,
  not just those with a member_number. This is the primary population metric
  for civilization advancement.

### 2. refresh_empire_progress function updated
- `tribe_city_count` now counts cities where `founder_count >= 100` (Tribe or
  any higher tier), instead of only `tier = 'tribe'` which missed cities that
  had grown beyond Tribe.
- `total_population` now counts all members (SELECT count(*) FROM members).
- `total_founders` unchanged — still counts members with member_number IS NOT NULL.

### 3. New civilization level thresholds (enforced in frontend, not DB)
The DB stores the raw measurements; the frontend maps them to civilization
levels using these thresholds:
  - Outpost:    1,000 population + 10 Tribe Cities
  - Settlement: 5,000 population + 20 Tribe Cities
  - Village:    25,000 population + 30 Tribe Cities
  - Province:   50,000 population + 40 Tribe Cities
  - Kingdom:    100,000 population + 50 Tribe Cities
  - Dominion:   500,000 population + 100 Tribe Cities
  - Empire:     1,000,000 population + 200 Tribe Cities

## Security
- No RLS policy changes — empire_progress remains readable by authenticated users.
- refresh_empire_progress remains SECURITY DEFINER with search_path = 'public'.

## Important Notes
1. This migration is idempotent — safe to re-run.
2. The old tribe_city_count only counted tier='tribe' exactly; now it counts
   any city that has reached Tribe or higher (founder_count >= 100).
3. total_population counts ALL members regardless of member_number status.
4. total_founders is preserved for backward compatibility but is no longer
   the primary population metric for civilization advancement.
*/

-- ==================== ADD total_population COLUMN ====================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empire_progress' AND column_name = 'total_population'
  ) THEN
    ALTER TABLE empire_progress ADD COLUMN total_population int NOT NULL DEFAULT 0;
  END IF;
END $$;

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
  v_total_population int;
BEGIN
  -- Tribe Cities = any city that has reached Tribe or higher (founder_count >= 100)
  SELECT count(*) INTO v_tribe_count
  FROM cities
  WHERE founder_count >= 100;

  -- Total founders/members with assigned numbers (preserved for backward compat)
  SELECT count(*) INTO v_total_members FROM members WHERE member_number IS NOT NULL;

  -- Total population = ALL members
  SELECT count(*) INTO v_total_population FROM members;

  UPDATE empire_progress
  SET tribe_city_count = v_tribe_count,
      total_founders = v_total_members,
      total_population = v_total_population,
      updated_at = now()
  WHERE id = 1;
END;
$$;

-- ==================== REFRESH EMPIRE PROGRESS ====================
SELECT public.refresh_empire_progress();

-- ==================== GRANT EXECUTE ====================
GRANT EXECUTE ON FUNCTION public.refresh_empire_progress TO authenticated;
