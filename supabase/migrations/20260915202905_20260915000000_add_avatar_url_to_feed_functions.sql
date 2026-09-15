/*
# Add avatar_url to Activity Feed and Council News Feed Functions

1. Purpose
   - Both `get_activity_feed` and `get_council_news_feed` currently return member
     display names but NOT their profile photo (avatar_url).
   - The Empire dashboard feed cards currently show a generic category icon.
     We want to show the member's actual profile photo when available, falling
     back to the category icon when no avatar exists.
   - This migration recreates both functions to additionally return `avatar_url`
     by joining the `members` table (which already has the `avatar_url` column
     from migration 00039).

2. Changes
   - `get_activity_feed`: add `avatar_url text` to the RETURNS TABLE clause and
     select `m.avatar_url` from the existing `members m` join.
   - `get_council_news_feed`: add `avatar_url text` to the RETURNS TABLE clause
     and select `m.avatar_url` from the existing `members m` join.
   - The `activity_feed` VIEW itself is NOT changed (it does not expose
     avatar_url directly; the function joins members at query time).

3. Security
   - Both functions remain SECURITY DEFINER, SET search_path = 'public'.
   - EXECUTE granted to authenticated (unchanged).
   - No new tables, no RLS changes, no data modifications.

4. Idempotency
   - Both functions use DROP FUNCTION IF EXISTS before CREATE, so re-running
     is safe.
*/

-- ==================== get_activity_feed ====================

DROP FUNCTION IF EXISTS public.get_activity_feed(uuid, int);

CREATE FUNCTION public.get_activity_feed(
  p_metro_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  member_id uuid,
  event_type text,
  display_name text,
  city_name text,
  metro_id uuid,
  metro_name text,
  created_at timestamptz,
  message text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_metro_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      af.id,
      af.member_id,
      af.event_type,
      af.display_name,
      af.city_name,
      af.metro_id,
      af.metro_name,
      af.created_at,
      af.message,
      m.avatar_url
    FROM activity_feed af
    LEFT JOIN members m ON m.id = af.member_id
    WHERE af.metro_id = p_metro_id
    ORDER BY af.created_at DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      af.id,
      af.member_id,
      af.event_type,
      af.display_name,
      af.city_name,
      af.metro_id,
      af.metro_name,
      af.created_at,
      af.message,
      m.avatar_url
    FROM activity_feed af
    LEFT JOIN members m ON m.id = af.member_id
    ORDER BY af.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_feed(uuid, int) TO authenticated;

-- ==================== get_council_news_feed ====================

DROP FUNCTION IF EXISTS public.get_council_news_feed(uuid, int);

CREATE OR REPLACE FUNCTION public.get_council_news_feed(
  p_metro_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  member_id uuid,
  event_type text,
  display_name text,
  city_name text,
  metro_id uuid,
  metro_name text,
  created_at timestamptz,
  message text,
  title text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_metro_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      n.id,
      n.author_id AS member_id,
      'council_news'::text AS event_type,
      COALESCE(m.display_name, split_part(m.email, '@', 1)) AS display_name,
      c.name AS city_name,
      c.metro_id,
      mt.name AS metro_name,
      n.created_at,
      n.body AS message,
      n.title AS title,
      m.avatar_url
    FROM local_news n
    LEFT JOIN members m ON m.id = n.author_id
    LEFT JOIN cities c ON c.id = n.city_id
    LEFT JOIN metros mt ON mt.id = c.metro_id
    WHERE n.status = 'approved'
      AND c.metro_id = p_metro_id
    ORDER BY n.created_at DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      n.id,
      n.author_id AS member_id,
      'council_news'::text AS event_type,
      COALESCE(m.display_name, split_part(m.email, '@', 1)) AS display_name,
      c.name AS city_name,
      c.metro_id,
      mt.name AS metro_name,
      n.created_at,
      n.body AS message,
      n.title AS title,
      m.avatar_url
    FROM local_news n
    LEFT JOIN members m ON m.id = n.author_id
    LEFT JOIN cities c ON c.id = n.city_id
    LEFT JOIN metros mt ON mt.id = c.metro_id
    WHERE n.status = 'approved'
    ORDER BY n.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_council_news_feed(uuid, int) TO authenticated;
