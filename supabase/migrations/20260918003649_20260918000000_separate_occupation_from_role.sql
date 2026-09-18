/*
# Separate Occupation from Support Role

## Purpose
"Professional" is being removed as a support role option. Occupation becomes
its own independent field that any member can set regardless of their role
(supporter, business_owner, or organization).

## Changes to Existing Tables

### members (modified)
- Adds `occupation` (text, nullable) — a free-text occupation field, editable
  by any member regardless of their support_role.

## Data Migration
- Existing members with `support_role = 'professional'` have their
  `support_role_detail` copied into the new `occupation` column, then their
  `support_role` is set to `'supporter'` and `support_role_detail` to NULL.

## Modified Functions

### update_member_profile (modified)
- Drops the old 4-parameter signature and recreates with a new 5th parameter
  `p_occupation text DEFAULT NULL`.
- Removes `'professional'` from the valid support_role check (now only
  'supporter', 'business_owner', 'organization').
- Saves `occupation` to the member's row.

## Security
- RLS already enabled on members — no changes needed.
- Function remains SECURITY DEFINER with search_path = 'public'.
- GRANT EXECUTE to authenticated role only.
*/

-- Add occupation column to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS occupation text;

-- Migrate existing professional members: copy detail to occupation, switch role to supporter
UPDATE members
SET occupation = support_role_detail,
    support_role = 'supporter',
    support_role_detail = NULL
WHERE support_role = 'professional';

-- Drop old function signature (4 params: date, text, text, text)
DROP FUNCTION IF EXISTS public.update_member_profile(date, text, text, text);

-- Recreate with occupation parameter and without 'professional' as valid role
CREATE OR REPLACE FUNCTION public.update_member_profile(
  p_date_of_birth date DEFAULT NULL,
  p_support_role text DEFAULT NULL,
  p_support_role_detail text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_occupation text DEFAULT NULL
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

  -- Validate support_role if provided (professional removed)
  IF p_support_role IS NOT NULL AND p_support_role NOT IN ('supporter', 'business_owner', 'organization') THEN
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
      avatar_url = p_avatar_url,
      occupation = p_occupation,
      updated_at = now()
  WHERE id = v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_profile TO authenticated;