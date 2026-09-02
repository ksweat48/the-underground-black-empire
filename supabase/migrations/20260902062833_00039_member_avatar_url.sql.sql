/*
# Add member avatar_url column and storage bucket

1. Schema Changes
- Adds `avatar_url` (text, nullable) to the `members` table so each member can store a profile photo URL.
- Drops and recreates `update_member_profile` function to accept an optional `p_avatar_url` parameter.

2. Storage
- Creates a public storage bucket `member-avatars` for storing profile photos.
- Storage policies so authenticated users can upload/update/delete only their own avatar.
- Public read access for avatar URLs.

3. Security
- RLS already enabled on `members` — no changes needed.
- Storage policies restrict uploads to the owner only.
*/

-- Add avatar_url column to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url text;

-- Drop old function signature before recreating with new parameter
DROP FUNCTION IF EXISTS public.update_member_profile(date, text, text);

-- Recreate with avatar_url parameter
CREATE OR REPLACE FUNCTION public.update_member_profile(
  p_date_of_birth date DEFAULT NULL,
  p_support_role text DEFAULT NULL,
  p_support_role_detail text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Validate support_role if provided
  IF p_support_role IS NOT NULL AND p_support_role NOT IN ('supporter', 'business_owner', 'professional', 'organization') THEN
    RAISE EXCEPTION 'Invalid support role' USING ERRCODE = '23514';
  END IF;

  -- If support_role is not 'supporter' and not null, detail must be non-empty
  IF p_support_role IS NOT NULL AND p_support_role <> 'supporter' AND (p_support_role_detail IS NULL OR btrim(p_support_role_detail) = '') THEN
    RAISE EXCEPTION 'A detail is required for this support role' USING ERRCODE = '23502';
  END IF;

  -- Date of birth must not be in the future
  IF p_date_of_birth IS NOT NULL AND p_date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future' USING ERRCODE = '23514';
  END IF;

  -- Update only the caller's own row
  UPDATE members
  SET date_of_birth = p_date_of_birth,
      support_role = p_support_role,
      support_role_detail = CASE
        WHEN p_support_role IS NULL OR p_support_role = 'supporter' THEN NULL
        ELSE p_support_role_detail
      END,
      avatar_url = p_avatar_url,
      updated_at = now()
  WHERE id = v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_profile TO authenticated;

-- Create storage bucket for member avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-avatars', 'member-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can manage only their own folder
DROP POLICY IF EXISTS "Avatar upload own" ON storage.objects;
CREATE POLICY "Avatar upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Avatar update own" ON storage.objects;
CREATE POLICY "Avatar update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'member-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'member-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Avatar delete own" ON storage.objects;
CREATE POLICY "Avatar delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'member-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read for avatars
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'member-avatars');
