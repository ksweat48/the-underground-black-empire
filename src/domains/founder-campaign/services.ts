import { supabase } from '@/shared/supabase-client';

export interface CityWithProgress {
  id: string;
  name: string;
  slug: string;
  state: string;
  tier: string;
  population_count: number;
  metro_id: string | null;
  metro_name: string | null;
  canonical_status: string;
}

export interface StateOption {
  id: string;
  name: string;
  abbreviation: string;
}

export interface CitySearchResult {
  id: string;
  name: string;
  state: string;
  slug: string;
  population_count: number;
  tier: string;
  metro_name: string | null;
  metro_id: string | null;
}

export interface CityWithMetro {
  id: string;
  name: string;
  state: string;
  slug: string;
  population_count: number;
  tier: string;
  metro_id: string | null;
  metro_name: string | null;
  metro_population_count: number;
  metro_city_count: number;
  metro_rank: number;
}

export interface EmpireProgressData {
  tribe_city_count: number;
  total_population: number;
  total_cities: number;
  total_states: number;
}

export interface LeaderboardEntry {
  member_id: string;
  display_name: string | null;
  email: string;
  city_name: string | null;
  city_slug: string | null;
  founder_number: number | null;
  member_number: number | null;
  influence: number;
  referral_count: number;
}

export async function fetchCities(): Promise<CityWithProgress[]> {
  const { data, error } = await supabase
    .from('cities')
    .select(`
      id,
      name,
      slug,
      state,
      tier,
      population_count,
      metro_id,
      canonical_status,
      metro:metro_id ( name )
    `)
    .eq('canonical_status', 'active')
    .order('name');

  if (error) throw error;
  return (data ?? []).map((c) => {
    const metro = (Array.isArray(c.metro) ? c.metro[0] : c.metro) as { name: string } | null;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      state: c.state,
      tier: c.tier,
      population_count: c.population_count,
      metro_id: c.metro_id,
      metro_name: metro?.name ?? null,
      canonical_status: c.canonical_status,
    } as CityWithProgress;
  });
}

export async function fetchAllStates(): Promise<StateOption[]> {
  const { data, error } = await supabase
    .from('states')
    .select('id, name, abbreviation')
    .order('name');

  if (error) throw error;
  return data ?? [];
}

export async function searchCitiesInState(
  stateAbbreviation: string,
  query: string,
  limit: number = 8
): Promise<CitySearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    const { data, error } = await supabase
      .from('cities')
      .select(`
        id,
        name,
        state,
        slug,
        population_count,
        tier,
        metro_id,
        metro:metro_id ( name )
      `)
      .eq('canonical_status', 'active')
      .eq('state', stateAbbreviation)
      .order('name')
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map((c) => {
      const metro = (Array.isArray(c.metro) ? c.metro[0] : c.metro) as { name: string } | null;
      return {
        id: c.id, name: c.name, state: c.state, slug: c.slug,
        population_count: c.population_count, tier: c.tier,
        metro_name: metro?.name ?? null, metro_id: c.metro_id,
      } as CitySearchResult;
    });
  }

  const { data, error } = await supabase
    .from('cities')
    .select(`
      id,
      name,
      state,
      slug,
      population_count,
      tier,
      metro_id,
      metro:metro_id ( name )
    `)
    .eq('canonical_status', 'active')
    .eq('state', stateAbbreviation)
    .ilike('name', `${trimmed}%`)
    .order('name')
    .limit(limit);

  if (error) throw error;

  const startsWith = (data ?? []).map((c) => {
    const metro = (Array.isArray(c.metro) ? c.metro[0] : c.metro) as { name: string } | null;
    return {
      id: c.id, name: c.name, state: c.state, slug: c.slug,
      population_count: c.population_count, tier: c.tier,
      metro_name: metro?.name ?? null, metro_id: c.metro_id,
    } as CitySearchResult;
  });

  if (startsWith.length >= limit) return startsWith.slice(0, limit);

  const { data: containsData, error: containsError } = await supabase
    .from('cities')
    .select(`
      id,
      name,
      state,
      slug,
      population_count,
      tier,
      metro_id,
      metro:metro_id ( name )
    `)
    .eq('canonical_status', 'active')
    .eq('state', stateAbbreviation)
    .ilike('name', `%${trimmed}%`)
    .not('name', 'ilike', `${trimmed}%`)
    .order('name')
    .limit(limit - startsWith.length);

  if (!containsError && containsData) {
    const existingIds = new Set(startsWith.map((c) => c.id));
    for (const c of containsData) {
      if (!existingIds.has(c.id)) {
        const metro = (Array.isArray(c.metro) ? c.metro[0] : c.metro) as { name: string } | null;
        startsWith.push({
          id: c.id, name: c.name, state: c.state, slug: c.slug,
          population_count: c.population_count, tier: c.tier,
          metro_name: metro?.name ?? null, metro_id: c.metro_id,
        } as CitySearchResult);
      }
    }
  }

  return startsWith.slice(0, limit);
}

