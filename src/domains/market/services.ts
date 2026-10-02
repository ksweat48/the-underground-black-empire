import { supabase } from '@/shared/supabase-client';
import type {
  MarketListing,
  ListingUpdate,
  LocalNewsItem,
  MarketEvent,
  ListingComment,
  NewsComment,
  CommunityFeedItem,
  Vote,
  ContentReportInput,
  CreateListingInput,
  CreateUpdateInput,
  CreateNewsInput,
  CreateEventInput,
  ListingCategory,
  ListingForReview,
  ReviewAction,
  UpdateType,
  Organization,
  OrganizationComment,
  CreateOrganizationInput,
  OrganizationVoteCandidate,
  OrgType,
  FeedPostType,
} from './types';

export type {
  MarketListing,
  ListingUpdate,
  LocalNewsItem,
  MarketEvent,
  ListingComment,
  NewsComment,
  CommunityFeedItem,
  Vote,
  ContentReportInput,
  CreateListingInput,
  CreateUpdateInput,
  CreateNewsInput,
  CreateEventInput,
  ListingCategory,
  ListingForReview,
  ReviewAction,
  UpdateType,
  Organization,
  OrganizationComment,
  CreateOrganizationInput,
  OrganizationVoteCandidate,
  OrgType,
  FeedPostType,
};

// ============================================================
// LISTINGS
// ============================================================

