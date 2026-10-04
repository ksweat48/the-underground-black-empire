import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Receipt, Send, XCircle } from 'lucide-react';
import { cn } from '@/shared/cn';
import { ErrorBanner } from '@/shared/components/error-banner';
import { NewReleaseModal } from '@/domains/admin/components/new-release-modal';
import {
  FUND_LABELS,
  completeTreasuryRelease,
  fetchFundBalances,
  fetchReleaseQueue,
  formatCents,
  rejectTreasuryRelease,
  reviewTreasuryRelease,
  type FundRelease,
  type FundTotals,
} from '@/domains/admin/financial-services';

type Action = 'approve' | 'pay' | 'reject';

const STATUS_LABEL: Record<FundRelease['status'], { text: string; style: string }> = {
  submitted: { text: 'Awaiting approval', style: 'bg-sky-50 text-sky-700' },
  under_review: { text: 'In review', style: 'bg-sky-50 text-sky-700' },
  approved: { text: 'Approved, not paid', style: 'bg-amber-50 text-amber-700' },
  funded: { text: 'Paid', style: 'bg-emerald-50 text-emerald-700' },
  completed: { text: 'Paid', style: 'bg-emerald-50 text-emerald-700' },
  rejected: { text: 'Rejected', style: 'bg-red-50 text-red-700' },
};

const FUND_STYLE: Record<FundRelease['fund'], string> = {
  metro: 'text-emerald-700',
  empire: 'text-blue-700',
  family_legacy: 'text-plum-700',
};

export function FundReleaseQueue({ refreshKey }: { refreshKey: number }) {
  const [releases, setReleases] = useState<FundRelease[]>([]);
  const [balances, setBalances] = useState<{ empire: FundTotals; family_legacy: FundTotals } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<{ id: string; action: Action } | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [queue, totals] = await Promise.all([fetchReleaseQueue(showClosed), fetchFundBalances()]);
      setReleases(queue);
      setBalances(totals);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const open = (id: string, action: Action) => {
    setActive({ id, action });
    setInput('');
    setActionError(null);
  };

  const run = async () => {
    if (!active) return;
    setSaving(true);
    setActionError(null);
    try {
      if (active.action === 'approve') await reviewTreasuryRelease(active.id, input.trim(), true);
      if (active.action === 'pay') await completeTreasuryRelease(active.id, input.trim());
      if (active.action === 'reject') await rejectTreasuryRelease(active.id, input.trim());
      setActive(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update this release.');
    } finally {
      setSaving(false);
    }
  };

  const inputValid = active?.action === 'approve' || input.trim().length >= 3;

  return (
    <div className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Receipt className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Fund Releases</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-display font-bold text-stone-900">Release Queue</h2>
          <p className="text-xs text-stone-500">Submit, approve by a second admin, then mark paid with a payment reference.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
        >
          <Plus className="h-4 w-4" />
          New Release
        </button>
      </div>

      {balances && (
        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          {(['empire', 'family_legacy'] as const).map((key) => (
            <div key={key} className="frame-intel p-3">
              <p className={cn('text-xs font-semibold', FUND_STYLE[key])}>{FUND_LABELS[key]}</p>
              <p className="text-xl font-display font-bold tabular-nums text-stone-900">{formatCents(balances[key].available_cents)}</p>
              <p className="text-[10px] text-stone-500">
                available · {formatCents(balances[key].committed_cents)} pending · {formatCents(balances[key].paid_cents)} paid out
              </p>
            </div>
          ))}
        </div>
      )}

      <label className="mb-2 inline-flex items-center gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        Show paid and rejected
      </label>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-stone-400" /></div>
      ) : loadError ? (
        <ErrorBanner message="Unable to load releases." onRetry={load} />
      ) : releases.length === 0 ? (
        <p className="py-4 text-center text-xs text-stone-500">No releases {showClosed ? 'yet' : 'waiting'}.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {releases.map((r) => {
            const status = STATUS_LABEL[r.status];
            const openHere = active?.id === r.id;
            return (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn('text-[10px] font-semibold uppercase tracking-wider', FUND_STYLE[r.fund])}>
                      {FUND_LABELS[r.fund]}{r.metro_name ? ` · ${r.metro_name}` : ''}
                    </p>
                    <p className="text-sm font-semibold text-stone-900 break-words">{r.purpose ?? 'Treasury release'}</p>
                    <p className="text-[10px] text-stone-500">
                      Submitted by {r.submitted_by_name ?? 'admin'} on {new Date(r.created_at).toLocaleDateString()}
                      {r.approved_by_name && ` · approved by ${r.approved_by_name}`}
                      {r.payment_reference && ` · ref ${r.payment_reference}`}
                      {r.rejection_reason && <span className="text-red-600"> · {r.rejection_reason}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-display font-bold tabular-nums text-stone-900">{formatCents(r.amount_cents)}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', status.style)}>{status.text}</span>
                  </div>
                </div>

                {!openHere && ['submitted', 'under_review', 'approved'].includes(r.status) && (
                  <div className="mt-2 flex gap-3">
                    {r.status === 'approved' ? (
                      <button type="button" onClick={() => open(r.id, 'pay')} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
                        <Send className="h-3.5 w-3.5" /> Mark Paid
                      </button>
                    ) : (
                      <button type="button" onClick={() => open(r.id, 'approve')} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                    )}
                    <button type="button" onClick={() => open(r.id, 'reject')} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline">
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}

                {openHere && active && (
                  <div className="mt-2 space-y-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={300}
                      placeholder={
                        active.action === 'pay' ? 'Payment reference (check #, transfer ID)' :
                        active.action === 'reject' ? 'Reason for rejecting' : 'Approval notes (optional)'
                      }
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                    />
                    {actionError && <p className="text-[10px] text-red-700">{actionError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={run} disabled={saving || !inputValid} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active.action === 'pay' ? 'Confirm Paid' : active.action === 'reject' ? 'Confirm Reject' : 'Confirm Approval'}
                      </button>
                      <button type="button" onClick={() => setActive(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <NewReleaseModal open={creating} onClose={() => setCreating(false)} onSubmitted={load} />
    </div>
  );
}
