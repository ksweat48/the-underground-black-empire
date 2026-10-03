import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Vote, ListOrdered, Trophy, Landmark, Clock, Coins } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { useAuth } from '@/domains/identity/auth-context';
import { cn } from '@/shared/cn';
import { formatCents } from '@/domains/treasury/services';
import { fetchInitiativeHub, formatCountdown, type InitiativeHub } from '@/domains/initiatives/services';
import { useNow, EmptyState } from '@/domains/initiatives/components/initiative-ui';
import { RankingTab } from '@/domains/initiatives/components/ranking-tab';
import { VoteTab } from '@/domains/initiatives/components/vote-tab';
import { ResultsTab } from '@/domains/initiatives/components/results-tab';

const TABS = [
  { id: 'ranking', label: 'Ranking', icon: ListOrdered },
  { id: 'vote', label: 'Vote Now', icon: Vote },
  { id: 'results', label: 'Results', icon: Trophy },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function MetroInitiativesPage() {
  const { sessionVersion } = useAuth();
  const [params, setParams] = useSearchParams();
  const [hub, setHub] = useState<InitiativeHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const requested = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : hub?.active_cycle ? 'vote' : 'ranking';

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(false);
    try {
      setHub(await fetchInitiativeHub());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, sessionVersion]);
  const refresh = useCallback(() => load(true), [load]);

  return (
    <Layout showTopBar>
      <div className="max-w-[960px] mx-auto w-full py-4 lg:py-8 flex flex-col gap-4 lg:gap-6">
        <Link to="/empire" className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to HQ
        </Link>

        {loading ? (
          <HubSkeleton />
        ) : error ? (
          <ErrorBanner message="Unable to load Metro Initiatives." onRetry={() => load()} />
        ) : !hub ? (
          <EmptyState icon={Landmark} title="No Metro yet" body="Your city is not part of a Metro area yet, so there is no initiative ballot for you to join." />
        ) : (
          <>
            <HubHeader hub={hub} onCycleChange={refresh} />
            <div className="flex gap-1 p-1 rounded-2xl bg-stone-100 border border-stone-200 w-full sm:w-fit" role="tablist">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setParams({ tab: id }, { replace: true })}
                  className={cn(
                    'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                    tab === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900',
                  )}
                >
                  <Icon className={cn('w-4 h-4', tab === id && 'text-plum-600')} />
                  {label}
                  {id === 'vote' && hub.active_cycle && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-label="Voting open" />
                  )}
                </button>
              ))}
            </div>
            <div key={tab} className="animate-fade-in">
              {tab === 'ranking' && <RankingTab hub={hub} onChange={refresh} />}
              {tab === 'vote' && <VoteTab hub={hub} onSubmitted={refresh} />}
              {tab === 'results' && <ResultsTab hub={hub} />}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function HubHeader({ hub, onCycleChange }: { hub: InitiativeHub; onCycleChange: () => void }) {
  const now = useNow();
  const cycle = hub.active_cycle;
  const target = cycle ? cycle.closes_at : hub.next_cycle_opens_at;
  const remaining = target ? new Date(target).getTime() - now : 0;
  const expired = Boolean(target) && remaining <= 0;

  useEffect(() => {
    if (!expired) return;
    const id = window.setTimeout(onCycleChange, 90_000);
    return () => window.clearTimeout(id);
  }, [expired, onCycleChange]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-plum-600">Metro Initiatives</p>
        <h1 className="text-2xl lg:text-4xl font-display font-bold text-stone-900 leading-tight mt-1">
          {hub.metro.name}
          {hub.metro.state && <span className="text-stone-400 font-semibold"> · {hub.metro.state}</span>}
        </h1>
        <p className="text-sm text-stone-500 mt-1 leading-relaxed max-w-xl">
          Local organizations ask for Treasury funding. Members back the ones they believe in, then vote on the Top 5 twice a month.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:w-[380px]">
        <div className={cn('frame-command p-4', cycle && 'ring-1 ring-emerald-200')}>
          <div className="flex items-center gap-1.5">
            <Clock className={cn('w-3.5 h-3.5', cycle ? 'text-emerald-600' : 'text-stone-500')} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {cycle ? 'Voting closes in' : 'Next vote opens in'}
            </p>
          </div>
          <p className="text-lg font-display font-bold text-stone-900 tabular-nums mt-1.5 leading-tight">
            {target ? (expired ? 'Updating…' : formatCountdown(remaining)) : '—'}
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5 truncate">{hub.metro.timezone.replace('_', ' ')}</p>
        </div>
        <Link to={`/treasury/${hub.metro.id}`} className="frame-command p-4 group transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-stone-500" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Available</p>
          </div>
          <p className="text-lg font-display font-bold text-emerald-700 tabular-nums mt-1.5 leading-tight">{formatCents(hub.available_cents)}</p>
          <p className="text-[10px] text-stone-400 mt-0.5 group-hover:text-plum-600 transition-colors">View Treasury</p>
        </Link>
      </div>
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-24 rounded-2xl bg-stone-100" />
      <div className="h-11 w-72 rounded-2xl bg-stone-100" />
      {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-stone-100" />)}
    </div>
  );
}
