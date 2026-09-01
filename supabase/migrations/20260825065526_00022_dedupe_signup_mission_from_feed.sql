/*
# Remove Duplicate "Signup Mission" Events from Activity Feed

1. Purpose
   When a founder joins, two audit log entries are created at nearly the same
   instant: `founder_number_assigned` ("joined [city]") and `mission_completed`
   with slug "signup" ("completed a mission: signup"). Both appear in the feed
   as separate entries for the same person, which looks like a duplicate.

   The join event (`founder_number_assigned`) is the meaningful one — it shows
   the city the person joined. The signup mission is an automatic side effect
   of joining, not a separate user action. This migration filters the signup
   mission completion out of the activity feed view so only the join event
   appears.

2. Changes
   - Recreates the `activity_feed` view with an added WHERE condition that
     excludes `mission_completed` rows whose metadata slug is 'signup'.
   - All other mission completions (first-referral, five-referrals, city-tribe,
     etc.) still appear in the feed as before.

3. Security
   - No security changes. The view remains read-only and the
     `get_activity_feed` SECURITY DEFINER function is unchanged.
*/

DROP VIEW IF EXISTS activity_feed;

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
)
AND NOT (
  a.action = 'mission_completed'
  AND a.metadata ->> 'slug' = 'signup'
);
