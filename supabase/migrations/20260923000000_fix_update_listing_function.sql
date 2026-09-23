/*
# Fix update_listing RPC function

## Purpose
The `update_listing` SECURITY DEFINER function had a bug in its RETURNING ... INTO clause
that caused every edit attempt to fail with a type mismatch error. The function tried
to assign the `updated_at` timestamp column into a text variable, and also reused the
same input parameter variables as INTO targets, corrupting the values.

## Changes
1. Replaces the `update_listing` function with a corrected version that:
   - Uses a separate `v_new_status` variable instead of overwriting input parameters
   - Does not use RETURNING ... INTO (avoids the type mismatch entirely)
   - Computes the new status before the UPDATE and returns it directly
2. Preserves all existing security properties:
   - SECURITY DEFINER with search_path = public
   - Ownership check via auth.uid()
   - EXECUTE revoked from anon, granted to authenticated
*/

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
  v_new_status text;
BEGIN
  SELECT owner_id, status INTO v_owner, v_current_status
  FROM market_listings
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to edit this listing';
  END IF;

  v_new_status := CASE WHEN v_current_status = 'approved' THEN 'in_review' ELSE v_current_status END;

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
    status = v_new_status,
    updated_at = now()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object('id', p_listing_id, 'status', v_new_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_listing(uuid, text, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION update_listing(uuid, text, text, text, text, text, text, text, text) TO authenticated;
