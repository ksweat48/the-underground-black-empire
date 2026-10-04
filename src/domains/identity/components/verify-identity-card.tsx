import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Camera, CreditCard, Loader2, Lock, Phone, ShieldAlert, User } from 'lucide-react';
import { cn } from '@/shared/cn';
import {
  fetchMyVerification,
  submitIdentityVerification,
  uploadIdentityDocument,
  type MyVerification,
} from '@/domains/identity/verification-services';

function StepPill({ done, icon: Icon, label }: { done: boolean; icon: typeof User; label: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
        done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-ink-300',
      )}
    >
      {done ? <BadgeCheck className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      <span>{label}</span>
    </div>
  );
}

function PhotoPicker({
  label,
  hint,
  done,
  busy,
  capture,
  onPick,
}: {
  label: string;
  hint: string;
  done: boolean;
  busy: boolean;
  capture?: 'user' | 'environment';
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      disabled={busy}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-all',
        done ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/15 hover:border-amber-400/50 hover:bg-white/5',
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-ink-300" /> : done ? <BadgeCheck className="h-5 w-5 text-emerald-400" /> : <Camera className="h-5 w-5 text-ink-300 group-hover:text-amber-300" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-100">{label}</span>
        <span className="block text-xs text-ink-400">{done ? 'Received. Tap to replace.' : hint}</span>
      </span>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture={capture}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
    </button>
  );
}

export function VerifyIdentityCard({ memberId }: { memberId: string }) {
  const [status, setStatus] = useState<MyVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [legalName, setLegalName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploading, setUploading] = useState<'license' | 'selfie' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyVerification(memberId);
      setStatus(data);
      setLegalName(data.legal_name ?? '');
      setPhone(data.phone ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your verification status.');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDetails = async () => {
    setSavingDetails(true);
    setError(null);
    try {
      await submitIdentityVerification({ legalName: legalName.trim(), phone: phone.trim() });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const uploadPhoto = async (kind: 'license' | 'selfie', file: File) => {
    setUploading(kind);
    setError(null);
    try {
      const path = await uploadIdentityDocument(memberId, kind, file);
      await submitIdentityVerification(kind === 'license' ? { licensePath: path } : { selfiePath: path });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <section className="glass-card flex items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
      </section>
    );
  }

  const verified = status?.status === 'verified';
  const hasName = !!status?.legal_name;
  const hasPhone = !!status?.phone;
  const detailsChanged = legalName.trim() !== (status?.legal_name ?? '') || phone.trim() !== (status?.phone ?? '');

  if (verified) {
    return (
      <section className="glass-card animate-fade-up p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
            <BadgeCheck className="h-5 w-5 text-emerald-400" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-ink-100">Identity Verified</h2>
            <p className="text-xs text-ink-400">
              You are eligible for funding approvals, partner payouts and leadership roles.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-card animate-fade-up space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
          <ShieldAlert className="h-5 w-5 text-amber-300" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold text-ink-100">Verify Identity</h2>
          <p className="text-sm font-medium text-amber-300">Verification Required Before Funds Can Be Approved</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Complete all four steps and you are verified instantly. Needed for funding, partner payouts and leadership.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StepPill done={hasName} icon={User} label="Legal name" />
        <StepPill done={hasPhone} icon={Phone} label="Phone" />
        <StepPill done={!!status?.has_license} icon={CreditCard} label="License" />
        <StepPill done={!!status?.has_selfie} icon={Camera} label="Selfie" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-300">Full legal name</span>
          <input
            className="input-field w-full"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="As shown on your license"
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-300">Phone number</span>
          <input
            className="input-field w-full"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
          />
        </label>
      </div>
      {detailsChanged && (
        <button
          type="button"
          onClick={saveDetails}
          disabled={savingDetails || !legalName.trim() || !phone.trim()}
          className="btn-secondary w-full sm:w-auto"
        >
          {savingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Name & Phone'}
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <PhotoPicker
          label="Driver's license photo"
          hint="Front of your license, all corners visible"
          done={!!status?.has_license}
          busy={uploading === 'license'}
          capture="environment"
          onPick={(file) => uploadPhoto('license', file)}
        />
        <PhotoPicker
          label="Selfie"
          hint="A clear photo of your face"
          done={!!status?.has_selfie}
          busy={uploading === 'selfie'}
          capture="user"
          onPick={(file) => uploadPhoto('selfie', file)}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <Lock className="h-3 w-3" />
        Stored privately. Only the Financial Admin or Founder can view these, and only during a funding review.
      </p>
    </section>
  );
}
