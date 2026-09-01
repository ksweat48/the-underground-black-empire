import { supabase } from '@/shared/supabase-client';
import type {
  MarketListing,
  ListingUpdate,
  LocalNewsItem,
  MarketEvent,
  ListingComment,
  CommunityFeedItem,
  Vote,
  ContentReportInput,
  CreateListingInput,
  CreateUpdateInput,
  CreateNewsInput,
  CreateEventInput,
  ListingCategory,
} from './types';

// ============================================================
// LISTINGS
// ============================================================

export async function fetchListings(params: {
  cityId?: string;
  metroCityIds?: string[];
  category?: ListingCategory | 'all';
  search?: string;
  limit?: number;
}): Promise<MarketListing[]> {
  const { cityId, metroCityIds, category, search, limit = 50 } = params;

  let query = supabase
    .from('market_listings')
    .select(`
      *,
      city:city_id ( name ),
      ranking:market_ranking_cache!left ( score )
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cityId && metroCityIds && metroCityIds.length > 0) {
    query = query.in('city_id', [cityId, ...metroCityIds]);
  } else if (cityId) {
    query = query.eq('city_id', cityId);
  }

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  if (search && search.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,products_services.ilike.%${search.trim}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const cityData = (Array.isArray(row.city) ? row.city[0] : row.city) as { name: string } | null;
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
      comment_count: row.comment_count,
      check_in_count: row.check_in_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      rank_score: rankingData?.score ?? 0,
      city_name: cityData?.name ?? undefined,
    } as MarketListing;
  }).sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
}

export async function fetchListingById(id: string, currentUserId?: string): Promise<MarketListing | null> {
  const { data, error } = await supabase
    .from('market_listings')
    .select(`
      *,
      city:city_id ( name ),
      ranking:market_ranking_cache!left ( score )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const cityData = (Array.isArray(data.city) ? data.city[0] : data.city) as { name: string } | null;
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
    comment_count: data.comment_count,
    check_in_count: data.check_in_count,
    created_at: data.created_at,
    updated_at: data.updated_at,
    rank_score: rankingData?.score ?? 0,
    city_name: cityData?.name ?? undefined,
    is_saved,
    is_liked,
  } as MarketListing;
}

export async function fetchMyListings(userId: string): Promise<MarketListing[]> {
  const { data, error } = await supabase
    .from('market_listings')
    .select(`
      *,
      city:city_id ( name )
    `)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const cityData = (Array.isArray(row.city) ? row.city[0] : row.city) as { name: string } | null;
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
      comment_count: row.comment_count,
      check_in_count: row.check_in_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      city_name: cityData?.name ?? undefined,
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
    .from('listing_saves')
    .select(`
      listing:listing_id (
        *,
        city:city_id ( name )
      )
    `)
    .eq('member_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const listing = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as Record<string, unknown> | null;
      if (!listing) return null;
      const cityData = (Array.isArray(listing.city) ? listing.city[0] : listing.city) as { name: string } | null;
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
        comment_count: listing.comment_count,
        check_in_count: listing.check_in_count,
        created_at: listing.created_at,
        updated_at: listing.updated_at,
        city_name: cityData?.name ?? undefined,
        is_saved: true,
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
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data as MarketListing;
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
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data as ListingUpdate;
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
      status: 'pending',
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

export async function checkInToEvent(eventId: string, userId: string): Promise<void> {
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

export async function fetchCommunityFeed(cityId: string, metroCityIds?: string[], limit: number = 30): Promise<CommunityFeedItem[]> {
  const cityIds = metroCityIds && metroCityIds.length > 0 ? [cityId, ...metroCityIds] : [cityId];

  const [updatesRes, newsRes, eventsRes] = await Promise.all([
    supabase
      .from('listing_updates')
      .select(`
        id, listing_id, body, image_url, author_id, created_at,
        listing:listing_id ( name, city_id )
      `)
      .eq('status', 'approved')
      .in('listing.city_id', cityIds)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('local_news')
      .select('id, title, body, image_url, author_id, city_id, created_at')
      .eq('status', 'approved')
      .in('city_id', cityIds)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('market_events')
      .select('id, listing_id, name, description, image_url, author_id, city_id, created_at')
      .eq('status', 'approved')
      .in('city_id', cityIds)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const items: CommunityFeedItem[] = [];

  for (const row of updatesRes.data ?? []) {
    const listingData = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as { name: string; city_id: string } | null;
    items.push({
      id: row.id,
      feed_type: 'update',
      listing_id: row.listing_id,
      listing_name: listingData?.name ?? null,
      city_id: listingData?.city_id ?? '',
      body: row.body,
      image_url: row.image_url,
      author_id: row.author_id,
      created_at: row.created_at,
      rank_score: 0,
    });
  }

  for (const row of newsRes.data ?? []) {
    items.push({
      id: row.id,
      feed_type: 'news',
      listing_id: null,
      listing_name: row.title,
      city_id: row.city_id,
      body: row.body,
      image_url: row.image_url,
      author_id: row.author_id,
      created_at: row.created_at,
      rank_score: 0,
    });
  }

  for (const row of eventsRes.data ?? []) {
    items.push({
      id: row.id,
      feed_type: 'event',
      listing_id: row.listing_id,
      listing_name: row.name,
      city_id: row.city_id,
      body: row.description,
      image_url: row.image_url,
      author_id: row.author_id,
      created_at: row.created_at,
      rank_score: 0,
    });
  }

  return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
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
    .select(`
      city:city_id ( id, name, metro_id )
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  const cityData = (Array.isArray(data?.city) ? data?.city[0] : data?.city) as { id: string; name: string; metro_id: string | null } | null;
  return {
    cityId: cityData?.id ?? null,
    metroId: cityData?.metro_id ?? null,
    cityName: cityData?.name ?? null,
  };
}
