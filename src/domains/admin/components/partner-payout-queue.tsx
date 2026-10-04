import { useCallback, useEffect, useState } from 'react';
import { Loader2, Send, Wallet } from 'lucide-react';
import { cn } from '@/shared/cn';
import { ErrorBanner } from '@/shared/components/error-banner';
import {
  fetchPayoutQueue,
  formatCents,
  runMonthlyPayouts,
  type PayoutQueueItem,
} from '@/domains/admin/financial-services';
import { IdentityReviewButton } from '@/domains/admin/components/identity-review-button';

const STATUS_STYLE: Record<PayoutQueueItem['status'], string> = {
  requested: 'bg-sky-50 text-sky-700',
  processing: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

export function PartnerPayoutQueue() {
  const [items, setItems] = useState<PayoutQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setItems(await fetchPayoutQueue());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requested = items.filter((i) => i.status === 'requested');
  const requestedTotal = requested.reduce((sum, i) => sum + i.net_cents, 0);

  const run = async () => {
    setRunning(true);
    setMessage(null);
    setRunError(null);
    try {
      const result = await runMonthlyPayouts();
      setMessage(`Payout run finished: ${result.paid} sent, ${result.failed} failed.`);
      await load();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'The payout run could not be completed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Wallet className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Monthly Partner Payouts</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-display font-bold text-stone-900">Payout Requests</h2>
          <p className="text-xs text-stone-500">
            {requested.length} waiting · {formatCents(requestedTotal)} to send. Failed payouts return to the Partner's Available balance.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || requested.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send Monthly Payouts
        </button>
      </div>
      {message && <p className="mb-3 text-xs text-emerald-700">{message}</p>}
      {runError && <p className="mb-3 text-xs text-red-700">{runError}</p>}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-stone-400" /></div>
      ) : loadError ? (
        <ErrorBanner message="Unable to load payout requests." onRetry={load} />
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-xs text-stone-500">No payout requests yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {items.slice(0, 25).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-900">{item.display_name ?? 'Partner'}</p>
                <p className="text-[10px] text-stone-500">
                  Requested {new Date(item.requested_at).toLocaleDateString()} · fee {formatCents(item.fee_cents)}
                  {item.failure_reason && <span className="text-red-600"> · {item.failure_reason}</span>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {item.status === 'requested' && (
                  <IdentityReviewButton memberId={item.partner_id} memberName={item.display_name ?? 'Partner'} context={`Partner payout ${item.id}`} />
                )}
                <span className="text-sm font-display font-bold tabular-nums text-stone-900">{formatCents(item.net_cents)}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', STATUS_STYLE[item.status])}>
                  {item.status === 'completed' ? 'Paid' : item.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
