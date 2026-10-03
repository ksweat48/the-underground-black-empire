import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ChevronDown, Ban, SkipForward, Users, Check } from 'lucide-react';
import { cn } from '@/shared/cn';
import { formatCents } from '@/domains/treasury/services';
import type { InitiativeHub, PastCycle } from '@/domains/initiatives/services';
import { EmptyState, OutcomePill } from '@/domains/initiatives/components/initiative-ui';

const dateRange = (c: PastCycle) =>
  `${new Date(c.opens_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(c.closes_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

export function ResultsTab({ hub }: { hub: InitiativeHub }) {
  const [openId, setOpenId] = useState<string | null>(hub.cycles[0]?.id ?? null);

  if (hub.cycles.length === 0) {
    return <EmptyState icon={Trophy} title="No results yet" body="Results post on the 3rd and 17th, after each 48-hour voting window closes." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {hub.cycles.map((c) => (
        <CycleCard key={c.id} cycle={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
      ))}
    </div>
  );
}

function CycleCard({ cycle, open, onToggle }: { cycle: PastCycle; open: boolean; onToggle: () => void }) {
  const headline =
    cycle.status === 'skipped' ? 'Cycle skipped'
    : cycle.status === 'cancelled' ? 'Cycle cancelled'
    : cycle.quorum_met ? `${cycle.ballot_count ?? 0} ballots · quorum reached`
    : 'Quorum not reached';
  const Icon = cycle.status === 'skipped' ? SkipForward : cycle.status === 'cancelled' ? Ban : cycle.quorum_met ? Trophy : Users;
  const tone =
    cycle.status === 'results_posted' && cycle.quorum_met ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : cycle.status === 'cancelled' ? 'bg-red-50 border-red-200 text-red-600'
    : 'bg-stone-50 border-stone-200 text-stone-500';

  return (
    <section className="frame-command overflow-hidden">
      <button onClick={onToggle} className="w-full p-4 flex items-center gap-3 text-left hover:bg-stone-50/60 transition-colors" aria-expanded={open}>
        <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', tone)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900">{headline}</p>
          <p className="text-xs text-stone-500">{dateRange(cycle)}</p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 animate-fade-in">
          {cycle.status === 'skipped' && <Note text={cycle.skip_reason ?? 'This cycle was skipped.'} />}
          {cycle.status === 'cancelled' && (
            <Note text={`${cycle.cancel_reason ?? 'Cancelled by an administrator.'} All Voting Credits spent in this cycle were refunded.`} />
          )}
          {cycle.status === 'results_posted' && !cycle.quorum_met && (
            <Note text={`Quorum not reached: ${cycle.ballot_count ?? 0} of ${cycle.quorum_required ?? 0} ballots needed. Nothing is funded from this cycle, and all initiatives stay eligible.`} />
          )}

          {cycle.entries.length > 0 && cycle.status !== 'skipped' && (
            <ol className="mt-3 flex flex-col gap-2">
              {cycle.entries.map((e) => {
                const share = cycle.ballot_count ? Math.round((e.support_ballots / cycle.ballot_count) * 100) : 0;
                const mine = cycle.my_selections.includes(e.initiative_id);
                return (
                  <li key={e.initiative_id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-display font-bold tabular-nums shrink-0',
                        e.final_rank === 1 && cycle.quorum_met ? 'bg-plum-700 text-white' : 'bg-stone-100 text-stone-600',
                      )}>
                        {e.final_rank ?? e.frozen_rank}
                      </span>
                      <Link to={`/initiatives/${e.initiative_id}`} className="flex-1 min-w-0 group">
                        <p className="text-sm font-semibold text-stone-900 truncate group-hover:text-plum-700 transition-colors">{e.title}</p>
                        <p className="text-[11px] text-stone-500 truncate">{e.organization_name} · {formatCents(e.amount_requested_cents)}</p>
                      </Link>
                      <OutcomePill outcome={e.outcome} />
                    </div>
                    {cycle.status === 'results_posted' && (
                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden relative">
                          <div className={cn('h-full rounded-full transition-[width] duration-700', share >= 10 ? 'bg-emerald-600' : 'bg-stone-300')} style={{ width: `${share}%` }} />
                          <div className="absolute top-0 bottom-0 w-px bg-stone-400" style={{ left: '10%' }} title="10% minimum" />
                        </div>
                        <p className="text-[11px] text-stone-500 tabular-nums shrink-0 w-44 text-right">
                          {e.support_ballots} ballots ({share}%) · {Number(e.weighted_support).toFixed(2)} power
                        </p>
                      </div>
                    )}
                    {mine && (
                      <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-plum-600">
                        <Check className="w-3 h-3" /> You supported this
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {cycle.status === 'results_posted' && cycle.quorum_met && (
            <p className="text-[11px] text-stone-400 mt-3">
              Initiatives need support on at least 10% of ballots to qualify. Qualifying initiatives are funded in ranked order as the Treasury allows.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Note({ text }: { text: string }) {
  return <p className="text-xs text-stone-600 leading-relaxed rounded-xl bg-stone-50 border border-stone-200 p-3">{text}</p>;
}
