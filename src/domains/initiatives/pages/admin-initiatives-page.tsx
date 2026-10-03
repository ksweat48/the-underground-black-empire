import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ClipboardCheck, Banknote, CalendarClock, CheckCircle2, XCircle, PauseCircle, Layers, Ban, Loader2, ChevronDown, Flag,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { cn } from '@/shared/cn';
import { parseSupabaseError } from '@/shared/errors';
import { formatCents } from '@/domains/treasury/services';
import {
  fetchAdminInitiativeOverview, adminReviewInitiative, adminSetInitiativeOutcome, adminReleaseInitiativeFunding,
  adminCompleteInitiative, adminCancelInitiativeCycle,
  type AdminInitiativeOverview, type AdminReviewItem, type AdminFundingItem, type AdminCycleItem,
} from '@/domains/initiatives/services';
import { StatusPill, OutcomePill, ReasonSheet, Sheet } from '@/domains/initiatives/components/initiative-ui';

type Action =
  | { kind: 'disqualify_review'; item: AdminReviewItem }
  | { kind: 'outcome'; item: AdminFundingItem; action: 'disqualify' | 'defer' | 'approve_staged' }
  | { kind: 'release'; item: AdminFundingItem }
  | { kind: 'complete'; id: string; title: string }
  | { kind: 'cancel'; cycle: AdminCycleItem };

const OUTCOME_COPY = {
  disqualify: { title: 'Disqualify (failed review)', confirm: 'Disqualify', danger: true },
  defer: { title: 'Defer initiative', confirm: 'Defer', danger: false },
  approve_staged: { title: 'Approve staged funding', confirm: 'Approve staged funding', danger: false },
} as const;

