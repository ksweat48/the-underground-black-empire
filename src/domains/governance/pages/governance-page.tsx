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
  submitEACApplication,
  castEmpireBallot,
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
  const [applySeat, setApplySeat] = useState<EACSeat | null>(null);
  const [conflictDisclosure, setConflictDisclosure] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [votedInitiatives, setVotedInitiatives] = useState<Set<string>>(new Set());

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

        <EACSection seats={eac} onApply={(seat) => { setApplySeat(seat); setApplySuccess(false); setApplyError(null); setConflictDisclosure(''); setQualifications(''); }} />

        <MetroCouncilSection council={council} />

        <EmpireInitiativesSection initiatives={initiatives} votedIds={votedInitiatives} onVote={async (id, vote) => {
          try {
            await castEmpireBallot(id, vote);
            setVotedInitiatives((prev) => new Set([...prev, id]));
          } catch (err) {
            console.error('Vote failed:', err);
          }
        }} />
        {applySeat && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl border border-stone-200 p-6 max-w-md w-full space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-display font-bold text-stone-900">Apply for Seat {applySeat.seat_number}</h3>
                <button onClick={() => setApplySeat(null)} className="text-stone-400 hover:text-stone-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-stone-500">{applySeat.role_label}</p>

              {applySuccess ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <p className="text-sm text-emerald-700">Application submitted successfully.</p>
                  </div>
                  <button onClick={() => setApplySeat(null)} className="w-full py-2 rounded-lg text-sm font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors">
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-700 mb-1 block">Conflict Disclosure (required)</label>
                    <textarea
                      value={conflictDisclosure}
                      onChange={(e) => setConflictDisclosure(e.target.value)}
                      placeholder="Describe any conflicts of interest, or state 'None'..."
                      className="w-full p-3 rounded-lg border border-stone-200 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-plum-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-700 mb-1 block">Qualifications (optional)</label>
                    <textarea
                      value={qualifications}
                      onChange={(e) => setQualifications(e.target.value)}
                      placeholder="Why are you qualified for this role?"
                      className="w-full p-3 rounded-lg border border-stone-200 text-sm resize-y min-h-[60px] focus:outline-none focus:ring-2 focus:ring-plum-400"
                    />
                  </div>
                  {applyError && (
                    <p className="text-xs text-red-600">{applyError}</p>
                  )}
                  <button
                    onClick={async () => {
                      if (!conflictDisclosure.trim()) { setApplyError('Conflict disclosure is required.'); return; }
                      setApplying(true);
                      setApplyError(null);
                      try {
                        await submitEACApplication(applySeat.seat_number, conflictDisclosure, qualifications);
                        setApplySuccess(true);
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : 'Application failed.';
                        setApplyError(msg);
                      } finally {
                        setApplying(false);
                      }
                    }}
                    disabled={applying}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-plum-600 text-white hover:bg-plum-700 transition-colors disabled:opacity-50"
                  >
                    {applying ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Application'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function EACSection({ seats, onApply }: { seats: EACSeat[]; onApply: (seat: EACSeat) => void }) {
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
              <button
                onClick={() => onApply(seat)}
                className="text-[10px] font-semibold text-plum-600 hover:text-plum-700 uppercase tracking-wider transition-colors"
              >
                Vacant · Apply
              </button>
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

function EmpireInitiativesSection({ initiatives, votedIds, onVote }: { initiatives: EmpireInitiative[]; votedIds: Set<string>; onVote: (id: string, vote: 'yes' | 'no') => Promise<void> }) {
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
            <InitiativeCard key={init.id} initiative={init} hasVoted={votedIds.has(init.id)} onVote={onVote} />
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

function InitiativeCard({ initiative, hasVoted, onVote }: { initiative: EmpireInitiative; hasVoted: boolean; onVote: (id: string, vote: 'yes' | 'no') => Promise<void> }) {
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
        <>
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
          {!hasVoted && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onVote(initiative.id, 'yes')}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Vote Yes
              </button>
              <button
                onClick={() => onVote(initiative.id, 'no')}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Vote No
              </button>
              <span className="text-[10px] text-stone-400 ml-auto">+25 Influence for voting</span>
            </div>
          )}
          {hasVoted && (
            <p className="text-[10px] text-emerald-600 font-semibold mt-2">You voted on this initiative.</p>
          )}
        </>
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
