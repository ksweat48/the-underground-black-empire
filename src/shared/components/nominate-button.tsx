import { useState } from 'react';
import { Scale, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { GlassModal } from '@/shared/components/glass-modal';
import { cn } from '@/shared/cn';
import { submitNomination } from '@/domains/leadership/services';

interface NominateButtonProps {
  candidateId: string;
  candidateName: string;
  candidateAvatarUrl?: string | null;
  candidateLevel?: number;
  candidateInfluence?: number;
  hasNominated?: boolean;
  disabled?: boolean;
  variant?: 'icon' | 'full';
  onNominated?: () => void;
}

export function NominateButton({
  candidateId,
  candidateName,
  candidateAvatarUrl,
  candidateLevel,
  candidateInfluence,
  hasNominated = false,
  disabled = false,
  variant = 'icon',
  onNominated,
}: NominateButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleNominate = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await submitNomination(candidateId);
      setSuccess(true);
      onNominated?.();
      setTimeout(() => {
        setShowConfirm(false);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to nominate';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (hasNominated) {
    if (variant === 'icon') {
      return (
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-emerald-500"
          aria-label="Already nominated"
        >
          <CheckCircle2 className="w-4 h-4" />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/20">
        <CheckCircle2 className="w-4 h-4" />
        Nominated
      </span>
    );
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={() => { setShowConfirm(true); setError(null); setSuccess(false); }}
          disabled={disabled}
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
            disabled
              ? 'text-ink-600 cursor-not-allowed'
              : 'text-ink-300 hover:bg-ink-200/10 hover:text-ink-100'
          )}
          aria-label={`Nominate ${candidateName} for leadership`}
        >
          <Scale className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => { setShowConfirm(true); setError(null); setSuccess(false); }}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            disabled
              ? 'bg-ink-800/20 text-ink-500 cursor-not-allowed border border-ink-700/15'
              : 'bg-ink-100 text-ink-900 hover:bg-ink-200 border border-transparent'
          )}
        >
          <Scale className="w-4 h-4" />
          Nominate
        </button>
      )}

      <GlassModal
        open={showConfirm}
        onClose={() => { setShowConfirm(false); setError(null); setSuccess(false); }}
        title="Nominate for Leadership"
      >
        {success ? (
          <div className="text-center py-8 space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-ink-200">Nomination submitted.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-300">
              Do you believe {candidateName} would be a strong leader and supporter of the Empire?
            </p>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-ink-800/30 border border-ink-700/20">
              <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden bg-ink-800/40 border border-ink-700/20 flex items-center justify-center">
                {candidateAvatarUrl ? (
                  <img src={candidateAvatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display font-bold text-sm text-ink-300">
                    {candidateName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-100 truncate">{candidateName}</p>
                {candidateLevel !== undefined && candidateInfluence !== undefined && (
                  <p className="text-xs text-ink-400">
                    Level {candidateLevel} - {candidateInfluence.toLocaleString()} Influence
                  </p>
                )}
              </div>
            </div>
            {error && (
              <p className="text-sm text-crimson-300 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowConfirm(false); setError(null); }}
                className="btn-secondary flex-1 text-sm py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={handleNominate}
                disabled={submitting}
                className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Scale className="w-4 h-4" />
                    Nominate {candidateName.split(' ')[0]}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </GlassModal>
    </>
  );
}
