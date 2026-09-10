/*
# Fix stale population counts and prevent duplicate onboarding listings

## Problem
1. City and Empire population counts are stale: Kennesaw shows 1 member but
   has 2 completed onboarding members. The `mark_onboarding_complete()` function
   did NOT call `refresh_city_progress` or `refresh_empire_progress`, so cached
   population totals were never updated when the second member completed onboarding.
2. The onboarding identity page can create duplicate market listings if the user
   submits the form multiple times (double-click, retry after navigation error).

## Changes

### 1. Fix `mark_onboarding_complete()` to refresh population counts
- After setting `onboarding_complete = true`, the function now calls
  `refresh_city_progress` for the member's city and `refresh_empire_progress()`.
- This ensures city and Empire population totals are updated immediately when
  a member finishes onboarding.

### 2. Add unique constraint to prevent duplicate active listings per owner+name
- Adds a partial unique index on `market_listings(owner_id, name)` where status
  is NOT IN ('removed', 'needs_changes'). This prevents a member from having
  two active (in_review or approved) listings with the same name.
- The index is partial so removed or needs_changes listings don't block creation.

### 3. Refresh all cached population totals now
- Runs `refresh_city_progress` for all cities and `refresh_empire_progress()`
  to repair the currently stale cached values.

## Security
- No new tables, columns, or RLS policies.
- `mark_onboarding_complete` remains SECURITY DEFINER with authenticated execute grant.
- The unique index is a data integrity constraint, not a security change.
*/

-- ============================================================
-- 1. Fix mark_onboarding_complete to refresh population counts
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_onboarding_complete()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected int;
  v_city_id uuid;
BEGIN
  SELECT city_id INTO v_city_id FROM members WHERE id = auth.uid();

  UPDATE members
  SET onboarding_complete = true, updated_at = now()
  WHERE id = auth.uid() AND onboarding_complete = false;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected > 0 AND v_city_id IS NOT NULL THEN
    PERFORM public.refresh_city_progress(v_city_id);
  END IF;

  PERFORM public.refresh_empire_progress();

  RETURN v_affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_onboarding_complete() TO authenticated;

-- ============================================================
-- 2. Prevent duplicate active listings with the same name per owner
-- ============================================================

DROP INDEX IF EXISTS idx_market_listings_owner_name_active;
CREATE UNIQUE INDEX idx_market_listings_owner_name_active
  ON market_listings (owner_id, name)
  WHERE status NOT IN ('removed', 'needs_changes');

-- ============================================================
-- 3. Repair currently stale cached population totals
-- ============================================================

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
