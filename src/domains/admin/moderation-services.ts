import { supabase } from '@/shared/supabase-client';

export interface ModerationReport {
  id: string;
  reporter_id: string;
  target_type: 'listing' | 'comment' | 'member' | 'post';
  target_id: string;
  reason: string;
  status: 'pending' | 'actioned' | 'dismissed';
  created_at: string;
  reporter_name: string | null;
}

export interface AdminSubRole {
  id: string;
  member_id: string;
  sub_role: string;
  is_active: boolean;
  assigned_at: string;
  revoked_at: string | null;
  member_name: string | null;
  member_avatar_url: string | null;
}

export interface ElectionStats {
  cycle_id: string;
  metro_id: string;
  phase: string;
  eligible_voters: number;
  ballots_cast: number;
  participation_rate: number;
  candidates: number;
  nominations: number;
}

export async function fetchModerationQueue(limit = 30): Promise<ModerationReport[]> {
  const { data, error } = await supabase.rpc('get_moderation_queue', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ModerationReport[];
}

export async function takeModerationAction(
  targetType: string,
  targetId: string,
  action: 'warn' | 'suspend' | 'remove' | 'dismiss' | 'unsuspend',
  reason: string,
  notes?: string,
  reportId?: string,
): Promise<void> {
  const { error } = await supabase.rpc('take_moderation_action', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_action: action,
    p_reason: reason,
    p_notes: notes ?? null,
    p_report_id: reportId ?? null,
  });
  if (error) throw error;
}

export async function fetchAdminSubRoles(): Promise<AdminSubRole[]> {
  const { data, error } = await supabase.rpc('get_admin_sub_roles');
  if (error) throw error;
  return (data ?? []) as AdminSubRole[];
}

export async function assignSubRole(memberId: string, subRole: string): Promise<void> {
  const { error } = await supabase.rpc('assign_sub_role', {
    p_member_id: memberId,
    p_sub_role: subRole,
  });
  if (error) throw error;
}

export async function revokeSubRole(memberId: string, subRole: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_sub_role', {
    p_member_id: memberId,
    p_sub_role: subRole,
  });
  if (error) throw error;
}

export async function cancelElectionCycle(cycleId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_election_cycle', { p_cycle_id: cycleId });
  if (error) throw error;
}

export async function fetchElectionStats(cycleId: string): Promise<ElectionStats | null> {
  const { data, error } = await supabase.rpc('get_election_participation_stats', { p_cycle_id: cycleId });
  if (error) throw error;
  return data as ElectionStats | null;
}

export async function correctMemberCity(memberId: string, newCityId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('correct_member_city', {
    p_member_id: memberId,
    p_new_city_id: newCityId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function correctMilestone(
  metroId: string,
  field: string,
  newValue: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('correct_milestone', {
    p_metro_id: metroId,
    p_field: field,
    p_new_value: newValue,
    p_reason: reason,
  });
  if (error) throw error;
}

export interface AdminPartner {
  member_id: string;
  display_name: string | null;
  member_number: number | null;
  avatar_url: string | null;
  stripe_connect_status: string | null;
  is_active: boolean;
  joined_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  referral_count: number;
  pending_cents: number;
  available_cents: number;
  paid_cents: number;
}

export async function fetchPartnersAdmin(): Promise<AdminPartner[]> {
  const { data, error } = await supabase.rpc('get_partners_admin');
  if (error) throw error;
  return Array.isArray(data) ? (data as AdminPartner[]) : [];
}

export async function setPartnerStatus(memberId: string, active: boolean, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_set_partner_status', {
    p_partner_id: memberId,
    p_active: active,
    p_reason: reason,
  });
  if (error) throw error;
}
