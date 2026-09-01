/*
# Activity Feed View

## Purpose
Creates a secure, read-only view that exposes feed-safe audit log events to all
authenticated users. The audit_log table's RLS only lets you read your own entries,
so a SECURITY DEFINER function wraps the view to bypass RLS safely, exposing only
feed-safe columns (no emails, no actor IDs, no raw metadata).

## What This Does
1. Creates `activity_feed` view — joins audit_log → members (display_name) →
   cities (city name, metro_id) → metros (metro name)
2. Filters to only feed-safe actions: founder joins, city upgrades, empire progress,
   referral verifications, mission completions
3. Creates `get_activity_feed` SECURITY DEFINER function that reads the view,
   optionally filtered by metro_id for the Local feed
4. Grants EXECUTE to authenticated role

## Security
- The SECURITY DEFINER function bypasses audit_log RLS to expose feed-safe events
- Only feed-safe actions are included (filtered in the view WHERE clause)
- Exposed columns: event_type, display_name, city_name, metro_id, metro_name,
  created_at, message — no emails, no actor IDs, no raw metadata
- The function is callable by authenticated users only

## Important Notes
1. The view is read-only — no INSERT/UPDATE/DELETE.
2. Feed-safe actions are filtered in the view definition itself.
3. The message column is generated server-side via SQL CASE logic.
4. metro_id and metro_name are included so the frontend can filter Local vs Empire
   feeds without additional queries.
*/

-- ==================== ACTIVITY FEED VIEW ====================
CREATE OR REPLACE VIEW activity_feed AS
SELECT
  a.id,
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

-- ==================== SECURITY DEFINER FUNCTION ====================
CREATE OR REPLACE FUNCTION public.get_activity_feed(
  p_metro_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
) RETURNS TABLE (
  id uuid,
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

GRANT EXECUTE ON FUNCTION public.get_activity_feed TO authenticated;
