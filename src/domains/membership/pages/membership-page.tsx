import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { GlassModal } from '@/shared/components/glass-modal';
import { ErrorBanner } from '@/shared/components/error-banner';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchMembershipTiers,
  fetchMyMembership,
  fetchVotingCredits,
  fetchCreditLedger,
  cancelMembershipAtPeriodEnd,
  startStripeCheckout,
  TIER_DETAILS,
} from '@/domains/membership/services';
import { BillingStatusPanel } from '@/domains/membership/components/billing-status-panel';
import type { MembershipTier, MembershipTierId, MemberMembership, VotingCredits, CreditLedgerEntry, TierDetails as TierDetailsType } from '@/domains/membership/types';

type TierSurfaceKey = MembershipTierId;

const CARD_SURFACE: Record<TierSurfaceKey, string> = {
  white: 'membership-card-white',
  black: 'membership-card-black',
  black_plus: 'membership-card-black-plus',
  black_pro: 'membership-card-black-pro',
  arch: 'membership-card-arch',
  arch_pro: 'membership-card-arch-pro',
};

const CARD_TEXT: Record<TierSurfaceKey, string> = {
  white: 'text-stone-900',
  black: 'text-white',
  black_plus: 'text-white',
  black_pro: 'text-white',
  arch: 'text-white',
  arch_pro: 'text-white',
};

const CARD_MUTED: Record<TierSurfaceKey, string> = {
  white: 'text-stone-500',
  black: 'text-white/75',
  black_plus: 'text-white/75',
  black_pro: 'text-white/75',
  arch: 'text-emerald-100/80',
  arch_pro: 'text-fuchsia-100/80',
};

const CARD_STATUS: Record<MembershipTierId, string> = {
  white: 'Participate',
  black: 'Contribute',
  black_plus: 'Serve',
  black_pro: 'Protect',
  arch: 'Prestige',
  arch_pro: 'Supreme',
};

const CARD_COLOR_LABEL: Record<MembershipTierId, string> = {
  white: 'White Card',
  black: 'Black Card',
  black_plus: 'Black+',
  black_pro: 'Black Pro',
  arch: 'Arch Member',
  arch_pro: 'Arch Pro',
};

const TIER_SORT: Record<MembershipTierId, number> = {
  white: 1,
  black: 2,
  black_plus: 3,
  black_pro: 4,
  arch: 5,
  arch_pro: 6,
};

const CARD_EMBLEM_VARIANT: Record<TierSurfaceKey, 'light' | 'dark'> = {
  white: 'light',
  black: 'dark',
  black_plus: 'dark',
  black_pro: 'dark',
  arch: 'dark',
  arch_pro: 'dark',
};

const COLOR_DOT: Record<TierSurfaceKey, string> = {
  white: 'bg-white border border-stone-300',
  black: 'bg-white/10 border border-white/30',
  black_plus: 'bg-white/10 border border-white/30',
  black_pro: 'bg-white/10 border border-white/30',
  arch: 'bg-emerald-700',
  arch_pro: 'bg-purple-800',
};

type ChangeDirection = 'upgrade' | 'downgrade' | 'switch';

function getChangeDirection(currentTier: MembershipTierId, targetTier: MembershipTierId): ChangeDirection {
  if (targetTier === 'white' && currentTier !== 'white') return 'downgrade';
  if (TIER_SORT[targetTier] > TIER_SORT[currentTier]) return 'upgrade';
  return 'switch';
}

function getCtaLabel(tier: MembershipTierId, direction: ChangeDirection, defaultLabel: string): string {
  if (direction === 'downgrade') return 'Downgrade to Free';
  if (direction === 'switch') return `Switch to ${CARD_COLOR_LABEL[tier]}`;
  return defaultLabel;
}

