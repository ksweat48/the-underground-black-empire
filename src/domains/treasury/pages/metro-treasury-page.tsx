import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Landmark, Lock, Unlock, Building2, Users, PartyPopper, X, ShieldCheck, Infinity as InfinityIcon, Vote, ChevronRight } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { useAuth } from '@/domains/identity/auth-context';
import { cn } from '@/shared/cn';
import { TREASURY_CAPACITY_BANDS, QUALIFIED_METRO_MIN_MEMBERS } from '@/config/progression-rules';
import {
  fetchMemberMetroId,
  fetchMetroTreasury,
  formatCents,
  type MetroTreasury,
} from '@/domains/treasury/services';
import { TreasuryCityList, TreasuryReleases, TreasuryMilestones } from '@/domains/treasury/components/treasury-sections';

const seenKey = (metroId: string) => `ube:treasury-band-seen:${metroId}`;

export default function MetroTreasuryPage() {
  const { metroId: routeMetroId } = useParams();
  const { session, sessionVersion } = useAuth();
  const memberId = session?.user.id ?? null;
  const [treasury, setTreasury] = useState<MetroTreasury | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [noMetro, setNoMetro] = useState(false);
  const [celebrateBand, setCelebrateBand] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNoMetro(false);
    try {
      const metroId = routeMetroId ?? (memberId ? await fetchMemberMetroId(memberId) : null);
      if (!metroId) {
        setNoMetro(true);
        setTreasury(null);
        return;
      }
      const t = await fetchMetroTreasury(metroId);
      if (!t) {
        setNoMetro(true);
        setTreasury(null);
        return;
      }
      setTreasury(t);
      const seen = Number(localStorage.getItem(seenKey(t.metro_id)) ?? '0');
      if (t.capacity_band > seen) setCelebrateBand(t.capacity_band);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [routeMetroId, memberId]);

  useEffect(() => { load(); }, [load, sessionVersion]);

  const dismissCelebration = () => {
    if (treasury) localStorage.setItem(seenKey(treasury.metro_id), String(treasury.capacity_band));
    setCelebrateBand(null);
  };

  return (
    <Layout showTopBar>
      <div className="max-w-[960px] mx-auto w-full py-4 lg:py-8 flex flex-col gap-4 lg:gap-6">
        <Link
          to="/empire"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to HQ
        </Link>

        {loading ? (
          <TreasurySkeleton />
        ) : error ? (
          <ErrorBanner message="Unable to load the Metro Treasury." onRetry={load} />
        ) : noMetro || !treasury ? (
          <div className="frame-intel p-8 text-center">
            <Landmark className="w-6 h-6 text-stone-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-stone-900">No Metro Treasury yet</p>
            <p className="text-xs text-stone-500 mt-1">Your city is not part of a Metro area yet.</p>
          </div>
        ) : (
          <>
            {celebrateBand != null && (
              <CapacityCelebration treasury={treasury} onDismiss={dismissCelebration} />
            )}
            <TreasuryHeader treasury={treasury} />
            <BalanceTiles treasury={treasury} />
            <CapacityCard treasury={treasury} />
            <Link
              to="/initiatives"
              className="frame-command p-4 lg:p-5 flex items-center gap-4 group transition-all hover:-translate-y-0.5"
            >
              <div className="w-11 h-11 rounded-xl bg-plum-50 border border-plum-200 flex items-center justify-center shrink-0">
                <Vote className="w-5 h-5 text-plum-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900">Metro Initiatives</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  Members decide how Available funds are released. Vote on the 1st and 15th; results post on the 3rd and 17th.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-plum-600 transition-colors shrink-0" />
            </Link>
            <TreasuryCityList cities={treasury.cities} totalRaisedCents={treasury.total_raised_cents} />
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              <TreasuryReleases releases={treasury.releases} />
              <TreasuryMilestones milestones={treasury.milestones} />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function TreasuryHeader({ treasury }: { treasury: MetroTreasury }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-plum-600">Metro Treasury</p>
        <h1 className="text-2xl lg:text-4xl font-display font-bold text-stone-900 leading-tight mt-1">
          {treasury.metro_name}
          {treasury.state && <span className="text-stone-400 font-semibold"> · {treasury.state}</span>}
        </h1>
        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
          Every city in this Metro pools its contributions here.
        </p>
      </div>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 self-start sm:self-auto px-2.5 py-1 rounded-full text-[11px] font-semibold border',
          treasury.qualified
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-stone-50 text-stone-600 border-stone-200',
        )}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        {treasury.qualified ? 'Qualified Metro' : `Qualifies at ${QUALIFIED_METRO_MIN_MEMBERS} members`}
      </span>
    </div>
  );
}

function BalanceTiles({ treasury }: { treasury: MetroTreasury }) {
  const tiles = [
    { label: 'Available', value: treasury.available_cents, hint: 'Ready for approved initiatives', accent: 'text-emerald-700', icon: Unlock },
    { label: 'Reserved', value: treasury.reserved_cents, hint: 'Held above current capacity', accent: 'text-plum-700', icon: Lock },
    { label: 'Total Raised', value: treasury.total_raised_cents, hint: 'All-time, after refunds', accent: 'text-stone-900', icon: Landmark },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {tiles.map(({ label, value, hint, accent, icon: Icon }, i) => (
        <div
          key={label}
          className="frame-command p-4 lg:p-5 animate-fade-in"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-stone-500" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</p>
          </div>
          <p className={cn('text-2xl lg:text-3xl font-display font-bold tabular-nums mt-2 leading-tight', accent)}>
            {formatCents(value)}
          </p>
          <p className="text-[11px] text-stone-500 mt-1">{hint}</p>
        </div>
      ))}
    </div>
  );
}

function CapacityCard({ treasury }: { treasury: MetroTreasury }) {
  const next = treasury.next_band;
  const prevThreshold = TREASURY_CAPACITY_BANDS[treasury.capacity_band]?.minPopulation ?? 0;
  const progress = next
    ? Math.min(100, Math.max(0, Math.round(((treasury.population - prevThreshold) / (next.population_threshold - prevThreshold)) * 100)))
    : 100;

  return (
    <div className="frame-command p-4 lg:p-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:gap-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Unlocked Capacity</p>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-3xl font-display font-bold text-stone-900 tabular-nums">
              {treasury.capacity_unlimited ? 'No cap' : formatCents(treasury.capacity_cents ?? 0)}
            </p>
            {treasury.capacity_band > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-plum-50 border border-plum-200 text-plum-700 text-[10px] font-semibold uppercase tracking-wider">
                <Lock className="w-3 h-3" />
                Permanent
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-2 leading-relaxed">
            {treasury.capacity_band > 0
              ? `Unlocked${treasury.capacity_unlocked_at ? ` on ${new Date(treasury.capacity_unlocked_at).toLocaleDateString()}` : ''}. Capacity only goes up — it never drops, even if membership falls.`
              : 'All contributions stay Reserved until this Metro reaches 100 active members.'}
          </p>
          <div className="flex items-center gap-2 mt-4">
            <Users className="w-4 h-4 text-stone-500" />
            <p className="text-sm text-stone-700">
              <span className="font-semibold tabular-nums text-stone-900">{treasury.population.toLocaleString()}</span> active members today
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4">
          {next ? (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-stone-900">
                  Next unlock: {next.capacity_cents == null ? 'no cap' : formatCents(next.capacity_cents)}
                </p>
                <p className="text-xs text-stone-500 tabular-nums">{progress}%</p>
              </div>
              <div className="progress-track mt-2 !h-2.5">
                <div className="progress-fill" style={{ width: `${progress}%` }}>
                  <span className="progress-shimmer" aria-hidden="true" />
                </div>
              </div>
              <p className="text-xs text-stone-500 mt-2 tabular-nums">
                {next.members_needed > 0
                  ? `${next.members_needed.toLocaleString()} more members needed (at ${next.population_threshold.toLocaleString()})`
                  : `Unlocks at ${next.population_threshold.toLocaleString()} members`}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-700">
              <InfinityIcon className="w-5 h-5" />
              <p className="text-sm font-semibold">Every capacity level unlocked</p>
            </div>
          )}
          <BandLadder unlockedBand={treasury.capacity_band} />
        </div>
      </div>
    </div>
  );
}

function BandLadder({ unlockedBand }: { unlockedBand: number }) {
  const bands = TREASURY_CAPACITY_BANDS.filter((b) => b.band > 0);
  return (
    <div className="grid grid-cols-6 gap-1.5" aria-label="Treasury capacity levels">
      {bands.map((b) => {
        const unlocked = b.band <= unlockedBand;
        return (
          <div
            key={b.band}
            title={`${b.minPopulation.toLocaleString()}+ members`}
            className={cn(
              'rounded-md border px-1 py-1.5 text-center transition-colors',
              unlocked ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-50 border-stone-200',
            )}
          >
            <p className={cn('text-[10px] font-bold tabular-nums', unlocked ? 'text-emerald-700' : 'text-stone-500')}>
              {b.capacityCents == null ? 'No cap' : `$${b.capacityCents / 100000}k`}
            </p>
            <p className="text-[8px] text-stone-400 tabular-nums">{b.minPopulation.toLocaleString()}+</p>
          </div>
        );
      })}
    </div>
  );
}

function CapacityCelebration({ treasury, onDismiss }: { treasury: MetroTreasury; onDismiss: () => void }) {
  return (
    <div className="frame-command relative overflow-hidden p-4 lg:p-5 border-emerald-300/60 animate-fade-in">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-50 via-white to-plum-50 pointer-events-none" aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 animate-bounce">
          <PartyPopper className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-display font-bold text-stone-900">
            {treasury.metro_name} unlocked {treasury.capacity_unlimited ? 'full Treasury capacity' : `${formatCents(treasury.capacity_cents ?? 0)} in Treasury capacity`}
          </p>
          <p className="text-xs text-stone-600 mt-1 leading-relaxed">
            This milestone is permanent. Reserved funds now flow into Available up to the new limit.
          </p>
        </div>
        <button onClick={onDismiss} className="p-1 rounded-md text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TreasurySkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-10 w-2/3 rounded bg-stone-100" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <div key={i} className="frame-intel h-28" />)}
      </div>
      <div className="frame-intel h-48" />
      <div className="frame-intel h-40 flex items-center justify-center">
        <Building2 className="w-5 h-5 text-stone-300" />
      </div>
    </div>
  );
}
