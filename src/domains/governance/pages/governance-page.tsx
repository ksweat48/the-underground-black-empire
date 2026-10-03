import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Crown,
  Users,
  Vote,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Scale,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchEAC,
  fetchEmpireInitiatives,
  type EACSeat,
  type EmpireInitiative,
} from '@/domains/governance/services';
import { fetchMetroCouncil, type MetroCouncilMember } from '@/domains/leadership/services';
import { fetchMemberMetroId } from '@/domains/treasury/services';

export default function GovernancePage() {
  const { session, sessionVersion } = useAuth();
  const memberId = session?.user.id ?? null;
  const [eac, setEac] = useState<EACSeat[]>([]);
  const [council, setCouncil] = useState<MetroCouncilMember[]>([]);
  const [initiatives, setInitiatives] = useState<EmpireInitiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [eacData, initiativesData] = await Promise.all([
        fetchEAC(),
        fetchEmpireInitiatives(20),
      ]);
      setEac(eacData);
      setInitiatives(initiativesData);

      if (memberId) {
        const metroId = await fetchMemberMetroId(memberId);
        if (metroId) {
          const councilData = await fetchMetroCouncil(metroId);
          setCouncil(councilData);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { load(); }, [load, sessionVersion]);

  if (loading) {
    return (
      <Layout showTopBar>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout showTopBar>
        <div className="flex items-center justify-center py-20">
          <ErrorBanner message="Unable to load governance data." onRetry={load} />
        </div>
      </Layout>
    );
  }

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

        <div>
          <div className="flex items-center gap-3">
            <Scale className="w-7 h-7 text-stone-700" />
            <h1 className="text-2xl lg:text-4xl font-display font-bold text-stone-900">Governance</h1>
          </div>
          <p className="text-sm text-stone-500 mt-2">
            The Empire Advisory Council and your Metro Council.
          </p>
        </div>

        <EACSection seats={eac} />

        <MetroCouncilSection council={council} />

        <EmpireInitiativesSection initiatives={initiatives} />
      </div>
    </Layout>
  );
}

