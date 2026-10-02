/*
# Remove city level events from the activity feed

## Plain-English summary
Cities no longer have levels, so the public activity feed stops showing
"city upgraded" / "city reached Tribe" / "Tribe Cities" messages. Join events and
verified referrals are unchanged.

## Changes
- `activity_feed` view: only `founder_number_assigned`, `member_number_assigned` and
  `referral_verified` events. Same columns as before.

## Security
- View keeps `security_invoker = true` so the caller's RLS still applies.
*/

CREATE OR REPLACE VIEW public.activity_feed WITH (security_invoker = true) AS
SELECT id, member_id, event_type, display_name, city_name, metro_id, metro_name, created_at, message
FROM (
  SELECT DISTINCT ON (a.actor_id) a.id,
    a.actor_id AS member_id,
    a.action AS event_type,
    COALESCE(m.display_name, split_part(m.email, '@', 1)) AS display_name,
    mc.name AS city_name,
    mc.metro_id,
    mt.name AS metro_name,
    a.created_at,
    CASE
      WHEN a.action IN ('founder_number_assigned','member_number_assigned') THEN COALESCE('joined ' || mc.name, 'joined the Empire')
      WHEN a.action = 'referral_verified' THEN 'A referral was verified'
      ELSE a.action
    END AS message
  FROM audit_log a
  LEFT JOIN members m ON m.id = a.actor_id
  LEFT JOIN cities mc ON mc.id = m.city_id
  LEFT JOIN metros mt ON mt.id = mc.metro_id
  WHERE a.action IN ('founder_number_assigned','member_number_assigned','referral_verified')
  ORDER BY a.actor_id, a.created_at DESC
) feed
ORDER BY created_at DESC;