export async function fetchCityWithMetro(cityId: string): Promise<CityWithMetro | null> {
  const { data, error } = await supabase
    .from('cities')
    .select(`
      id,
      name,
      state,
      slug,
      population_count,
      tier,
      metro_id,
      metro:metro_id ( name )
    `)
    .eq('id', cityId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const metro = (Array.isArray(data.metro) ? data.metro[0] : data.metro) as { name: string } | null;
  let metroPopulationCount = 0;
  let metroCityCount = 0;
  let metroRank = 0;

  if (data.metro_id) {
    const { data: mp } = await supabase
      .from('metro_progress')
      .select('population_count, city_count')
      .eq('metro_id', data.metro_id)
      .maybeSingle();

    metroPopulationCount = mp?.population_count ?? 0;
    metroCityCount = mp?.city_count ?? 0;

    const { data: rankedMetros } = await supabase
      .from('metro_progress')
      .select('metro_id, population_count')
      .order('population_count', { ascending: false });

    if (rankedMetros) {
      const idx = rankedMetros.findIndex((m) => m.metro_id === data.metro_id);
      metroRank = idx >= 0 ? idx + 1 : 0;
    }
  }

  return {
    id: data.id,
    name: data.name,
    state: data.state,
    slug: data.slug,
    population_count: data.population_count,
    tier: data.tier,
    metro_id: data.metro_id,
    metro_name: metro?.name ?? null,
    metro_population_count: metroPopulationCount,
    metro_city_count: metroCityCount,
    metro_rank: metroRank,
  };
}

export async function fetchEmpireProgress(): Promise<EmpireProgressData> {
  const [progressRes, statsRes, membersRes] = await Promise.all([
    supabase
      .from('empire_progress')
      .select('tribe_city_count, total_population')
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('cities')
      .select('state, population_count'),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true }),
  ]);

  if (progressRes.error) throw progressRes.error;
  const progress = progressRes.data ?? { tribe_city_count: 0, total_population: 0 };
  const cities = statsRes.data ?? [];

  const activeCities = cities.filter((c) => c.population_count > 0);
  const distinctStates = new Set(activeCities.map((c) => c.state)).size;
  const totalPopulation = progress.total_population ?? (membersRes.count ?? 0);

  return {
    ...progress,
    total_cities: activeCities.length,
    total_states: distinctStates,
    total_population: totalPopulation,
  };
}

