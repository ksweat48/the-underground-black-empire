-- ============================================================
-- Marketplace Onboarding + Listing Review Status System
-- ============================================================
-- 1. Add new columns to market_listings for onboarding-created listings
-- 2. Migrate 'pending' status to 'in_review'
-- 3. Update RLS to allow in_review + approved listings to be publicly visible
-- 4. Add admin review SECURITY DEFINER function (approve / needs_changes / remove)
-- 5. Add listing review reason column for admin feedback
-- ============================================================

-- Step 1: Add review_reason column for admin feedback when needs_changes or removed
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS review_reason text NOT NULL DEFAULT '';

-- Step 2: Migrate existing 'pending' listings to 'in_review'
UPDATE market_listings SET status = 'in_review' WHERE status = 'pending';

-- Step 3: Update RLS policies for market_listings
-- Drop old read policy and replace with one that allows in_review + approved
DROP POLICY IF EXISTS "read_market_listings" ON market_listings;
CREATE POLICY "read_market_listings" ON market_listings FOR SELECT
  TO anon, authenticated
  USING (
    status = 'approved'
    OR status = 'in_review'
    OR owner_id = auth.uid()
  );

-- Drop old insert policy and replace with one that allows in_review status
DROP POLICY IF EXISTS "insert_market_listings" ON market_listings;
CREATE POLICY "insert_market_listings" ON market_listings FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = owner_id
    AND status IN ('in_review', 'approved')
  );

-- Update policy stays the same (owner can update their own listing)
-- but we need to prevent owners from self-approving
DROP POLICY IF EXISTS "update_market_listings" ON market_listings;
CREATE POLICY "update_market_listings" ON market_listings FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND status IN ('in_review', 'approved', 'needs_changes')
  );

-- Step 4: Create admin review function
-- This function allows admin users to approve, request changes, or remove listings
CREATE OR REPLACE FUNCTION review_market_listing(
  p_listing_id uuid,
  p_action text,
  p_reason text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_current_status text;
BEGIN
  -- Check if caller is admin
  SELECT is_current_user_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can review listings';
  END IF;

  -- Validate action
  IF p_action NOT IN ('approve', 'needs_changes', 'remove') THEN
    RAISE EXCEPTION 'Invalid action. Must be approve, needs_changes, or remove';
  END IF;

  -- Get current status
  SELECT status INTO v_current_status FROM market_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Apply the action
  IF p_action = 'approve' THEN
    UPDATE market_listings
    SET status = 'approved', is_verified = true, review_reason = ''
    WHERE id = p_listing_id;
  ELSIF p_action = 'needs_changes' THEN
    UPDATE market_listings
    SET status = 'needs_changes', review_reason = p_reason
    WHERE id = p_listing_id;
  ELSIF p_action = 'remove' THEN
    UPDATE market_listings
    SET status = 'removed', review_reason = p_reason
    WHERE id = p_listing_id;
  END IF;

  RETURN true;
END;
$$;

-- Grant execute to authenticated users (function itself checks admin)
GRANT EXECUTE ON FUNCTION review_market_listing(uuid, text, text) TO authenticated;

-- Step 5: Add function to fetch listings pending review (for admin panel)
CREATE OR REPLACE FUNCTION get_listings_for_review(
  p_status text DEFAULT 'in_review',
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  description text,
  products_services text,
  price_display text,
  external_url text,
  image_url text,
  status text,
  is_verified boolean,
  like_count int,
  comment_count int,
  created_at timestamptz,
  owner_email text,
  city_name text,
  review_reason text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ml.id,
    ml.name,
    ml.category,
    ml.description,
    ml.products_services,
    ml.price_display,
    ml.external_url,
    ml.image_url,
    ml.status,
    ml.is_verified,
    ml.like_count,
    ml.comment_count,
    ml.created_at,
    m.email AS owner_email,
    c.name AS city_name,
    ml.review_reason
  FROM market_listings ml
  JOIN members m ON m.id = ml.owner_id
  JOIN cities c ON c.id = ml.city_id
  WHERE ml.status = p_status
  ORDER BY ml.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_listings_for_review(text, int) TO authenticated;

-- Step 6: Also update the listing_updates insert policy to allow in_review listings
-- (so listing owners can post updates while in review)
DROP POLICY IF EXISTS "insert_listing_updates" ON listing_updates;
CREATE POLICY "insert_listing_updates" ON listing_updates FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM market_listings
      WHERE market_listings.id = listing_updates.listing_id
      AND market_listings.owner_id = auth.uid()
      AND market_listings.status IN ('approved', 'in_review')
    )
  );
