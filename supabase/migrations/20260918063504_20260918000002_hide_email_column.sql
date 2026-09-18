/*
# Hide Email Column from Other Users

## Summary
Revokes column-level SELECT on the `members.email` column from both `anon`
and `authenticated` roles. This means no signed-in user can read another user's
email address through the Supabase API, even by crafting their own query.

The user's own email is still available from the Supabase auth session object
(`session.user.email`), which the app already uses for the current user's
profile display. The `members.email` column itself is still used internally by
the `create_member` SECURITY DEFINER function and by the service role.

## Changes
- REVOKE SELECT (email) ON members FROM anon
- REVOKE SELECT (email) ON members FROM authenticated

## Notes
- The members table still has a SELECT policy allowing authenticated users to
  read all rows (the member directory is intentionally visible to all signed-in
  users). After this change, the `email` column will simply return null/empty
  for other users' rows, while all other columns (display_name, founder_number,
  avatar_url, etc.) remain visible.
- The user's own email comes from `session.user.email` in the auth context,
  not from the members table.
*/

REVOKE SELECT (email) ON public.members FROM anon;
REVOKE SELECT (email) ON public.members FROM authenticated;
