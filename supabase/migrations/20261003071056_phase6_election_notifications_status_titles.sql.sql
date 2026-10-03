/*
# Phase 6: Election notifications and status titles

## Summary
1. Adds triggers to send notifications when election phases change (nomination opens,
   election opens, results posted).
2. Adds a `get_status_title` function for automatic Status Titles based on member Level.
3. Adds payment status notification triggers for cancelled payments and tier upgrades.
*/

-- ============================================================
-- 1. FUNCTION: get_status_title
-- Returns a status title based on the member's influence level
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_status_title(p_member_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_influence integer;
  v_level int;
BEGIN
  v_influence := public.get_member_influence(p_member_id);

  IF v_influence < 100 THEN
    RETURN 'Pioneer';
  ELSIF v_influence < 500 THEN
    RETURN 'Advocate';
  ELSIF v_influence < 1000 THEN
    RETURN 'Organizer';
  ELSIF v_influence < 2500 THEN
    RETURN 'Leader';
  ELSIF v_influence < 5000 THEN
    RETURN 'Visionary';
  ELSE
    RETURN 'Architect';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_status_title(uuid) TO authenticated;

-- ============================================================
-- 2. FUNCTION: notify_election_phase_change
-- Called by admin when creating or advancing an election cycle
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_election_phase_change(
  p_metro_id uuid,
  p_phase text,
  p_cycle_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metro_name text;
  v_title text;
  v_body text;
  v_type text;
BEGIN
  SELECT m.name INTO v_metro_name FROM metros m WHERE m.id = p_metro_id;

  IF p_phase = 'nomination' THEN
    v_type := 'election_nomination';
    v_title := 'Nominations Open';
    v_body := 'Metro ' || COALESCE(v_metro_name, 'Unknown') || ' council nominations are now open.';
  ELSIF p_phase = 'election' THEN
    v_type := 'election_voting';
    v_title := 'Election Voting Open';
    v_body := 'Voting is now open for Metro ' || COALESCE(v_metro_name, 'Unknown') || ' council.';
  ELSIF p_phase = 'closed' THEN
    v_type := 'election_results';
    v_title := 'Election Results Posted';
    v_body := 'Results are in for Metro ' || COALESCE(v_metro_name, 'Unknown') || ' council election.';
  ELSE
    RETURN;
  END IF;

  -- Notify all members in the metro
  PERFORM public.broadcast_notification(
    p_type := v_type,
    p_title := v_title,
    p_body := v_body,
    p_link_url := '/governance'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_election_phase_change(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Notification for membership tier changes
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_tier_change(
  p_member_id uuid,
  p_old_tier text,
  p_new_tier text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
BEGIN
  IF p_new_tier = 'white' AND p_old_tier <> 'white' THEN
    v_title := 'Membership Cancelled';
    v_body := 'Your membership has been changed to White (Free). You will lose access to premium features.';
  ELSIF p_new_tier <> 'white' AND (p_old_tier IS NULL OR p_old_tier = 'white') THEN
    v_title := 'Membership Upgraded';
    v_body := 'Welcome to ' || p_new_tier || '! Your premium membership is now active.';
  ELSE
    v_title := 'Membership Changed';
    v_body := 'Your membership tier has been updated to ' || p_new_tier || '.';
  END IF;

  INSERT INTO notifications (member_id, type, title, body, link_url)
  VALUES (p_member_id, 'membership_change', v_title, v_body, '/membership');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_tier_change(uuid, text, text) FROM PUBLIC, anon, authenticated;
