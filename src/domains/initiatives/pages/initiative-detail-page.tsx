import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Heart, Loader2, Target, CalendarRange, ShieldAlert, FileText, History, Megaphone, Undo2, BadgeCheck, Trophy,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { useAuth } from '@/domains/identity/auth-context';
import { cn } from '@/shared/cn';
import { parseSupabaseError } from '@/shared/errors';
import { formatCents } from '@/domains/treasury/services';
import {
  fetchInitiativeDetail, toggleInitiativeBacking, withdrawInitiative, postInitiativeUpdate,
  STATUS_LABELS, type InitiativeDetail, type InitiativeStatus,
} from '@/domains/initiatives/services';
import { StatusPill, OutcomePill, OrgMark, ReasonSheet, EmptyState } from '@/domains/initiatives/components/initiative-ui';

const WITHDRAWABLE: InitiativeStatus[] = ['submitted', 'eligible', 'in_voting', 'awaiting_review', 'awaiting_funding', 'deferred'];

export default function InitiativeDetailPage() {
  const { id } = useParams();
  const { sessionVersion } = useAuth();
  const [item, setItem] = useState<InitiativeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [backing, setBacking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'withdraw' | 'update' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(false);
    try {
      setItem(await fetchInitiativeDetail(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load, sessionVersion]);

  const toggleBack = async () => {
    if (!item) return;
    setBacking(true);
    setActionError(null);
    try {
      const res = await toggleInitiativeBacking(item.id);
      setItem({ ...item, i_backed: res.backed, backer_count: res.backer_count });
    } catch (e) {
      setActionError(parseSupabaseError(e));
    } finally {
      setBacking(false);
    }
  };

  return (
    <Layout showTopBar>
      <div className="max-w-[880px] mx-auto w-full py-4 lg:py-8 flex flex-col gap-4 lg:gap-6">
        <Link to="/initiatives" className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Metro Initiatives
        </Link>

        {loading ? (
          <div className="flex flex-col gap-4 animate-pulse">
            <div className="h-32 rounded-2xl bg-stone-100" />
            <div className="h-48 rounded-2xl bg-stone-100" />
          </div>
        ) : error ? (
          <ErrorBanner message="Unable to load this initiative." onRetry={load} />
        ) : !item ? (
          <EmptyState icon={FileText} title="Initiative not found" body="It may still be under review, or it is no longer available." />
        ) : (
          <>
            <header className="frame-command p-5 lg:p-7">
              <div className="flex items-start gap-4">
                <OrgMark name={item.organization.name} imageUrl={item.organization.image_url} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={item.status} />
                    {item.staged_funding_approved && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-plum-600">Staged funding approved</span>
                    )}
                  </div>
                  <h1 className="text-2xl lg:text-3xl font-display font-bold text-stone-900 leading-tight mt-2">{item.title}</h1>
                  <Link to={`/market/organization/${item.organization.id}`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-plum-700 transition-colors mt-1">
                    {item.organization.name}
                    {item.organization.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-plum-600" />}
                    {item.metro && <span className="text-stone-400"> · {item.metro.name}</span>}
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                <Figure label="Requested" value={formatCents(item.amount_requested_cents)} />
                <Figure label="Released" value={formatCents(item.funded_cents)} accent={item.funded_cents > 0 ? 'text-emerald-700' : undefined} />
                <Figure label="Backers" value={item.backer_count.toLocaleString()} />
              </div>
              {item.funded_cents > 0 && (
                <div className="mt-3 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full transition-[width] duration-700"
                    style={{ width: `${Math.min(100, Math.round((item.funded_cents / item.amount_requested_cents) * 100))}%` }} />
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-5">
                {item.can_back && (
                  <button
                    onClick={toggleBack}
                    disabled={backing}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all active:scale-95',
                      item.i_backed ? 'bg-plum-700 border-plum-700 text-white hover:bg-plum-800' : 'bg-white border-stone-200 text-stone-800 hover:border-plum-300 hover:text-plum-700',
                    )}
                  >
                    {backing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={cn('w-4 h-4', item.i_backed && 'fill-current')} />}
                    {item.i_backed ? 'Backing' : 'Back this initiative'}
                  </button>
                )}
                {item.status === 'in_voting' && (
                  <Link to="/initiatives?tab=vote" className="btn-primary !px-4 !py-2.5 text-sm">Go to ballot</Link>
                )}
                {item.is_owner && item.funded_cents > 0 && (
                  <button onClick={() => setSheet('update')} className="btn-secondary !px-4 !py-2.5 text-sm">
                    <Megaphone className="w-4 h-4" /> Post progress report
                  </button>
                )}
                {item.is_owner && WITHDRAWABLE.includes(item.status) && item.funded_cents === 0 && (
                  <button onClick={() => setSheet('withdraw')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
                    <Undo2 className="w-4 h-4" /> Withdraw
                  </button>
                )}
              </div>
              {actionError && <p className="text-xs text-red-600 mt-2">{actionError}</p>}
              {item.is_owner && item.payment_reference && (
                <p className="text-[11px] text-stone-400 mt-3">Payment reference: {item.payment_reference}</p>
              )}
            </header>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
              <div className="flex flex-col gap-4">
                <Block icon={FileText} title="About this initiative" body={item.description} />
                <Block icon={Target} title="Expected impact" body={item.impact} />
                <Block icon={CalendarRange} title="Timeline" body={item.timeline} />
                <Block icon={ShieldAlert} title="Conflict of interest disclosure" body={item.conflict_disclosure} muted />
              </div>
              <div className="flex flex-col gap-4">
                {item.cycles.length > 0 && (
                  <section className="frame-command p-4 lg:p-5">
                    <SectionTitle icon={Trophy} title="Voting cycles" />
                    <ul className="flex flex-col gap-2.5">
                      {item.cycles.map((c) => (
                        <li key={c.cycle_id} className="rounded-xl border border-stone-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-stone-900">
                              {new Date(c.opens_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <OutcomePill outcome={c.outcome} />
                          </div>
                          <p className="text-[11px] text-stone-500 mt-1">
                            {c.status === 'open'
                              ? `On the ballot at #${c.frozen_rank}. Totals hidden until voting closes.`
                              : c.final_rank != null
                                ? `Finished #${c.final_rank} · ${c.support_ballots ?? 0} of ${c.ballot_count ?? 0} ballots`
                                : `Frozen at #${c.frozen_rank}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section className="frame-command p-4 lg:p-5">
                  <SectionTitle icon={History} title="History" />
                  <ol className="relative border-l border-stone-200 ml-1.5 flex flex-col gap-4">
                    {item.events.map((ev) => (
                      <li key={ev.id} className="pl-4 relative">
                        <span className={cn(
                          'absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white',
                          ev.event_type === 'progress_report' ? 'bg-emerald-500' : ev.event_type === 'funded' ? 'bg-emerald-600' : 'bg-plum-400',
                        )} />
                        <p className="text-xs font-semibold text-stone-900">{eventLabel(ev.event_type, ev.to_status)}</p>
                        {ev.note && <p className="text-xs text-stone-600 mt-0.5 leading-relaxed whitespace-pre-line">{ev.note}</p>}
                        <p className="text-[10px] text-stone-400 mt-0.5">
                          {new Date(ev.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          {ev.actor_name && ` · ${ev.actor_name}`}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </div>

            <ReasonSheet
              open={sheet === 'withdraw'}
              onClose={() => setSheet(null)}
              title="Withdraw initiative"
              subtitle="Withdrawn initiatives leave the ranking and any ballot. This cannot be undone."
              label="Reason"
              confirmLabel="Withdraw"
              danger
              minLength={3}
              onConfirm={async (reason) => { await withdrawInitiative(item.id, reason); await load(); }}
            />
            <ReasonSheet
              open={sheet === 'update'}
              onClose={() => setSheet(null)}
              title="Post a progress report"
              subtitle="Share what the funding has accomplished so far. Reports are public to members."
              label="Progress report"
              confirmLabel="Post report"
              minLength={10}
              onConfirm={async (note) => { await postInitiativeUpdate(item.id, note); await load(); }}
            />
          </>
        )}
      </div>
    </Layout>
  );
}

function eventLabel(type: string, to: string | null): string {
  const map: Record<string, string> = {
    submitted: 'Submitted',
    approved: 'Approved as eligible',
    entered_voting: 'Frozen onto the ballot',
    qualified: 'Qualified for funding review',
    not_qualified: 'Did not reach 10% support',
    no_quorum: 'Quorum not reached',
    awaiting_funding: 'Awaiting Funding',
    staged_funding_approved: 'Staged funding approved',
    staged_release: 'Funding stage released',
    funded: 'Funded',
    completed: 'Completed',
    progress_report: 'Progress report',
    cycle_cancelled: 'Voting cycle cancelled',
    withdrawn: 'Withdrawn',
    disqualified: 'Disqualified',
    deferred: 'Deferred',
  };
  return map[type] ?? (to && to in STATUS_LABELS ? STATUS_LABELS[to as InitiativeStatus] : 'Update');
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className={cn('text-lg font-display font-bold tabular-nums text-stone-900 mt-0.5', accent)}>{value}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-plum-600" />
      <h2 className="text-sm font-display font-bold text-stone-900">{title}</h2>
    </div>
  );
}

function Block({ icon, title, body, muted }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string; muted?: boolean }) {
  return (
    <section className={cn('p-4 lg:p-5', muted ? 'frame-utility' : 'frame-command')}>
      <SectionTitle icon={icon} title={title} />
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{body}</p>
    </section>
  );
}
