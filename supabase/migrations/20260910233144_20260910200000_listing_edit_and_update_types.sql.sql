/*
# Listing Editing + Short Business Updates

## Purpose
1. Allow listing owners to edit their own listings (name, category, description, products/services, price, website, contact, image).
2. Add an `update_type` column to `listing_updates` so business posts can be categorized as 'offer', 'update', or 'progress'.
3. Enforce a 50-character minimum and 280-character maximum on `listing_updates.body` via a CHECK constraint.
4. Provide a `update_listing` SECURITY DEFINER RPC that resets an approved listing to `in_review` when content changes, so admins can re-verify edits.

## New Columns
- `listing_updates.update_type` (text, NOT NULL, default 'update') — one of 'offer', 'update', 'progress'.

## New Constraints
- `listing_updates_body_length` CHECK: `length(body) >= 50 AND length(body) <= 280`.

## New Functions
- `update_listing(p_listing_id uuid, p_name text, p_category text, p_description text, p_products_services text, p_price_display text, p_external_url text, p_contact_info text, p_image_url text)` — SECURITY DEFINER, updates only if caller owns the listing, resets status to `in_review` if it was `approved`.

## Security
- `update_listing` revokes EXECUTE from anon, grants to authenticated.
- Ownership check uses `auth.uid()`, not a caller-supplied parameter.
- `SET search_path = public` on the function.
*/

-- 1. Add update_type column to listing_updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listing_updates' AND column_name = 'update_type'
  ) THEN
    ALTER TABLE listing_updates ADD COLUMN update_type text NOT NULL DEFAULT 'update';
  END IF;
END $$;

-- 2. Add CHECK constraint on body length (50-280 chars)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listing_updates_body_length'
  ) THEN
    ALTER TABLE listing_updates
    ADD CONSTRAINT listing_updates_body_length
    CHECK (length(body) >= 50 AND length(body) <= 280);
  END IF;
END $$;

-- 3. Create update_listing RPC function
DROP FUNCTION IF EXISTS update_listing(uuid, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION update_listing(
  p_listing_id uuid,
  p_name text,
  p_category text,
  p_description text,
  p_products_services text,
  p_price_display text,
  p_external_url text,
  p_contact_info text,
  p_image_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_current_status text;
BEGIN
  -- Get the listing owner and current status
  SELECT owner_id, status INTO v_owner, v_current_status
  FROM market_listings
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Ownership check: caller must be the owner
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to edit this listing';
  END IF;

  -- Update the listing; reset to in_review if it was approved
  UPDATE market_listings
  SET
    name = p_name,
    category = p_category::listing_category,
    description = p_description,
    products_services = p_products_services,
    price_display = p_price_display,
    external_url = p_external_url,
    contact_info = p_contact_info,
    image_url = p_image_url,
    status = CASE WHEN v_current_status = 'approved' THEN 'in_review' ELSE v_current_status END,
    updated_at = now()
  WHERE id = p_listing_id
  RETURNING id, name, category, description, products_services, price_display, external_url, contact_info, image_url, status, updated_at
  INTO p_listing_id, p_name, p_category, p_description, p_products_services, p_price_display, p_external_url, p_contact_info, p_image_url, v_current_status, v_current_status;

  RETURN jsonb_build_object(
    'id', p_listing_id,
    'status', v_current_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION update_listing(uuid, text, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION update_listing(uuid, text, text, text, text, text, text, text, text) TO authenticated;
