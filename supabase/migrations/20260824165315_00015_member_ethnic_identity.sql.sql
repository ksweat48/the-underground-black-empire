/*
# Add Ethnic / Race Identity to Members

## Purpose
Collects race / ethnic identity data at signup, treating it as core participation
data alongside city and location. Members can select multiple categories and
optionally provide a free-text self-description when "Another race / ethnic identity"
is selected.

## Changes to Existing Tables

### members (modified)
- `ethnic_identity` (text[], nullable) — array of selected ethnic/racial categories.
  Values: 'black_african_american', 'hispanic_latino', 'white', 'asian',
  'middle_eastern_north_african', 'american_indian_alaska_native',
  'native_hawaiian_pacific_islanderer', 'another'.
- `ethnic_identity_detail` (text, nullable) — free-text self-description required
  when 'another' is included in the ethnic_identity array.

## New Functions

### update_ethnic_identity
SECURITY DEFINER function that lets an authenticated member update ONLY their own
ethnic identity fields. Validates that if 'another' is in the array, a non-empty
detail string is provided. Prevents users from modifying anyone else's identity.

## Security
- RLS already enabled on members table (existing policies unchanged).
- The new function is SECURITY DEFINER with search_path = 'public'.
- Function checks auth.uid() matches the member being updated.
- GRANT EXECUTE to authenticated role only.

## Important Notes
1. Both columns are nullable so existing members are not affected.
2. The function validates the 'another' + detail requirement server-side.
3. Only the member owner can update their own ethnic identity — no cross-user writes.
*/

-- Add ethnic identity columns to members
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS ethnic_identity text[],
  ADD COLUMN IF NOT EXISTS ethnic_identity_detail text;

-- ==================== UPDATE_ETHNIC_IDENTITY ====================
CREATE OR REPLACE FUNCTION public.update_ethnic_identity(
  p_ethnic_identity text[],
  p_ethnic_identity_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_has_another boolean;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Validate: if 'another' is in the array, detail must be non-empty
  v_has_another := COALESCE(
    EXISTS (SELECT 1 FROM unnest(p_ethnic_identity) WHERE elem = 'another'),
    false
  );

  IF v_has_another AND (p_ethnic_identity_detail IS NULL OR btrim(p_ethnic_identity_detail) = '') THEN
    RAISE EXCEPTION 'A self-description is required when "Another race / ethnic identity" is selected' USING ERRCODE = '23502';
  END IF;

  -- Update only the caller's own row
  UPDATE members
  SET ethnic_identity = p_ethnic_identity,
      ethnic_identity_detail = CASE
        WHEN NOT v_has_another THEN NULL
        ELSE p_ethnic_identity_detail
      END,
      updated_at = now()
  WHERE id = v_member_id;
END;
$$;

-- ==================== GRANT EXECUTE ====================
GRANT EXECUTE ON FUNCTION public.update_ethnic_identity TO authenticated;