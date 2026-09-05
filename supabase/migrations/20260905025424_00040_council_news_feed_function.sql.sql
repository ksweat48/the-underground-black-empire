/*
# Council News Feed Function

## Purpose
Creates a SECURITY DEFINER function that returns approved local_news items
in the same shape as the activity feed events, so the home page (Empire
Dashboard) can merge council news above empire activity updates.

## Changes
1. New function `get_council_news_feed(p_metro_id, p_limit)`
   - Returns approved local_news items joined with members, cities, and metros
   - Optional metro_id filter for the Local tab (city + metro scoped)
   - When p_metro_id is NULL, returns news from all cities (Empire tab)
   - Returns columns: id, member_id, event_type ('council_news'),
     display_name (author), city_name, metro_id, metro_name, created_at,
     message (news body), title (news headline)
2. Grants EXECUTE to authenticated role

## Security
- SECURITY DEFINER bypasses local_news RLS for read-only feed access
- Only approved news is returned (status = 'approved')
- No sensitive columns exposed (no emails, no raw author IDs in the response
  beyond what the activity feed already exposes)

## Important Notes
1. The function is read-only — no INSERT/UPDATE/DELETE.
2. The event_type is always 'council_news' so the frontend can style it
   differently from activity events.
3. The title column carries the news headline; message carries the body.
*/
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
  title text
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
      n.title AS title
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
      n.title AS title
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

GRANT EXECUTE ON FUNCTION public.get_council_news_feed TO authenticated;