export function MembershipPage() {
  const { session, sessionVersion } = useAuth();
  const userId = session?.user.id ?? '';
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [myMembership, setMyMembership] = useState<MemberMembership | null>(null);
  const [votingCredits, setVotingCredits] = useState<VotingCredits | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<CreditLedgerEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selecting, setSelecting] = useState<MembershipTierId | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [selectSuccess, setSelectSuccess] = useState<string | null>(null);
  const [learnMoreTier, setLearnMoreTier] = useState<MembershipTierId | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState<MembershipTier | null>(null);
  const touchStartX = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoadError(false);
    try {
      const [tierData, membership, credits, ledger] = await Promise.all([
        fetchMembershipTiers(),
        fetchMyMembership(userId),
        fetchVotingCredits(userId),
        fetchCreditLedger(userId, 5),
      ]);
      setTiers(tierData);
      setMyMembership(membership);
      setVotingCredits(credits);
      setLedgerEntries(ledger);
      const index = tierData.findIndex((tier) => tier.id === (membership?.membership_tier ?? 'white'));
      setActiveIndex(index >= 0 ? index : 0);
    } catch {
      setTiers([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId, sessionVersion]);

  useEffect(() => { loadData(); }, [loadData, sessionVersion]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');
    const tierParam = params.get('tier');
    if (checkoutStatus === 'success' && tierParam) {
      setSelectSuccess(`Your ${CARD_COLOR_LABEL[tierParam as MembershipTierId] ?? tierParam} membership is now active.`);
      window.history.replaceState({}, '', '/membership');
    } else if (checkoutStatus === 'upgraded' && tierParam) {
      setSelectSuccess(`You are now ${CARD_COLOR_LABEL[tierParam as MembershipTierId] ?? tierParam}. Your card was charged only the prorated difference, and any extra voting credits were added. It can take a moment to show.`);
      window.history.replaceState({}, '', '/membership');
    } else if (checkoutStatus === 'scheduled' && tierParam) {
      setSelectSuccess(`Your switch to ${CARD_COLOR_LABEL[tierParam as MembershipTierId] ?? tierParam} will take effect at your next billing date. You can undo it any time before then.`);
      window.history.replaceState({}, '', '/membership');
    } else if (checkoutStatus === 'cancelled') {
      setSelectError('Checkout was cancelled. Your membership was not changed.');
      window.history.replaceState({}, '', '/membership');
    }
  }, []);

  const chooseTier = async (tier: MembershipTier) => {
    if (!userId || !myMembership || myMembership.membership_tier === tier.id) return;
    const direction = getChangeDirection(myMembership.membership_tier, tier.id);

    if (direction === 'downgrade') {
      setConfirmDowngrade(tier);
      return;
    }

    setSelecting(tier.id);
    setSelectError(null);
    setSelectSuccess(null);
    try {
      const checkoutUrl = await startStripeCheckout(tier.id);
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        setSelectError('Unable to start checkout. Please try again.');
      }
    } catch (error) {
      setSelectError(error instanceof Error ? error.message : 'Unable to update your membership tier. Please try again.');
    } finally {
      setSelecting(null);
    }
  };

  const confirmDowngradeToWhite = async () => {
    if (!confirmDowngrade) return;
    setSelecting('white');
    setSelectError(null);
    setSelectSuccess(null);
    setConfirmDowngrade(null);
    try {
      await cancelMembershipAtPeriodEnd();
      await loadData();
      setSelectSuccess('Your paid membership will end at the close of your billing period. You keep every benefit until then.');
    } catch (error) {
      setSelectError(error instanceof Error ? error.message : 'Unable to cancel your membership. Please try again.');
    } finally {
      setSelecting(null);
    }
  };

  const goTo = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(tiers.length - 1, index)));
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStartX.current === null) return;
    const distance = clientX - touchStartX.current;
    if (Math.abs(distance) > 45) goTo(activeIndex + (distance < 0 ? 1 : -1));
    touchStartX.current = null;
  };

  if (loading) {
    return (
      <Layout fullWidth>
        <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout fullWidth>
        <div className="flex items-center justify-center py-24">
          <ErrorBanner message="Unable to load membership options. Please try again." onRetry={loadData} />
        </div>
      </Layout>
    );
  }

  const memberName = myMembership?.display_name?.trim()
    || (typeof session?.user.user_metadata?.display_name === 'string' ? session.user.user_metadata.display_name.trim() : '')
    || session?.user.email?.split('@')[0]
    || 'Member';
  const currentTierId = myMembership?.membership_tier ?? 'white';
  const desktopStartIndex = Math.min(Math.max(activeIndex - 1, 0), Math.max(tiers.length - 3, 0));
  const tabletStartIndex = Math.min(Math.max(activeIndex - 1, 0), Math.max(tiers.length - 2, 0));

  return (
    <Layout fullWidth>
      {selectError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 animate-fade-up mb-4">
          <p className="text-xs text-red-700 flex-1">{selectError}</p>
        </div>
      )}
      {selectSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 animate-fade-up mb-4">
          <Check className="h-4 w-4 text-emerald-700 shrink-0" />
          <p className="text-xs text-emerald-700 flex-1">{selectSuccess}</p>
        </div>
      )}
      {myMembership && (
        <BillingStatusPanel
          membership={myMembership}
          tierLabels={CARD_COLOR_LABEL}
          onChanged={(message) => { setSelectError(null); setSelectSuccess(message); loadData(); }}
        />
      )}
      {currentTierId !== 'white' && votingCredits && (
        <CreditBalancePanel
          credits={votingCredits}
          ledger={ledgerEntries}
          membershipStartedAt={myMembership?.membership_started_at ?? null}
        />
      )}
      <div className="membership-page w-full overflow-hidden pb-24">
        {tiers.length > 0 ? (
          <section
            className="membership-carousel relative pb-3 pt-8 sm:pb-7 sm:pt-12"
            onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
          >
            <div
              className="membership-carousel-track"
              style={{
                '--membership-active-index': activeIndex,
                '--membership-desktop-start-index': desktopStartIndex,
                '--membership-tablet-start-index': tabletStartIndex,
              } as CSSProperties}
            >
              {tiers.map((tier, index) => {
                const details = TIER_DETAILS[tier.id];
                const isActive = index === activeIndex;
                const isCurrent = currentTierId === tier.id;
                const direction = isCurrent ? null : getChangeDirection(currentTierId, tier.id);
                return (
                  <div
                    key={tier.id}
                    className={cn('membership-slide', isActive ? 'membership-slide-active' : 'membership-slide-side')}
                  >
                    <button
                      type="button"
                      className="membership-slide-card-btn"
                      onClick={() => goTo(index)}
                      aria-label={`View ${tier.display_name} membership`}
                    >
                      <TierCard tier={tier} active={isActive} memberName={memberName} />
                    </button>
                    {details && (
                      <TierDetailsPanel
                        details={details}
                        tierId={tier.id}
                        isCurrent={isCurrent}
                        direction={direction}
                        onSelect={() => chooseTier(tier)}
                        selecting={selecting === tier.id}
                        disabled={!!selecting}
                        onLearnMore={() => setLearnMoreTier(tier.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} className="membership-arrow membership-arrow-left" aria-label="Previous membership tier"><ChevronLeft /></button>
            <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === tiers.length - 1} className="membership-arrow membership-arrow-right" aria-label="Next membership tier"><ChevronRight /></button>

            <div className="mx-auto flex max-w-[1180px] items-center justify-center gap-2 px-5 pb-2 pt-5">
              {tiers.map((tier, index) => (
                <button key={tier.id} type="button" onClick={() => goTo(index)} aria-label={`Select ${tier.display_name}`} className={cn('h-2 rounded-full transition-all duration-300', index === activeIndex ? 'w-8 bg-stone-900' : 'w-2 bg-stone-300 hover:bg-stone-500')} />
              ))}
            </div>
          </section>
        ) : (
          <div className="mx-auto max-w-lg px-5 py-16 text-center text-sm text-stone-500">Membership options are temporarily unavailable.</div>
        )}
      </div>

      <GlassModal open={!!learnMoreTier} onClose={() => setLearnMoreTier(null)} title={learnMoreTier ? TIER_DETAILS[learnMoreTier].learnMoreTitle ?? '' : ''}>
        {learnMoreTier && <div className="space-y-3"><p className="whitespace-pre-line text-sm leading-6 text-stone-600">{TIER_DETAILS[learnMoreTier].learnMoreBody}</p><button onClick={() => setLearnMoreTier(null)} className="btn-secondary w-full px-4 py-2 text-sm">Close</button></div>}
      </GlassModal>

      <GlassModal
        open={!!confirmDowngrade}
        onClose={() => setConfirmDowngrade(null)}
        title="Downgrade to Free Membership?"
      >
        {confirmDowngrade && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-900">This takes effect at the end of your billing period.</p>
                <p className="text-xs text-red-700 leading-5">
                  You keep your paid benefits until {myMembership?.current_period_end
                    ? new Date(myMembership.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                    : 'your next billing date'}. After that you move to White and lose voting credits,
                  treasury participation, and tier features. Your Empire Level and Influence are not affected.
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-600">
              You will not be charged again. You can undo this any time before your billing date.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDowngrade(null)}
                className="btn-secondary flex-1 px-4 py-2.5 text-sm"
              >
                Keep My Membership
              </button>
              <button
                onClick={confirmDowngradeToWhite}
                disabled={selecting === 'white'}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {selecting === 'white' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Cancel at Period End'}
              </button>
            </div>
          </div>
        )}
      </GlassModal>
    </Layout>
  );
}

function TierCard({ tier, active, memberName }: { tier: MembershipTier; active: boolean; memberName: string }) {
  const textClass = CARD_TEXT[tier.id];
  const mutedClass = CARD_MUTED[tier.id];
  const isFree = tier.price_monthly === 0;
  return (
    <div className={cn(CARD_SURFACE[tier.id], 'relative aspect-[1.72/1] w-full overflow-hidden rounded-[22px] p-5 text-left shadow-2xl transition-all duration-300 sm:p-8', active ? 'ring-2 ring-stone-900/10' : '')}>
      <div className="relative z-10 flex h-full min-h-0 flex-col justify-between">
        <div className="flex min-h-0 items-start justify-between gap-4">
          <div className="min-h-0">
            <p className={cn('text-[10px] font-bold uppercase tracking-[0.28em]', mutedClass)}>The Underground</p>
            <p className={cn('mt-1 text-[10px] uppercase tracking-[0.18em]', mutedClass)}>Black Empire</p>
          </div>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', COLOR_DOT[tier.id])}>
            <EmpireEmblem variant={CARD_EMBLEM_VARIANT[tier.id]} className="h-5 w-5" />
          </span>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className={cn('max-w-[14rem] truncate text-sm font-bold leading-tight sm:text-base', textClass)}>{memberName}</p>
            <p className={cn('mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] leading-tight', mutedClass)}>{CARD_COLOR_LABEL[tier.id]}</p>
          </div>
          <div className="text-right">
            <p className={cn('font-display text-xl font-bold leading-none sm:text-2xl', textClass)}>
              {isFree ? 'Free' : (
                <>
                  <span>{'$' + tier.price_monthly}</span>
                  <span className={cn('ml-1 text-[0.5em] font-medium align-baseline opacity-60', mutedClass)}>/month</span>
                </>
              )}
            </p>
            <p className={cn('mt-1 text-[10px] font-bold uppercase tracking-[0.18em] leading-tight', mutedClass)}>{CARD_STATUS[tier.id]}</p>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-[-26%] right-[-4%] opacity-[0.08]"><img src="/UBE_text_logo.png" alt="" className="w-[320px] max-w-none grayscale invert" /></div>
    </div>
  );
}

function TierDetailsPanel({
  details,
  tierId,
  isCurrent,
  direction,
  onSelect,
  selecting,
  disabled,
  onLearnMore,
}: {
  details: TierDetailsType;
  tierId: MembershipTierId;
  isCurrent: boolean;
  direction: ChangeDirection | null;
  onSelect: () => void;
  selecting: boolean;
  disabled: boolean;
  onLearnMore: () => void;
}) {
  const ctaLabel = direction ? getCtaLabel(tierId, direction, details.ctaLabel) : details.ctaLabel;
  const isDowngrade = direction === 'downgrade';
  const isSwitch = direction === 'switch';

  return (
    <div className="membership-details-panel mt-4">
      <div className="frame-utility rounded-2xl p-4 sm:p-5">
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {details.benefits.filter((benefit) => !benefit.locked).map((benefit) => (
            <div key={benefit.text} className="flex items-start gap-2 text-xs leading-5 text-stone-700 sm:text-sm"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 sm:h-5 sm:w-5"><Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" /></span>{benefit.text}</div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {isCurrent ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-stone-100 px-4 py-2.5 text-xs font-semibold text-stone-500 sm:text-sm sm:px-5 sm:py-3"><Check className="h-4 w-4" />Current membership</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={onSelect}
                disabled={disabled}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm',
                  isDowngrade
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'membership-action-button',
                )}
              >
                {selecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isDowngrade ? (
                  <ArrowDown className="h-4 w-4" />
                ) : isSwitch ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
                {ctaLabel}
              </button>
              {isSwitch && (
                <p className="text-[10px] text-stone-400 leading-tight">
                  Takes effect at your next billing date
                </p>
              )}
            </div>
          )}
          {details.learnMoreTitle && <button type="button" onClick={onLearnMore} className="inline-flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold text-stone-500 transition hover:text-stone-900 sm:py-3 sm:text-sm"><Info className="h-4 w-4" />Details</button>}
        </div>
      </div>
    </div>
  );
}

const LEDGER_SOURCE_LABELS: Record<string, string> = {
  monthly_grant: 'Monthly grant',
  initial_grant: 'Initial grant',
  upgrade_grant: 'Upgrade bonus',
  initiative_vote_spend: 'Initiative vote',
  initiative_vote_refund: 'Initiative refund',
};

function formatLedgerDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAnniversary(startedAt: string | null): string {
  if (!startedAt) return '';
  const d = new Date(startedAt);
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd'
    : 'th';
  return `${day}${suffix}`;
}

function CreditBalancePanel({
  credits,
  ledger,
  membershipStartedAt,
}: {
  credits: VotingCredits;
  ledger: CreditLedgerEntry[];
  membershipStartedAt: string | null;
}) {
  const anniversary = formatAnniversary(membershipStartedAt);

  return (
    <div className="mx-auto max-w-[1180px] px-5 mb-6">
      <div className="frame-utility rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Voting Credits</p>
              <p className="font-display text-2xl font-bold text-stone-900 leading-tight">{credits.balance}</p>
            </div>
          </div>
          {anniversary && (
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Next Grant</p>
              <p className="text-sm font-semibold text-stone-700">Every {anniversary} of the month</p>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-stone-500 leading-relaxed">
          Initiative Voting Credits are granted on your monthly anniversary date and carry forward up to 30.
          Spend them on Metro Initiative voting — each initiative you support costs 1 credit.
        </p>
        {ledger.length > 0 && (
          <div className="mt-4 border-t border-stone-200 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Recent Activity</p>
            <div className="space-y-1.5">
              {ledger.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">{LEDGER_SOURCE_LABELS[entry.source] ?? entry.source}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-stone-400">{formatLedgerDate(entry.created_at)}</span>
                    <span className={cn('font-semibold tabular-nums', entry.amount > 0 ? 'text-emerald-700' : 'text-stone-700')}>
                      {entry.amount > 0 ? '+' : ''}{entry.amount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MembershipPage;
