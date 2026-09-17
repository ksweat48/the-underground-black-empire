import { useEffect, useState, useCallback } from 'react';
import {
  Vote as VoteIcon,
  Check,
  Clock,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Coins,
  Zap,
  Info,
  Scale,
  Landmark,
  Crown,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { GlassModal } from '@/shared/components/glass-modal';
import { ErrorBanner } from '@/shared/components/error-banner';
import { cn } from '@/shared/cn';
import { supabase } from '@/shared/supabase-client';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchVotes,
  castVote,
  fetchVotingCredits,
  fetchVotingPower,
  fetchMemberCityInfo,
  type Vote,
} from '@/domains/market/services';
import { BALLOT_CREDIT_CAP } from '@/config/progression-rules';
import {
  fetchActiveCycle,
  fetchNominationCandidates,
  submitNomination,
  fetchMyNominationCount,
  fetchFinalists,
  castLeadershipBallot,
  fetchMyBallot,
  fetchMetroCouncil,
} from '@/domains/leadership/services';
import type {
  LeadershipCycle,
  NominationCandidate,
  LeadershipFinalist,
  MetroCouncilMember,
} from '@/domains/leadership/types';

type Tab = 'initiatives' | 'leadership';

export function VotePage() {
  const { session, sessionVersion } = useAuth();
  const userId = session?.user.id ?? '';
  const [tab, setTab] = useState<Tab>('initiatives');

  return (
    <Layout fullWidth>
      <div className="max-w-[960px] mx-auto px-2 sm:px-3 pt-3 pb-24 space-y-4">
        <VoteHeader tab={tab} onTabChange={setTab} />
        {tab === 'initiatives' ? (
          <InitiativesTab userId={userId} sessionVersion={sessionVersion} />
        ) : (
          <LeadershipTab userId={userId} sessionVersion={sessionVersion} />
        )}
      </div>
    </Layout>
  );
}

// ==================== Header ====================

