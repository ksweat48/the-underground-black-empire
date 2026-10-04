import { supabase } from '@/shared/supabase-client';

const BUCKET = 'identity-documents';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface MyVerification {
  status: 'not_started' | 'incomplete' | 'verified';
  legal_name: string | null;
  phone: string | null;
  has_license: boolean;
  has_selfie: boolean;
  verified_at: string | null;
}

export interface VerificationForReview {
  status: 'not_started' | 'incomplete' | 'verified';
  legal_name?: string | null;
  phone?: string | null;
  verified_at?: string | null;
  license_url: string | null;
  selfie_url: string | null;
}

const KNOWN_MESSAGES = [
  'Enter your full legal name',
  'Enter a valid phone number',
  'License photo upload not found',
  'Selfie upload not found',
  'A funding review reason is required',
  'Not authorized',
];

function friendly(error: unknown, fallback: string): Error {
  console.error(fallback, error);
  const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (msg.includes('Rate limit')) return new Error('Too many attempts. Please wait a bit and try again.');
  const known = KNOWN_MESSAGES.find((m) => msg.includes(m));
  return new Error(known ?? fallback);
}

export async function fetchMyVerification(memberId: string): Promise<MyVerification> {
  const { data, error } = await supabase
    .from('identity_verifications')
    .select('status, legal_name, phone, license_path, selfie_path, verified_at')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw friendly(error, 'Could not load your verification status.');
  if (!data) {
    return { status: 'not_started', legal_name: null, phone: null, has_license: false, has_selfie: false, verified_at: null };
  }
  return {
    status: data.status,
    legal_name: data.legal_name,
    phone: data.phone,
    has_license: !!data.license_path,
    has_selfie: !!data.selfie_path,
    verified_at: data.verified_at,
  };
}

export async function uploadIdentityDocument(memberId: string, kind: 'license' | 'selfie', file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Please upload a JPG, PNG, WEBP or HEIC photo.');
  if (file.size > MAX_BYTES) throw new Error('Photos must be 10 MB or smaller.');
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${memberId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw friendly(error, 'Upload failed. Please try again.');
  return path;
}

export async function submitIdentityVerification(input: {
  legalName?: string;
  phone?: string;
  licensePath?: string;
  selfiePath?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('submit_identity_verification', {
    p_legal_name: input.legalName ?? null,
    p_phone: input.phone ?? null,
    p_license_path: input.licensePath ?? null,
    p_selfie_path: input.selfiePath ?? null,
  });
  if (error) throw friendly(error, 'Could not save your verification. Please try again.');
}

export async function fetchVerificationForReview(memberId: string, context: string): Promise<VerificationForReview> {
  const { data, error } = await supabase.rpc('get_identity_documents_for_review', {
    p_member_id: memberId,
    p_context: context,
  });
  if (error) throw friendly(error, 'Could not load identity documents.');
  const row = (data ?? {}) as {
    status?: VerificationForReview['status'];
    legal_name?: string | null;
    phone?: string | null;
    verified_at?: string | null;
    license_path?: string | null;
    selfie_path?: string | null;
  };
  const sign = async (path: string | null | undefined) => {
    if (!path) return null;
    const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (signError) {
      console.error('signed url failed', signError);
      return null;
    }
    return signed.signedUrl;
  };
  const [license_url, selfie_url] = await Promise.all([sign(row.license_path), sign(row.selfie_path)]);
  return {
    status: row.status ?? 'not_started',
    legal_name: row.legal_name ?? null,
    phone: row.phone ?? null,
    verified_at: row.verified_at ?? null,
    license_url,
    selfie_url,
  };
}
