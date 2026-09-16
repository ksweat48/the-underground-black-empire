import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Users,
  TrendingUp,
  Map,
  CheckCircle2,
  Trophy,
  Share2,
  Copy,
  Check,
  UserPlus,
  Building2,
  Megaphone,
  ChevronRight,
  Newspaper,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { GlassModal } from '@/shared/components/glass-modal';
import { GlassDrawer } from '@/shared/components/glass-drawer';
import { GuideMissionCard } from '@/shared/components/guide-mission-card';
import { USMapCard } from '@/shared/components/us-map-card';
import { SwipeableCardContainer } from '@/shared/components/swipeable-card-container';
import { EmpireFrame } from '@/shared/components/empire-frame';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { MemberProfileModal } from '@/shared/components/member-profile-modal';
import { Avatar } from '@/shared/components/avatar';
import { ErrorBanner } from '@/shared/components/error-banner';

import { useAuth } from '@/domains/identity/auth-context';
import {
  PROGRESSION_RULES,
  getCityTier,
  getCityTierLevel,
  getEmpireCivilizationLevel,
  type CityTierName,
} from '@/config/progression-rules';
import { supabase } from '@/shared/supabase-client';
import {
  fetchMemberDashboard,
  fetchCities,
  fetchEmpireProgress,
  fetchCityWithMetro,
  fetchEmpireFeed,
  fetchLocalFeed,
  fetchEmpireCouncilNews,
  fetchLocalCouncilNews,
  fetchMapData,
  type MemberDashboardData,
  type EmpireProgressData,
  type FeedEvent,
  type CouncilNewsEvent,
  type StateMapData,
} from '@/domains/founder-campaign/services';
import { cn } from '@/shared/cn';

type FeedTab = 'local' | 'empire';

type MergedFeedItem = {
  id: string;
  event_type: string;
  display_name: string | null;
  city_name: string | null;
  metro_id: string | null;
  metro_name: string | null;
  created_at: string;
  message: string;
  member_id: string | null;
  title: string | null;
  is_council_news: boolean;
  avatar_url: string | null;
};

