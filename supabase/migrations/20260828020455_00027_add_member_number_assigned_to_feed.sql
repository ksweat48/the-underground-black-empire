-- ==================== ADD member_number_assigned TO ACTIVITY FEED ====================
-- The activity_feed view only included founder_number_assigned, so new members
-- whose join event was logged as member_number_assigned never appeared in the
-- Empire or Local feed. This adds member_number_assigned to the view's filter
-- and message CASE so those join events show up.

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
    WHEN a.action = 'member_number_assigned' THEN
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
  'member_number_assigned',
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
