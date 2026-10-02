/*
# Notify members when their Metro unlocks Treasury capacity

1. Overview
- Whenever a Metro permanently unlocks a higher Treasury capacity, every active member
  living in that Metro receives an in-app notification linking to the Metro Treasury page.

2. New Functions
- `notify_metro_capacity_unlocked()` (trigger function, SECURITY DEFINER)
  - Runs after a `capacity_unlocked` row is added to `metro_milestone_events`.
  - Inserts one `metro_capacity_unlocked` notification per active member
    (onboarding complete and account status active) whose city belongs to that Metro.

3. New Triggers
- `trg_notify_metro_capacity_unlocked` on `metro_milestone_events` (AFTER INSERT).

4. Security
- The trigger function is not callable by app users; EXECUTE is revoked from public, anon and authenticated.
- No table or policy changes.
*/

CREATE OR REPLACE FUNCTION public.notify_metro_capacity_unlocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metro_name text;
  v_capacity bigint;
  v_label text;
BEGIN
  IF NEW.event_type <> 'capacity_unlocked' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_metro_name FROM metros WHERE id = NEW.metro_id;
  v_capacity := public.treasury_capacity_cents(NEW.capacity_band);
  v_label := CASE
    WHEN v_capacity IS NULL THEN 'full Treasury capacity'
    ELSE '$' || to_char(v_capacity / 100, 'FM999,999,999') || ' in Treasury capacity'
  END;

  INSERT INTO notifications (member_id, type, title, body, link_url)
  SELECT m.id,
         'metro_capacity_unlocked',
         COALESCE(v_metro_name, 'Your Metro') || ' unlocked ' || v_label,
         'This milestone is permanent. Reserved funds now move into Available up to the new limit.',
         '/treasury'
  FROM members m
  JOIN cities c ON c.id = m.city_id
  WHERE c.metro_id = NEW.metro_id
    AND m.onboarding_complete = true
    AND m.account_status = 'active';

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_metro_capacity_unlocked() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_metro_capacity_unlocked ON public.metro_milestone_events;
CREATE TRIGGER trg_notify_metro_capacity_unlocked
AFTER INSERT ON public.metro_milestone_events
FOR EACH ROW EXECUTE FUNCTION public.notify_metro_capacity_unlocked();
