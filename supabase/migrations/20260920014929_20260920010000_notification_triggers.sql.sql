/*
# Notification Triggers for Key Events

## What This Does
Creates database triggers that automatically generate in-app notifications when
important events happen in the system. Each trigger calls `create_notification()`
to insert a row into the notifications table for the affected member.

## Triggers Created
1. **listing_status_changed** — fires after a market_listing's status changes
   - approve → notifies the listing owner ("Your listing has been approved")
   - needs_changes → notifies the listing owner ("Your listing needs changes")
   - remove → notifies the listing owner ("Your listing has been removed")

2. **referral_verified** — fires after a referral's status changes to 'verified'
   - Notifies the referring member ("Your referral has been verified")

3. **leadership_nomination_created** — fires after a new nomination is inserted
   - Notifies the nominated candidate ("You have been nominated for leadership")

## Helper Functions
- `broadcast_notification()` — sends a notification to all members (for announcements,
  voting windows, empire upgrades). Called from admin/edge functions.
- `notify_listing_owner_on_review()` — trigger function for listing status changes
- `notify_referral_verified()` — trigger function for referral verification
- `notify_leadership_nomination()` — trigger function for new nominations
*/

-- ============================================================
-- Trigger 1: Listing status changes (approve / needs_changes / remove)
-- ============================================================

CREATE OR REPLACE FUNCTION notify_listing_owner_on_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_listing_name text;
  v_old_status text;
  v_new_status text;
BEGIN
  v_old_status := OLD.status;
  v_new_status := NEW.status;

  -- Only fire when status actually changes to a review action
  IF v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  IF v_new_status = 'approved' THEN
    PERFORM create_notification(
      NEW.owner_id,
      'listing_approved',
      'Your listing has been approved',
      'Your marketplace listing "' || NEW.name || '" is now live.',
      '/market/' || NEW.id
    );
  ELSIF v_new_status = 'needs_changes' THEN
    PERFORM create_notification(
      NEW.owner_id,
      'listing_needs_changes',
      'Your listing needs changes',
      'Your listing "' || NEW.name || '" needs updates before it can be approved.',
      '/market/edit-listing/' || NEW.id
    );
  ELSIF v_new_status = 'removed' THEN
    PERFORM create_notification(
      NEW.owner_id,
      'listing_removed',
      'Your listing has been removed',
      'Your listing "' || NEW.name || '" has been removed.',
      '/market'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_status_changed ON market_listings;
CREATE TRIGGER trg_listing_status_changed
  AFTER UPDATE OF status ON market_listings
  FOR EACH ROW
  EXECUTE FUNCTION notify_listing_owner_on_review();

-- ============================================================
-- Trigger 2: Referral verified
-- ============================================================

CREATE OR REPLACE FUNCTION notify_referral_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes TO 'verified'
  IF (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'verified' AND NEW.referring_member_id IS NOT NULL THEN
    PERFORM create_notification(
      NEW.referring_member_id,
      'general_announcement',
      'Your referral has been verified',
      'A member you referred has joined the Empire. You earned 25 Influence.',
      '/empire'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_verified ON referrals;
CREATE TRIGGER trg_referral_verified
  AFTER INSERT OR UPDATE OF status ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION notify_referral_verified();

-- ============================================================
-- Trigger 3: Leadership nomination created
-- ============================================================

CREATE OR REPLACE FUNCTION notify_leadership_nomination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.candidate_id IS NOT NULL THEN
    PERFORM create_notification(
      NEW.candidate_id,
      'leadership_nomination',
      'You have been nominated for leadership',
      'A member has nominated you for a leadership role. Review and accept or decline.',
      '/empire'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leadership_nomination ON leadership_nominations;
CREATE TRIGGER trg_leadership_nomination
  AFTER INSERT ON leadership_nominations
  FOR EACH ROW
  EXECUTE FUNCTION notify_leadership_nomination();

-- ============================================================
-- Broadcast function: send notification to all members
-- Used for: voting_window_opened, empire_upgrade, general_announcement, quest_notification
-- ============================================================

CREATE OR REPLACE FUNCTION broadcast_notification(
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link_url text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO notifications (member_id, type, title, body, link_url)
  SELECT id, p_type, p_title, p_body, p_link_url FROM members
  WHERE member_number IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION broadcast_notification(text, text, text, text) TO authenticated;
