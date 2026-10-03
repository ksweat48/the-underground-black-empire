import { supabase } from '@/shared/supabase-client';
import { getLevelFromInfluence } from '@/config/progression-rules';
import type {
  LeadershipCycle,
  NominationCandidate,
  LeadershipFinalist,
  MetroCouncilMember,
  LeadershipEligibility,
  MyBallot,
  MyNominationStatus,
  NomineeAcceptanceStatus,
} from './types';

export type {
  LeadershipCycle,
  NominationCandidate,
  LeadershipFinalist,
  MetroCouncilMember,
  LeadershipEligibility,
  MyBallot,
  MyNominationStatus,
  NomineeAcceptanceStatus,
};

// ============================================================
// ELIGIBILITY
// ============================================================

export async function fetchLeadershipEligibility(memberId: string): Promise<LeadershipEligibility> {
  const { data: member, error } = await supabase
    .from('members')
    .select('city_id, membership_tier')
    .eq('id', memberId)
    .maybeSingle();

  if (error || !member) {
    return {
      eligible: false,
      influence: 0,
      membership_tier: null,
      has_city: false,
      reasons: ['Unable to load member data'],
    };
  }

  const { data: influenceData } = await supabase
    .rpc('get_member_influence', { p_member_id: memberId });

  const influence = Number(influenceData ?? 0);
  const hasCity = !!member.city_id;
  const tier = member.membership_tier as string | null;
  const hasValidTier = tier !== null && ['black', 'black_plus', 'black_pro', 'arch', 'arch_pro'].includes(tier);
  const hasInfluence = influence >= 250;

  const reasons: string[] = [];
  if (!hasCity) reasons.push('Select your city');
  if (!hasInfluence) reasons.push(`Reach 250 Influence (you have ${influence})`);
  if (!hasValidTier) reasons.push('Upgrade to Black or higher membership');

  return {
    eligible: hasCity && hasInfluence && hasValidTier,
    influence,
    membership_tier: tier,
    has_city: hasCity,
    reasons,
  };
}

// ============================================================
// ELECTION CYCLES
// ============================================================

export async function fetchActiveCycle(metroId: string | null): Promise<LeadershipCycle | null> {
  if (!metroId) return null;
  const { data, error } = await supabase
    .from('leadership_election_cycles')
    .select('*')
    .eq('metro_id', metroId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as LeadershipCycle | null;
}

// ============================================================
// NOMINATIONS
// ============================================================

export async function fetchNominationCandidates(metroId: string | null, currentUserId: string): Promise<NominationCandidate[]> {
  if (!metroId) return [];

  const metroCityIds = await supabase
    .from('cities')
    .select('id')
    .eq('metro_id', metroId)
    .eq('canonical_status', 'active');

  if (metroCityIds.error || !metroCityIds.data || metroCityIds.data.length === 0) return [];

  const cityIds = metroCityIds.data.map((c) => c.id);

  // Fetch all members in the metro (no opt_in filter — eligibility is automatic)
  const { data: members, error } = await supabase
    .from('members')
    .select('id, display_name, avatar_url, city_id, membership_tier')
    .in('city_id', cityIds)
    .neq('id', currentUserId);

  if (error) throw error;
  if (!members || members.length === 0) return [];

  // Get active cycle for acceptance status lookup
  const { data: activeCycle } = await supabase
    .from('leadership_election_cycles')
    .select('id')
    .eq('metro_id', metroId)
    .eq('phase', 'nomination')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch acceptance statuses for this cycle
  let acceptanceMap: Record<string, NomineeAcceptanceStatus> = {};
  if (activeCycle) {
    const { data: acceptances } = await supabase
      .from('leadership_nominee_acceptances')
      .select('member_id, status')
      .eq('cycle_id', activeCycle.id);
    if (acceptances) {
      for (const a of acceptances) {
        acceptanceMap[a.member_id] = a.status as NomineeAcceptanceStatus;
      }
    }
  }

  const candidates: NominationCandidate[] = [];

  for (const member of members) {
    const { data: influence } = await supabase
      .rpc('get_member_influence', { p_member_id: member.id });

    const influenceValue = Number(influence ?? 0);
    const level = getLevelFromInfluence(influenceValue).level;

    // Check eligibility directly
    const tier = member.membership_tier as string | null;
    const hasValidTier = tier !== null && ['black', 'black_plus', 'black_pro', 'arch', 'arch_pro'].includes(tier);
    const isEligible = hasValidTier && influenceValue >= 250;

    const { count: nomCount } = await supabase
      .from('leadership_nominations')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', member.id);

    const { data: myNom } = await supabase
      .from('leadership_nominations')
      .select('id')
      .eq('candidate_id', member.id)
      .eq('nominator_id', currentUserId)
      .maybeSingle();

    candidates.push({
      member_id: member.id,
      display_name: member.display_name,
      avatar_url: member.avatar_url,
      influence: influenceValue,
      level,
      nomination_count: nomCount ?? 0,
      has_nominated: !!myNom,
      is_eligible: isEligible,
      acceptance_status: acceptanceMap[member.id] ?? null,
    });
  }

  // Sort: eligible first, then by nomination count, then by influence
  candidates.sort((a, b) => {
    if (a.is_eligible !== b.is_eligible) return a.is_eligible ? -1 : 1;
    return b.nomination_count - a.nomination_count || b.influence - a.influence;
  });

  return candidates;
}

export async function submitNomination(candidateId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_leadership_nomination', { p_candidate_id: candidateId });
  if (error) throw error;
}

export async function fetchMyNominationCount(currentUserId: string): Promise<number> {
  const { count, error } = await supabase
    .from('leadership_nominations')
    .select('id', { count: 'exact', head: true })
    .eq('nominator_id', currentUserId);

  if (error) return 0;
  return count ?? 0;
}

// ============================================================
// NOMINEE ACCEPTANCE / DECLINE
// ============================================================

export async function acceptLeadershipNomination(cycleId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_leadership_nomination', { p_cycle_id: cycleId });
  if (error) throw error;
}

export async function declineLeadershipNomination(cycleId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_leadership_nomination', { p_cycle_id: cycleId });
  if (error) throw error;
}

export async function fetchMyNominationStatus(currentUserId: string, metroId: string | null): Promise<MyNominationStatus | null> {
  if (!metroId) return null;

  const { data: cycle, error } = await supabase
    .from('leadership_election_cycles')
    .select('id, nomination_closes_at')
    .eq('metro_id', metroId)
    .eq('phase', 'nomination')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !cycle) return null;

  const { count: nomCount } = await supabase
    .from('leadership_nominations')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', currentUserId);

  const { data: acceptance } = await supabase
    .from('leadership_nominee_acceptances')
    .select('status')
    .eq('cycle_id', cycle.id)
    .eq('member_id', currentUserId)
    .maybeSingle();

  return {
    cycle_id: cycle.id,
    nomination_count: nomCount ?? 0,
    acceptance_status: (acceptance?.status as NomineeAcceptanceStatus) ?? null,
    nomination_closes_at: cycle.nomination_closes_at,
  };
}

