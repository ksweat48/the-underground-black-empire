/*
# Stage 3: Identity verification

## Plain-English summary
Members can verify their identity from their profile by giving their legal name, phone number,
a driver's license photo and a selfie. Once all four are submitted, they are verified automatically.
Documents are stored privately. Only the Financial Admin or the Founder can see them, and only
while reviewing funding. Every time an admin opens someone's documents, it is logged.
This replaces the old admin-reviewed leader identity checks.

## New tables
- identity_verifications
  - member_id (uuid, primary key, the member)
  - legal_name (text), phone (text)
  - license_path (text), selfie_path (text): private storage locations
  - status (text): 'incomplete' or 'verified'
  - submitted_at, verified_at, updated_at (timestamptz)

## Storage
- New PRIVATE bucket 'identity-documents' (10 MB limit, images only).
- Members can only upload into their own folder; nobody can overwrite or list other folders.
- Only Financial Admin or the Founder can read files.

## Security
- RLS enabled: members can read only their own verification row. No direct writes;
  all writes go through submit_identity_verification(), which checks the files exist
  in the member's own folder.
- get_identity_documents_for_review(member) is restricted to Financial Admin / Founder and audited.
- Old leader identity check functions are retired (data kept).

## Also
- Partner payout requests now require a verified identity and are limited to one per month.
*/

CREATE TABLE IF NOT EXISTS identity_verifications (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  legal_name text,
  phone text,
  license_path text,
  selfie_path text,
  status text NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'verified')),
  submitted_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON identity_verifications FROM anon, authenticated;

