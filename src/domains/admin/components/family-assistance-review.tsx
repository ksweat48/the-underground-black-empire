import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, HeartHandshake, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/shared/cn';
import { ErrorBanner } from '@/shared/components/error-banner';
import { IdentityReviewButton } from '@/domains/admin/components/identity-review-button';
import {
  decideAssistanceRequest,
  fetchAssistanceRequestsForReview,
  formatCents,
  type AssistanceRequestForReview,
} from '@/domains/admin/financial-services';

const STATUS_STYLE: Record<AssistanceRequestForReview['status'], string> = {
  submitted: 'bg-sky-50 text-sky-700',
  approved: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
  denied: 'bg-red-50 text-red-700',
  withdrawn: 'bg-stone-100 text-stone-600',
};

export function FamilyAssistanceReview({ onDecided }: { onDecided: () => void }) {
  const [requests, setRequests] = useState<AssistanceRequestForReview[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState<{ id: string; approve: boolean } | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setRequests(await fetchAssistanceRequestsForReview(showClosed));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => { load(); }, [load]);

  const open = (r: AssistanceRequestForReview, approve: boolean) => {
    setActive({ id: r.id, approve });
    setAmount((r.amount_requested_cents / 100).toFixed(2));
    setNotes('');
    setActionError(null);
  };

  const decide = async () => {
    if (!active) return;
    setSaving(true);
    setActionError(null);
    try {
      await decideAssistanceRequest(active.id, active.approve, active.approve ? Math.round(Number(amount) * 100) : null, notes.trim());
      setActive(null);
      await load();
      onDecided();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not save this decision.');
    } finally {
      setSaving(false);
    }
  };

  const decisionValid = active?.approve ? Number(amount) > 0 : notes.trim().length >= 5;

  return (
    <div className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <HeartHandshake className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Family & Legacy</p>
      </div>
      <h2 className="text-lg font-display font-bold text-stone-900">Assistance Requests</h2>
      <p className="text-xs text-stone-500 mb-3">
        Approving sends the request to the Release Queue, where a second admin signs off before payment.
      </p>
      <label className="mb-2 inline-flex items-center gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        Show closed requests
      </label>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-stone-400" /></div>
      ) : loadError ? (
        <ErrorBanner message="Unable to load assistance requests." onRetry={load} />
      ) : requests.length === 0 ? (
        <p className="py-4 text-center text-xs text-stone-500">No requests {showClosed ? 'yet' : 'waiting'}.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {requests.map((r) => {
            const openHere = active?.id === r.id;
            return (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900">{r.display_name ?? 'Member'}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[10px] text-stone-500">
                      <span className="capitalize">{r.category}</span>
                      <span>· {r.membership_tier.replace('_', ' ')}</span>
                      <span>· {r.good_standing_days} days in good standing</span>
                      {r.identity_verified ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-700"><BadgeCheck className="h-3 w-3" />Verified</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-red-700"><ShieldAlert className="h-3 w-3" />Not verified</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-display font-bold tabular-nums text-stone-900">
                      {formatCents(r.approved_amount_cents ?? r.amount_requested_cents)}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', STATUS_STYLE[r.status])}>
                      {r.status}
                    </span>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-stone-700">{r.description}</p>
                {r.decision_notes && <p className="mt-1 text-[10px] text-stone-500">Notes: {r.decision_notes}</p>}

                {r.status === 'submitted' && !openHere && (
                  <div className="mt-2 flex items-center gap-3">
                    <IdentityReviewButton memberId={r.member_id} memberName={r.display_name ?? 'Member'} context={`Family assistance ${r.id}`} />
                    <button type="button" onClick={() => open(r, true)} className="text-xs font-semibold text-emerald-700 hover:underline">Approve</button>
                    <button type="button" onClick={() => open(r, false)} className="text-xs font-semibold text-red-700 hover:underline">Deny</button>
                  </div>
                )}

                {openHere && active && (
                  <div className="mt-2 space-y-2">
                    {active.approve && (
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-40 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                        aria-label="Approved amount"
                      />
                    )}
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder={active.approve ? 'Notes (optional)' : 'Reason shared with the member'}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                    />
                    {actionError && <p className="text-[10px] text-red-700">{actionError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={decide} disabled={saving || !decisionValid} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active.approve ? 'Approve Request' : 'Deny Request'}
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
    </div>
  );
}
