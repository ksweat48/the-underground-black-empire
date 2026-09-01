/*
# Fix update_ethnic_identity function — unnest column alias

## Purpose
Fixes a bug in the `update_ethnic_identity` function where `unnest(p_ethnic_identity)`
was referenced with column name `elem` but no alias was defined, causing:
"column 'elem' does not exist"

## Changes
- Replaces `unnest(p_ethnic_identity) WHERE elem = 'another'` with
  `unnest(p_ethnic_identity) AS t(value) WHERE value = 'another'`
- Function signature, security, and all other logic unchanged.
*/

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

  v_has_another := COALESCE(
    EXISTS (SELECT 1 FROM unnest(p_ethnic_identity) AS t(value) WHERE value = 'another'),
    false
  );

  IF v_has_another AND (p_ethnic_identity_detail IS NULL OR btrim(p_ethnic_identity_detail) = '') THEN
    RAISE EXCEPTION 'A self-description is required when "Another race / ethnic identity" is selected' USING ERRCODE = '23502';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.update_ethnic_identity TO authenticated;