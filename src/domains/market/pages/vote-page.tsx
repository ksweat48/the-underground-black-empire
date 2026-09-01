import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { GlassModal } from '@/shared/components/glass-modal';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchVotes,
  castVote,
  fetchVotingCredits,
  fetchVotingPower,
  type Vote,
} from '@/domains/market/services';
import { BALLOT_CREDIT_CAP } from '@/config/progression-rules';

export function VotePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const userId = session?.user.id ?? '';

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

  const loadVotes = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchVotes(userId);
      setVotes(data);
    } catch {
      setVotes([]);
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

  useEffect(() => { loadVotes(); }, [loadVotes]);
  useEffect(() => { loadVotingInfo(); }, [loadVotingInfo]);

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
      <Layout fullWidth>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-empire-text-muted animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="max-w-[960px] mx-auto px-2 sm:px-3 pt-3 pb-4 space-y-4">
        {/* VP & Credits Summary Bar */}
        <div className="frame-utility p-3 flex items-center justify-between gap-3 animate-fade-up" style={{ animationDelay: '25ms' }}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-empire-gold" />
            <div>
              <p className="text-xs font-semibold text-empire-ivory">Voting Power</p>
              <p className="text-lg font-display font-bold text-empire-gold tabular-nums">{votingPower.toFixed(2)}×</p>
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
      </div>

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

            {/* Eligibility & timing */}
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

            {/* Already voted indicator */}
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
                    Your vote weight: {selectedVote.user_effective_weight.toFixed(2)} ({selectedVote.user_credits_used} credits × {selectedVote.user_voting_power?.toFixed(2)} VP)
                  </p>
                )}
              </div>
            )}

            {/* Choices */}
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

            {/* Credit selector (only if not already voted) */}
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

                {/* Effective weight preview */}
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
                  {creditsToUse} credits × {votingPower.toFixed(2)} VP = {effectiveWeight.toFixed(2)} weighted votes
                </p>

                {/* Error */}
                {voteError && (
                  <p className="text-sm text-crimson-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {voteError}
                  </p>
                )}

                {/* Submit */}
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
                      Confirm Vote — Final
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
    </Layout>
  );
}

// ==================== Vote Card ====================

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
          <span className="text-ink-600">·</span>
          {vote.user_credits_used} credits × {vote.user_voting_power?.toFixed(2)} VP
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

// ==================== Completed Vote Row ====================

function CompletedVoteRow({ vote }: { vote: Vote }) {
  return (
    <div className="frame-utility p-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-sm font-medium text-empire-text-secondary line-clamp-1">{vote.question}</h3>
        <p className="text-[10px] text-empire-text-muted mt-0.5">
          Closed {formatVoteDate(vote.closes_at)}
          {vote.total_votes !== undefined && ` · ${vote.total_votes} votes`}
          {vote.total_weight !== undefined && vote.total_weight > 0 && ` · ${vote.total_weight.toFixed(1)} total weight`}
        </p>
      </div>
      {vote.user_choice && (
        <CheckCircle2 className="w-4 h-4 text-empire-success shrink-0" />
      )}
    </div>
  );
}

// ==================== Utilities ====================

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