DROP POLICY IF EXISTS "Members read own verification" ON identity_verifications;
CREATE POLICY "Members read own verification" ON identity_verifications FOR SELECT
  TO authenticated USING (member_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('identity-documents', 'identity-documents', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

DROP POLICY IF EXISTS "identity_docs_insert_own_folder" ON storage.objects;
CREATE POLICY "identity_docs_insert_own_folder" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'identity-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "identity_docs_select_reviewers" ON storage.objects;
CREATE POLICY "identity_docs_select_reviewers" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'identity-documents' AND public.has_sub_role('financial_admin'));

CREATE OR REPLACE FUNCTION public.is_identity_verified(p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM identity_verifications WHERE member_id = p_member_id AND status = 'verified');
$$;
REVOKE EXECUTE ON FUNCTION public.is_identity_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_identity_verified(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_identity_verification(
  p_legal_name text, p_phone text, p_license_path text, p_selfie_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := NULLIF(trim(COALESCE(p_legal_name, '')), '');
  v_phone text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_row identity_verifications;
  v_complete boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.check_rate_limit('identity_submit', 10);

  IF v_name IS NOT NULL AND (length(v_name) < 3 OR length(v_name) > 120) THEN
    RAISE EXCEPTION 'Enter your full legal name';
  END IF;
  IF v_phone IS NOT NULL AND (length(v_phone) < 10 OR length(v_phone) > 16) THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;

  IF p_license_path IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'identity-documents' AND o.name = p_license_path
      AND (storage.foldername(o.name))[1] = v_uid::text) THEN
    RAISE EXCEPTION 'License photo upload not found';
  END IF;
  IF p_selfie_path IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'identity-documents' AND o.name = p_selfie_path
      AND (storage.foldername(o.name))[1] = v_uid::text) THEN
    RAISE EXCEPTION 'Selfie upload not found';
  END IF;

  INSERT INTO identity_verifications (member_id) VALUES (v_uid) ON CONFLICT (member_id) DO NOTHING;

  UPDATE identity_verifications SET
    legal_name = COALESCE(v_name, legal_name),
    phone = COALESCE(v_phone, phone),
    license_path = COALESCE(p_license_path, license_path),
    selfie_path = COALESCE(p_selfie_path, selfie_path),
    updated_at = now()
  WHERE member_id = v_uid
  RETURNING * INTO v_row;

  v_complete := v_row.legal_name IS NOT NULL AND v_row.phone IS NOT NULL
    AND v_row.license_path IS NOT NULL AND v_row.selfie_path IS NOT NULL;

  IF v_complete AND v_row.status <> 'verified' THEN
    UPDATE identity_verifications SET status = 'verified', submitted_at = now(), verified_at = now()
    WHERE member_id = v_uid RETURNING * INTO v_row;
    INSERT INTO notifications (member_id, type, title, body, link_url)
    VALUES (v_uid, 'identity_verified', 'Identity verified',
      'Thanks. Your identity is on file, so you are eligible for funding, payouts and leadership.', '/profile');
  END IF;

  RETURN jsonb_build_object(
    'status', v_row.status,
    'has_legal_name', v_row.legal_name IS NOT NULL,
    'has_phone', v_row.phone IS NOT NULL,
    'has_license', v_row.license_path IS NOT NULL,
    'has_selfie', v_row.selfie_path IS NOT NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_identity_verification(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_identity_verification(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_identity_documents_for_review(p_member_id uuid, p_context text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row identity_verifications;
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  IF p_context IS NULL OR length(trim(p_context)) < 3 THEN
    RAISE EXCEPTION 'A funding review reason is required';
  END IF;
  SELECT * INTO v_row FROM identity_verifications WHERE member_id = p_member_id;
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'identity_documents_viewed', 'member', p_member_id, jsonb_build_object('context', left(trim(p_context), 300)));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_started');
  END IF;
  RETURN jsonb_build_object(
    'status', v_row.status, 'legal_name', v_row.legal_name, 'phone', v_row.phone,
    'license_path', v_row.license_path, 'selfie_path', v_row.selfie_path,
    'verified_at', v_row.verified_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_identity_documents_for_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_identity_documents_for_review(uuid, text) TO authenticated;

-- Retire the old admin-reviewed leader identity checks.
REVOKE EXECUTE ON FUNCTION public.submit_identity_check(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_identity_check(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_identity_checks() FROM PUBLIC, anon, authenticated;

-- Payout requests: verified identity, one per calendar month.
CREATE OR REPLACE FUNCTION public.request_my_partner_payout()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_partner record;
  v_available bigint;
  v_adj bigint;
  v_total bigint;
  v_fee int;
  v_payout_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.check_rate_limit('payout_request', 3);

  SELECT * INTO v_partner FROM empire_partners WHERE member_id = v_caller FOR UPDATE;
  IF NOT FOUND OR NOT v_partner.is_active THEN
    RAISE EXCEPTION 'Your Partner account is not active';
  END IF;
  IF NOT public.is_identity_verified(v_caller) THEN
    RAISE EXCEPTION 'Verify your identity before requesting a payout';
  END IF;
  IF v_partner.stripe_connect_status IS DISTINCT FROM 'verified' OR v_partner.stripe_connect_account_id IS NULL THEN
    RAISE EXCEPTION 'Finish payout setup before requesting a payout';
  END IF;
  IF EXISTS (SELECT 1 FROM partner_payouts WHERE partner_id = v_caller AND status IN ('requested', 'processing')) THEN
    RAISE EXCEPTION 'You already have a payout in progress';
  END IF;
  IF EXISTS (SELECT 1 FROM partner_payouts WHERE partner_id = v_caller AND status = 'completed'
      AND date_trunc('month', requested_at) = date_trunc('month', now())) THEN
    RAISE EXCEPTION 'You can request one payout per month';
  END IF;

  PERFORM public.release_matured_partner_commissions();

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_available
  FROM partner_commission_ledger WHERE partner_id = v_caller AND status = 'available';
  v_adj := public.partner_open_adjustments_cents(v_caller);
  v_total := v_available + v_adj;

  IF v_total < 10000 THEN
    RAISE EXCEPTION 'Minimum payout is $100';
  END IF;

  v_fee := ROUND(v_total * 0.03)::int;
  INSERT INTO partner_payouts (partner_id, gross_amount_cents, fee_cents, net_amount_cents, status, requested_at)
  VALUES (v_caller, v_total::int, v_fee, (v_total - v_fee)::int, 'requested', now())
  RETURNING id INTO v_payout_id;

  UPDATE partner_commission_ledger SET status = 'requested', payout_id = v_payout_id
  WHERE partner_id = v_caller AND status = 'available';

  UPDATE partner_balance_adjustments a SET payout_id = v_payout_id
  WHERE a.partner_id = v_caller AND a.payout_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM partner_commission_ledger l WHERE l.id = a.commission_id AND l.status = 'reversed');

  RETURN jsonb_build_object('payout_id', v_payout_id, 'gross_cents', v_total, 'fee_cents', v_fee, 'net_cents', v_total - v_fee);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_my_partner_payout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_my_partner_payout() TO authenticated, service_role;
