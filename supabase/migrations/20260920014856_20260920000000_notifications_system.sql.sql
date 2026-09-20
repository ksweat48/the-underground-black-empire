/*
# Create Notifications System

## What This Does
Creates a per-user notifications table that stores in-app notifications for every member.
Notifications are generated automatically by database triggers when key events happen
(listing approved/rejected, referral verified, leadership nomination, voting opened, etc.)
and can also be created manually by admin/edge functions.

## New Tables
- `notifications` — stores one row per notification per user
  - `id` (uuid, primary key)
  - `member_id` (uuid, FK to members.id, the recipient)
  - `type` (text, the notification category matching email types)
  - `title` (text, short headline)
  - `body` (text, longer description)
  - `link_url` (text, optional URL to navigate to when tapped)
  - `is_read` (boolean, default false)
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled on `notifications`
- Members can only SELECT, UPDATE (mark read) their own notifications
- INSERT/DELETE only via service role (triggers, edge functions) — no client policies
- `get_unread_notification_count()` function returns the count for the current user

## Helper Functions
- `get_unread_notification_count()` — returns integer count of unread notifications for `auth.uid()`
- `create_notification()` — SECURITY DEFINER function to insert notifications (used by triggers)
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general_announcement',
  title text NOT NULL,
  body text,
  link_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_member_unread
  ON notifications (member_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_member_created
  ON notifications (member_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

-- No INSERT or DELETE policies: only service role (bypasses RLS) can create/delete notifications

-- Helper function: get unread count for current user
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM notifications
  WHERE member_id = auth.uid() AND is_read = false;
$$;

-- Helper function: create a notification (used by triggers and edge functions)
CREATE OR REPLACE FUNCTION create_notification(
  p_member_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (member_id, type, title, body, link_url)
  VALUES (p_member_id, p_type, p_title, p_body, p_link_url);
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION get_unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text) TO authenticated;

-- Grant table privileges
GRANT SELECT, UPDATE ON notifications TO authenticated;