export default function AdminInitiativesPage() {
  const [data, setData] = useState<AdminInitiativeOverview | null>(null);
  const [error, setError] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await fetchAdminInitiativeOverview());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (item: AdminReviewItem) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      await adminReviewInitiative(item.id, 'approve', '');
      await load();
    } catch (e) {
      setNotice(parseSupabaseError(e));
    } finally {
      setBusyId(null);
    }
  };

  const close = () => setAction(null);
  const done = async (msg?: string) => { if (msg) setNotice(msg); await load(); };

  return (
    <Layout showTopBar>
      <div className="max-w-[1080px] mx-auto w-full py-4 lg:py-8 flex flex-col gap-5 lg:gap-6">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Admin
        </Link>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-plum-600">Admin Console</p>
          <h1 className="text-2xl lg:text-4xl font-display font-bold text-stone-900 leading-tight mt-1">Metro Initiatives</h1>
          <p className="text-sm text-stone-500 mt-1">Review submissions, release funding in vote order and monitor every voting cycle.</p>
        </div>
        {notice && <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">{notice}</div>}

        {error ? (
          <ErrorBanner message="Unable to load the initiative console." onRetry={load} />
        ) : !data ? (
          <div className="flex flex-col gap-4 animate-pulse">{[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-stone-100" />)}</div>
        ) : (
          <>
            <Section icon={ClipboardCheck} title="Review queue" count={data.review_queue.length} subtitle="New and deferred submissions waiting for approval.">
              {data.review_queue.length === 0 ? <Empty text="Nothing waiting for review." /> : (
                <ul className="flex flex-col gap-3">
                  {data.review_queue.map((item) => (
                    <ReviewRow key={item.id} item={item} busy={busyId === item.id}
                      onApprove={() => approve(item)} onDisqualify={() => setAction({ kind: 'disqualify_review', item })} />
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={Banknote} title="Funding queue" count={data.funding_queue.length} subtitle="Qualifying initiatives in ranked order. Only the next in line can be released.">
              {data.funding_queue.length === 0 ? <Empty text="No initiatives waiting for funding." /> : (
                <ul className="flex flex-col gap-3">
                  {data.funding_queue.map((item) => (
                    <FundingRow key={`${item.cycle_id}:${item.initiative_id}`} item={item}
                      onRelease={() => setAction({ kind: 'release', item })}
                      onOutcome={(a) => setAction({ kind: 'outcome', item, action: a })} />
                  ))}
                </ul>
              )}
            </Section>

            {data.funded.length > 0 && (
              <Section icon={Flag} title="Funded — in progress" count={data.funded.length} subtitle="Mark initiatives complete once their work is delivered.">
                <ul className="divide-y divide-stone-100">
                  {data.funded.map((f) => (
                    <li key={f.id} className="py-3 flex items-center gap-3">
                      <Link to={`/initiatives/${f.id}`} className="flex-1 min-w-0 group">
                        <p className="text-sm font-semibold text-stone-900 truncate group-hover:text-plum-700">{f.title}</p>
                        <p className="text-[11px] text-stone-500 truncate">{f.organization_name} · {formatCents(f.funded_cents)} · ref {f.payment_reference ?? '—'}</p>
                      </Link>
                      <button onClick={() => setAction({ kind: 'complete', id: f.id, title: f.title })} className="btn-secondary !px-3 !py-1.5 text-xs">Mark complete</button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section icon={CalendarClock} title="Cycle monitor" count={data.cycles.length} subtitle="Every Metro's recent voting cycles.">
              {data.cycles.length === 0 ? <Empty text="No cycles have run yet. Cycles open automatically on the 1st and 15th." /> : (
                <div className="overflow-x-auto -mx-4 lg:-mx-5">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-100">
                        <th className="px-4 lg:px-5 py-2">Metro</th><th className="py-2">Window</th><th className="py-2">Status</th>
                        <th className="py-2 text-right">Ballots / Quorum</th><th className="py-2 text-right">Eligible</th><th className="px-4 lg:px-5 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {data.cycles.map((c) => (
                        <tr key={c.id} className="align-top">
                          <td className="px-4 lg:px-5 py-3 font-semibold text-stone-900">{c.metro_name}</td>
                          <td className="py-3 text-stone-600 text-xs whitespace-nowrap">
                            {new Date(c.opens_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(c.closes_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="py-3">
                            <CycleBadge cycle={c} />
                            {(c.skip_reason || c.cancel_reason) && <p className="text-[11px] text-stone-500 mt-1 max-w-[240px]">{c.skip_reason ?? c.cancel_reason}</p>}
                          </td>
                          <td className="py-3 text-right tabular-nums text-stone-700">{c.status === 'skipped' ? '—' : `${c.ballot_count ?? 0} / ${c.quorum_required ?? 0}`}</td>
                          <td className="py-3 text-right tabular-nums text-stone-700">{c.eligible_voter_count ?? '—'}</td>
                          <td className="px-4 lg:px-5 py-3 text-right">
                            {c.can_cancel && (
                              <button onClick={() => setAction({ kind: 'cancel', cycle: c })} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700">
                                <Ban className="w-3.5 h-3.5" /> Cancel Cycle
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </div>

      <ReasonSheet
        open={action?.kind === 'disqualify_review'}
        onClose={close}
        title="Disqualify submission"
        subtitle={action?.kind === 'disqualify_review' ? action.item.title : undefined}
        label="Reason (shared with the organization)"
        confirmLabel="Disqualify"
        danger
        onConfirm={async (r) => { if (action?.kind === 'disqualify_review') { await adminReviewInitiative(action.item.id, 'disqualify', r); await done(); } }}
      />
      <ReasonSheet
        open={action?.kind === 'outcome'}
        onClose={close}
        title={action?.kind === 'outcome' ? OUTCOME_COPY[action.action].title : ''}
        subtitle={action?.kind === 'outcome'
          ? action.action === 'approve_staged'
            ? `${action.item.title}: allows releasing funds in stages instead of all at once.`
            : `${action.item.title}: the next-ranked initiative moves up the funding queue.`
          : undefined}
        label="Written reason"
        confirmLabel={action?.kind === 'outcome' ? OUTCOME_COPY[action.action].confirm : ''}
        danger={action?.kind === 'outcome' && OUTCOME_COPY[action.action].danger}
        onConfirm={async (r) => { if (action?.kind === 'outcome') { await adminSetInitiativeOutcome(action.item.cycle_id, action.item.initiative_id, action.action, r); await done(); } }}
      />
      <ReasonSheet
        open={action?.kind === 'complete'}
        onClose={close}
        title="Mark initiative complete"
        subtitle={action?.kind === 'complete' ? action.title : undefined}
        label="Completion note"
        confirmLabel="Mark complete"
        onConfirm={async (n) => { if (action?.kind === 'complete') { await adminCompleteInitiative(action.id, n); await done(); } }}
      />
      <ReasonSheet
        open={action?.kind === 'cancel'}
        onClose={close}
        title="Cancel voting cycle"
        subtitle="Only for a system or admin error. Every Voting Credit spent is refunded, the +25 Influence is reversed, and the Metro is notified."
        label="Describe the error"
        confirmLabel="Cancel cycle and refund"
        minLength={10}
        danger
        onConfirm={async (r) => {
          if (action?.kind === 'cancel') {
            const n = await adminCancelInitiativeCycle(action.cycle.id, r);
            await done(`Cycle cancelled. ${n} ballot${n === 1 ? '' : 's'} refunded.`);
          }
        }}
      />
      <ReleaseSheet item={action?.kind === 'release' ? action.item : null} onClose={close} onDone={() => done('Funding released and recorded on the Metro Treasury.')} />
    </Layout>
  );
}

function ReviewRow({ item, busy, onApprove, onDisqualify }: { item: AdminReviewItem; busy: boolean; onApprove: () => void; onDisqualify: () => void }) {
  const [open, setOpen] = useState(false);
  const overBudget = item.amount_requested_cents > item.metro_available_cents;
  return (
    <li className="rounded-xl border border-stone-200">
      <div className="p-3 flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(!open)} className="flex-1 min-w-[200px] text-left flex items-center gap-2" aria-expanded={open}>
          <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform shrink-0', open && 'rotate-180')} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-stone-900 truncate">{item.title}</span>
            <span className="block text-[11px] text-stone-500 truncate">
              {item.organization_name} · {item.metro_name} · {formatCents(item.amount_requested_cents)}
              <span className={overBudget ? 'text-red-600' : ''}> (Available {formatCents(item.metro_available_cents)})</span>
            </span>
          </span>
        </button>
        <StatusPill status={item.status} />
        <div className="flex gap-2">
          <button onClick={onDisqualify} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">
            <XCircle className="w-3.5 h-3.5" /> Disqualify
          </button>
          <button onClick={onApprove} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve
          </button>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2 text-xs text-stone-700 animate-fade-in">
          <Detail label="Description" text={item.description} />
          <Detail label="Expected impact" text={item.impact} />
          <Detail label="Timeline" text={item.timeline} />
          <Detail label="Conflict disclosure" text={item.conflict_disclosure} />
        </div>
      )}
    </li>
  );
}

function FundingRow({ item, onRelease, onOutcome }: {
  item: AdminFundingItem; onRelease: () => void; onOutcome: (a: 'disqualify' | 'defer' | 'approve_staged') => void;
}) {
  const remaining = item.amount_requested_cents - item.funded_cents;
  const fundable = item.staged_funding_approved ? item.metro_available_cents > 0 : item.metro_available_cents >= remaining;
  const share = item.ballot_count ? Math.round((item.support_ballots / item.ballot_count) * 100) : 0;
  return (
    <li className={cn('rounded-xl border p-3', item.is_next ? 'border-plum-200 bg-plum-50/20' : 'border-stone-200')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center text-xs font-display font-bold shrink-0">#{item.final_rank}</span>
        <div className="flex-1 min-w-[200px]">
          <Link to={`/initiatives/${item.initiative_id}`} className="text-sm font-semibold text-stone-900 hover:text-plum-700">{item.title}</Link>
          <p className="text-[11px] text-stone-500">
            {item.organization_name} · {item.metro_name} · {share}% of ballots · {Number(item.weighted_support).toFixed(2)} power
          </p>
          <p className="text-[11px] text-stone-500">
            Remaining {formatCents(remaining)} of {formatCents(item.amount_requested_cents)} · Available {formatCents(item.metro_available_cents)}
            {item.staged_funding_approved && <span className="text-plum-600 font-semibold"> · Staged</span>}
          </p>
        </div>
        <OutcomePill outcome={item.outcome} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3 justify-end">
        <button onClick={() => onOutcome('defer')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-600 hover:bg-stone-100">
          <PauseCircle className="w-3.5 h-3.5" /> Defer
        </button>
        <button onClick={() => onOutcome('disqualify')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">
          <XCircle className="w-3.5 h-3.5" /> Fails review
        </button>
        {!item.staged_funding_approved && (
          <button onClick={() => onOutcome('approve_staged')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-plum-700 hover:bg-plum-50">
            <Layers className="w-3.5 h-3.5" /> Approve staged
          </button>
        )}
        <button
          onClick={onRelease}
          disabled={!item.is_next || !fundable}
          title={!item.is_next ? 'A higher-ranked initiative is still waiting' : !fundable ? 'Available Treasury cannot cover this request' : undefined}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Banknote className="w-3.5 h-3.5" /> Verify &amp; release
        </button>
      </div>
    </li>
  );
}

function ReleaseSheet({ item, onClose, onDone }: { item: AdminFundingItem | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = item ? item.amount_requested_cents - item.funded_cents : 0;

  useEffect(() => {
    if (!item) return;
    setAmount(((item.amount_requested_cents - item.funded_cents) / 100).toFixed(2));
    setReference('');
    setVerified(false);
    setError(null);
  }, [item]);

  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100);
  const valid = verified && reference.trim().length >= 3 && cents > 0 && cents <= remaining
    && (item?.staged_funding_approved || cents === remaining);

  const submit = async () => {
    if (!item || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await adminReleaseInitiativeFunding(item.cycle_id, item.initiative_id, cents, reference.trim());
      onDone();
      onClose();
    } catch (e) {
      setError(parseSupabaseError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!item} onClose={() => !busy && onClose()} title="Release funding" subtitle={item ? `${item.title} · ${item.organization_name}` : undefined}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">Amount (USD)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!item?.staged_funding_approved} inputMode="decimal"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-900 disabled:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-plum-200" />
          <p className="text-[11px] text-stone-400 mt-1">
            {item?.staged_funding_approved ? `Staged: up to ${formatCents(remaining)}.` : 'Full request only. Approve staged funding to release partial amounts.'}
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">Payment reference</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="e.g. ACH-20261003-0042"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-plum-200" />
        </div>
        <label className="flex items-start gap-2 text-xs text-stone-700 cursor-pointer">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 accent-stone-900" />
          I verified the organization, the final compliance review, and the payment details.
        </label>
      </div>
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onClose} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">Cancel</button>
        <button onClick={submit} disabled={!valid || busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Release {cents > 0 ? formatCents(cents) : ''}
        </button>
      </div>
    </Sheet>
  );
}

function CycleBadge({ cycle }: { cycle: AdminCycleItem }) {
  const map = {
    open: ['Voting open', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    results_posted: [cycle.quorum_met ? 'Results posted' : 'Quorum not reached', cycle.quorum_met ? 'bg-plum-50 text-plum-700 border-plum-200' : 'bg-stone-50 text-stone-600 border-stone-200'],
    skipped: ['Skipped', 'bg-stone-50 text-stone-500 border-stone-200'],
    cancelled: ['Cancelled', 'bg-red-50 text-red-700 border-red-200'],
  } as const;
  const [label, style] = map[cycle.status];
  return <span className={cn('inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider', style)}>{label}</span>;
}

function Section({ icon: Icon, title, subtitle, count, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; count: number; children: React.ReactNode;
}) {
  return (
    <section className="frame-command p-4 lg:p-5">
      <div className="flex items-start gap-3 mb-4">
        <Icon className="w-5 h-5 text-plum-600 mt-0.5" />
        <div className="flex-1">
          <h2 className="text-base font-display font-bold text-stone-900 leading-tight">
            {title} <span className="text-stone-400 font-semibold tabular-nums">{count}</span>
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-0.5">{label}</p>
      <p className="leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-stone-500 py-4 text-center">{text}</p>;
}
