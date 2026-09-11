/*
# Add save_count to market_listings with trigger

1. Changes to existing tables
- `market_listings`: add `save_count` integer column (default 0, not null)
2. New functions
- `update_listing_save_count()`: trigger function that increments/decrements save_count on INSERT/DELETE of listing_saves
3. New triggers
- `trg_listing_saves_count`: AFTER INSERT OR DELETE on listing_saves, calls update_listing_save_count()
4. Security
- No policy changes needed; listing_saves already has RLS enabled
5. Important notes
- The save_count is maintained automatically by the trigger, mirroring the existing like_count trigger pattern
- Existing saves are backfilled by counting current rows
*/

-- Add save_count column
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0;

-- Backfill from existing saves
DO $$
BEGIN
  UPDATE market_listings ml
  SET save_count = COALESCE((SELECT COUNT(*) FROM listing_saves ls WHERE ls.listing_id = ml.id), 0)
  WHERE true;
END $$;

-- Create trigger function (idempotent)
CREATE OR REPLACE FUNCTION update_listing_save_count()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE market_listings SET save_count = save_count + 1 WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE market_listings SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Create trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_listing_saves_count ON listing_saves;
CREATE TRIGGER trg_listing_saves_count
AFTER INSERT OR DELETE ON listing_saves
FOR EACH ROW
EXECUTE FUNCTION update_listing_save_count();