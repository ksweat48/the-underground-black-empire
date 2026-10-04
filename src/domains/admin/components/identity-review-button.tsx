import { useState } from 'react';
import { BadgeCheck, ScanFace, Loader2, ShieldAlert } from 'lucide-react';
import { GlassModal } from '@/shared/components/glass-modal';
import { fetchVerificationForReview, type VerificationForReview } from '@/domains/identity/verification-services';

export function IdentityReviewButton({ memberId, memberName, context }: { memberId: string; memberName: string; context: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VerificationForReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      setData(await fetchVerificationForReview(memberId, context));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load identity documents.');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setOpen(false);
    setData(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-100"
      >
        <ScanFace className="h-3.5 w-3.5" />
        View ID
      </button>
      <GlassModal open={open} onClose={close} title={`Identity: ${memberName}`}>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ink-400" /></div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {data.status === 'verified' ? (
                <span className="badge-emerald inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" />Verified</span>
              ) : (
                <span className="badge-amber inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" />Not verified. Funds cannot be approved.</span>
              )}
            </div>
            {data.status !== 'not_started' && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-ink-400">Legal name</dt><dd className="text-ink-100">{data.legal_name ?? 'Missing'}</dd></div>
                <div><dt className="text-xs text-ink-400">Phone</dt><dd className="text-ink-100">{data.phone ?? 'Missing'}</dd></div>
              </dl>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(['license_url', 'selfie_url'] as const).map((key) => (
                <div key={key}>
                  <p className="mb-1 text-xs text-ink-400">{key === 'license_url' ? "Driver's license" : 'Selfie'}</p>
                  {data[key] ? (
                    <img src={data[key] ?? ''} alt={key === 'license_url' ? "Driver's license" : 'Selfie'} className="w-full rounded-lg border border-white/10 object-contain" />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-ink-500">Not provided</div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-500">This view was logged. Links expire in 5 minutes.</p>
          </div>
        ) : null}
      </GlassModal>
    </>
  );
}
