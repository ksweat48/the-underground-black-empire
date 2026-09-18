export type ElectionPhase = 'nomination' | 'election' | 'closed';

export type NomineeAcceptanceStatus = 'pending' | 'accepted' | 'declined';

export interface LeadershipCycle {
  id: string;
  metro_id: string;
  cycle_name: string;
  phase: ElectionPhase;
  nomination_opens_at: string;
  nomination_closes_at: string;
  election_opens_at: string;
  election_closes_at: string;
  seats: number;
  finalist_count: number;
}

export interface NominationCandidate {
  member_id: string;
  display_name: string | null;
  avatar_url: string | null;
  influence: number;
  level: number;
  nomination_count: number;
  has_nominated: boolean;
  is_eligible: boolean;
  acceptance_status: NomineeAcceptanceStatus | null;
}

export interface LeadershipFinalist {
  id: string;
  member_id: string;
  display_name: string | null;
  avatar_url: string | null;
  influence: number;
  level: number;
  nomination_count: number;
  service_statement: string;
}

export interface MetroCouncilMember {
  member_id: string;
  seat_number: number;
  vote_count: number;
  display_name: string | null;
  avatar_url: string | null;
  influence: number;
  level: number;
  seated_at: string;
}

export interface LeadershipEligibility {
  eligible: boolean;
  influence: number;
  membership_tier: string | null;
  has_city: boolean;
  reasons: string[];
}

export interface MyNominationStatus {
  cycle_id: string;
  nomination_count: number;
  acceptance_status: NomineeAcceptanceStatus | null;
  nomination_closes_at: string;
}

export interface MyBallot {
  id: string;
  cycle_id: string;
  selected_candidate_ids: string[];
  created_at: string;
}