function mergeFeedWithNews(news: CouncilNewsEvent[], events: FeedEvent[]): MergedFeedItem[] {
  const newsItems: MergedFeedItem[] = news.map((n) => ({
    id: n.id,
    event_type: 'council_news',
    display_name: n.display_name,
    city_name: n.city_name,
    metro_id: n.metro_id,
    metro_name: n.metro_name,
    created_at: n.created_at,
    message: n.message,
    member_id: n.member_id,
    title: n.title,
    is_council_news: true,
    avatar_url: n.avatar_url,
  }));
  const activityItems: MergedFeedItem[] = events.map((e) => ({
    id: e.id,
    event_type: e.event_type,
    display_name: e.display_name,
    city_name: e.city_name,
    metro_id: e.metro_id,
    metro_name: e.metro_name,
    created_at: e.created_at,
    message: e.message,
    member_id: e.member_id,
    title: null,
    is_council_news: false,
    avatar_url: e.avatar_url,
  }));
  return [...newsItems, ...activityItems].sort((a, b) => {
    if (a.is_council_news !== b.is_council_news) {
      return a.is_council_news ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ==================== Feed Category Config ====================

interface FeedCategoryConfig {
  label: string;
  icon: typeof Trophy;
  iconColor: string;
  ringColor: string;
  labelColor: string;
}

const FEED_CATEGORIES: Record<string, FeedCategoryConfig> = {
  council_news: {
    label: 'Council News',
    icon: Newspaper,
    iconColor: 'text-empire-success',
    ringColor: 'bg-empire-success/10 border-empire-success/30',
    labelColor: 'text-empire-success',
  },
  referral_verified: {
    label: 'New Member',
    icon: UserPlus,
    iconColor: 'text-empire-success',
    ringColor: 'bg-empire-success/10 border-empire-success/30',
    labelColor: 'text-empire-success',
  },
  city_reached_tribe: {
    label: 'City Milestone',
    icon: Building2,
    iconColor: 'text-empire-info',
    ringColor: 'bg-empire-info/10 border-empire-info/30',
    labelColor: 'text-empire-info',
  },
  city_tier_changed: {
    label: 'City Milestone',
    icon: Megaphone,
    iconColor: 'text-empire-info',
    ringColor: 'bg-empire-info/10 border-empire-info/30',
    labelColor: 'text-empire-info',
  },
  founder_number_assigned: {
    label: 'New Member',
    icon: Users,
    iconColor: 'text-empire-success',
    ringColor: 'bg-empire-success/10 border-empire-success/30',
    labelColor: 'text-empire-success',
  },
  member_number_assigned: {
    label: 'New Member',
    icon: Users,
    iconColor: 'text-empire-success',
    ringColor: 'bg-empire-success/10 border-empire-success/30',
    labelColor: 'text-empire-success',
  },
  empire_progress_updated: {
    label: 'Empire Announcement',
    icon: TrendingUp,
    iconColor: 'text-empire-gold',
    ringColor: 'bg-empire-gold/10 border-empire-gold/30',
    labelColor: 'text-empire-gold',
  },
};

const DEFAULT_CATEGORY: FeedCategoryConfig = {
  label: 'Empire Announcement',
  icon: Megaphone,
  iconColor: 'text-empire-gold',
  ringColor: 'bg-empire-gold/10 border-empire-gold/30',
  labelColor: 'text-empire-gold',
};

export function EmpireDashboardPage() {
  const { session, sessionVersion } = useAuth();
  const [data, setData] = useState<MemberDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [empire, setEmpire] = useState<EmpireProgressData>({ tribe_city_count: 0, total_population: 0, total_cities: 0, total_states: 0 });
  const [assignedNumber] = useState<number | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showCityDrawer, setShowCityDrawer] = useState(false);
  const [metroData, setMetroData] = useState<{ name: string; rank: number; populationCount: number; cityCount: number; metroId: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState<FeedTab>('local');
  const [localFeed, setLocalFeed] = useState<FeedEvent[]>([]);
  const [empireFeed, setEmpireFeed] = useState<FeedEvent[]>([]);
  const [localCouncilNews, setLocalCouncilNews] = useState<CouncilNewsEvent[]>([]);
  const [empireCouncilNews, setEmpireCouncilNews] = useState<CouncilNewsEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const [mobileCollapsed, setMobileCollapsed] = useState(false);
  const [desktopCompact, setDesktopCompact] = useState(false);
  const [mapData, setMapData] = useState<Map<string, StateMapData> | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchLastY = useRef(0);

  const memberId = session?.user.id ?? null;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchLastY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    const delta = y - touchStartY.current;
    if (delta < -20) {
      setMobileCollapsed(true);
    } else if (delta > 20) {
      setMobileCollapsed(false);
    }
    touchLastY.current = y;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY > 4) {
      setDesktopCompact(true);
    } else if (e.deltaY < -4) {
      setDesktopCompact(false);
    }
  }, []);

  const handleShare = useCallback(async () => {
    const code = data?.email ?? '';
    const link = `${window.location.origin}/auth/sign-up?ref=${code}`;
    const shareData = {
      title: 'The Underground Black Empire',
      text: 'Join the Empire and earn Influence. Every verified referral earns you 25 Influence.',
      url: link,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(link);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch { /* clipboard unavailable */ }
    }
  }, [data?.email]);

  const loadDashboard = useCallback(() => {
    if (!memberId) { setLoading(false); return; }
    setDashboardError(false);
    fetchMemberDashboard(memberId)
      .then(setData)
      .catch(() => { setData(null); setDashboardError(true); })
      .finally(() => setLoading(false));
  }, [memberId, sessionVersion]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    Promise.all([fetchCities(), fetchEmpireProgress()])
      .then(([, progress]) => {
        setEmpire(progress);
      })
      .catch(() => {});
  }, [sessionVersion]);

  useEffect(() => {
    fetchMapData()
      .then(setMapData)
      .catch(() => setMapData(null))
      .finally(() => setMapLoading(false));
  }, [sessionVersion]);

  // Fetch metro data for the member's city
  useEffect(() => {
    if (data?.city_name) {
      supabase
        .from('members')
        .select('city_id')
        .eq('id', memberId)
        .maybeSingle()
        .then(({ data: member, error }) => {
          if (error || !member?.city_id) return;
          supabase
            .from('cities')
            .select('id, metro_id')
            .eq('id', member.city_id)
            .maybeSingle()
            .then(({ data: cityData, error: cityError }) => {
              if (cityError || !cityData?.id) return;
              fetchCityWithMetro(cityData.id).then((metro) => {
                if (metro) {
                  setMetroData({
                    name: metro.metro_name ?? 'Unassigned',
                    rank: metro.metro_rank,
                    populationCount: metro.metro_population_count,
                    cityCount: metro.metro_city_count,
                    metroId: cityData.metro_id,
                  });
                }
              });
            });
        });
    }
  }, [data?.city_name, memberId, sessionVersion]);

  // Fetch both feeds whenever metro data is available
  useEffect(() => {
    (async () => {
      setFeedLoading(true);
      try {
        const [empireEvents, localEvents, empireNews, localNews] = await Promise.all([
          fetchEmpireFeed(20),
          metroData?.metroId
            ? fetchLocalFeed(metroData.metroId, 20)
            : Promise.resolve([]),
          fetchEmpireCouncilNews(20),
          metroData?.metroId
            ? fetchLocalCouncilNews(metroData.metroId, 20)
            : Promise.resolve([]),
        ]);
        setEmpireFeed(empireEvents);
        setLocalFeed(localEvents);
        setEmpireCouncilNews(empireNews);
        setLocalCouncilNews(localNews);
      } catch {
        setEmpireFeed([]);
        setLocalFeed([]);
        setEmpireCouncilNews([]);
        setLocalCouncilNews([]);
        setFeedError(true);
      } finally {
        setFeedLoading(false);
      }
    })();
  }, [metroData?.metroId, sessionVersion]);

  // If no metro, default to empire tab
  useEffect(() => {
    if (metroData && !metroData.metroId) {
      setActiveTab('empire');
    }
  }, [metroData]);

  if (loading) {
    return (
      <Layout fullWidth showTopBar>
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-antique-gold/30 border-t-antique-gold animate-spin" />
        </div>
      </Layout>
    );
  }

  if (dashboardError) {
    return (
      <Layout fullWidth showTopBar>
        <div className="flex items-center justify-center py-20">
          <ErrorBanner message="Unable to load your dashboard. Please try again." onRetry={loadDashboard} />
        </div>
      </Layout>
    );
  }

  const civLevel = getEmpireCivilizationLevel(empire.tribe_city_count, empire.total_population);
  const cityTier = data?.city_population_count ? getCityTier(data.city_population_count) : 'group';
  const cityTierLevel = getCityTierLevel(cityTier);

  const currentFeed = activeTab === 'local'
    ? mergeFeedWithNews(localCouncilNews, localFeed)
    : mergeFeedWithNews(empireCouncilNews, empireFeed);
  const hasLocalFeed = metroData?.metroId != null;

  return (
    <Layout fullWidth showTopBar>
      <div className={cn(
        'w-full min-w-0 px-2 sm:px-3 pb-4 lg:pb-10 flex flex-col h-full transition-[padding-top] duration-300 ease-out',
        mobileCollapsed ? 'pt-0' : 'pt-4',
        desktopCompact && 'lg:pt-2',
      )}>
        <div className="w-full min-w-0 max-w-[960px] mx-auto flex flex-col h-full">
        {/* Assigned number toast */}
        {assignedNumber !== null && (
          <div className="frame-utility p-3 border-emerald-700/30 animate-fade-up flex items-center gap-3 mb-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-display text-sm font-semibold text-emerald-200">
                You are Member #{assignedNumber}!
              </p>
              <p className="text-[11px] text-emerald-300/60">Your member number has been assigned.</p>
            </div>
          </div>
        )}

        {/* Share CTA — slim referral bar */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-300 ease-out lg:max-h-16 lg:translate-y-0 lg:opacity-100 lg:pointer-events-auto',
            mobileCollapsed
              ? 'max-h-0 -translate-y-2 opacity-0 pointer-events-none'
              : 'max-h-16 translate-y-0 opacity-100',
          )}
        >
          <button
            onClick={handleShare}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 mb-2 shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-500/25 transition-all duration-200 hover:border-emerald-500/45 hover:bg-emerald-500/15 active:scale-[0.99] animate-fade-up"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Share2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-display text-xs font-medium text-emerald-200 truncate">Share the Empire to earn Influence</span>
            </div>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400/70 shrink-0">
              {shareCopied ? (
                <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
              ) : (
                <><Share2 className="w-3 h-3" /> Share</>
              )}
            </span>
          </button>
        </div>

        {/* Dashboard columns: swipeable map/mission card on the left, feed on the right */}
        <div className={cn(
          'grid grid-cols-1 flex-1 min-h-0 items-start lg:items-stretch transition-all duration-300 ease-out',
          mobileCollapsed ? 'gap-0 pt-0 content-start' : 'gap-4 pt-4',
          desktopCompact ? 'lg:grid-cols-[2fr_5fr] lg:gap-3 lg:pt-3' : 'lg:grid-cols-2 lg:gap-4 lg:pt-4',
          mobileCollapsed && 'lg:content-stretch',
        )}>
          <SwipeableCardContainer
            cards={[
              {
                label: 'Empire Map',
                node: (
                  <USMapCard
                    mapData={mapData}
                    loading={mapLoading}
                    collapsed={mobileCollapsed}
                  />
                ),
              },
              {
                label: 'Mission',
                node: (
                  <GuideMissionCard
                    civLevel={civLevel}
                    population={empire.total_population}
                    tribeCityCount={empire.tribe_city_count}
                    collapsed={mobileCollapsed}
                  />
                ),
              },
            ]}
            collapsed={mobileCollapsed}
            className={cn('shrink-0 lg:mb-8', desktopCompact ? 'lg:min-h-[200px]' : 'lg:min-h-[360px]')}
          />

          {/* City tabs + feed (sole scrollable zone) */}
          <div
            className={cn(
              'flex min-h-0 w-full flex-col animate-fade-up transition-[margin-top] duration-300 ease-out',
              mobileCollapsed ? 'mt-0' : 'mt-5',
              desktopCompact && 'lg:mt-2',
            )}
            style={{
              animationDelay: '300ms',
              minHeight: mobileCollapsed ? '0px' : 'calc((100dvh - 126px - 48px) * 0.40)',
              scrollMarginTop: 'calc(96px + env(safe-area-inset-top))',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onWheel={handleWheel}
          >
            <FeedTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              hasLocalFeed={hasLocalFeed}
            />
            <div ref={scrollRef} className="flex w-full flex-1 min-h-0 flex-col overflow-y-auto scrollbar-none pb-6">
              {activeTab === 'local' && data?.city_name && (
                <CityCard
                  cityName={data.city_name}
                  cityTier={cityTier}
                  cityTierLevel={cityTierLevel}
                  populationCount={data.city_population_count ?? 0}
                  onClick={() => setShowCityDrawer(true)}
                />
              )}
              {feedError ? (
                <ErrorBanner message="Unable to load activity feed." onRetry={() => { setFeedError(false); setFeedLoading(true); }} />
              ) : (
                <FeedList events={currentFeed} loading={feedLoading} onCardClick={setProfileMemberId} />
              )}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* City Detail Drawer */}
      <GlassDrawer
        open={showCityDrawer}
        onClose={() => setShowCityDrawer(false)}
        title={data?.city_name ?? 'Your City'}
      >
        {data?.city_name ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="badge-gold text-xs">
                  <EmpireEmblem variant="dark" className="w-3 h-3" />
                  {PROGRESSION_RULES.city[cityTier].label} · City Level {cityTierLevel}
                </span>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-bold text-antique-200 tabular-nums">
                  {data.city_population_count ?? 0}
                </p>
                <p className="text-xs text-stone">members</p>
              </div>
            </div>

            {metroData && (
              <div className="grid grid-cols-3 gap-3">
                <EmpireFrame variant="utility" className="p-3 text-center">
                  <Map className="w-4 h-4 text-antique-gold mx-auto mb-1" />
                  <p className={cn(
                    'font-display font-bold text-ivory leading-tight break-words',
                    metroData.name.length > 12 ? 'text-base' : metroData.name.length > 8 ? 'text-xl' : 'text-2xl',
                  )}>{metroData.name}</p>
                  <p className="text-[10px] text-stone mt-1">Metro Area</p>
                </EmpireFrame>
                <EmpireFrame variant="utility" className="p-3 text-center">
                  <Trophy className="w-4 h-4 text-antique-gold mx-auto mb-1" />
                  <p className="text-2xl font-display font-bold text-antique-200 tabular-nums">#{metroData.rank}</p>
                  <p className="text-[10px] text-stone mt-1">Metro Rank</p>
                </EmpireFrame>
                <EmpireFrame variant="utility" className="p-3 text-center">
                  <Users className="w-4 h-4 text-antique-gold mx-auto mb-1" />
                  <p className="text-2xl font-display font-bold text-antique-200 tabular-nums">{metroData.populationCount}</p>
                  <p className="text-[10px] text-stone mt-1">Metro Population</p>
                </EmpireFrame>
              </div>
            )}

            <button onClick={() => { setShowCityDrawer(false); setShowInviteModal(true); }} className="btn-secondary text-sm w-full">
              <Share2 className="w-4 h-4" />
              Invite Members to {data.city_name}
            </button>
          </div>
        ) : (
          <p className="text-sm text-stone">No city selected yet.</p>
        )}
      </GlassDrawer>

      {/* Invite Modal */}
      <GlassModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite Members"
      >
        <InviteContent referralCode={data?.email ?? ''} />
      </GlassModal>

      {/* Member Profile Popup (from feed card click) */}
      <MemberProfileModal
        memberId={profileMemberId}
        onClose={() => setProfileMemberId(null)}
        currentUserId={memberId}
      />

    </Layout>
  );
}

