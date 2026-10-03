import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Loader2, Plus, ChevronRight } from 'lucide-react';
import { parseSupabaseError } from '@/shared/errors';
import { formatCents } from '@/domains/treasury/services';
import {
  submitInitiative, fetchOrganizationInitiatives, type InitiativeStatus,
} from '@/domains/initiatives/services';
import { Sheet, StatusPill } from '@/domains/initiatives/components/initiative-ui';

const ACTIVE: InitiativeStatus[] = ['submitted', 'eligible', 'in_voting', 'awaiting_review', 'awaiting_funding'];

const FIELDS = [
  { key: 'title', label: 'Title', min: 4, max: 120, rows: 0, placeholder: 'e.g. Westside Youth Coding Lab' },
  { key: 'description', label: 'Description', min: 20, max: 4000, rows: 4, placeholder: 'What will you do, and who does it serve?' },
  { key: 'impact', label: 'Expected impact', min: 10, max: 2000, rows: 3, placeholder: 'What measurable change will members see?' },
  { key: 'timeline', label: 'Timeline', min: 3, max: 500, rows: 2, placeholder: 'e.g. Launch in 30 days, complete within 6 months' },
  { key: 'conflictDisclosure', label: 'Conflict of interest disclosure', min: 2, max: 2000, rows: 2, placeholder: 'List any personal or financial ties, or write "None".' },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-plum-200 focus:border-plum-400 transition';

export function OrganizationInitiativesCard({ organizationId }: { organizationId: string }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchOrganizationInitiatives>>>([]);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchOrganizationInitiatives(organizationId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const hasActive = items.some((i) => ACTIVE.includes(i.status));

  return (
    <section className="frame-command p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-plum-50 border border-plum-200 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-plum-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-plum-600">Metro Treasury</p>
          <h3 className="text-base font-display font-bold text-stone-900 leading-tight">Metro Initiatives</h3>
          <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
            Request funding from your Metro Treasury. Members back and vote on initiatives twice a month.
          </p>
        </div>
      </div>

      {loadError && <p className="text-xs text-red-600 mt-3">Could not load your initiatives.</p>}
      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-stone-100">
          {items.map((i) => (
            <li key={i.id}>
              <Link to={`/initiatives/${i.id}`} className="py-2.5 flex items-center gap-3 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 truncate group-hover:text-plum-700 transition-colors">{i.title}</p>
                  <p className="text-[11px] text-stone-500">{formatCents(i.amount_requested_cents)}</p>
                </div>
                <StatusPill status={i.status} />
                <ChevronRight className="w-4 h-4 text-stone-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setOpen(true)}
        disabled={hasActive}
        className="btn-primary !px-4 !py-2.5 text-sm mt-4 w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" />
        Submit an Initiative
      </button>
      {hasActive && <p className="text-[11px] text-stone-400 mt-2">One active initiative per organization at a time.</p>}

      <SubmitInitiativeSheet open={open} onClose={() => setOpen(false)} organizationId={organizationId} onSubmitted={load} />
    </section>
  );
}

function SubmitInitiativeSheet({ open, onClose, organizationId, onSubmitted }: {
  open: boolean; onClose: () => void; organizationId: string; onSubmitted: () => void;
}) {
  const [values, setValues] = useState<Record<FieldKey, string>>({ title: '', description: '', impact: '', timeline: '', conflictDisclosure: '' });
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues({ title: '', description: '', impact: '', timeline: '', conflictDisclosure: '' });
    setAmount('');
    setError(null);
  }, [open]);

  const amountCents = Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100);
  const fieldsValid = FIELDS.every((f) => values[f.key].trim().length >= f.min);
  const valid = fieldsValid && Number.isFinite(amountCents) && amountCents >= 100;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitInitiative({
        organizationId,
        title: values.title,
        description: values.description,
        impact: values.impact,
        timeline: values.timeline,
        conflictDisclosure: values.conflictDisclosure,
        amountCents,
      });
      onSubmitted();
      onClose();
    } catch (e) {
      setError(parseSupabaseError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title="Submit an Initiative" subtitle="An admin reviews every submission before it joins the Metro ranking.">
      <div className="flex flex-col gap-3.5 max-h-[60vh] overflow-y-auto pr-1 -mr-1">
        {FIELDS.slice(0, 1).map((f) => (
          <Field key={f.key} label={f.label} count={values[f.key].length} max={f.max}>
            <input value={values[f.key]} maxLength={f.max} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} placeholder={f.placeholder} className={inputClass} />
          </Field>
        ))}
        <Field label="Amount requested (USD)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,000" className={`${inputClass} pl-7`} />
          </div>
          <p className="text-[11px] text-stone-400 mt-1">Requests above your Metro's Available Treasury are not accepted.</p>
        </Field>
        {FIELDS.slice(1).map((f) => (
          <Field key={f.key} label={f.label} count={values[f.key].length} max={f.max}>
            <textarea rows={f.rows} value={values[f.key]} maxLength={f.max} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} placeholder={f.placeholder} className={inputClass} />
          </Field>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onClose} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">Cancel</button>
        <button onClick={submit} disabled={!valid || busy} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit for review
        </button>
      </div>
    </Sheet>
  );
}

function Field({ label, count, max, children }: { label: string; count?: number; max?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</label>
        {max != null && <span className="text-[10px] text-stone-400 tabular-nums">{count}/{max}</span>}
      </div>
      {children}
    </div>
  );
}