function EACSection({ seats }: { seats: EACSeat[] }) {
  const filledSeats = seats.filter((s) => !s.is_vacant).length;

  return (
    <section className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Crown className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Empire Advisory Council</p>
      </div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-display font-bold text-stone-900">11 Council Seats</h2>
        <span className="text-xs text-stone-500 tabular-nums">{filledSeats} filled · {seats.length - filledSeats} vacant</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {seats.map((seat) => (
          <div
            key={seat.seat_number}
            className={cn(
              'frame-intel p-3 flex items-center gap-3 transition-colors',
              seat.is_vacant && 'border-dashed',
            )}
          >
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              seat.is_vacant ? 'bg-stone-50 border border-stone-200' : 'bg-plum-50 border border-plum-200',
            )}>
              {seat.is_vacant ? (
                <Users className="w-4 h-4 text-stone-400" />
              ) : (
                <span className="text-xs font-bold text-plum-700">{seat.seat_number}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-900 truncate">{seat.role_label}</p>
              {seat.is_vacant ? (
                <p className="text-[10px] text-stone-400">Seat {seat.seat_number} · Vacant</p>
              ) : (
                <p className="text-[10px] text-stone-500">
                  {seat.member_name ?? 'Unknown'} · Seat {seat.seat_number}
                </p>
              )}
            </div>
            {seat.is_vacant ? (
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Vacant</span>
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500 mt-4 leading-relaxed">
        The EAC approves Empire-wide initiatives. 7 of 11 members must approve before
        an initiative goes to a full member vote.
      </p>
    </section>
  );
}

function MetroCouncilSection({ council }: { council: MetroCouncilMember[] }) {
  return (
    <section className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Metro Council</p>
      </div>
      <h2 className="text-lg font-display font-bold text-stone-900 mb-4">7 Council Seats</h2>

      {council.length === 0 ? (
        <div className="frame-intel p-4 text-center">
          <p className="text-sm text-stone-500">No council members have been seated yet.</p>
          <p className="text-xs text-stone-400 mt-1">Council members are elected every 6 months.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {council.map((member, i) => (
            <div key={member.member_id} className="frame-intel p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-emerald-700">{member.seat_number}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">
                  {member.display_name ?? 'Unknown'}
                </p>
                <p className="text-[10px] text-stone-500">
                  Seat {member.seat_number} · Level {member.level} · {member.vote_count} votes
                </p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmpireInitiativesSection({ initiatives }: { initiatives: EmpireInitiative[] }) {
  const active = initiatives.filter((i) => i.status === 'eac_review' || i.status === 'member_voting');
  const past = initiatives.filter((i) => i.status === 'passed' || i.status === 'failed' || i.status === 'eac_rejected');

  return (
    <section className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Vote className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Empire-Wide Initiatives</p>
      </div>
      <h2 className="text-lg font-display font-bold text-stone-900 mb-4">Policy Decisions</h2>

      {active.length > 0 && (
        <div className="space-y-3 mb-4">
          {active.map((init) => (
            <InitiativeCard key={init.id} initiative={init} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Past Results</p>
          <div className="space-y-2">
            {past.slice(0, 10).map((init) => (
              <PastInitiativeRow key={init.id} initiative={init} />
            ))}
          </div>
        </>
      )}

      {initiatives.length === 0 && (
        <p className="text-xs text-stone-500 py-4 text-center">No Empire-wide initiatives yet.</p>
      )}
    </section>
  );
}

function InitiativeCard({ initiative }: { initiative: EmpireInitiative }) {
  const inEacReview = initiative.status === 'eac_review';
  const inMemberVoting = initiative.status === 'member_voting';

  return (
    <div className="frame-intel p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900">{initiative.title}</p>
          <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{initiative.description}</p>
        </div>
        <span className={cn(
          'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0',
          inEacReview && 'bg-amber-50 text-amber-700 border-amber-200',
          inMemberVoting && 'bg-emerald-50 text-emerald-700 border-emerald-200',
        )}>
          {inEacReview ? 'EAC Review' : 'Member Voting'}
        </span>
      </div>

      {inEacReview && (
        <div className="flex items-center gap-3 mt-3 text-xs">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-stone-700 tabular-nums">{initiative.eac_approvals} approve</span>
          </div>
          <div className="flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-stone-700 tabular-nums">{initiative.eac_rejections} reject</span>
          </div>
          <div className="flex items-center gap-1 text-stone-500 ml-auto">
            <Clock className="w-3.5 h-3.5" />
            <span>Needs 7 of 11</span>
          </div>
        </div>
      )}

      {inMemberVoting && (
        <div className="flex items-center gap-3 mt-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-emerald-700 font-semibold tabular-nums">{initiative.yes_votes} Yes</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-600 font-semibold tabular-nums">{initiative.no_votes} No</span>
          </div>
          <div className="flex items-center gap-1 text-stone-500 ml-auto">
            <Clock className="w-3.5 h-3.5" />
            <span>Closes {initiative.member_voting_closes_at ? new Date(initiative.member_voting_closes_at).toLocaleDateString() : 'soon'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PastInitiativeRow({ initiative }: { initiative: EmpireInitiative }) {
  const passed = initiative.status === 'passed';
  return (
    <Link
      to="#"
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 transition-colors"
      onClick={(e) => e.preventDefault()}
    >
      {passed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
      )}
      <p className="text-sm text-stone-700 flex-1 truncate">{initiative.title}</p>
      <span className={cn(
        'text-[10px] font-semibold uppercase tracking-wider',
        passed ? 'text-emerald-600' : 'text-red-500',
      )}>
        {passed ? 'Passed' : 'Failed'}
      </span>
      <span className="text-[10px] text-stone-400 tabular-nums">
        {initiative.yes_votes}-{initiative.no_votes}
      </span>
    </Link>
  );
}