export async function fetchLeaderboard(limit: number = 50, metroId?: string | null): Promise<LeaderboardEntry[]> {
  let query = supabase
    .from('members')
    .select(`
      id,
      display_name,
      email,
      founder_number,
      member_number,
      city:city_id!members_city_id_fkey (
        name,
        slug,
        metro_id
      )
    `)
    .not('member_number', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit * 2);

  const { data, error } = await query;

  if (error) throw error;
  if (!data || data.length === 0) return [];

  let filtered = data;
  if (metroId) {
    filtered = filtered.filter((m) => {
      const cityData = (Array.isArray(m.city) ? m.city[0] : m.city) as { metro_id: string | null } | null;
      return cityData?.metro_id === metroId;
    });
  }
  const seenIds = new Set<string>();
  filtered = filtered.filter((m) => {
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });
  filtered = filtered.slice(0, limit);

  const memberIds = filtered.map((m) => m.id);

  const { data: influenceData, error: influenceError } = await supabase
    .from('influence_ledger')
    .select('member_id, amount')
    .in('member_id', memberIds);

  if (influenceError) throw influenceError;

  const { data: refData, error: refError } = await supabase
    .from('referrals')
    .select('referring_member_id')
    .in('referring_member_id', memberIds)
    .eq('status', 'verified');

  if (refError) throw refError;

  const influenceMap = new Map<string, number>();
  for (const entry of influenceData ?? []) {
    const current = influenceMap.get(entry.member_id) ?? 0;
    influenceMap.set(entry.member_id, current + entry.amount);
  }

  const refMap = new Map<string, number>();
  for (const entry of refData ?? []) {
    const current = refMap.get(entry.referring_member_id) ?? 0;
    refMap.set(entry.referring_member_id, current + 1);
  }

  return filtered.map((m) => {
    const cityData = (Array.isArray(m.city) ? m.city[0] : m.city) as { name: string; slug: string; metro_id: string | null } | null;
    return {
      member_id: m.id,
      display_name: m.display_name,
      email: m.email,
      city_name: cityData?.name ?? null,
      city_slug: cityData?.slug ?? null,
      founder_number: m.founder_number,
      member_number: (m as { member_number?: number | null }).member_number ?? null,
      influence: influenceMap.get(m.id) ?? 0,
      referral_count: refMap.get(m.id) ?? 0,
    };
  }).sort((a, b) => b.influence - a.influence || b.referral_count - a.referral_count);
}

export async function fetchInfluence(memberId: string): Promise<number> {
  const { data, error } = await supabase
    .from('influence_ledger')
    .select('amount')
    .eq('member_id', memberId);

  if (error) throw error;
  return (data ?? []).reduce((sum, entry) => sum + entry.amount, 0);
}

export interface MemberDashboardData {
  email: string;
  display_name: string | null;
  city_name: string | null;
  city_slug: string | null;
  city_tier: string | null;
  city_population_count: number | null;
  founder_number: number | null;
  member_number: number | null;
  influence: number;
  referral_count: number;
  verified_referral_count: number;
}

export interface FeedEvent {
  id: string;
  member_id: string | null;
  event_type: string;
  display_name: string | null;
  city_name: string | null;
  metro_id: string | null;
  metro_name: string | null;
  created_at: string;
  message: string;
}

export async function fetchEmpireFeed(limit: number = 20): Promise<FeedEvent[]> {
  const { data, error } = await supabase
    .rpc('get_activity_feed', { p_metro_id: null, p_limit: limit });

  if (error) throw error;
  return (data ?? []) as FeedEvent[];
}

export async function fetchLocalFeed(metroId: string, limit: number = 20): Promise<FeedEvent[]> {
  const { data, error } = await supabase
    .rpc('get_activity_feed', { p_metro_id: metroId, p_limit: limit });

  if (error) throw error;
  return (data ?? []) as FeedEvent[];
}

export interface CouncilNewsEvent {
  id: string;
  member_id: string | null;
  event_type: string;
  display_name: string | null;
  city_name: string | null;
  metro_id: string | null;
  metro_name: string | null;
  created_at: string;
  message: string;
  title: string | null;
}

export async function fetchEmpireCouncilNews(limit: number = 20): Promise<CouncilNewsEvent[]> {
  const { data, error } = await supabase
    .rpc('get_council_news_feed', { p_metro_id: null, p_limit: limit });

  if (error) throw error;
  return (data ?? []) as CouncilNewsEvent[];
}

export async function fetchLocalCouncilNews(metroId: string, limit: number = 20): Promise<CouncilNewsEvent[]> {
  const { data, error } = await supabase
    .rpc('get_council_news_feed', { p_metro_id: metroId, p_limit: limit });

  if (error) throw error;
  return (data ?? []) as CouncilNewsEvent[];
}

