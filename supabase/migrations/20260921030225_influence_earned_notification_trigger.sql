/*
# Influence Earned Notification Trigger

## What This Does
Creates a database trigger on the `influence_ledger` table that automatically
sends an in-app notification to the member whenever they earn Influence. The
notification has type `influence_earned` and includes the amount and a
human-readable description of what the Influence was awarded for.

## Trigger Created
- **trg_influence_earned** — fires AFTER INSERT on `influence_ledger`
  - Calls `create_notification()` to insert a notification row for the member
  - Skips `referral_verified` source since the existing `notify_referral_verified`
    trigger on the referrals table already sends a notification that mentions
    the Influence earned (avoids double-notifying the member)

## Notification Details
- type: `influence_earned`
- title: `Influence Earned`
- body: varies by source (e.g., "You earned 5 Influence for casting a vote.")
- link_url: `/empire`

## Sources Covered
- `ballot_participation` — voting in a ballot
- `signup_completed` — joining the Empire
- `city_selected` — selecting a city
- Any other source except `referral_verified` (which has its own notification)

## Security
- Trigger function is SECURITY DEFINER so it can call `create_notification()`
  (which is also SECURITY DEFINER) regardless of the calling role
- No new tables or columns are created
- No RLS policy changes needed
*/

CREATE OR REPLACE FUNCTION notify_influence_earned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
BEGIN
  -- Skip referral_verified — the notify_referral_verified trigger on the
  -- referrals table already sends a notification mentioning the Influence.
  IF NEW.source = 'referral_verified' THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'ballot_participation' THEN
    v_body := 'You earned ' || NEW.amount || ' Influence for casting a vote.';
  ELSIF NEW.source = 'signup_completed' THEN
    v_body := 'You earned ' || NEW.amount || ' Influence for joining the Empire.';
  ELSIF NEW.source = 'city_selected' THEN
    v_body := 'You earned ' || NEW.amount || ' Influence for selecting your city.';
  ELSIF NEW.notes IS NOT NULL THEN
    v_body := 'You earned ' || NEW.amount || ' Influence. ' || NEW.notes;
  ELSE
    v_body := 'You earned ' || NEW.amount || ' Influence.';
  END IF;

  PERFORM create_notification(
    NEW.member_id,
    'influence_earned',
    'Influence Earned',
    v_body,
    '/empire'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_influence_earned ON influence_ledger;
CREATE TRIGGER trg_influence_earned
  AFTER INSERT ON influence_ledger
  FOR EACH ROW
  EXECUTE FUNCTION notify_influence_earned();