export async function fetchListings(params: {
  cityId?: string;
  metroCityIds?: string[];
  category?: ListingCategory | 'all' | 'market' | 'feed';
  search?: string;
  limit?: number;
  currentUserId?: string;
}): Promise<MarketListing[]> {
  const { cityId, metroCityIds, category, search, limit = 50, currentUserId } = params;

  let query = supabase
    .from('market_listings')
    .select(`
      *,
      city:city_id ( name, state ),
      ranking:market_ranking_cache!left ( score )
    `)
    .in('status', ['approved', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cityId && metroCityIds && metroCityIds.length > 0) {
    query = query.in('city_id', [cityId, ...metroCityIds]);
  } else if (cityId) {
    query = query.eq('city_id', cityId);
  }

  if (category && category !== 'all' && category !== 'market' && category !== 'feed') {
    query = query.eq('category', category);
  }

  if (search && search.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,products_services.ilike.%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const listingIds = (data ?? []).map((r) => r.id);

  const savedSet = new Set<string>();
  if (currentUserId && listingIds.length > 0) {
    const { data: savedData } = await supabase
      .from('listing_saves')
      .select('listing_id')
      .eq('member_id', currentUserId)
      .in('listing_id', listingIds);
    if (savedData) {
      for (const row of savedData) {
        savedSet.add(row.listing_id as string);
      }
    }
  }

  return (data ?? []).map((row) => {
    const cityData = (Array.isArray(row.city) ? row.city[0] : row.city) as { name: string; state: string } | null;
    const rankingData = (Array.isArray(row.ranking) ? row.ranking[0] : row.ranking) as { score: number } | null;
    return {
      id: row.id,
      owner_id: row.owner_id,
      city_id: row.city_id,
      name: row.name,
      category: row.category,
      description: row.description,
      products_services: row.products_services,
      price_display: row.price_display,
      external_url: row.external_url,
      contact_info: row.contact_info,
      image_url: row.image_url,
      status: row.status,
      is_verified: row.is_verified,
      like_count: row.like_count,
      save_count: row.save_count ?? 0,
      comment_count: row.comment_count,
      check_in_count: row.check_in_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      rank_score: rankingData?.score ?? 0,
      city_name: cityData?.name ?? undefined,
      city_state: cityData?.state ?? undefined,
      is_saved: savedSet.has(row.id),
    } as MarketListing;
  }).sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
}

export async function fetchListingById(id: string, currentUserId?: string): Promise<MarketListing | null> {
  const { data, error } = await supabase
    .from('market_listings')
    .select(`
      *,
      city:city_id ( name, state ),
      ranking:market_ranking_cache!left ( score )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const cityData = (Array.isArray(data.city) ? data.city[0] : data.city) as { name: string; state: string } | null;
  const rankingData = (Array.isArray(data.ranking) ? data.ranking[0] : data.ranking) as { score: number } | null;

  let is_saved = false;
  let is_liked = false;

  if (currentUserId) {
    const [saveRes, likeRes] = await Promise.all([
      supabase.from('listing_saves').select('id').eq('listing_id', id).eq('member_id', currentUserId).maybeSingle(),
      supabase.from('listing_likes').select('id').eq('listing_id', id).eq('member_id', currentUserId).maybeSingle(),
    ]);
    is_saved = !!saveRes.data;
    is_liked = !!likeRes.data;
  }

  return {
    id: data.id,
    owner_id: data.owner_id,
    city_id: data.city_id,
    name: data.name,
    category: data.category,
    description: data.description,
    products_services: data.products_services,
    price_display: data.price_display,
    external_url: data.external_url,
    contact_info: data.contact_info,
    image_url: data.image_url,
    status: data.status,
    is_verified: data.is_verified,
    like_count: data.like_count,
    save_count: data.save_count ?? 0,
    comment_count: data.comment_count,
    check_in_count: data.check_in_count,
    created_at: data.created_at,
    updated_at: data.updated_at,
    rank_score: rankingData?.score ?? 0,
    city_name: cityData?.name ?? undefined,
    city_state: cityData?.state ?? undefined,
    is_saved,
    is_liked,
  } as MarketListing;
}

export async function fetchMyListings(userId: string): Promise<MarketListing[]> {
  const { data, error } = await supabase
    .from('market_listings')
    .select(`
      *,
      city:city_id ( name, state )
    `)
    .eq('owner_id', userId)
    .neq('status', 'removed')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const cityData = (Array.isArray(row.city) ? row.city[0] : row.city) as { name: string; state: string } | null;
    return {
      id: row.id,
      owner_id: row.owner_id,
      city_id: row.city_id,
      name: row.name,
      category: row.category,
      description: row.description,
      products_services: row.products_services,
      price_display: row.price_display,
      external_url: row.external_url,
      contact_info: row.contact_info,
      image_url: row.image_url,
      status: row.status,
      is_verified: row.is_verified,
      like_count: row.like_count,
      save_count: row.save_count ?? 0,
      comment_count: row.comment_count,
      check_in_count: row.check_in_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      city_name: cityData?.name ?? undefined,
      city_state: cityData?.state ?? undefined,
    } as MarketListing;
  });
}

export async function fetchApprovedListingsByOwner(userId: string): Promise<MarketListing[]> {
  const { data, error } = await supabase
    .from('market_listings')
    .select('id, name, category')
    .eq('owner_id', userId)
    .eq('status', 'approved')
    .order('name');

  if (error) throw error;
  return (data ?? []) as MarketListing[];
}

export async function fetchSavedListings(userId: string): Promise<MarketListing[]> {
  const { data, error } = await supabase
    .from('listing_likes')
    .select(`
      listing:listing_id (
        *,
        city:city_id ( name, state )
      )
    `)
    .eq('member_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const listing = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as Record<string, unknown> | null;
      if (!listing) return null;
      const cityData = (Array.isArray(listing.city) ? listing.city[0] : listing.city) as { name: string; state: string } | null;
      return {
        id: listing.id,
        owner_id: listing.owner_id,
        city_id: listing.city_id,
        name: listing.name,
        category: listing.category,
        description: listing.description,
        products_services: listing.products_services,
        price_display: listing.price_display,
        external_url: listing.external_url,
        contact_info: listing.contact_info,
        image_url: listing.image_url,
        status: listing.status,
        is_verified: listing.is_verified,
        like_count: listing.like_count,
        save_count: listing.save_count ?? 0,
        comment_count: listing.comment_count,
        check_in_count: listing.check_in_count,
        created_at: listing.created_at,
        updated_at: listing.updated_at,
        city_name: cityData?.name ?? undefined,
        city_state: cityData?.state ?? undefined,
        is_liked: true,
      } as MarketListing;
    })
    .filter((l): l is MarketListing => l !== null);
}

export async function createListing(input: CreateListingInput): Promise<MarketListing> {
  const { data, error } = await supabase
    .from('market_listings')
    .insert({
      city_id: input.city_id,
      name: input.name,
      category: input.category,
      description: input.description,
      products_services: input.products_services,
      price_display: input.price_display,
      external_url: input.external_url,
      contact_info: input.contact_info,
      image_url: input.image_url,
      status: input.status ?? 'in_review',
    })
    .select()
    .single();

  if (error) throw error;
  return data as MarketListing;
}

// ============================================================
// ADMIN LISTING REVIEW
// ============================================================

export async function fetchListingsForReview(status: string = 'in_review', limit: number = 50): Promise<ListingForReview[]> {
  const { data, error } = await supabase
    .rpc('get_listings_for_review', { p_status: status, p_limit: limit });

  if (error) throw error;
  return (data ?? []) as ListingForReview[];
}

export async function reviewListing(listingId: string, action: ReviewAction, reason: string = ''): Promise<void> {
  const { error } = await supabase
    .rpc('review_market_listing', {
      p_listing_id: listingId,
      p_action: action,
      p_reason: reason,
    });

  if (error) throw error;
}

export async function toggleListingLike(listingId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await supabase
      .rpc('unlike_listing', { p_listing_id: listingId });
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase
      .rpc('like_listing', { p_listing_id: listingId });
    if (error) throw error;
    return true;
  }
}

export async function toggleListingSave(listingId: string, userId: string, currentlySaved: boolean): Promise<boolean> {
  if (currentlySaved) {
    const { error } = await supabase
      .from('listing_saves')
      .delete()
      .eq('listing_id', listingId)
      .eq('member_id', userId);
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase
      .from('listing_saves')
      .insert({ listing_id: listingId, member_id: userId });
    if (error) throw error;
    return true;
  }
}

// ============================================================
// LISTING UPDATES
// ============================================================

export async function fetchListingUpdates(listingId: string): Promise<ListingUpdate[]> {
  const { data, error } = await supabase
    .from('listing_updates')
    .select('*')
    .eq('listing_id', listingId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ListingUpdate[];
}

export async function createListingUpdate(input: CreateUpdateInput): Promise<ListingUpdate> {
  const { data, error } = await supabase
    .from('listing_updates')
    .insert({
      listing_id: input.listing_id,
      body: input.body,
      image_url: input.image_url,
      update_type: input.update_type ?? 'update',
      status: 'approved',
    })
    .select()
    .single();

  if (error) throw error;
  return data as ListingUpdate;
}

export async function updateListing(input: {
  listing_id: string;
  name: string;
  category: ListingCategory;
  description: string;
  products_services: string;
  price_display: string;
  external_url: string;
  contact_info: string;
  image_url: string | null;
}): Promise<{ id: string; status: string }> {
  // First, fetch the current listing to check its status
  const { data: current, error: fetchError } = await supabase
    .from('market_listings')
    .select('status')
    .eq('id', input.listing_id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!current) throw new Error('Listing not found');

  // If the listing was approved, reset to in_review so admins can re-verify
  const newStatus = current.status === 'approved' ? 'in_review' : current.status;

  const { data, error } = await supabase
    .from('market_listings')
    .update({
      name: input.name,
      category: input.category,
      description: input.description,
      products_services: input.products_services,
      price_display: input.price_display,
      external_url: input.external_url,
      contact_info: input.contact_info,
      image_url: input.image_url,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.listing_id)
    .select('id, status')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to update listing - you may not have permission to edit this listing.');
  return { id: data.id, status: data.status };
}

// ============================================================
// LOCAL NEWS
// ============================================================

export async function fetchLocalNews(cityId: string, limit: number = 20): Promise<LocalNewsItem[]> {
  const { data, error } = await supabase
    .from('local_news')
    .select('*')
    .eq('city_id', cityId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as LocalNewsItem[];
}

export async function createLocalNews(input: CreateNewsInput): Promise<LocalNewsItem> {
  const { data, error } = await supabase
    .from('local_news')
    .insert({
      city_id: input.city_id,
      title: input.title,
      body: input.body,
      location_text: input.location_text,
      news_date: input.news_date,
      image_url: input.image_url,
      status: 'approved',
    })
    .select()
    .single();

  if (error) throw error;
  return data as LocalNewsItem;
}

// ============================================================
// MARKET EVENTS
// ============================================================

export async function fetchEvents(params: {
  cityId?: string;
  metroCityIds?: string[];
  listingId?: string;
  limit?: number;
  upcomingOnly?: boolean;
}): Promise<MarketEvent[]> {
  const { cityId, metroCityIds, listingId, limit = 50, upcomingOnly } = params;

  let query = supabase
    .from('market_events')
    .select(`
      *,
      listing:listing_id ( name )
    `)
    .eq('status', 'approved')
    .order('event_date', { ascending: upcomingOnly ?? false })
    .limit(limit);

  if (cityId && metroCityIds && metroCityIds.length > 0) {
    query = query.in('city_id', [cityId, ...metroCityIds]);
  } else if (cityId) {
    query = query.eq('city_id', cityId);
  }

  if (listingId) {
    query = query.eq('listing_id', listingId);
  }

  if (upcomingOnly) {
    query = query.gte('event_date', new Date().toISOString().split('T')[0]);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const listingData = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as { name: string } | null;
    return {
      id: row.id,
      author_id: row.author_id,
      city_id: row.city_id,
      listing_id: row.listing_id,
      name: row.name,
      description: row.description,
      event_date: row.event_date,
      event_time: row.event_time,
      location_text: row.location_text,
      external_url: row.external_url,
      image_url: row.image_url,
      status: row.status,
      check_in_count: row.check_in_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      listing_name: listingData?.name ?? undefined,
    } as MarketEvent;
  });
}

export async function createMarketEvent(input: CreateEventInput): Promise<MarketEvent> {
  const { data, error } = await supabase
    .from('market_events')
    .insert({
      city_id: input.city_id,
      listing_id: input.listing_id,
      name: input.name,
      description: input.description,
      event_date: input.event_date,
      event_time: input.event_time,
      location_text: input.location_text,
      external_url: input.external_url,
      image_url: input.image_url,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data as MarketEvent;
}

export async function checkInToEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .rpc('check_in_to_event', { p_event_id: eventId });

  if (error) throw error;
}

export async function hasUserCheckedIn(eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('event_check_ins')
    .select('id')
    .eq('event_id', eventId)
    .eq('member_id', userId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

// ============================================================
// COMMENTS
// ============================================================

export async function fetchListingComments(listingId: string): Promise<ListingComment[]> {
  const { data, error } = await supabase
    .from('listing_comments')
    .select(`
      *,
      author:member_id ( display_name, email )
    `)
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const authorData = (Array.isArray(row.author) ? row.author[0] : row.author) as { display_name: string | null; email: string } | null;
    return {
      id: row.id,
      member_id: row.member_id,
      listing_id: row.listing_id,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author_name: authorData?.display_name ?? authorData?.email ?? 'Unknown',
    } as ListingComment;
  });
}

export async function createListingComment(listingId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('listing_comments')
    .insert({ listing_id: listingId, body });

  if (error) throw error;
}

// ============================================================
// COMMUNITY FEED
// ============================================================

export async function fetchCommunityFeed(cityId?: string, metroCityIds?: string[], limit: number = 30, currentUserId?: string): Promise<CommunityFeedItem[]> {
  const cityIds = cityId && metroCityIds && metroCityIds.length > 0 ? [cityId, ...metroCityIds] : cityId ? [cityId] : null;

  let updatesQuery = supabase
    .from('listing_updates')
    .select(`
      id, listing_id, body, image_url, author_id, update_type, created_at,
      listing:listing_id ( name, city_id, like_count, comment_count )
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cityIds) updatesQuery = updatesQuery.in('listing.city_id', cityIds);

  let eventsQuery = supabase
    .from('market_events')
    .select(`
      id, listing_id, name, description, image_url, author_id, city_id, created_at,
      listing:listing_id ( name, like_count, comment_count )
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cityIds) eventsQuery = eventsQuery.in('city_id', cityIds);

  let listingsQuery = supabase
    .from('market_listings')
    .select('id, owner_id, city_id, name, category, description, image_url, like_count, comment_count, created_at')
    .in('status', ['approved', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cityIds) listingsQuery = listingsQuery.in('city_id', cityIds);

  let orgsQuery = supabase
    .from('organizations')
    .select('id, owner_id, city_id, name, org_type, description, image_url, like_count, comment_count, created_at')
    .in('status', ['approved', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cityIds) orgsQuery = orgsQuery.in('city_id', cityIds);

  const [updatesRes, eventsRes, listingsRes, orgsRes] = await Promise.all([updatesQuery, eventsQuery, listingsQuery, orgsQuery]);

  const items: CommunityFeedItem[] = [];
  const authorIds = new Set<string>();
  for (const row of updatesRes.data ?? []) authorIds.add(row.author_id);
  for (const row of eventsRes.data ?? []) authorIds.add(row.author_id);
  for (const row of listingsRes.data ?? []) authorIds.add(row.owner_id);
  for (const row of orgsRes.data ?? []) authorIds.add(row.owner_id);

  const { data: authors } = authorIds.size > 0
    ? await supabase.from('members').select('id, display_name, avatar_url').in('id', Array.from(authorIds))
    : { data: [] };
  const authorMap = new Map((authors ?? []).map((author) => [author.id, author]));

  const listingTargetIds = new Set<string>();
  for (const row of listingsRes.data ?? []) listingTargetIds.add(row.id);
  for (const row of updatesRes.data ?? []) listingTargetIds.add(row.listing_id);
  for (const row of eventsRes.data ?? []) if (row.listing_id) listingTargetIds.add(row.listing_id);
  const { data: likedListings } = currentUserId && listingTargetIds.size > 0
    ? await supabase.from('listing_likes').select('listing_id').eq('member_id', currentUserId).in('listing_id', Array.from(listingTargetIds))
    : { data: [] };
  const likedListingIds = new Set((likedListings ?? []).map((row) => row.listing_id as string));

  const orgIds = (orgsRes.data ?? []).map((row) => row.id);
  const { data: likedOrganizations } = currentUserId && orgIds.length > 0
    ? await supabase.from('organization_likes').select('organization_id').eq('member_id', currentUserId).in('organization_id', orgIds)
    : { data: [] };
  const likedOrganizationIds = new Set((likedOrganizations ?? []).map((row) => row.organization_id as string));

  for (const row of updatesRes.data ?? []) {
    const listingData = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as { name: string; city_id: string; like_count?: number; comment_count?: number } | null;
    const author = authorMap.get(row.author_id);
    items.push({
      id: row.id,
      feed_type: 'update',
      listing_id: row.listing_id,
      listing_name: listingData?.name ?? null,
      city_id: listingData?.city_id ?? '',
      body: row.body,
      image_url: row.image_url,
      author_id: row.author_id,
      author_name: author?.display_name ?? null,
      author_avatar_url: author?.avatar_url ?? null,
      update_type: (row as { update_type?: string }).update_type ?? null,
      created_at: row.created_at,
      rank_score: row.created_at ? (listingData?.like_count ?? 0) : 0,
      like_count: listingData?.like_count ?? 0,
      comment_count: listingData?.comment_count ?? 0,
      is_liked: likedListingIds.has(row.listing_id),
    });
  }

  for (const row of eventsRes.data ?? []) {
    const listingData = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as { name: string; like_count?: number; comment_count?: number } | null;
    const author = authorMap.get(row.author_id);
    items.push({
      id: row.id,
      feed_type: 'event',
      listing_id: row.listing_id,
      listing_name: listingData?.name ?? row.name,
      city_id: row.city_id,
      body: row.description,
      image_url: row.image_url,
      author_id: row.author_id,
      author_name: author?.display_name ?? null,
      author_avatar_url: author?.avatar_url ?? null,
      update_type: null,
      created_at: row.created_at,
      rank_score: listingData?.like_count ?? 0,
      like_count: listingData?.like_count ?? 0,
      comment_count: listingData?.comment_count ?? 0,
      is_liked: row.listing_id ? likedListingIds.has(row.listing_id) : false,
    });
  }

  for (const row of listingsRes.data ?? []) {
    const author = authorMap.get(row.owner_id);
    items.push({
      id: row.id,
      feed_type: 'listing',
      listing_id: row.id,
      listing_name: row.name,
      city_id: row.city_id,
      body: row.description ?? '',
      image_url: row.image_url,
      author_id: row.owner_id,
      author_name: author?.display_name ?? null,
      author_avatar_url: author?.avatar_url ?? null,
      update_type: null,
      created_at: row.created_at,
      rank_score: row.like_count ?? 0,
      like_count: row.like_count ?? 0,
      comment_count: row.comment_count ?? 0,
      is_liked: likedListingIds.has(row.id),
      category: (row as { category?: string }).category ?? null,
    });
  }

  for (const row of orgsRes.data ?? []) {
    const author = authorMap.get(row.owner_id);
    items.push({
      id: row.id,
      feed_type: 'organization',
      listing_id: null,
      listing_name: row.name,
      city_id: row.city_id,
      body: row.description ?? '',
      image_url: row.image_url,
      author_id: row.owner_id,
      author_name: author?.display_name ?? null,
      author_avatar_url: author?.avatar_url ?? null,
      update_type: null,
      created_at: row.created_at,
      rank_score: row.like_count ?? 0,
      like_count: row.like_count ?? 0,
      comment_count: row.comment_count ?? 0,
      is_liked: likedOrganizationIds.has(row.id),
      org_type: (row as { org_type?: string }).org_type ?? null,
    });
  }

  return items
    .sort((a, b) => {
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, limit);
}

// ============================================================
// VOTES
// ============================================================

export async function fetchVotes(userId: string): Promise<Vote[]> {
  const { data: votes, error } = await supabase
    .from('votes')
    .select('*')
    .in('status', ['active', 'closed', 'tallied'])
    .order('closes_at', { ascending: false });

  if (error) throw error;
  if (!votes || votes.length === 0) return [];

  const voteIds = votes.map((v) => v.id);
  const { data: myRecords } = await supabase
    .from('vote_records')
    .select('vote_id, choice, credits_used, voting_power, effective_weight')
    .in('vote_id', voteIds)
    .eq('member_id', userId);

  const recordMap = new Map<string, { choice: string; credits_used: number; voting_power: number; effective_weight: number }>();
  for (const rec of myRecords ?? []) {
    recordMap.set(rec.vote_id, {
      choice: rec.choice,
      credits_used: rec.credits_used,
      voting_power: Number(rec.voting_power),
      effective_weight: Number(rec.effective_weight),
    });
  }

  const { data: allRecords } = await supabase
    .from('vote_records')
    .select('vote_id, effective_weight')
    .in('vote_id', voteIds);

  const countMap = new Map<string, number>();
  const weightMap = new Map<string, number>();
  for (const rec of allRecords ?? []) {
    countMap.set(rec.vote_id, (countMap.get(rec.vote_id) ?? 0) + 1);
    weightMap.set(rec.vote_id, (weightMap.get(rec.vote_id) ?? 0) + Number(rec.effective_weight));
  }

  return votes.map((v) => {
    const myRecord = recordMap.get(v.id);
    return {
      id: v.id,
      question: v.question,
      description: v.description,
      choices: v.choices as Vote['choices'],
      eligibility: v.eligibility,
      opens_at: v.opens_at,
      closes_at: v.closes_at,
      status: v.status,
      created_at: v.created_at,
      user_choice: myRecord?.choice ?? null,
      user_credits_used: myRecord?.credits_used,
      user_voting_power: myRecord?.voting_power,
      user_effective_weight: myRecord?.effective_weight,
      total_votes: countMap.get(v.id) ?? 0,
      total_weight: weightMap.get(v.id) ?? 0,
    };
  });
}

export async function castVote(voteId: string, choice: string, creditsUsed: number = 1): Promise<number> {
  const { data, error } = await supabase
    .rpc('cast_weighted_vote', {
      p_vote_id: voteId,
      p_choice: choice,
      p_credits_used: creditsUsed,
    });

  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchVotingCredits(userId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_member_credits', { p_member_id: userId });

  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchVotingPower(userId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_member_voting_power', { p_member_id: userId });

  if (error) throw error;
  return Number(data ?? 1.0);
}

// ============================================================
// REPORTS
// ============================================================

export async function createContentReport(input: ContentReportInput): Promise<void> {
  const { error } = await supabase
    .from('content_reports')
    .insert({
      content_type: input.content_type,
      content_id: input.content_id,
      reason: input.reason,
      details: input.details,
      status: 'open',
    });

  if (error) throw error;
}

// ============================================================
// METRO CITY IDS HELPER
// ============================================================

export async function fetchCityIdsInMetro(metroId: string | null): Promise<string[]> {
  if (!metroId) return [];
  const { data, error } = await supabase
    .from('cities')
    .select('id')
    .eq('metro_id', metroId)
    .eq('canonical_status', 'active');

  if (error) throw error;
  return (data ?? []).map((c) => c.id);
}

export async function fetchMemberCityInfo(userId: string): Promise<{ cityId: string | null; metroId: string | null; cityName: string | null }> {
  const { data, error } = await supabase
    .from('members')
    .select('city_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.city_id) return { cityId: null, metroId: null, cityName: null };

  const { data: cityData, error: cityError } = await supabase
    .from('cities')
    .select('id, name, metro_id')
    .eq('id', data.city_id)
    .maybeSingle();

  if (cityError) throw cityError;
  return {
    cityId: cityData?.id ?? null,
    metroId: cityData?.metro_id ?? null,
    cityName: cityData?.name ?? null,
  };
}

// ============================================================
// ORGANIZATIONS
// ============================================================

export async function fetchOrganizations(params: {
  cityId?: string;
  metroCityIds?: string[];
  search?: string;
  limit?: number;
  currentUserId?: string;
}): Promise<Organization[]> {
  const { cityId, metroCityIds, search, limit = 50, currentUserId } = params;

  let query = supabase
    .from('organizations')
    .select(`
      *,
      city:city_id ( name, state )
    `)
    .in('status', ['approved', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cityId && metroCityIds && metroCityIds.length > 0) {
    query = query.in('city_id', [cityId, ...metroCityIds]);
  } else if (cityId) {
    query = query.eq('city_id', cityId);
  }

  if (search && search.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const orgIds = (data ?? []).map((r) => r.id);

  const savedSet = new Set<string>();
  const likedSet = new Set<string>();
  if (currentUserId && orgIds.length > 0) {
    const [savedRes, likedRes] = await Promise.all([
      supabase.from('organization_saves').select('organization_id').eq('member_id', currentUserId).in('organization_id', orgIds),
      supabase.from('organization_likes').select('organization_id').eq('member_id', currentUserId).in('organization_id', orgIds),
    ]);
    if (savedRes.data) for (const row of savedRes.data) savedSet.add(row.organization_id as string);
    if (likedRes.data) for (const row of likedRes.data) likedSet.add(row.organization_id as string);
  }

  return (data ?? []).map((row) => {
    const cityData = (Array.isArray(row.city) ? row.city[0] : row.city) as { name: string; state: string } | null;
    return {
      id: row.id,
      owner_id: row.owner_id,
      city_id: row.city_id,
      name: row.name,
      org_type: row.org_type,
      description: row.description,
      funding_goal: Number(row.funding_goal) ?? 0,
      total_raised: Number(row.total_raised) ?? 0,
      external_url: row.external_url,
      contact_info: row.contact_info,
      image_url: row.image_url,
      status: row.status,
      is_verified: row.is_verified,
      like_count: row.like_count,
      save_count: row.save_count ?? 0,
      comment_count: row.comment_count,
      vote_support_total: Number(row.vote_support_total) ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      city_name: cityData?.name ?? undefined,
      city_state: cityData?.state ?? undefined,
      is_saved: savedSet.has(row.id),
      is_liked: likedSet.has(row.id),
    } as Organization;
  });
}

export async function fetchOrganizationById(id: string, currentUserId?: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select(`
      *,
      city:city_id ( name, state )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const cityData = (Array.isArray(data.city) ? data.city[0] : data.city) as { name: string; state: string } | null;

  let is_saved = false;
  let is_liked = false;

  if (currentUserId) {
    const [saveRes, likeRes] = await Promise.all([
      supabase.from('organization_saves').select('id').eq('organization_id', id).eq('member_id', currentUserId).maybeSingle(),
      supabase.from('organization_likes').select('id').eq('organization_id', id).eq('member_id', currentUserId).maybeSingle(),
    ]);
    is_saved = !!saveRes.data;
    is_liked = !!likeRes.data;
  }

  return {
    id: data.id,
    owner_id: data.owner_id,
    city_id: data.city_id,
    name: data.name,
    org_type: data.org_type,
    description: data.description,
    funding_goal: Number(data.funding_goal) ?? 0,
    total_raised: Number(data.total_raised) ?? 0,
    external_url: data.external_url,
    contact_info: data.contact_info,
    image_url: data.image_url,
    status: data.status,
    is_verified: data.is_verified,
    like_count: data.like_count,
    save_count: data.save_count ?? 0,
    comment_count: data.comment_count,
    vote_support_total: Number(data.vote_support_total) ?? 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
    city_name: cityData?.name ?? undefined,
    city_state: cityData?.state ?? undefined,
    is_saved,
    is_liked,
  } as Organization;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      city_id: input.city_id,
      name: input.name,
      org_type: input.org_type,
      description: input.description,
      funding_goal: input.funding_goal,
      external_url: input.external_url,
      contact_info: input.contact_info,
      image_url: input.image_url,
      status: 'in_review',
    })
    .select()
    .single();

  if (error) throw error;
  return data as Organization;
}

export async function toggleOrganizationLike(orgId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('organization_likes')
      .delete()
      .eq('organization_id', orgId)
      .eq('member_id', userId);
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase
      .from('organization_likes')
      .insert({ organization_id: orgId, member_id: userId });
    if (error) throw error;
    return true;
  }
}