export async function fetchMemberDashboard(memberId: string): Promise<MemberDashboardData | null> {
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select(`
      id,
      email,
      display_name,
      founder_number,
      member_number,
      city:city_id!members_city_id_fkey (
        name,
        slug,
        tier,
        population_count
      )
    `)
    .eq('id', memberId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) return null;

  const { data: influenceData, error: influenceError } = await supabase
    .from('influence_ledger')
    .select('amount')
    .eq('member_id', memberId);

  if (influenceError) throw influenceError;

  const { data: refData, error: refError } = await supabase
    .from('referrals')
    .select('status')
    .eq('referring_member_id', memberId);

  if (refError) throw refError;

  const totalInfluence = (influenceData ?? []).reduce((sum, entry) => sum + entry.amount, 0);
  const referralCount = refData?.length ?? 0;
  const verifiedReferralCount = refData?.filter((r) => r.status === 'verified').length ?? 0;

  const cityData = (Array.isArray(member.city) ? member.city[0] : member.city) as { name: string; slug: string; tier: string; population_count: number } | null;

  return {
    email: member.email,
    display_name: member.display_name,
    city_name: cityData?.name ?? null,
    city_slug: cityData?.slug ?? null,
    city_tier: cityData?.tier ?? null,
    city_population_count: cityData?.population_count ?? null,
    founder_number: member.founder_number,
    member_number: (member as { member_number?: number | null }).member_number ?? null,
    influence: totalInfluence,
    referral_count: referralCount,
    verified_referral_count: verifiedReferralCount,
  };
}

export interface StateMapData {
  state: string;
  cityCount: number;
  totalPopulation: number;
  tribeCityCount: number;
  cities: {
    id: string;
    name: string;
    population_count: number;
    tier: string;
  }[];
}

export async function fetchMapData(): Promise<Map<string, StateMapData>> {
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, state, population_count, tier')
    .eq('canonical_status', 'active')
    .gt('population_count', 0)
    .order('population_count', { ascending: false });

  if (error) throw error;

  const map = new Map<string, StateMapData>();
  for (const c of data ?? []) {
    let entry = map.get(c.state);
    if (!entry) {
      entry = {
        state: c.state,
        cityCount: 0,
        totalPopulation: 0,
        tribeCityCount: 0,
        cities: [],
      };
      map.set(c.state, entry);
    }
    entry.cityCount++;
    entry.totalPopulation += c.population_count;
    if (c.population_count >= 100) entry.tribeCityCount++;
    entry.cities.push({
      id: c.id,
      name: c.name,
      population_count: c.population_count,
      tier: c.tier,
    });
  }
  return map;
}

// ==================== Public Member Profile (for feed card popups) ====================

export interface PublicMemberProfile {
  id: string;
  display_name: string | null;
  email: string;
  founder_number: number | null;
  member_number: number | null;
  city_name: string | null;
  city_tier: string | null;
  city_population_count: number | null;
  state: string | null;
  influence: number;
  referral_count: number;
  verified_referral_count: number;
  joined_at: string | null;
}

export async function fetchPublicMemberProfile(memberId: string): Promise<PublicMemberProfile | null> {
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select(`
      id,
      email,
      display_name,
      founder_number,
      member_number,
      created_at,
      city:city_id!members_city_id_fkey ( name, tier, population_count, state )
    `)
    .eq('id', memberId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) return null;

  const [
    { data: refData, error: refError },
    { data: influenceData, error: influenceError },
  ] = await Promise.all([
    supabase
      .from('referrals')
      .select('status')
      .eq('referring_member_id', memberId),
    supabase
      .from('influence_ledger')
      .select('amount')
      .eq('member_id', memberId),
  ]);

  if (refError) throw refError;
  if (influenceError) throw influenceError;

  const totalInfluence = (influenceData ?? []).reduce((sum, e) => sum + e.amount, 0);
  const refList = refData ?? [];
  const cityData = (Array.isArray(member.city) ? member.city[0] : member.city) as
    { name: string; tier: string; population_count: number; state: string } | null;

  return {
    id: member.id,
    display_name: member.display_name,
    email: member.email,
    founder_number: member.founder_number,
    member_number: (member as { member_number?: number | null }).member_number ?? null,
    city_name: cityData?.name ?? null,
    city_tier: cityData?.tier ?? null,
    city_population_count: cityData?.population_count ?? null,
    state: cityData?.state ?? null,
    influence: totalInfluence,
    referral_count: refList.length,
    verified_referral_count: refList.filter((r) => r.status === 'verified').length,
    joined_at: (member as { created_at?: string | null }).created_at ?? null,
  };
}
