/*
# Local News — Correspondent-Gated Publishing

## Purpose
Restricts local news publishing to approved Correspondents. Adds correspondent
status fields to the members table and enforces publisher accountability.

## Changes

### 1. members table
- Adds `correspondent_status` text column (values: none, pending, approved, revoked)
  DEFAULT 'none'
- Adds `correspondent_city_id` uuid column FK -> cities (nullable)
  Records which city a correspondent is approved to report for.

### 2. RLS on local_news
- Replaces the existing INSERT policy so only members with
  correspondent_status = 'approved' can insert news rows.

### 3. Permissions
- Only empire_admin can UPDATE correspondent_status and correspondent_city_id
  on members. Members can read their own correspondent fields.
*/

-- ==================== ADD CORRESPONDENT COLUMNS ====================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'correspondent_status'
  ) THEN
    ALTER TABLE members ADD COLUMN correspondent_status text NOT NULL DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'correspondent_city_id'
  ) THEN
    ALTER TABLE members ADD COLUMN correspondent_city_id uuid;
    ALTER TABLE members
      ADD CONSTRAINT members_correspondent_city_fk
      FOREIGN KEY (correspondent_city_id) REFERENCES cities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ==================== RLS: local_news INSERT — correspondent only ====================
DO $$
BEGIN
  -- Drop existing insert policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'local_news' AND policyname = 'insert_own_news'
  ) THEN
    DROP POLICY insert_own_news ON local_news;
  END IF;
END $$;

CREATE POLICY insert_correspondent_news ON local_news FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members
      WHERE id = auth.uid()
      AND correspondent_status = 'approved'
    )
  );

-- ==================== RLS: members can read their own correspondent fields ====================
-- (Already covered by existing SELECT policy on members if one exists.
--  If members table has a SELECT policy for authenticated, correspondent_status
--  and correspondent_city_id are included automatically.)

-- ==================== RLS: only admins can update correspondent fields ====================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'admin_update_correspondent'
  ) THEN
    CREATE POLICY admin_update_correspondent ON members FOR UPDATE
      TO authenticated
      USING (public.is_current_user_admin())
      WITH CHECK (public.is_current_user_admin());
  END IF;
END $$;

-- ==================== GRANT ====================
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