function VoteHeader({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-1 p-1 frame-utility">
        <TabButton
          active={tab === 'initiatives'}
          onClick={() => onTabChange('initiatives')}
          icon={VoteIcon}
          label="Initiatives"
        />
        <TabButton
          active={tab === 'leadership'}
          onClick={() => onTabChange('leadership')}
          icon={Scale}
          label="Leadership"
        />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-display font-semibold uppercase tracking-wider transition-all',
        active
          ? 'bg-empire-gold text-white shadow-sm'
          : 'text-empire-text-secondary hover:text-empire-ivory'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ==================== Initiatives Tab ====================

function InitiativesTab({ userId, sessionVersion }: { userId: string; sessionVersion: number }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVote, setSelectedVote] = useState<Vote | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [votedSuccess, setVotedSuccess] = useState(false);
  const [votedWeight, setVotedWeight] = useState(0);
  const [votingCredits, setVotingCredits] = useState(0);
  const [votingPower, setVotingPower] = useState(1.0);
  const [creditsToUse, setCreditsToUse] = useState(1);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadVotes = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchVotes(userId);
      setVotes(data);
    } catch {
      setVotes([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadVotingInfo = useCallback(async () => {
    if (!userId) return;
    try {
      const [credits, power] = await Promise.all([
        fetchVotingCredits(userId),
        fetchVotingPower(userId),
      ]);
      setVotingCredits(credits);
      setVotingPower(power);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => { loadVotes(); }, [loadVotes, sessionVersion]);
  useEffect(() => { loadVotingInfo(); }, [loadVotingInfo, sessionVersion]);

  const handleOpenVote = (vote: Vote) => {
    setSelectedVote(vote);
    setSelectedChoice(vote.user_choice ?? '');
    setShowConfirm(true);
    setVotedSuccess(false);
    setVoteError(null);
    setCreditsToUse(1);
  };

  const effectiveWeight = creditsToUse * votingPower;
  const maxCreditsForBallot = Math.min(BALLOT_CREDIT_CAP, votingCredits);

  const handleCastVote = async () => {
    if (!selectedVote || !selectedChoice) return;
    setSubmitting(true);
    setVoteError(null);
    try {
      const weight = await castVote(selectedVote.id, selectedChoice, creditsToUse);
      setVotedWeight(weight);
      setVotedSuccess(true);
      loadVotingInfo();
      setTimeout(() => {
        setShowConfirm(false);
        loadVotes();
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cast vote';
      setVoteError(message);
      setVotedSuccess(false);
    } finally {
      setSubmitting(false);
    }
  };

  const activeVotes = votes.filter((v) => v.status === 'active');
  const completedVotes = votes.filter((v) => v.status === 'closed' || v.status === 'tallied');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-empire-text-muted animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorBanner message="Unable to load active votes. Please try again." onRetry={loadVotes} />
    );
  }

  return (
    <>
      {/* VP & Credits Summary Bar */}
      <div className="frame-utility p-3 flex items-center justify-between gap-3 animate-fade-up" style={{ animationDelay: '25ms' }}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-empire-gold" />
          <div>
            <p className="text-xs font-semibold text-empire-ivory">Voting Power</p>
            <p className="text-lg font-display font-bold text-empire-gold tabular-nums">{votingPower.toFixed(2)}x</p>
          </div>
        </div>
        <div className="w-px h-10 bg-ink-700/30" />
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-empire-text-secondary" />
          <div>
            <p className="text-xs font-semibold text-empire-ivory">Voting Credits</p>
            <p className="text-lg font-display font-bold text-empire-text-secondary tabular-nums">{votingCredits}</p>
          </div>
        </div>
      </div>

      {/* Active votes */}
      <section className="animate-fade-up" style={{ animationDelay: '50ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-empire-success animate-pulse" />
          <h2 className="font-display text-sm font-semibold text-empire-ivory uppercase tracking-wider">
            Active Votes
          </h2>
        </div>
        {activeVotes.length === 0 ? (
          <div className="frame-utility p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-ink-800/20 border border-ink-700/20 mb-3">
              <VoteIcon className="w-5 h-5 text-empire-text-muted" />
            </div>
            <p className="text-sm font-medium text-empire-text-secondary mb-1">No active votes</p>
            <p className="text-xs text-empire-text-muted">
              Community decisions will appear here when they're open for voting.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeVotes.map((vote) => (
              <VoteCard key={vote.id} vote={vote} onOpen={() => handleOpenVote(vote)} />
            ))}
          </div>
        )}
      </section>

      {/* Completed votes */}
      {completedVotes.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-empire-text-muted" />
            <h2 className="font-display text-sm font-semibold text-empire-text-muted uppercase tracking-wider">
              Recently Completed
            </h2>
          </div>
          <div className="space-y-2">
            {completedVotes.map((vote) => (
              <CompletedVoteRow key={vote.id} vote={vote} />
            ))}
          </div>
        </section>
      )}

      {/* Vote confirmation modal */}
      <GlassModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={selectedVote?.question ?? 'Cast Your Vote'}
      >
        {votedSuccess ? (
          <div className="text-center py-8 space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-empire-success/10 border border-empire-success/20">
              <CheckCircle2 className="w-7 h-7 text-empire-success" />
            </div>
            <p className="text-sm font-medium text-empire-text-secondary">Your vote has been recorded.</p>
            <p className="text-xs text-empire-text-muted">
              Effective voting weight: <span className="font-bold text-empire-gold tabular-nums">{votedWeight.toFixed(2)}</span>
            </p>
            <p className="text-[10px] text-empire-text-muted italic">
              Votes are final and cannot be changed.
            </p>
          </div>
        ) : selectedVote ? (
          <div className="space-y-4">
            {selectedVote.description && (
              <p className="text-sm text-empire-text-secondary">{selectedVote.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <span className="badge-gold text-[10px]">
                <Users className="w-3 h-3" />
                {selectedVote.eligibility === 'all_authenticated' ? 'All Members' : selectedVote.eligibility}
              </span>
              <span className="badge-steel text-[10px]">
                <Clock className="w-3 h-3" />
                Closes {formatVoteDate(selectedVote.closes_at)}
              </span>
              {selectedVote.total_votes !== undefined && (
                <span className="badge-emerald text-[10px]">
                  {selectedVote.total_votes} votes
                </span>
              )}
            </div>
            {selectedVote.user_choice && (
              <div className="frame-utility p-3 border-empire-success/20 bg-empire-success/5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-empire-success" />
                  <p className="text-xs text-empire-success font-medium">
                    You already voted. Votes are final and cannot be changed.
                  </p>
                </div>
                {selectedVote.user_effective_weight !== undefined && (
                  <p className="text-[10px] text-empire-text-muted mt-1 pl-6">
                    Your vote weight: {selectedVote.user_effective_weight.toFixed(2)} ({selectedVote.user_credits_used} credits x {selectedVote.user_voting_power?.toFixed(2)} VP)
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              {selectedVote.choices.map((choice) => (
                <button
                  key={choice.key}
                  onClick={() => setSelectedChoice(choice.key)}
                  disabled={!!selectedVote.user_choice}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg border transition-all',
                    selectedVote.user_choice
                      ? 'opacity-60 cursor-not-allowed frame-utility text-empire-text-muted'
                      : selectedChoice === choice.key
                      ? 'bg-empire-gold/10 border-empire-gold/25 text-empire-gold'
                      : 'frame-utility text-empire-text-secondary hover:text-empire-ivory'
                  )}
                >
                  <p className="text-sm font-medium">{choice.label}</p>
                  {choice.description && (
                    <p className="text-xs text-empire-text-muted mt-0.5">{choice.description}</p>
                  )}
                </button>
              ))}
            </div>
            {!selectedVote.user_choice && (
              <>
                <div className="frame-utility p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-empire-gold" />
                    <p className="text-xs font-semibold text-empire-ivory">Voting Credits</p>
                  </div>
                  <p className="text-[11px] text-empire-text-muted">
                    You have <span className="font-bold text-empire-text-secondary">{votingCredits}</span> credits.
                    Use up to <span className="font-bold text-empire-text-secondary">{maxCreditsForBallot}</span> on this ballot.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCreditsToUse(Math.max(1, creditsToUse - 1))}
                      disabled={creditsToUse <= 1}
                      className="w-8 h-8 rounded-lg frame-utility flex items-center justify-center text-empire-text-secondary disabled:opacity-30"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min={1}
                      max={maxCreditsForBallot}
                      value={Math.min(creditsToUse, maxCreditsForBallot)}
                      onChange={(e) => setCreditsToUse(Number(e.target.value))}
                      disabled={maxCreditsForBallot < 1}
                      className="flex-1 accent-empire-gold"
                    />
                    <button
                      onClick={() => setCreditsToUse(Math.min(maxCreditsForBallot, creditsToUse + 1))}
                      disabled={creditsToUse >= maxCreditsForBallot}
                      className="w-8 h-8 rounded-lg frame-utility flex items-center justify-center text-empire-text-secondary disabled:opacity-30"
                    >
                      +
                    </button>
                    <span className="font-display font-bold text-lg text-empire-gold tabular-nums w-10 text-center">
                      {creditsToUse}
                    </span>
                  </div>
                  {votingCredits < 1 && (
                    <p className="text-[11px] text-crimson-300 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      You need at least 1 voting credit to cast a vote.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-empire-gold/5 border border-empire-gold/15">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-empire-gold" />
                    <span className="text-xs text-empire-text-secondary">Effective Voting Weight</span>
                  </div>
                  <span className="font-display font-bold text-lg text-empire-gold tabular-nums">
                    {effectiveWeight.toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-empire-text-muted text-center">
                  {creditsToUse} credits x {votingPower.toFixed(2)} VP = {effectiveWeight.toFixed(2)} weighted votes
                </p>
                {voteError && (
                  <p className="text-sm text-crimson-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {voteError}
                  </p>
                )}
                <button
                  onClick={handleCastVote}
                  disabled={!selectedChoice || submitting || votingCredits < 1}
                  className="btn-primary w-full text-sm py-2.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirm Vote -- Final
                    </>
                  )}
                </button>
                <p className="text-[10px] text-empire-text-muted text-center">
                  Your vote is final and cannot be changed. Credits are consumed on submission.
                </p>
              </>
            )}
          </div>
        ) : null}
      </GlassModal>
    </>
  );
}

// ==================== Leadership Tab ====================

function LeadershipTab({ userId, sessionVersion }: { userId: string; sessionVersion: number }) {
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<LeadershipCycle | null>(null);
  const [metroName, setMetroName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<NominationCandidate[]>([]);
  const [finalists, setFinalists] = useState<LeadershipFinalist[]>([]);
  const [council, setCouncil] = useState<MetroCouncilMember[]>([]);
  const [myNominations, setMyNominations] = useState(0);
  const [ballotSubmitted, setBallotSubmitted] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [nomineeForNomination, setNomineeForNomination] = useState<NominationCandidate | null>(null);
  const [nominationSubmitting, setNominationSubmitting] = useState(false);
  const [nominationError, setNominationError] = useState<string | null>(null);
  const [nominationSuccess, setNominationSuccess] = useState(false);
  const [ballotSubmitting, setBallotSubmitting] = useState(false);
  const [ballotError, setBallotError] = useState<string | null>(null);
  const [ballotSuccess, setBallotSuccess] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const cityInfo = await fetchMemberCityInfo(userId);
      if (cityInfo.metroId) {
        const { data: metro } = await supabase
          .from('metros')
          .select('name')
          .eq('id', cityInfo.metroId)
          .maybeSingle();
        setMetroName((metro as { name: string } | null)?.name ?? 'Your Metro');
      }

      const activeCycle = await fetchActiveCycle(cityInfo.metroId);
      setCycle(activeCycle);

      if (activeCycle?.phase === 'nomination') {
        const [cands, myNoms] = await Promise.all([
          fetchNominationCandidates(cityInfo.metroId, userId),
          fetchMyNominationCount(userId),
        ]);
        setCandidates(cands);
        setMyNominations(myNoms);
      } else if (activeCycle?.phase === 'election') {
        const [fins, myBallot] = await Promise.all([
          fetchFinalists(activeCycle.id),
          fetchMyBallot(activeCycle.id, userId),
        ]);
        setFinalists(fins);
        setBallotSubmitted(!!myBallot);
        if (myBallot) setSelectedCandidates(myBallot.selected_candidate_ids);
      } else {
        const councilData = await fetchMetroCouncil(cityInfo.metroId);
        setCouncil(councilData);
        if (activeCycle?.phase === 'closed') {
          const fins = await fetchFinalists(activeCycle.id);
          setFinalists(fins);
        }
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load, sessionVersion]);

  const handleNominate = async () => {
    if (!nomineeForNomination) return;
    setNominationSubmitting(true);
    setNominationError(null);
    setNominationSuccess(false);
    try {
      await submitNomination(nomineeForNomination.member_id);
      setNominationSuccess(true);
      setMyNominations((n) => n + 1);
      setCandidates((prev) =>
        prev.map((c) =>
          c.member_id === nomineeForNomination.member_id
            ? { ...c, has_nominated: true, nomination_count: c.nomination_count + 1 }
            : c
        )
      );
      setTimeout(() => {
        setNomineeForNomination(null);
        setNominationSuccess(false);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to nominate';
      setNominationError(message);
    } finally {
      setNominationSubmitting(false);
    }
  };

  const handleCastBallot = async () => {
    if (!cycle || selectedCandidates.length < 1) return;
    setBallotSubmitting(true);
    setBallotError(null);
    setBallotSuccess(false);
    try {
      await castLeadershipBallot(cycle.id, selectedCandidates);
      setBallotSuccess(true);
      setBallotSubmitted(true);
      setTimeout(() => setBallotSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cast ballot';
      setBallotError(message);
    } finally {
      setBallotSubmitting(false);
    }
  };

  const toggleCandidateSelection = (memberId: string) => {
    setSelectedCandidates((prev) => {
      if (prev.includes(memberId)) return prev.filter((id) => id !== memberId);
      if (prev.length >= (cycle?.seats ?? 7)) return prev;
      return [...prev, memberId];
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-empire-text-muted animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorBanner message="Unable to load leadership data. Please try again." onRetry={load} />
    );
  }

  return (
    <>
      {/* Metro header */}
      <div className="frame-command p-4 animate-fade-up" style={{ animationDelay: '25ms' }}>
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-empire-gold/10 border border-empire-gold/20 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-empire-gold" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-empire-ivory uppercase tracking-wider">
              {metroName ? `${metroName} Metro` : 'Your Metro'} Leadership
            </h2>
            <p className="text-xs text-empire-text-muted mt-0.5">
              {cycle ? getPhaseDescription(cycle.phase) : 'No active election cycle'}
            </p>
          </div>
        </div>
      </div>

      {/* No cycle */}
      {!cycle && (
        <div className="frame-utility p-6 text-center animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-ink-800/20 border border-ink-700/20 mb-3">
            <Scale className="w-5 h-5 text-empire-text-muted" />
          </div>
          <p className="text-sm font-medium text-empire-text-secondary mb-1">No active leadership election</p>
          <p className="text-xs text-empire-text-muted">
            When a nomination period opens, eligible members who have opted in will appear here.
          </p>
        </div>
      )}

      {/* Nomination phase */}
      {cycle?.phase === 'nomination' && (
        <section className="space-y-3 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-empire-success animate-pulse" />
              <h3 className="font-display text-sm font-semibold text-empire-ivory uppercase tracking-wider">
                Nominations Open
              </h3>
            </div>
            <span className="badge-steel text-[10px]">
              {myNominations}/3 used
            </span>
          </div>
          <p className="text-xs text-empire-text-muted">
            Help identify the members you trust to represent your Metro. You have 3 nominations per cycle.
          </p>

          {candidates.length === 0 ? (
            <div className="frame-utility p-6 text-center">
              <p className="text-sm font-medium text-empire-text-secondary mb-1">No candidates yet</p>
              <p className="text-xs text-empire-text-muted">
                Members who have opted in to leadership will appear here as nominees.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <NominationCard
                  key={candidate.member_id}
                  candidate={candidate}
                  canNominate={myNominations < 3 && !candidate.has_nominated}
                  onNominate={() => {
                    setNomineeForNomination(candidate);
                    setNominationError(null);
                    setNominationSuccess(false);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Election phase */}
      {cycle?.phase === 'election' && (
        <section className="space-y-3 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-empire-gold animate-pulse" />
            <h3 className="font-display text-sm font-semibold text-empire-ivory uppercase tracking-wider">
              Your Metro's Finalists
            </h3>
          </div>
          <p className="text-xs text-empire-text-muted">
            These {finalists.length} members received the strongest community support and have advanced to the election.
            Select up to {cycle.seats} candidates. No credits are used -- one member, one ballot.
          </p>

          {ballotSubmitted && !ballotSuccess && (
            <div className="frame-utility p-3 border-empire-success/20 bg-empire-success/5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-empire-success" />
                <p className="text-xs text-empire-success font-medium">
                  Your ballot has been recorded. You selected {selectedCandidates.length} candidates.
                </p>
              </div>
            </div>
          )}

          {ballotSuccess && (
            <div className="frame-utility p-3 border-empire-success/20 bg-empire-success/5 animate-fade-up">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-empire-success" />
                <p className="text-xs text-empire-success font-medium">Ballot submitted successfully.</p>
              </div>
            </div>
          )}

          {finalists.length === 0 ? (
            <div className="frame-utility p-6 text-center">
              <p className="text-sm font-medium text-empire-text-secondary mb-1">No finalists yet</p>
              <p className="text-xs text-empire-text-muted">
                Finalists will appear here when the nomination period closes.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {finalists.map((finalist) => (
                  <FinalistCard
                    key={finalist.id}
                    finalist={finalist}
                    selected={selectedCandidates.includes(finalist.member_id)}
                    disabled={ballotSubmitted}
                    onToggle={() => toggleCandidateSelection(finalist.member_id)}
                  />
                ))}
              </div>

              {!ballotSubmitted && (
                <>
                  {ballotError && (
                    <p className="text-sm text-crimson-300 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      {ballotError}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3 frame-utility p-3">
                    <span className="text-xs text-empire-text-secondary">
                      {selectedCandidates.length} of {cycle.seats} selected
                    </span>
                    <button
                      onClick={handleCastBallot}
                      disabled={selectedCandidates.length < 1 || ballotSubmitting}
                      className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
                    >
                      {ballotSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Submit Ballot
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* Closed phase — show council */}
      {cycle?.phase === 'closed' && (
        <section className="space-y-3 animate-fade-up" style={{ animationDelay: '50ms' }}>
          {council.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-empire-gold" />
                <h3 className="font-display text-sm font-semibold text-empire-ivory uppercase tracking-wider">
                  Your Metro Council
                </h3>
              </div>
              <p className="text-xs text-empire-text-muted">
                These {council.length} members were elected by your Metro to serve as council representatives.
              </p>
              <div className="space-y-3">
                {council.map((member) => (
                  <CouncilCard key={member.member_id} member={member} />
                ))}
              </div>
            </>
          ) : (
            <div className="frame-utility p-6 text-center">
              <p className="text-sm font-medium text-empire-text-secondary mb-1">Election results pending</p>
              <p className="text-xs text-empire-text-muted">
                Council members will be announced once the results are finalized.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Nomination confirmation modal */}
      <GlassModal
        open={!!nomineeForNomination}
        onClose={() => { setNomineeForNomination(null); setNominationError(null); setNominationSuccess(false); }}
        title="Nominate for Leadership"
      >
        {nominationSuccess ? (
          <div className="text-center py-8 space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-empire-success/10 border border-empire-success/20">
              <CheckCircle2 className="w-7 h-7 text-empire-success" />
            </div>
            <p className="text-sm font-medium text-empire-text-secondary">Nomination submitted.</p>
          </div>
        ) : nomineeForNomination ? (
          <div className="space-y-4">
            <p className="text-sm text-empire-text-secondary">
              Do you believe {nomineeForNomination.display_name ?? nomineeForNomination.email.split('@')[0]} would be a strong leader and supporter of the Empire?
            </p>
            <div className="flex items-center gap-3 p-3 frame-utility">
              <Avatar member={nomineeForNomination} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-empire-ivory truncate">
                  {nomineeForNomination.display_name ?? nomineeForNomination.email.split('@')[0]}
                </p>
                <p className="text-xs text-empire-text-muted">
                  Level {nomineeForNomination.level} - {nomineeForNomination.influence.toLocaleString()} Influence
                </p>
              </div>
            </div>
            {nominationError && (
              <p className="text-sm text-crimson-300 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {nominationError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setNomineeForNomination(null); setNominationError(null); }}
                className="btn-secondary flex-1 text-sm py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={handleNominate}
                disabled={nominationSubmitting}
                className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50"
              >
                {nominationSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Scale className="w-4 h-4" />
                    Nominate
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </GlassModal>
    </>
  );
}

// ==================== Cards ====================

function NominationCard({
  candidate,
  canNominate,
  onNominate,
}: {
  candidate: NominationCandidate;
  canNominate: boolean;
  onNominate: () => void;
}) {
  return (
    <div className="frame-command p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar member={candidate} />
          <div className="flex-1 min-w-0">
            <h4 className="font-display text-sm font-semibold text-empire-ivory truncate">
              {candidate.display_name ?? candidate.email.split('@')[0]}
            </h4>
            <p className="text-xs text-empire-text-muted">
              Level {candidate.level} - {candidate.influence.toLocaleString()} Influence
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-display font-bold text-empire-gold tabular-nums">
            {candidate.nomination_count}
          </p>
          <p className="text-[10px] text-empire-text-muted uppercase tracking-wider">Nominations</p>
        </div>
      </div>
      <button
        onClick={onNominate}
        disabled={!canNominate}
        className={cn(
          'w-full text-sm py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2',
          candidate.has_nominated
            ? 'frame-utility text-empire-success cursor-default'
            : canNominate
            ? 'btn-primary'
            : 'btn-secondary opacity-50 cursor-not-allowed'
        )}
      >
        {candidate.has_nominated ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Nominated
          </>
        ) : (
          <>
            <Scale className="w-4 h-4" />
            Nominate
          </>
        )}
      </button>
    </div>
  );
}

function FinalistCard({
  finalist,
  selected,
  disabled,
  onToggle,
}: {
  finalist: LeadershipFinalist;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'w-full text-left p-4 rounded-lg border transition-all',
        selected
          ? 'bg-empire-gold/10 border-empire-gold/25'
          : 'frame-command hover:border-empire-gold/15',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5',
          selected ? 'bg-empire-gold border-empire-gold' : 'border-empire-text-muted'
        )}>
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar member={finalist} />
              <div className="min-w-0">
                <h4 className="font-display text-sm font-semibold text-empire-ivory truncate">
                  {finalist.display_name ?? finalist.email.split('@')[0]}
                </h4>
                <p className="text-xs text-empire-text-muted">
                  Level {finalist.level} - {finalist.influence.toLocaleString()} Influence - {finalist.nomination_count} nominations
                </p>
              </div>
            </div>
          </div>
          {finalist.service_statement && (
            <p className="text-xs text-empire-text-secondary italic pl-1 border-l-2 border-empire-gold/20 ml-1">
              {finalist.service_statement}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function CouncilCard({ member }: { member: MetroCouncilMember }) {
  return (
    <div className="frame-command p-4 flex items-center gap-3">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-empire-gold/10 border border-empire-gold/20 flex items-center justify-center">
        <Crown className="w-5 h-5 text-empire-gold" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-display text-sm font-semibold text-empire-ivory truncate">
          {member.display_name ?? member.email.split('@')[0]}
        </h4>
        <p className="text-xs text-empire-text-muted">
          Level {member.level} - {member.influence.toLocaleString()} Influence
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-empire-gold tabular-nums">Seat {member.seat_number}</p>
        <p className="text-[10px] text-empire-text-muted">{member.vote_count} votes</p>
      </div>
    </div>
  );
}

// ==================== Shared ====================

function Avatar({ member }: { member: { avatar_url: string | null; display_name: string | null; email: string } }) {
  const name = member.display_name ?? member.email.split('@')[0];
  const initials = getInitials(name);
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [member.avatar_url]);
  return (
    <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-ink-800/20 border border-ink-700/20">
      {member.avatar_url && !imgError ? (
        <img src={member.avatar_url} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <span className="font-display font-bold text-sm text-empire-text-secondary">{initials}</span>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.split(/[\s@._-]/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getPhaseDescription(phase: string): string {
  switch (phase) {
    case 'nomination': return 'Nomination period is open';
    case 'election': return 'Election is open for voting';
    case 'closed': return 'Election has concluded';
    default: return '';
  }
}

// ==================== Vote Card (Initiatives) ====================

function VoteCard({ vote, onOpen }: { vote: Vote; onOpen: () => void }) {
  const hasVoted = !!vote.user_choice;
  const timeLeft = getTimeLeft(vote.closes_at);

  return (
    <div className="frame-command p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold text-empire-ivory">{vote.question}</h3>
          {vote.description && (
            <p className="text-xs text-empire-text-muted mt-1 line-clamp-2">{vote.description}</p>
          )}
        </div>
        {hasVoted && (
          <div className="shrink-0">
            <CheckCircle2 className="w-5 h-5 text-empire-success" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="badge-gold text-[10px]">
          <Users className="w-3 h-3" />
          {vote.eligibility === 'all_authenticated' ? 'All Members' : vote.eligibility}
        </span>
        <span className="badge-steel text-[10px]">
          <Clock className="w-3 h-3" />
          {timeLeft}
        </span>
        {vote.total_votes !== undefined && vote.total_votes > 0 && (
          <span className="badge-emerald text-[10px]">
            {vote.total_votes} voted
          </span>
        )}
      </div>

      {hasVoted && vote.user_effective_weight !== undefined && (
        <div className="flex items-center gap-2 text-[10px] text-empire-text-muted">
          <Zap className="w-3 h-3 text-empire-gold" />
          Your vote weight: <span className="font-bold text-empire-gold tabular-nums">{vote.user_effective_weight.toFixed(2)}</span>
          <span className="text-ink-600">-</span>
          {vote.user_credits_used} credits x {vote.user_voting_power?.toFixed(2)} VP
        </div>
      )}

      <div className="flex items-center gap-2">
        {vote.choices.slice(0, 3).map((choice) => (
          <span key={choice.key} className="text-[10px] text-empire-text-muted px-2 py-1 rounded-md frame-utility">
            {choice.label}
          </span>
        ))}
        {vote.choices.length > 3 && (
          <span className="text-[10px] text-empire-text-muted">+{vote.choices.length - 3} more</span>
        )}
      </div>

      <button
        onClick={onOpen}
        disabled={hasVoted}
        className={cn(
          'w-full text-sm py-2.5 rounded-lg font-medium transition-all',
          hasVoted
            ? 'btn-secondary opacity-60 cursor-not-allowed'
            : 'btn-primary'
        )}
      >
        {hasVoted ? 'Vote Recorded (Final)' : 'Cast Your Vote'}
      </button>
    </div>
  );
}

function CompletedVoteRow({ vote }: { vote: Vote }) {
  return (
    <div className="frame-utility p-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-sm font-medium text-empire-text-secondary line-clamp-1">{vote.question}</h3>
        <p className="text-[10px] text-empire-text-muted mt-0.5">
          Closed {formatVoteDate(vote.closes_at)}
          {vote.total_votes !== undefined && ` - ${vote.total_votes} votes`}
          {vote.total_weight !== undefined && vote.total_weight > 0 && ` - ${vote.total_weight.toFixed(1)} total weight`}
        </p>
      </div>
      {vote.user_choice && (
        <CheckCircle2 className="w-4 h-4 text-empire-success shrink-0" />
      )}
    </div>
  );
}

function formatVoteDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getTimeLeft(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h left`;
  const mins = Math.floor(diff / 60000);
  return `${mins}m left`;
}


export default VotePage;
