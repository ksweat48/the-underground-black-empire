/*
# Listing Images Storage Bucket

## Purpose
Creates a public storage bucket `listing-images` for marketplace listing
photos/logos uploaded by members during onboarding or from the Marketplace.

## Security
- Authenticated users can upload/modify/delete only within their own folder
  (path starts with their auth.uid)
- Public read access so marketplace visitors can see listing photos
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: only into own folder
DROP POLICY IF EXISTS "Listing image upload own" ON storage.objects;
CREATE POLICY "Listing image upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Update: only within own folder
DROP POLICY IF EXISTS "Listing image update own" ON storage.objects;
CREATE POLICY "Listing image update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Delete: only within own folder
DROP POLICY IF EXISTS "Listing image delete own" ON storage.objects;
CREATE POLICY "Listing image delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read
DROP POLICY IF EXISTS "Listing image public read" ON storage.objects;
CREATE POLICY "Listing image public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'listing-images');