// ==================== City Card ====================

function CityCard({
  cityName,
  cityTier,
  cityTierLevel,
  populationCount,
  onClick,
}: {
  cityName: string;
  cityTier: CityTierName;
  cityTierLevel: number;
  populationCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="frame-utility w-full p-4 flex items-center justify-between text-left mb-3 transition-all duration-200 hover:border-ink-700/40 active:scale-[0.98]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-12 h-12 rounded-full bg-ink-800/40 border border-ink-700/30 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-ink-400" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-display font-semibold text-ink-100 truncate">{cityName}</p>
          <p className="text-xs text-ink-400 mt-0.5">
            {PROGRESSION_RULES.city[cityTier].label} · City Level {cityTierLevel}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xl font-display font-bold text-ink-100 tabular-nums">
          {populationCount}/100
        </p>
        <p className="text-[10px] text-ink-500">population</p>
      </div>
    </button>
  );
}

// ==================== Feed Tabs (Game Segmented Control) ====================

function FeedTabs({
  activeTab,
  onTabChange,
  hasLocalFeed,
}: {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  hasLocalFeed: boolean;
}) {
  const touchStartX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const threshold = 50;

    if (Math.abs(deltaX) > threshold) {
      if (deltaX > 0 && activeTab === 'empire' && hasLocalFeed) {
        onTabChange('local');
      } else if (deltaX < 0 && activeTab === 'local') {
        onTabChange('empire');
      }
    }
  };

  const tabs: { key: FeedTab; label: string; disabled?: boolean }[] = [
    { key: 'local', label: 'Local', disabled: !hasLocalFeed },
    { key: 'empire', label: 'Empire' },
  ];

  return (
    <div
      className="seg-control seg-control-wide mb-3"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && onTabChange(tab.key)}
            disabled={tab.disabled}
            className={cn(
              'seg-btn',
              isActive && 'seg-btn-active',
              tab.disabled && 'opacity-35 cursor-not-allowed pointer-events-none',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ==================== Feed List (Intelligence Cards) ====================

function FeedList({ events, loading, onCardClick }: { events: MergedFeedItem[]; loading: boolean; onCardClick: (memberId: string) => void }) {
  if (loading) {
    return (
      <div className="w-full space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="frame-intel p-3 flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-ink-800/40 border border-ink-700/30 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 rounded bg-ink-800/40 w-1/4" />
              <div className="h-3 rounded bg-ink-800/30 w-3/4" />
            </div>
            <div className="w-4 h-4 rounded bg-ink-800/30 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="frame-intel p-6 text-center">
        <p className="text-sm text-sand">No activity yet.</p>
        <p className="text-[11px] text-stone mt-1">Events will appear here as the community grows.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {events.map((event) => (
        <IntelligenceCard key={event.id} event={event} onCardClick={onCardClick} />
      ))}
    </div>
  );
}

// ==================== Intelligence Card ====================

function getInitials(name: string): string {
  const parts = name.split(/[\s@._-]/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function IntelligenceCard({ event, onCardClick }: { event: MergedFeedItem; onCardClick: (memberId: string) => void }) {
  const category = FEED_CATEGORIES[event.event_type] ?? DEFAULT_CATEGORY;
  const { icon: Icon, label, iconColor, ringColor, labelColor } = category;
  const clickable = event.member_id !== null;
  const hasAvatar = event.member_id !== null && event.avatar_url;
  const displayName = event.display_name ?? 'Someone';

  return (
    <div
      className={cn('frame-intel w-full text-left p-3 flex items-center gap-3 group transition-all duration-200', clickable ? 'cursor-pointer hover:border-antique-gold/30 hover:bg-ink-800/30 active:scale-[0.98]' : 'cursor-default')}
      onClick={clickable ? () => onCardClick(event.member_id!) : undefined}
    >
      {/* Avatar photo or category icon medallion */}
      {hasAvatar ? (
        <div className={cn(
          'shrink-0 w-10 h-10 rounded-full overflow-hidden border transition-all duration-200 group-hover:scale-105',
          ringColor,
        )}>
          <Avatar
            src={event.avatar_url}
            initials={getInitials(displayName)}
            initialsClassName="text-xs"
            initialsStyle={{ color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.65)' }}
          />
        </div>
      ) : (
        <div className={cn(
          'flex items-center justify-center shrink-0 w-10 h-10 rounded-full border transition-all duration-200 group-hover:scale-105',
          ringColor,
        )}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-[9px] font-bold uppercase tracking-wider mb-0.5', labelColor)}>
          {label}
        </p>
        {event.is_council_news && event.title ? (
          <>
            <p className="text-sm font-display font-semibold text-ivory leading-snug line-clamp-2">
              {event.title}
            </p>
            <p className="text-xs text-stone leading-snug line-clamp-2 mt-0.5">
              {event.message}
            </p>
          </>
        ) : (
          <p className="text-sm text-ivory leading-snug">
            <span className="text-antique-200 font-medium">{event.display_name ?? 'Someone'}</span>{' '}
            {event.message}
          </p>
        )}
        {event.city_name && (
          <p className="text-[10px] text-stone mt-0.5">{event.city_name}</p>
        )}
      </div>

      {/* Right side: timestamp + chevron */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-stone tabular-nums">
          {formatTimeAgo(event.created_at)}
        </span>
        <ChevronRight className="w-4 h-4 text-stone group-hover:text-antique-gold transition-colors" />
      </div>
    </div>
  );
}

// ==================== Invite Content ====================

function InviteContent({ referralCode }: { referralCode: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/auth/sign-up?ref=${referralCode}`;

  const handleShare = async () => {
    const shareData = {
      title: 'The Underground Black Empire',
      text: 'Join the Empire and earn Influence. Every verified referral earns you 25 Influence.',
      url: link,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* clipboard unavailable */ }
    }
  };

  return (
    <div>
      <p className="text-sm text-sand mb-4">
        Share your referral link. Every verified referral earns you 25 Influence.
      </p>
      <button onClick={handleShare} className="w-full flex items-center justify-center gap-2 text-sm rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-2.5 font-display font-medium text-emerald-200 transition-all duration-200 hover:bg-emerald-500/20 hover:border-emerald-500/50">
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-emerald-400" />}
        {copied ? 'Copied!' : 'Share Link'}
      </button>
      <div className="flex items-center gap-2 mt-4 text-sm text-emerald-400/60">
        <Copy className="w-4 h-4 text-emerald-400/70" />
        <span className="font-mono text-xs break-all">{link}</span>
      </div>
    </div>
  );
}

// ==================== Utilities ====================

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default EmpireDashboardPage;
