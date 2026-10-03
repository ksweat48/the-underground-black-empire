import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/shared/cn';
import { STATUS_LABELS, OUTCOME_LABELS, type InitiativeStatus, type EntryOutcome } from '@/domains/initiatives/services';

const STATUS_STYLES: Record<InitiativeStatus, string> = {
  submitted: 'bg-stone-50 text-stone-600 border-stone-200',
  eligible: 'bg-plum-50 text-plum-700 border-plum-200',
  in_voting: 'bg-stone-900 text-white border-stone-900',
  awaiting_review: 'bg-sky-50 text-sky-700 border-sky-200',
  awaiting_funding: 'bg-orange-50 text-orange-700 border-orange-200',
  funded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-600 text-white border-emerald-600',
  disqualified: 'bg-red-50 text-red-700 border-red-200',
  withdrawn: 'bg-stone-100 text-stone-500 border-stone-200',
  deferred: 'bg-stone-100 text-stone-600 border-stone-300',
};

const OUTCOME_STYLES: Record<EntryOutcome, string> = {
  voting: 'bg-stone-900 text-white border-stone-900',
  pending_review: 'bg-sky-50 text-sky-700 border-sky-200',
  awaiting_funding: 'bg-orange-50 text-orange-700 border-orange-200',
  funded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  not_qualified: 'bg-stone-50 text-stone-500 border-stone-200',
  no_quorum: 'bg-stone-50 text-stone-500 border-stone-200',
  disqualified: 'bg-red-50 text-red-700 border-red-200',
  deferred: 'bg-stone-100 text-stone-600 border-stone-300',
  withdrawn: 'bg-stone-100 text-stone-500 border-stone-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const pillBase = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap';

export function StatusPill({ status, className }: { status: InitiativeStatus; className?: string }) {
  return <span className={cn(pillBase, STATUS_STYLES[status], className)}>{STATUS_LABELS[status]}</span>;
}

export function OutcomePill({ outcome, className }: { outcome: EntryOutcome; className?: string }) {
  return <span className={cn(pillBase, OUTCOME_STYLES[outcome], className)}>{OUTCOME_LABELS[outcome]}</span>;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function OrgMark({ name, imageUrl, size = 'md' }: { name: string; imageUrl: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-14 h-14 text-lg' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  if (imageUrl) {
    return <img src={imageUrl} alt="" className={cn(dims, 'rounded-xl object-cover border border-stone-200 shrink-0')} />;
  }
  return (
    <div className={cn(dims, 'rounded-xl bg-plum-50 border border-plum-200 text-plum-700 font-display font-bold flex items-center justify-center shrink-0')}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

export function Sheet({ open, onClose, title, subtitle, children }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-stone-900/40 backdrop-blur-sm animate-fade-in overflow-y-auto" onClick={onClose}>
      <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-6">
        <div
          className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl border border-stone-200 shadow-2xl p-5 sm:p-6 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-stone-900 leading-tight">{title}</h3>
              {subtitle && <p className="text-xs text-stone-500 mt-1 leading-relaxed">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ReasonSheet({ open, onClose, title, subtitle, label, confirmLabel, minLength = 5, danger, extra, onConfirm }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  label: string;
  confirmLabel: string;
  minLength?: number;
  danger?: boolean;
  extra?: ReactNode;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setReason(''); setError(null); }
  }, [open]);

  const valid = reason.trim().length >= minLength;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {extra}
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">{label}</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        maxLength={2000}
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-plum-200 focus:border-plum-400 transition"
        placeholder="Write a clear reason. This is kept in the permanent history."
      />
      <p className="text-[11px] text-stone-400 mt-1">At least {minLength} characters.</p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onClose} className="btn-secondary !px-4 !py-2 text-sm">Cancel</button>
        <button
          onClick={submit}
          disabled={!valid || busy}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed',
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-900 hover:bg-stone-800',
          )}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function EmptyState({ icon: Icon, title, body, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; body: string; children?: ReactNode;
}) {
  return (
    <div className="frame-intel p-8 text-center">
      <div className="w-11 h-11 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5 text-stone-400" />
      </div>
      <p className="text-sm font-semibold text-stone-900">{title}</p>
      <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto leading-relaxed">{body}</p>
      {children}
    </div>
  );
}
