import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Store,
  Package,
  Wrench,
  CalendarDays,
  Heart,
  MessageCircle,
  MapPin,
  BadgeCheck,
  TrendingUp,
  Clock,
  Loader2,
  Image as ImageIcon,
  ShieldAlert,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchListings,
  fetchCommunityFeed,
  fetchEvents,
  fetchMemberCityInfo,
  fetchCityIdsInMetro,
  type MarketListing,
  type CommunityFeedItem,
  type MarketEvent,
  type ListingCategory,
} from '@/domains/market/services';
import { PLACEHOLDER_LISTINGS, PLACEHOLDER_EVENTS, PLACEHOLDER_FEED } from '@/domains/market/placeholder-data';

type CategoryFilter = 'feed' | 'market' | ListingCategory;
type ScopeFilter = 'local' | 'empire';

const CATEGORY_CONFIG: Record<CategoryFilter, { label: string; icon: typeof Store }> = {
  feed: { label: 'Feed', icon: Search },
  market: { label: 'Market', icon: Store },
  products: { label: 'Products', icon: Package },
  services: { label: 'Services', icon: Wrench },
  events: { label: 'Events', icon: CalendarDays },
};

export function MarketPage() {
  const { session, sessionVersion } = useAuth();
  const navigate = useNavigate();
  const userId = session?.user.id ?? '';

  const [cityInfo, setCityInfo] = useState<{ cityId: string | null; metroId: string | null; cityName: string | null }>({
    cityId: null,
    metroId: null,
    cityName: null,
  });
  const [scope, setScope] = useState<ScopeFilter>('local');
  const [category, setCategory] = useState<CategoryFilter>('feed');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [feed, setFeed] = useState<CommunityFeedItem[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetchMemberCityInfo(userId).then(setCityInfo).catch(() => {});
  }, [userId, sessionVersion]);

  const loadListings = useCallback(async () => {
    if (!cityInfo.cityId) { setLoading(false); return; }
    setLoading(true);
    try {
      let metroIds: string[] = [];
      if (scope === 'local' && cityInfo.metroId) {
        metroIds = await fetchCityIdsInMetro(cityInfo.metroId);
      }
      const data = await fetchListings({
        cityId: scope === 'local' ? cityInfo.cityId : undefined,
        metroCityIds: scope === 'local' ? metroIds : undefined,
        category,
        search,
        limit: 50,
      });
      setListings(data);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [cityInfo.cityId, cityInfo.metroId, scope, category, search]);

  const loadFeed = useCallback(async () => {
    if (!cityInfo.cityId) { setFeedLoading(false); return; }
    setFeedLoading(true);
    try {
      let metroIds: string[] = [];
      if (scope === 'local' && cityInfo.metroId) {
        metroIds = await fetchCityIdsInMetro(cityInfo.metroId);
      }
      const data = scope === 'local'
        ? await fetchCommunityFeed(cityInfo.cityId, metroIds, 20)
        : await fetchCommunityFeed(undefined, undefined, 20);
      setFeed(data);
    } catch {
      setFeed([]);
    } finally {
      setFeedLoading(false);
    }
  }, [cityInfo.cityId, cityInfo.metroId, scope]);

  const loadEvents = useCallback(async () => {
    if (!cityInfo.cityId) { setEventsLoading(false); return; }
    setEventsLoading(true);
    try {
      let metroIds: string[] = [];
      if (scope === 'local' && cityInfo.metroId) {
        metroIds = await fetchCityIdsInMetro(cityInfo.metroId);
      }
      const data = await fetchEvents({
        cityId: scope === 'local' ? cityInfo.cityId : undefined,
        metroCityIds: scope === 'local' ? metroIds : undefined,
        upcomingOnly: true,
        limit: 10,
      });
      setEvents(data);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [cityInfo.cityId, cityInfo.metroId, scope]);

  useEffect(() => { loadListings(); }, [loadListings]);
  useEffect(() => { loadFeed(); }, [loadFeed]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleSearch = () => {
    setSearch(searchInput.trim());
  };

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const displayListings = useMemo(() => {
    if (listings.length > 0) return listings;
    return PLACEHOLDER_LISTINGS;
  }, [listings]);

  const displayEvents = useMemo(() => {
    if (events.length > 0) return events;
    return PLACEHOLDER_EVENTS;
  }, [events]);

  const displayFeed = useMemo(() => {
    if (feed.length > 0) return feed;
    return PLACEHOLDER_FEED;
  }, [feed]);

  const featuredListings = useMemo(() => {
    if (category === 'feed' || category === 'events') return [];
    const source = category === 'market'
      ? displayListings
      : displayListings.filter((l) => l.category === category);
    return [...source].sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0)).slice(0, 5);
  }, [displayListings, category]);

  const filteredListings = useMemo(() => {
    if (category === 'feed' || category === 'events') return [];
    if (category === 'market') return displayListings;
    return displayListings.filter((l) => l.category === category);
  }, [displayListings, category]);

  return (
    <Layout fullWidth>
      <div className="w-full min-w-0 max-w-[960px] mx-auto px-2 sm:px-3 pt-3 pb-24 space-y-4">
        {/* Scope toggle (centered) */}
        <div className="flex justify-center animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="seg-control">
            <button
              className={cn('seg-btn', scope === 'local' && 'seg-btn-active')}
              onClick={() => setScope('local')}
              disabled={!cityInfo.metroId}
            >
              Local
            </button>
            <button
              className={cn('seg-btn', scope === 'empire' && 'seg-btn-active')}
              onClick={() => setScope('empire')}
            >
              Empire
            </button>
          </div>
        </div>

        {/* Search and category filters */}
        <div
          className="flex w-full min-w-0 items-center gap-2 overflow-x-auto scrollbar-none animate-fade-up pb-0.5"
          style={{ animationDelay: '100ms' }}
        >
          <div className={cn(
            'relative shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out',
            searchOpen ? 'w-[190px] opacity-100 sm:w-[240px]' : 'w-0 opacity-0'
          )}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-empire-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search..."
              tabIndex={searchOpen ? 0 : -1}
              className="input-field w-full pl-8 py-2 text-xs"
            />
          </div>
          <button
            onClick={() => setSearchOpen((isOpen) => !isOpen)}
            className="btn-primary flex h-[34px] w-[38px] shrink-0 items-center justify-center rounded-lg p-0"
            aria-label={searchOpen ? 'Close search' : 'Open search'}
            title={searchOpen ? 'Close search' : 'Open search'}
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>

          {(Object.keys(CATEGORY_CONFIG) as CategoryFilter[]).map((key) => {
            const config = CATEGORY_CONFIG[key];
            const Icon = config.icon;
            const isActive = category === key;
            return (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={cn(
                  'flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium whitespace-nowrap transition-all duration-200',
                  isActive
                    ? 'bg-empire-gold/10 border-empire-gold/30 text-empire-gold'
                    : 'frame-utility text-empire-text-muted hover:text-empire-ivory'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {config.label}
              </button>
            );
          })}
        </div>

        {/* ==================== FEED VIEW ==================== */}
        {category === 'feed' && (
          <>
            {/* Upcoming Events horizontal scroll */}
            <section className="animate-fade-up" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <CalendarDays className="w-3.5 h-3.5 text-empire-gold" />
                <h2 className="font-display text-[10px] font-semibold text-empire-ivory uppercase tracking-wider">Events</h2>
              </div>
              {eventsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 text-empire-text-muted animate-spin" />
                </div>
              ) : displayEvents.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No events this week"
                  description="Create an event to bring your community together."
                  actionLabel="Create an Event"
                  onAction={() => navigate('/market/create/event')}
                />
              ) : (
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                  {displayEvents.map((event) => (
                    <EventCard key={event.id} event={event} onClick={() => navigate(`/market/listing/${event.listing_id ?? ''}`)} />
                  ))}
                </div>
              )}
            </section>

            {/* Combined community feed */}
            <section className="animate-fade-up" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <MessageCircle className="w-3.5 h-3.5 text-empire-gold" />
                <h2 className="font-display text-[10px] font-semibold text-empire-ivory uppercase tracking-wider">Feed</h2>
              </div>

              {feedLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-empire-text-muted animate-spin" />
                </div>
              ) : displayFeed.length === 0 ? (
                <EmptyState
                  icon={MessageCircle}
                  title="No feed activity available"
                  description="Business updates, local news, and events will appear here."
                />
              ) : (
                <div className="space-y-2">
                  {displayFeed.map((item) => (
                    <FeedItemRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* ==================== EVENTS VIEW ==================== */}
        {category === 'events' && (
          <section className="animate-fade-up" style={{ animationDelay: '150ms' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <CalendarDays className="w-3.5 h-3.5 text-empire-gold" />
              <h2 className="font-display text-[10px] font-semibold text-empire-ivory uppercase tracking-wider">Events</h2>
            </div>
            {eventsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 text-empire-text-muted animate-spin" />
              </div>
            ) : displayEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No events this week"
                description="Create an event to bring your community together."
                actionLabel="Create an Event"
                onAction={() => navigate('/market/create/event')}
              />
            ) : (
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                {displayEvents.map((event) => (
                  <EventCard key={event.id} event={event} onClick={() => navigate(`/market/listing/${event.listing_id ?? ''}`)} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ==================== MARKET / PRODUCTS / SERVICES VIEWS ==================== */}
        {category !== 'feed' && category !== 'events' && (
          <>
            {/* Featured horizontal scroll */}
            <section className="animate-fade-up" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-empire-gold" />
                <h2 className="font-display text-[10px] font-semibold text-empire-ivory uppercase tracking-wider">Featured</h2>
              </div>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 text-empire-text-muted animate-spin" />
                </div>
              ) : featuredListings.length === 0 ? (
                <EmptyState
                  icon={Store}
                  title="No listings yet"
                  description="Be the first to list a business in your area."
                  actionLabel="List a Business"
                  onAction={() => navigate('/market/create/listing')}
                />
              ) : (
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                  {featuredListings.map((listing) => (
                    <FeaturedListingCard key={listing.id} listing={listing} onClick={() => navigate(`/market/listing/${listing.id}`)} />
                  ))}
                </div>
              )}
            </section>

            {/* All listings grid — Market view only */}
            {category === 'market' && filteredListings.length > 5 && (
              <section className="animate-fade-up" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Store className="w-3.5 h-3.5 text-empire-gold" />
                  <h2 className="font-display text-[10px] font-semibold text-empire-ivory uppercase tracking-wider">All Listings</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredListings.slice(5).map((listing) => (
                    <ListingCard key={listing.id} listing={listing} onClick={() => navigate(`/market/listing/${listing.id}`)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ==================== Featured Listing Card (horizontal) ====================

function FeaturedListingCard({ listing, onClick }: { listing: MarketListing; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="frame-intel shrink-0 w-[200px] p-0 overflow-hidden text-left transition-all duration-200 hover:border-empire-gold/25 group active:scale-[0.98]"
    >
      <div className="relative h-24 overflow-hidden bg-ink-800/10">
        {listing.image_url ? (
          <img src={listing.image_url} alt={listing.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <ImageIcon className="w-7 h-7 text-empire-text-muted/30" />
          </div>
        )}
        {listing.is_verified && (
          <div className="absolute top-1.5 right-1.5">
            <BadgeCheck className="w-4 h-4 text-empire-success" />
          </div>
        )}
        {!listing.is_verified && listing.status === 'in_review' && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-sm border border-amber-400/20">
            <ShieldAlert className="w-3 h-3 text-amber-900" />
            <span className="text-[8px] font-semibold text-amber-900">In Review</span>
          </div>
        )}
        <div className="absolute bottom-1.5 left-1.5">
          <span className="badge-gold text-[9px] py-0.5 px-1.5 capitalize">
            {listing.category}
          </span>
        </div>
      </div>
      <div className="p-2.5 space-y-1">
        <h3 className="font-display text-xs font-semibold text-empire-ivory leading-tight line-clamp-1">
          {listing.name}
        </h3>
        {listing.price_display && (
          <span className="text-xs font-semibold text-empire-gold">
            {listing.price_display}
          </span>
        )}
        {listing.city_name && (
          <span className="flex items-center gap-1 text-[10px] text-empire-text-muted">
            <MapPin className="w-2.5 h-2.5" />
            {listing.city_name}
          </span>
        )}
      </div>
    </button>
  );
}

// ==================== Listing Card (grid) ====================

function ListingCard({ listing, onClick }: { listing: MarketListing; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="frame-intel p-0 overflow-hidden text-left transition-all duration-200 hover:border-empire-gold/25 group active:scale-[0.99]"
    >
      {/* Image or placeholder */}
      <div className="relative h-32 overflow-hidden bg-ink-800/10">
        {listing.image_url ? (
          <img src={listing.image_url} alt={listing.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <ImageIcon className="w-8 h-8 text-empire-text-muted/30" />
          </div>
        )}
        {listing.is_verified && (
          <div className="absolute top-2 right-2">
            <BadgeCheck className="w-4 h-4 text-empire-success" />
          </div>
        )}
        {!listing.is_verified && listing.status === 'in_review' && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-sm border border-amber-400/20">
            <ShieldAlert className="w-3 h-3 text-amber-900" />
            <span className="text-[8px] font-semibold text-amber-900">In Review</span>
          </div>
        )}
        <div className="absolute bottom-2 left-2">
          <span className="badge-gold text-[9px] py-0.5 px-1.5 capitalize">
            {listing.category}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-empire-ivory leading-tight line-clamp-1">
            {listing.name}
          </h3>
          {listing.price_display && (
            <span className="text-xs font-semibold text-empire-gold whitespace-nowrap shrink-0">
              {listing.price_display}
            </span>
          )}
        </div>
        <p className="text-xs text-empire-text-muted line-clamp-2 leading-snug">
          {listing.description}
        </p>
        <div className="flex items-center gap-3 pt-1">
          {listing.city_name && (
            <span className="flex items-center gap-1 text-[10px] text-empire-text-muted">
              <MapPin className="w-2.5 h-2.5" />
              {listing.city_name}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-empire-text-muted">
            <Heart className="w-2.5 h-2.5" />
            {listing.like_count}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-empire-text-muted">
            <MessageCircle className="w-2.5 h-2.5" />
            {listing.comment_count}
          </span>
        </div>
      </div>
    </button>
  );
}

// ==================== Event Card (horizontal) ====================

function EventCard({ event, onClick }: { event: MarketEvent; onClick: () => void }) {
  const eventDate = new Date(event.event_date);
  const day = eventDate.toLocaleDateString('en-US', { day: 'numeric' });
  const month = eventDate.toLocaleDateString('en-US', { month: 'short' });

  return (
    <button
      onClick={onClick}
      className="frame-intel shrink-0 w-[200px] p-2.5 flex flex-col gap-2 text-left transition-all duration-200 hover:border-empire-gold/25 group active:scale-[0.98]"
    >
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center justify-center shrink-0 w-10 h-10 rounded-lg bg-empire-gold/8 border border-empire-gold/15">
          <span className="text-[8px] font-semibold text-empire-gold uppercase leading-none">{month}</span>
          <span className="text-base font-display font-bold text-empire-ivory leading-none mt-0.5">{day}</span>
        </div>
        <h3 className="font-display text-xs font-semibold text-empire-ivory line-clamp-2 leading-tight flex-1">{event.name}</h3>
      </div>
      <p className="text-[10px] text-empire-text-muted line-clamp-1">
        {event.event_time && `${event.event_time} · `}{event.location_text || 'Location TBA'}
      </p>
      {event.listing_name && (
        <p className="text-[10px] text-empire-text-muted/70 line-clamp-1">{event.listing_name}</p>
      )}
    </button>
  );
}

// ==================== Feed Item Row ====================

function FeedItemRow({ item }: { item: CommunityFeedItem }) {
  const updateTypeConfig: Record<string, { label: string; color: string; bg: string }> = {
    offer: { label: 'Offer', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    update: { label: 'Update', color: 'text-gold-400', bg: 'bg-gold-500/10 border-gold-500/20' },
    progress: { label: 'Progress', color: 'text-purple-300', bg: 'bg-purple-500/10 border-purple-500/20' },
  };
  const feedTypeConfig = {
    update: { label: 'Update', icon: MessageCircle, color: 'text-empire-info' },
    event: { label: 'Event', icon: CalendarDays, color: 'text-empire-gold' },
  };
  const config = feedTypeConfig[item.feed_type];
  const Icon = config.icon;
  const typeBadge = item.feed_type === 'update' && item.update_type ? updateTypeConfig[item.update_type] ?? updateTypeConfig.update : null;

  return (
    <div className="frame-intel w-full p-3 flex items-start gap-3">
      <div className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full border border-empire-gold/10 bg-empire-gold/5">
        <Icon className={cn('w-4 h-4', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {typeBadge && (
            <span className={cn('text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border', typeBadge.bg, typeBadge.color)}>
              {typeBadge.label}
            </span>
          )}
          {!typeBadge && (
            <span className={cn('text-[9px] font-bold uppercase tracking-wider', config.color)}>
              {config.label}
            </span>
          )}
          {item.listing_name && (
            <span className="text-xs font-medium text-empire-ivory line-clamp-1">{item.listing_name}</span>
          )}
        </div>
        <p className="text-sm text-empire-text-secondary line-clamp-2 leading-snug">
          {item.body}
        </p>
        <div className="flex items-center gap-1 mt-1">
          <Clock className="w-2.5 h-2.5 text-empire-text-muted" />
          <span className="text-[10px] text-empire-text-muted">{formatTimeAgo(item.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ==================== Empty State ====================

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: typeof Store;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="frame-utility p-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-ink-800/20 border border-ink-700/20 mb-3">
        <Icon className="w-5 h-5 text-empire-text-muted" />
      </div>
      <p className="text-sm font-medium text-empire-text-secondary mb-1">{title}</p>
      <p className="text-xs text-empire-text-muted mb-3">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-secondary text-sm py-2 px-4">
          {actionLabel}
        </button>
      )}
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

export default MarketPage;
