/*
# Council Leader Empire News Publishing

## Purpose
Allow only members who are currently seated on a Metro Council to publish news directly to the Empire feed.

## Changes
1. New function
- `is_current_user_seated_council_member()` checks whether the signed-in member has an active seat in `metro_council`.

2. Modified `local_news` publishing rules
- Removes the general pending-news insert path.
- Removes the old correspondent-status insert path.
- Allows inserts only when the authenticated author is seated on a Metro Council and the new post is marked `approved`.
- Allows updates only for the author while they remain seated, and keeps the post approved.

## Security
- The publishing rule is enforced by the database, not only by the screen, so non-leaders cannot bypass the interface.
- The helper function uses `SECURITY DEFINER` with a fixed `public` search path and is executable only by authenticated users.
- Existing read and delete behavior remains unchanged.

## Important Notes
1. A Metro Council seat already represents the result of the election process, whose finalists are limited to nominees who accepted their nomination.
2. New eligible posts appear in the existing Empire council-news feed because that feed already reads approved `local_news` records.
3. Existing pending news records are not deleted or automatically changed.
*/

CREATE OR REPLACE FUNCTION public.is_current_user_seated_council_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.metro_council
    WHERE member_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_current_user_seated_council_member() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_seated_council_member() TO authenticated;

DROP POLICY IF EXISTS "insert_local_news" ON public.local_news;
DROP POLICY IF EXISTS "insert_correspondent_news" ON public.local_news;
CREATE POLICY "insert_empire_news_as_council_member"
ON public.local_news FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = author_id
  AND status = 'approved'
  AND public.is_current_user_seated_council_member()
);

DROP POLICY IF EXISTS "update_local_news" ON public.local_news;
CREATE POLICY "update_own_empire_news"
ON public.local_news FOR UPDATE
TO authenticated
USING (
  auth.uid() = author_id
  AND public.is_current_user_seated_council_member()
)
WITH CHECK (
  auth.uid() = author_id
  AND status = 'approved'
  AND public.is_current_user_seated_council_member()
);