/*
# Add member_id to Activity Feed

1. Purpose
   Expose the actor's member ID in the activity feed so the frontend can link
   a feed card to the member who performed the action. Previously the view and
   RPC returned display_name but not the underlying member UUID, making it
   impossible to open a member profile from a feed card.

2. Changes
   - Drop and recreate `activity_feed` view to include `a.actor_id AS member_id`.
   - Drop and recreate `get_activity_feed` SECURITY DEFINER function to return
     the new `member_id` column in its RETURNS TABLE signature and both query
     branches.
   - Re-grant EXECUTE to authenticated.

3. Security
   - The view is still read-only.
   - The function is still SECURITY DEFINER with search_path = 'public'.
   - Only authenticated users can call the function (unchanged).
   - member_id is a UUID from audit_log.actor_id (FK to members.id). Exposing
     it lets the frontend fetch a public profile snapshot for that member,
     which is the same data already visible in the leaderboard.
*/

-- ==================== ACTIVITY FEED VIEW (recreated with member_id) ====================
DROP VIEW IF EXISTS activity_feed CASCADE;

CREATE VIEW activity_feed AS
SELECT
  a.id,
  a.actor_id AS member_id,
  a.action AS event_type,
  COALESCE(m.display_name, split_part(m.email, '@', 1)) AS display_name,
  c.name AS city_name,
  c.metro_id,
  mt.name AS metro_name,
  a.created_at,
  CASE
    WHEN a.action = 'founder_number_assigned' THEN
      COALESCE(
        'joined ' || c.name,
        'joined the Empire'
      )
    WHEN a.action = 'city_tier_changed' THEN
      COALESCE(
        c.name || ' upgraded to ' || (a.metadata ->> 'new_tier'),
        'A city upgraded its status'
      )
    WHEN a.action = 'city_reached_tribe' THEN
      COALESCE(
        c.name || ' reached Tribe status',
        'A city reached Tribe status'
      )
    WHEN a.action = 'empire_progress_updated' THEN
      'Empire progress updated — ' ||
        COALESCE(a.metadata ->> 'tribe_city_count', '0') || ' Tribe Cities'
    WHEN a.action = 'referral_verified' THEN
      'A referral was verified'
    WHEN a.action = 'mission_completed' THEN
      COALESCE(
        'completed a mission' ||
          CASE
            WHEN a.metadata ->> 'slug' IS NOT NULL
              THEN ': ' || (a.metadata ->> 'slug')
            ELSE ''
          END,
        'completed a mission'
      )
    ELSE
      a.action
  END AS message
FROM audit_log a
LEFT JOIN members m ON m.id = a.actor_id
LEFT JOIN cities c ON c.id = a.target_id AND a.target_type = 'city'
LEFT JOIN metros mt ON mt.id = c.metro_id
WHERE a.action IN (
  'founder_number_assigned',
  'city_tier_changed',
  'city_reached_tribe',
  'empire_progress_updated',
  'referral_verified',
  'mission_completed'
);

-- ==================== SECURITY DEFINER FUNCTION (recreated with member_id) ====================
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
  message text
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
      af.message
    FROM activity_feed af
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
      af.message
    FROM activity_feed af
    ORDER BY af.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_feed(uuid, int) TO authenticated;
