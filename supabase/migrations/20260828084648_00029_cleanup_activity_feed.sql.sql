/*
# Clean Up Activity Feed: Remove Missions, Deduplicate Join Events, Fix Local Feed

1. Purpose
   The activity feed was showing "Mission Complete" cards and duplicate
   "New Member" cards for the same user (both `founder_number_assigned` and
   `member_number_assigned` fire at the same instant). This migration:
     - Removes ALL `mission_completed` events from the feed.
     - Shows only ONE join event per user (deduplicated via DISTINCT ON actor_id).
     - Uses the member's CURRENT city_id for metro resolution so new members
       appear in their local feed immediately after signup.

2. Changes
   - Recreates `activity_feed` view:
     * Removes `mission_completed` from the WHERE filter entirely.
     * Joins `cities` on the member's current `city_id` (via members table)
       instead of only `audit_log.target_id`, so the local feed reflects
       the member's actual city/metro.
     * Uses DISTINCT ON (a.actor_id) to keep only the latest join event per
       user, eliminating duplicates between `founder_number_assigned` and
       `member_number_assigned`.
   - Recreates `get_activity_feed` SECURITY DEFINER function with the updated
     view (same signature, same member_id column).

3. Security
   - The view is still read-only.
   - The function is still SECURITY DEFINER with search_path = 'public'.
   - Only authenticated users can call the function (unchanged).
*/

-- ==================== ACTIVITY FEED VIEW (cleaned up) ====================
DROP VIEW IF EXISTS activity_feed CASCADE;

CREATE VIEW activity_feed AS
SELECT * FROM (
  SELECT DISTINCT ON (a.actor_id)
    a.id,
    a.actor_id AS member_id,
    a.action AS event_type,
    COALESCE(m.display_name, split_part(m.email, '@', 1)) AS display_name,
    mc.name AS city_name,
    mc.metro_id,
    mt.name AS metro_name,
    a.created_at,
    CASE
      WHEN a.action IN ('founder_number_assigned', 'member_number_assigned') THEN
        COALESCE('joined ' || mc.name, 'joined the Empire')
      WHEN a.action = 'city_tier_changed' THEN
        COALESCE(
          mc.name || ' upgraded to ' || (a.metadata ->> 'new_tier'),
          'A city upgraded its status'
        )
      WHEN a.action = 'city_reached_tribe' THEN
        COALESCE(
          mc.name || ' reached Tribe status',
          'A city reached Tribe status'
        )
      WHEN a.action = 'empire_progress_updated' THEN
        'Empire progress updated — ' ||
          COALESCE(a.metadata ->> 'tribe_city_count', '0') || ' Tribe Cities'
      WHEN a.action = 'referral_verified' THEN
        'A referral was verified'
      ELSE
        a.action
    END AS message
  FROM audit_log a
  LEFT JOIN members m ON m.id = a.actor_id
  LEFT JOIN cities mc ON mc.id = m.city_id
  LEFT JOIN metros mt ON mt.id = mc.metro_id
  WHERE a.action IN (
    'founder_number_assigned',
    'member_number_assigned',
    'city_tier_changed',
    'city_reached_tribe',
    'empire_progress_updated',
    'referral_verified'
  )
  ORDER BY a.actor_id, a.created_at DESC
) AS feed
ORDER BY feed.created_at DESC;

-- ==================== SECURITY DEFINER FUNCTION (recreated) ====================
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
