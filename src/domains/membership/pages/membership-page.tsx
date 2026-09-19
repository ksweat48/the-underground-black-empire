import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
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
  updateMembershipTier,
  startStripeCheckout,
  TIER_DETAILS,
} from '@/domains/membership/services';
import type { MembershipTier, MembershipTierId, MemberMembership, CardColor, TierDetails } from '@/domains/membership/types';

const COLOR_DOT: Record<CardColor, string> = {
  white: 'bg-white border border-stone-300',
  black: 'bg-white/10 border border-white/30',
  emerald: 'bg-emerald-700',
  plum: 'bg-purple-800',
};

const CARD_EMBLEM: Record<CardColor, 'light' | 'dark'> = {
  white: 'light',
  black: 'dark',
  emerald: 'dark',
  plum: 'dark',
};

const CARD_SURFACE: Record<MembershipTierId, string> = {
  white: 'membership-card-white',
  black: 'membership-card-black',
  black_plus: 'membership-card-black-plus',
  emerald: 'membership-card-emerald',
  plum: 'membership-card-plum',
};

const CARD_TEXT: Record<CardColor, string> = {
  white: 'text-stone-900',
  black: 'text-white',
  emerald: 'text-white',
  plum: 'text-white',
};

const CARD_MUTED: Record<CardColor, string> = {
  white: 'text-stone-500',
  black: 'text-white/75',
  emerald: 'text-emerald-100/80',
  plum: 'text-fuchsia-100/80',
};

const CARD_STATUS: Record<MembershipTierId, string> = {
  white: 'Participate',
  black: 'Contribute',
  black_plus: 'Serve',
  emerald: 'Family',
  plum: 'Legacy',
};

const CARD_COLOR_LABEL: Record<MembershipTierId, string> = {
  white: 'White Card',
  black: 'Black Card',
  black_plus: 'Black+',
  emerald: 'Emerald',
  plum: 'Plum',
};

export function MembershipPage() {
  const { session, sessionVersion } = useAuth();
  const userId = session?.user.id ?? '';
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [myMembership, setMyMembership] = useState<MemberMembership | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selecting, setSelecting] = useState<MembershipTierId | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [learnMoreTier, setLearnMoreTier] = useState<MembershipTierId | null>(null);
  const touchStartX = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoadError(false);
    try {
      const [tierData, membership] = await Promise.all([
        fetchMembershipTiers(),
        fetchMyMembership(userId),
      ]);
      setTiers(tierData);
      setMyMembership(membership);
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

  const chooseTier = async (tier: MembershipTier) => {
    if (!userId || !myMembership || myMembership.membership_tier === tier.id) return;
    setSelecting(tier.id);
    setSelectError(null);
    try {
      if (tier.price_monthly === 0) {
        await updateMembershipTier(userId, tier.id);
        await loadData();
      } else {
        const checkoutUrl = await startStripeCheckout(tier.id);
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
        } else {
          setSelectError('Unable to start checkout. Please try again.');
        }
      }
    } catch {
      setSelectError('Unable to update your membership tier. Please try again.');
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
  const desktopStartIndex = Math.min(Math.max(activeIndex - 1, 0), Math.max(tiers.length - 3, 0));
  const tabletStartIndex = Math.min(Math.max(activeIndex - 1, 0), Math.max(tiers.length - 2, 0));

  return (
    <Layout fullWidth>
      {selectError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-empire-danger/10 border border-empire-danger/20 animate-fade-up mb-4">
          <p className="text-xs text-empire-danger flex-1">{selectError}</p>
        </div>
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
                      <TierDetails
                        details={details}
                        isCurrent={myMembership?.membership_tier === tier.id}
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
    </Layout>
  );
}

function TierCard({ tier, active, memberName }: { tier: MembershipTier; active: boolean; memberName: string }) {
  const textClass = CARD_TEXT[tier.card_color];
  const mutedClass = CARD_MUTED[tier.card_color];
  const isFree = tier.price_monthly === 0;
  return (
    <div className={cn(CARD_SURFACE[tier.id], 'relative aspect-[1.72/1] w-full overflow-hidden rounded-[22px] p-5 text-left shadow-2xl transition-all duration-300 sm:p-8', active ? 'ring-2 ring-stone-900/10' : '')}>
      <div className="relative z-10 flex h-full min-h-0 flex-col justify-between">
        <div className="flex min-h-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={cn('text-[10px] font-bold uppercase tracking-[0.28em]', mutedClass)}>The Underground</p>
            <p className={cn('mt-1 text-[10px] uppercase tracking-[0.18em]', mutedClass)}>Black Empire</p>
          </div>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', COLOR_DOT[tier.card_color])}>
            <EmpireEmblem variant={CARD_EMBLEM[tier.card_color]} className="h-5 w-5" />
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
      <div className="pointer-events-none absolute bottom-[-26%] right-[-4%] opacity-[0.08]"><img src="/the_underground_black_empire_logo_no_background.png" alt="" className="w-[320px] max-w-none grayscale invert" /></div>
    </div>
  );
}

function TierDetails({
  details,
  isCurrent,
  onSelect,
  selecting,
  disabled,
  onLearnMore,
}: {
  details: TierDetails;
  isCurrent: boolean;
  onSelect: () => void;
  selecting: boolean;
  disabled: boolean;
  onLearnMore: () => void;
}) {
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
            <button type="button" onClick={onSelect} disabled={disabled} className="rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm">{selecting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : details.ctaLabel}</button>
          )}
          {details.learnMoreTitle && <button type="button" onClick={onLearnMore} className="inline-flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold text-stone-500 transition hover:text-stone-900 sm:py-3 sm:text-sm"><Info className="h-4 w-4" />Details</button>}
        </div>
      </div>
    </div>
  );
}

export default MembershipPage;