export async function toggleOrganizationSave(orgId: string, userId: string, currentlySaved: boolean): Promise<boolean> {
  if (currentlySaved) {
    const { error } = await supabase
      .from('organization_saves')
      .delete()
      .eq('organization_id', orgId)
      .eq('member_id', userId);
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase
      .from('organization_saves')
      .insert({ organization_id: orgId, member_id: userId });
    if (error) throw error;
    return true;
  }
}

export async function fetchOrganizationComments(orgId: string): Promise<OrganizationComment[]> {
  const { data, error } = await supabase
    .from('organization_comments')
    .select(`
      *,
      author:member_id ( display_name )
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const authorData = (Array.isArray(row.author) ? row.author[0] : row.author) as { display_name: string } | null;
    return {
      id: row.id,
      member_id: row.member_id,
      organization_id: row.organization_id,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author_name: authorData?.display_name ?? 'Member',
    } as OrganizationComment;
  });
}

export async function createOrganizationComment(orgId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('organization_comments')
    .insert({ organization_id: orgId, body });
  if (error) throw error;
}

export async function fetchTopOrganizationsForVoting(limit: number = 10): Promise<OrganizationVoteCandidate[]> {
  const { data, error } = await supabase
    .from('organization_ranking')
    .select(`
      id, name, org_type, funding_goal, total_raised, city_id, engagement_score
    `)
    .limit(limit);

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const cityIds = [...new Set(rows.map((r) => r.city_id).filter(Boolean))] as string[];
  const { data: cities } = await supabase
    .from('cities')
    .select('id, name, state')
    .in('id', cityIds);

  const cityMap = new Map<string, { name: string; state: string }>();
  if (cities) {
    for (const c of cities) {
      cityMap.set(c.id as string, { name: c.name as string, state: c.state as string });
    }
  }

  const orgIds = rows.map((r) => r.id as string);
  const { data: orgImages } = await supabase
    .from('organizations')
    .select('id, image_url')
    .in('id', orgIds);
  const imageMap = new Map<string, string | null>();
  if (orgImages) {
    for (const o of orgImages) {
      imageMap.set(o.id as string, (o.image_url as string | null) ?? null);
    }
  }

  return rows.map((row) => {
    const city = cityMap.get(row.city_id as string);
    return {
      id: row.id as string,
      name: row.name as string,
      org_type: row.org_type as OrgType,
      funding_goal: Number(row.funding_goal) ?? 0,
      total_raised: Number(row.total_raised) ?? 0,
      city_name: city?.name,
      city_state: city?.state,
      engagement_score: Number(row.engagement_score) ?? 0,
      image_url: imageMap.get(row.id as string) ?? null,
    } as OrganizationVoteCandidate;
  });
}

export async function recordOrgVoteSupport(
  organizationId: string,
  voteId: string,
  effectiveWeight: number
): Promise<number> {
  const { data, error } = await supabase.rpc('record_organization_vote_support', {
    p_organization_id: organizationId,
    p_vote_id: voteId,
    p_effective_weight: effectiveWeight,
  });

  if (error) throw error;
  return Number(data) ?? 0;
}

// ============================================================
// UNIFIED ENGAGEMENT: BOOST, NEWS LIKES/SAVES/COMMENTS
// ============================================================

export async function toggleBoost(
  postType: FeedPostType,
  postId: string,
  currentlyBoosted: boolean
): Promise<boolean> {
  if (currentlyBoosted) {
    const { error } = await supabase.rpc('unboost_post', {
      p_post_type: postType,
      p_post_id: postId,
    });
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase.rpc('boost_post', {
      p_post_type: postType,
      p_post_id: postId,
    });
    if (error) throw error;
    return true;
  }
}

export async function toggleNewsLike(
  newsId: string,
  currentlyLiked: boolean
): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await supabase.rpc('unlike_news', { p_news_id: newsId });
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase.rpc('like_news', { p_news_id: newsId });
    if (error) throw error;
    return true;
  }
}

export async function toggleNewsSave(
  newsId: string,
  currentlySaved: boolean
): Promise<boolean> {
  if (currentlySaved) {
    const { error } = await supabase
      .from('news_saves')
      .delete()
      .eq('news_id', newsId)
      .eq('member_id', supabase.auth.getUser().data.user?.id ?? '');
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase
      .from('news_saves')
      .insert({ news_id: newsId });
    if (error) throw error;
    return true;
  }
}

export async function fetchNewsComments(newsId: string): Promise<NewsComment[]> {
  const { data, error } = await supabase
    .from('news_comments')
    .select(`
      *,
      author:member_id ( display_name, avatar_url )
    `)
    .eq('news_id', newsId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const authorData = (Array.isArray(row.author) ? row.author[0] : row.author) as {
      display_name: string | null;
      avatar_url: string | null;
    } | null;
    return {
      id: row.id,
      member_id: row.member_id,
      news_id: row.news_id,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author_name: authorData?.display_name ?? 'Member',
      author_avatar_url: authorData?.avatar_url ?? null,
    } as NewsComment;
  });
}

export async function createNewsComment(newsId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('news_comments')
    .insert({ news_id: newsId, body });

  if (error) throw error;
}

export async function fetchBoostedPostIds(
  postType: FeedPostType,
  postIds: string[]
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('post_boosts')
    .select('post_id')
    .eq('post_type', postType)
    .in('post_id', postIds);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.post_id as string));
}