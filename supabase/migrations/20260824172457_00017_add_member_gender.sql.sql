/*
# Add Gender to Members

## Purpose
Adds a gender column to the members table and a secure server function to update it.
Gender is collected alongside race/ethnic identity during onboarding.

## Changes to Existing Tables

### members (modified)
- `gender` (text, nullable) — one of 'male', 'female', 'other'.
  Nullable so existing members are unaffected.

## New Functions

### update_gender
SECURITY DEFINER function that lets an authenticated member update ONLY their own
gender field. Validates that the value is one of the allowed options.
When 'other' is selected, an optional detail string can be provided.

## Security
- RLS already enabled on members table (existing policies unchanged).
- The new function is SECURITY DEFINER with search_path = 'public'.
- Function checks auth.uid() matches the member being updated.
- GRANT EXECUTE to authenticated role only.

## Important Notes
1. Column is nullable so existing members are not affected.
2. Only the member owner can update their own gender — no cross-user writes.
*/

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS gender_detail text;

CREATE OR REPLACE FUNCTION public.update_gender(
  p_gender text,
  p_gender_detail text DEFAULT NULL
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

  IF p_gender IS NULL OR btrim(p_gender) = '' THEN
    RAISE EXCEPTION 'Gender is required' USING ERRCODE = '23502';
  END IF;

  IF p_gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender value' USING ERRCODE = '23514';
  END IF;

  UPDATE members
  SET gender = p_gender,
      gender_detail = CASE
        WHEN p_gender = 'other' THEN p_gender_detail
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_gender TO authenticated;