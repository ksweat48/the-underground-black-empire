import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, HeartHandshake, Info, Loader2 } from 'lucide-react';
import { cn } from '@/shared/cn';
import { GlassModal } from '@/shared/components/glass-modal';
import { ErrorBanner } from '@/shared/components/error-banner';
import { formatCents } from '@/domains/treasury/services';
import {
  fetchFamilyLegacyOverview,
  submitAssistanceRequest,
  withdrawAssistanceRequest,
} from '@/domains/membership/services';
import type {
  AssistanceCategory,
  AssistanceRequest,
  FamilyLegacyEligibility,
  FamilyLegacyFund,
} from '@/domains/membership/types';

const CATEGORIES: { id: AssistanceCategory; label: string }[] = [
  { id: 'bereavement', label: 'Bereavement' },
  { id: 'medical', label: 'Medical' },
  { id: 'housing', label: 'Housing' },
  { id: 'education', label: 'Education' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'other', label: 'Other' },
];

const STATUS: Record<AssistanceRequest['status'], { label: string; style: string }> = {
  submitted: { label: 'Under review', style: 'bg-sky-50 text-sky-700' },
  approved: { label: 'Approved, payment pending', style: 'bg-amber-50 text-amber-700' },
  paid: { label: 'Paid', style: 'bg-emerald-50 text-emerald-700' },
  denied: { label: 'Not approved', style: 'bg-red-50 text-red-700' },
  withdrawn: { label: 'Withdrawn', style: 'bg-stone-100 text-stone-600' },
};

export function FamilyLegacyPanel() {
  const [fund, setFund] = useState<FamilyLegacyFund | null>(null);
  const [eligibility, setEligibility] = useState<FamilyLegacyEligibility | null>(null);
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await fetchFamilyLegacyOverview();
      setFund(data.fund);
      setEligibility(data.eligibility);
      setRequests(data.requests);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withdraw = async (id: string) => {
    setWithdrawing(id);
    setNotice(null);
    try {
      await withdrawAssistanceRequest(id);
      setNotice({ ok: true, text: 'Your request was withdrawn.' });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Could not withdraw this request.' });
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] px-5 mb-6">
      <div className="frame-utility rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-plum-100 text-plum-700">
              <HeartHandshake className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Family & Legacy Fund</p>
              <p className="font-display text-2xl font-bold text-stone-900 leading-tight">
                {fund ? formatCents(fund.available_cents) : '—'}
              </p>
              <p className="text-[11px] text-stone-500">available to support member families</p>
            </div>
          </div>
          {fund && (
            <div className="grid grid-cols-2 gap-4 text-right">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Raised</p>
                <p className="text-sm font-semibold tabular-nums text-stone-800">{formatCents(fund.raised_cents)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Families Helped</p>
                <p className="text-sm font-semibold tabular-nums text-stone-800">{fund.families_helped}</p>
              </div>
            </div>
          )}
        </div>

        {loadError && <div className="mt-4"><ErrorBanner message="Unable to load the Family & Legacy fund." onRetry={load} /></div>}

        {eligibility && (
          <div className="mt-4 border-t border-stone-200 pt-4">
            {eligibility.eligible ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  You are eligible to request assistance.
                </p>
                <button type="button" onClick={() => { setNotice(null); setFormOpen(true); }} className="btn-primary px-4 py-2 text-sm">
                  Request Assistance
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-stone-700 mb-1.5">To request assistance:</p>
                <ul className="space-y-1">
                  {eligibility.reasons.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-xs text-stone-600">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {notice && (
          <p className={cn('mt-3 text-xs', notice.ok ? 'text-emerald-700' : 'text-red-700')}>{notice.text}</p>
        )}

        {requests.length > 0 && (
          <div className="mt-4 border-t border-stone-200 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Your Requests</p>
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 rounded-xl bg-stone-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold capitalize text-stone-800">
                      {r.category} · {formatCents(r.approved_amount_cents ?? r.amount_requested_cents)}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS[r.status].style)}>
                      {STATUS[r.status].label}
                    </span>
                  </div>
                  <span className="text-[10px] text-stone-500">Submitted {new Date(r.created_at).toLocaleDateString()}</span>
                  {r.decision_notes && <p className="text-[11px] text-stone-600">{r.decision_notes}</p>}
                  {r.status === 'submitted' && (
                    <button
                      type="button"
                      onClick={() => withdraw(r.id)}
                      disabled={withdrawing === r.id}
                      className="w-fit text-[11px] font-semibold text-stone-600 hover:text-stone-900 hover:underline disabled:opacity-50"
                    >
                      {withdrawing === r.id ? 'Withdrawing...' : 'Withdraw request'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-stone-500">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Family & Legacy is community support, not insurance. Requests are reviewed by Financial Admins and help is not guaranteed.
        </p>
      </div>

      <AssistanceRequestModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmitted={() => {
          setFormOpen(false);
          setNotice({ ok: true, text: 'Your request was submitted. You will be notified once it is reviewed.' });
          load();
        }}
      />
    </div>
  );
}

function AssistanceRequestModal({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const [category, setCategory] = useState<AssistanceCategory>('bereavement');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCategory('bereavement');
      setAmount('');
      setDescription('');
      setError(null);
    }
  }, [open]);

  const cents = Math.round(Number(amount) * 100);
  const valid = cents >= 100 && cents <= 1_000_000 && description.trim().length >= 30;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await submitAssistanceRequest(category, cents, description.trim());
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title="Request Family & Legacy Assistance">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold text-stone-700">What is this for?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                  category === c.id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-700">Amount needed (USD, up to $10,000)</span>
          <input
            type="number"
            min="1"
            max="10000"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-700">Tell us what happened</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={3000}
            placeholder="Share what your family is facing and how this support would help."
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none"
          />
          <span className="text-[10px] text-stone-500">{description.trim().length < 30 ? `At least ${30 - description.trim().length} more characters` : 'Only Financial Admins can read this.'}</span>
        </label>
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 px-4 py-2.5 text-sm">Cancel</button>
          <button type="button" onClick={submit} disabled={!valid || saving} className="btn-primary flex-1 px-4 py-2.5 text-sm disabled:opacity-50">
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Submit Request'}
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
