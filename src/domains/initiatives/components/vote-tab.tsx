import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Vote, Lock, Loader2, ShieldCheck, Sparkles, CalendarClock, Coins, Zap } from 'lucide-react';
import { cn } from '@/shared/cn';
import { parseSupabaseError } from '@/shared/errors';
import { formatCents } from '@/domains/treasury/services';
import { submitInitiativeBallot, MAX_BALLOT_SELECTIONS, type InitiativeHub, type ActiveCycle } from '@/domains/initiatives/services';
import { EmptyState, OrgMark, Sheet } from '@/domains/initiatives/components/initiative-ui';

export function VoteTab({ hub, onSubmitted }: { hub: InitiativeHub; onSubmitted: () => void }) {
  const cycle = hub.active_cycle;
  if (!cycle) {
    const last = hub.cycles[0];
    return (
      <EmptyState
        icon={CalendarClock}
        title="Voting is closed right now"
        body={`Ballots open on the 1st and 15th for 48 hours. ${
          hub.next_cycle_opens_at ? `Next window: ${new Date(hub.next_cycle_opens_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : ''
        }`}
      >
        {last?.status === 'skipped' && last.skip_reason && (
          <p className="text-[11px] text-stone-500 mt-3 max-w-sm mx-auto">Last cycle skipped: {last.skip_reason}</p>
        )}
      </EmptyState>
    );
  }
  if (!hub.me.in_metro) {
    return <EmptyState icon={Lock} title="Members of this Metro only" body="You can only vote on initiatives in your own Metro." />;
  }
  if (!hub.me.can_vote) {
    return (
      <EmptyState icon={Lock} title="Black Card members and above vote" body="Upgrade your membership to receive Voting Credits and help decide which initiatives get funded.">
        <Link to="/membership" className="btn-primary !px-5 !py-2.5 text-sm mt-4">View memberships</Link>
      </EmptyState>
    );
  }
  if (cycle.my_ballot) return <BallotReceipt cycle={cycle} />;
  return <Ballot hub={hub} cycle={cycle} onSubmitted={onSubmitted} />;
}

function Ballot({ hub, cycle, onSubmitted }: { hub: InitiativeHub; cycle: ActiveCycle; onSubmitted: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ credits: number; remaining: number } | null>(null);

  const limit = Math.min(MAX_BALLOT_SELECTIONS, hub.me.credits, cycle.entries.length);
  const cost = selected.length;
  const atLimit = cost >= limit;

  const toggle = (id: string) => {
    setError(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= limit ? s : [...s, id]));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await submitInitiativeBallot(cycle.id, selected);
      setDone({ credits: res.credits_spent, remaining: res.credits_remaining });
      setConfirming(false);
    } catch (e) {
      setError(parseSupabaseError(e));
    } finally {
      setBusy(false);
    }
  };

  const chosen = useMemo(() => cycle.entries.filter((e) => selected.includes(e.initiative_id)), [cycle.entries, selected]);

  if (done) {
    return (
      <div className="frame-command p-8 text-center animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
          <Check className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-stone-900 mt-4">Ballot submitted</h2>
        <p className="text-sm text-stone-500 mt-1">
          {done.credits} Voting Credit{done.credits === 1 ? '' : 's'} spent · {done.remaining} left
        </p>
        <span className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full bg-plum-50 border border-plum-200 text-plum-700 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" /> +25 Influence earned
        </span>
        <p className="text-xs text-stone-400 mt-4">Totals stay hidden until voting closes.</p>
        <button onClick={onSubmitted} className="btn-secondary !px-5 !py-2.5 text-sm mt-5">View my ballot</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Coins} label="Your credits" value={String(hub.me.credits)} />
        <Stat icon={Zap} label="Voting power" value={`${Number(hub.me.voting_power).toFixed(2)}x`} />
        <Stat icon={ShieldCheck} label="Quorum" value={`${cycle.quorum_required} ballots`} />
      </div>

      {hub.me.credits === 0 ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-xs text-orange-800 leading-relaxed">
          You have no Voting Credits left this month. Credits refresh with your monthly grant.
        </div>
      ) : (
        <p className="text-xs text-stone-500 leading-relaxed">
          Check every initiative you support. Each one costs 1 Voting Credit and receives your full Voting Power.
          You can submit one ballot per cycle, and it is final.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {cycle.entries.map((entry) => {
          const on = selected.includes(entry.initiative_id);
          const disabled = (!on && atLimit) || hub.me.credits === 0;
          return (
            <li key={entry.initiative_id}>
              <div
                role="checkbox"
                tabIndex={disabled ? -1 : 0}
                aria-checked={on}
                aria-disabled={disabled}
                onClick={() => !disabled && toggle(entry.initiative_id)}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
                    e.preventDefault();
                    toggle(entry.initiative_id);
                  }
                }}
                className={cn(
                  'w-full text-left frame-command p-4 flex items-start gap-3 sm:gap-4 transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-plum-300',
                  on ? 'ring-2 ring-plum-500 bg-plum-50/30' : 'hover:-translate-y-0.5',
                  disabled && 'opacity-50 cursor-not-allowed hover:translate-y-0',
                )}
              >
                <span className={cn(
                  'mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all',
                  on ? 'bg-plum-700 border-plum-700 scale-105' : 'border-stone-300 bg-white',
                )}>
                  {on && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </span>
                <OrgMark name={entry.organization_name} imageUrl={entry.organization_image_url} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-stone-400 tabular-nums">#{entry.frozen_rank}</span>
                    <span className="text-sm font-semibold text-stone-900">{entry.title}</span>
                  </span>
                  <span className="block text-xs text-stone-500 mt-0.5">{entry.organization_name} · {formatCents(entry.amount_requested_cents)}</span>
                  <span className="block text-xs text-stone-600 mt-2 line-clamp-2 leading-relaxed">{entry.impact}</span>
                </span>
                <Link
                  to={`/initiatives/${entry.initiative_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-semibold text-plum-600 hover:text-plum-800 shrink-0 mt-0.5"
                >
                  Details
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-4 z-10">
        <div className="frame-command p-3 sm:p-4 flex items-center gap-3 shadow-lg bg-white/95 backdrop-blur">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900">
              {cost} of {limit} selected
            </p>
            <p className="text-[11px] text-stone-500 truncate">
              {atLimit && limit < MAX_BALLOT_SELECTIONS && limit === hub.me.credits
                ? 'You have checked as many as your credits allow.'
                : '+25 Influence for completing your ballot'}
            </p>
          </div>
          <button
            onClick={() => setConfirming(true)}
            disabled={cost === 0}
            className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Vote className="w-4 h-4" />
            Submit Ballot ({cost} Credit{cost === 1 ? '' : 's'})
          </button>
        </div>
      </div>

      <Sheet open={confirming} onClose={() => !busy && setConfirming(false)} title="Confirm your ballot" subtitle="Ballots are final once submitted.">
        <ul className="flex flex-col gap-2">
          {chosen.map((e) => (
            <li key={e.initiative_id} className="flex items-center gap-2 text-sm text-stone-800">
              <Check className="w-4 h-4 text-plum-600 shrink-0" />
              <span className="truncate">{e.title}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600 flex justify-between">
          <span>Cost</span>
          <span className="font-semibold text-stone-900">{cost} Voting Credit{cost === 1 ? '' : 's'}</span>
        </div>
        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setConfirming(false)} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">Back</button>
          <button onClick={submit} disabled={busy} className="btn-primary !px-4 !py-2 text-sm">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit Ballot ({cost} Credit{cost === 1 ? '' : 's'})
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function BallotReceipt({ cycle }: { cycle: ActiveCycle }) {
  const ballot = cycle.my_ballot!;
  return (
    <div className="frame-command p-5 lg:p-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <Check className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900">Your ballot is in</p>
          <p className="text-xs text-stone-500">
            Submitted {new Date(ballot.submitted_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
            {ballot.credits_spent} credit{ballot.credits_spent === 1 ? '' : 's'} · {Number(ballot.voting_power).toFixed(2)}x power
          </p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-stone-100">
        {cycle.entries.map((e) => {
          const on = ballot.selections.includes(e.initiative_id);
          return (
            <li key={e.initiative_id} className="py-2.5 flex items-center gap-3">
              <span className={cn('w-5 h-5 rounded-md flex items-center justify-center shrink-0', on ? 'bg-plum-700' : 'border border-stone-200')}>
                {on && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </span>
              <span className={cn('text-sm truncate', on ? 'text-stone-900 font-semibold' : 'text-stone-400')}>{e.title}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-stone-400 mt-3">Totals stay hidden until voting closes. Results post on the 3rd and 17th.</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="frame-command p-3 sm:p-4">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 truncate">{label}</p>
      </div>
      <p className="text-base sm:text-lg font-display font-bold text-stone-900 tabular-nums mt-1">{value}</p>
    </div>
  );
}
