import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/cn';
import { GlassModal } from '@/shared/components/glass-modal';
import {
  FUND_LABELS,
  fetchMetroOptions,
  submitFundRelease,
  type FundKey,
  type MetroOption,
} from '@/domains/admin/financial-services';

const FIELD = 'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-antique-300/60 focus:outline-none';

export function NewReleaseModal({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const [fund, setFund] = useState<FundKey>('metro');
  const [metros, setMetros] = useState<MetroOption[]>([]);
  const [metroId, setMetroId] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || metros.length > 0) return;
    fetchMetroOptions().then(setMetros).catch(() => setError('Could not load metros.'));
  }, [open, metros.length]);

  const amountCents = Math.round(Number(amount) * 100);
  const valid = amountCents > 0 && purpose.trim().length >= 10 && (fund !== 'metro' || metroId);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await submitFundRelease({ fund, amountCents, purpose: purpose.trim(), metroId });
      setAmount('');
      setPurpose('');
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit this release.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title="New Release">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs text-ink-400">Fund</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(FUND_LABELS) as FundKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFund(key)}
                className={cn(
                  'rounded-lg border px-2 py-2 text-xs font-semibold transition',
                  fund === key ? 'border-antique-300/70 bg-antique-300/10 text-antique-200' : 'border-ink-700 text-ink-300 hover:border-ink-500',
                )}
              >
                {FUND_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
        {fund === 'metro' && (
          <label className="block">
            <span className="mb-1 block text-xs text-ink-400">Metro</span>
            <select value={metroId} onChange={(e) => setMetroId(e.target.value)} className={FIELD}>
              <option value="">Choose a metro</option>
              {metros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs text-ink-400">Amount (USD)</span>
          <input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={FIELD} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-400">Purpose</span>
          <textarea rows={3} maxLength={1000} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What this money pays for and who receives it" className={FIELD} />
        </label>
        <p className="text-[11px] leading-relaxed text-ink-500">
          After submitting, a different Financial Admin must approve before the payment can be marked sent.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={!valid || saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-antique-300 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-antique-200 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit for Approval
        </button>
      </div>
    </GlassModal>
  );
}