// ============================================================
// FINALISTS / ELECTION
// ============================================================

export async function fetchFinalists(cycleId: string): Promise<LeadershipFinalist[]> {
  const { data: candidates, error } = await supabase
    .from('leadership_candidates')
    .select(`
      id, member_id, service_statement, nomination_count, influence_at_nomination,
      member:member_id ( display_name, avatar_url )
    `)
    .eq('cycle_id', cycleId)
    .order('nomination_count', { ascending: false });

  if (error) throw error;
  if (!candidates || candidates.length === 0) return [];

  return candidates.map((c) => {
    const member = (Array.isArray(c.member) ? c.member[0] : c.member) as { display_name: string | null; avatar_url: string | null } | null;
    const influence = c.influence_at_nomination;
    const level = getLevelFromInfluence(influence).level;
    return {
      id: c.id,
      member_id: c.member_id,
      display_name: member?.display_name ?? null,
      avatar_url: member?.avatar_url ?? null,
      influence,
      level,
      nomination_count: c.nomination_count,
      service_statement: c.service_statement,
    };
  });
}

export async function castLeadershipBallot(cycleId: string, candidateIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('cast_leadership_ballot', {
    p_cycle_id: cycleId,
    p_candidate_ids: candidateIds,
  });
  if (error) throw error;
}

export async function fetchMyBallot(cycleId: string, userId: string): Promise<MyBallot | null> {
  const { data, error } = await supabase
    .from('leadership_ballots')
    .select('*')
    .eq('cycle_id', cycleId)
    .eq('voter_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as MyBallot | null;
}

// ============================================================
// METRO COUNCIL
// ============================================================

export async function fetchMetroCouncil(metroId: string | null): Promise<MetroCouncilMember[]> {
  if (!metroId) return [];

  const { data: council, error } = await supabase
    .from('metro_council')
    .select(`
      member_id, seat_number, vote_count, seated_at,
      member:member_id ( display_name, avatar_url )
    `)
    .eq('metro_id', metroId)
    .in('council_member_status', ['active', 'grace_period'])
    .order('seat_number', { ascending: true });

  if (error) throw error;
  if (!council || council.length === 0) return [];

  const results: MetroCouncilMember[] = [];

  for (const c of council) {
    const member = (Array.isArray(c.member) ? c.member[0] : c.member) as { display_name: string | null; avatar_url: string | null } | null;
    const { data: influence } = await supabase
      .rpc('get_member_influence', { p_member_id: c.member_id });
    const influenceValue = Number(influence ?? 0);
    const level = getLevelFromInfluence(influenceValue).level;

    results.push({
      member_id: c.member_id,
      seat_number: c.seat_number,
      vote_count: c.vote_count,
      display_name: member?.display_name ?? null,
      avatar_url: member?.avatar_url ?? null,
      influence: influenceValue,
      level,
      seated_at: c.seated_at,
    });
  }

  return results;
}
