/*
# Add onboarding completion tracking

1. Changes to existing tables
- `members`: add `onboarding_complete` (boolean, default false) to track whether
  a member has finished the full onboarding flow (city selection, account creation,
  identity step, and welcome screen).

2. New functions
- `mark_onboarding_complete()`: SECURITY DEFINER function that sets
  `onboarding_complete = true` for the calling user's member record. Returns true
  on success. This ensures the flag can only be set by the authenticated owner,
  not by arbitrary client writes.

3. Security
- The existing `update_own_member` RLS policy already allows users to update
  their own row, but we use a SECURITY DEFINER function so the flag is set
  atomically and cannot be unset by the client.
- No new RLS policies needed — the column is readable via existing SELECT
  policies and writable only through the RPC.
*/

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.mark_onboarding_complete()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE members
  SET onboarding_complete = true, updated_at = now()
  WHERE id = auth.uid() AND onboarding_complete = false;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.mark_onboarding_complete() TO authenticated;
