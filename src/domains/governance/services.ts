import { supabase } from '@/shared/supabase-client';

export interface EACSeat {
  seat_number: number;
  role_label: string;
  member_id: string | null;
  is_active: boolean;
  appointed_at: string | null;
  is_vacant: boolean;
  member_name: string | null;
  member_avatar_url: string | null;
}

export interface EmpireInitiative {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'eac_review' | 'eac_rejected' | 'member_voting' | 'passed' | 'failed' | 'cancelled';
  eac_approvals: number;
  eac_rejections: number;
  yes_votes: number;
  no_votes: number;
  eac_review_opens_at: string;
  eac_review_closes_at: string;
  member_voting_opens_at: string | null;
  member_voting_closes_at: string | null;
  finalized_at: string | null;
  created_at: string;
  eac_votes: { voter_id: string; vote: string; notes: string | null; member_name: string | null; created_at: string }[];
}

export async function fetchEAC(): Promise<EACSeat[]> {
  const { data, error } = await supabase.rpc('get_eac');
  if (error) throw error;
  return (data ?? []) as EACSeat[];
}

export async function fetchEmpireInitiatives(limit = 20): Promise<EmpireInitiative[]> {
  const { data, error } = await supabase.rpc('get_empire_initiatives', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as EmpireInitiative[];
}

export async function submitEACApplication(
  seatNumber: number,
  conflictDisclosure: string,
  qualifications: string,
): Promise<void> {
  const { error } = await supabase.rpc('submit_eac_application', {
    p_seat_number: seatNumber,
    p_conflict_disclosure: conflictDisclosure,
    p_qualifications: qualifications,
  });
  if (error) throw error;
}

export async function castEACVote(
  initiativeId: string,
  vote: 'approve' | 'reject',
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('cast_eac_vote', {
    p_initiative_id: initiativeId,
    p_vote: vote,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function castEmpireBallot(initiativeId: string, vote: 'yes' | 'no'): Promise<void> {
  const { error } = await supabase.rpc('cast_empire_ballot', {
    p_initiative_id: initiativeId,
    p_vote: vote,
  });
  if (error) throw error;
}

export async function recuseFromEmpireVote(initiativeId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('recuse_from_empire_vote', {
    p_empire_vote_id: initiativeId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function createEmpireInitiative(
  title: string,
  description: string,
  category: string = 'policy',
): Promise<void> {
  const { error } = await supabase.rpc('create_empire_initiative', {
    p_title: title,
    p_description: description,
    p_category: category,
  });
  if (error) throw error;
}

export async function finalizeEmpireInitiative(initiativeId: string): Promise<void> {
  const { error } = await supabase.rpc('finalize_empire_initiative', {
    p_initiative_id: initiativeId,
  });
  if (error) throw error;
}

export async function appointEACMember(seatNumber: number, memberId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('appoint_eac_member', {
    p_seat_number: seatNumber,
    p_member_id: memberId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function removeEACMember(seatNumber: number, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('remove_eac_member', {
    p_seat_number: seatNumber,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}
