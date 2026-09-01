/*
# Add Date of Birth, Support Role, and Support Role Detail to Members

## Purpose
Step 3 of onboarding ("Who You Are") now collects:
- Date of birth (for age demographics in admin)
- Support role: how the member contributes to the Empire
  ('supporter', 'business_owner', 'professional', 'organization')
- Support role detail: business name, profession, or non-profit name
  (required when role is not 'supporter')

Also updates the `update_ethnic_identity` function to accept a single text
value instead of an array, since race selection is now a single dropdown
(defaulting to 'black_african_american') rather than a multi-select grid.

## Changes to Existing Tables

### members (modified)
- `date_of_birth` (date, nullable) — member's date of birth for age demographics.
- `support_role` (text, nullable) — one of 'supporter', 'business_owner',
  'professional', 'organization'.
- `support_role_detail` (text, nullable) — business name, profession, or
  non-profit name. Required when support_role is not 'supporter'.

## Modified Functions

### update_ethnic_identity (modified)
Signature changed from text[] to text. The old function is dropped first
to avoid ambiguity. Now accepts a single text value. When the value is
'another', a non-empty detail string is required. Stores as a single-element
array for backward compatibility with the text[] column.

### update_member_profile (new)
SECURITY DEFINER function for updating date_of_birth, support_role, and
support_role_detail. Validates role values and that detail is required
when role is not 'supporter'. Date of birth must not be in the future.

## Security
- RLS already enabled on members table (existing policies unchanged).
- Both functions are SECURITY DEFINER with search_path = 'public'.
- Functions check auth.uid() matches the member being updated.
- GRANT EXECUTE to authenticated role only.

## Important Notes
1. All new columns are nullable so existing members are not affected.
2. The ethnic_identity column type remains text[] for backward compatibility.
3. Only the member owner can update their own profile — no cross-user writes.
*/

-- Add new columns to members
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS support_role text,
  ADD COLUMN IF NOT EXISTS support_role_detail text;

-- Drop the old update_ethnic_identity function with text[] signature
DROP FUNCTION IF EXISTS public.update_ethnic_identity(text[], text);

-- ==================== UPDATE_ETHNIC_IDENTITY (updated for single value) ====================
CREATE OR REPLACE FUNCTION public.update_ethnic_identity(
  p_ethnic_identity text,
  p_ethnic_identity_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_ethnic_identity IS NULL OR btrim(p_ethnic_identity) = '' THEN
    RAISE EXCEPTION 'Race / ethnic identity is required' USING ERRCODE = '23502';
  END IF;

  -- Validate: if 'another' is selected, detail must be non-empty
  IF p_ethnic_identity = 'another' AND (p_ethnic_identity_detail IS NULL OR btrim(p_ethnic_identity_detail) = '') THEN
    RAISE EXCEPTION 'A self-description is required when "Another race / ethnic identity" is selected' USING ERRCODE = '23502';
  END IF;

  -- Update only the caller's own row — store as single-element array for backward compat
  UPDATE members
  SET ethnic_identity = ARRAY[p_ethnic_identity],
      ethnic_identity_detail = CASE
        WHEN p_ethnic_identity = 'another' THEN p_ethnic_identity_detail
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ethnic_identity TO authenticated;

-- ==================== UPDATE_MEMBER_PROFILE ====================
CREATE OR REPLACE FUNCTION public.update_member_profile(
  p_date_of_birth date DEFAULT NULL,
  p_support_role text DEFAULT NULL,
  p_support_role_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Validate support_role if provided
  IF p_support_role IS NOT NULL AND p_support_role NOT IN ('supporter', 'business_owner', 'professional', 'organization') THEN
    RAISE EXCEPTION 'Invalid support role' USING ERRCODE = '23514';
  END IF;

  -- If support_role is not 'supporter' and not null, detail must be non-empty
  IF p_support_role IS NOT NULL AND p_support_role <> 'supporter' AND (p_support_role_detail IS NULL OR btrim(p_support_role_detail) = '') THEN
    RAISE EXCEPTION 'A detail is required for this support role' USING ERRCODE = '23502';
  END IF;

  -- Date of birth must not be in the future
  IF p_date_of_birth IS NOT NULL AND p_date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future' USING ERRCODE = '23514';
  END IF;

  -- Update only the caller's own row
  UPDATE members
  SET date_of_birth = p_date_of_birth,
      support_role = p_support_role,
      support_role_detail = CASE
        WHEN p_support_role IS NULL OR p_support_role = 'supporter' THEN NULL
        ELSE p_support_role_detail
      END,
      updated_at = now()
  WHERE id = v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_profile TO authenticated;