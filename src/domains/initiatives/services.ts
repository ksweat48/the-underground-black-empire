import { supabase } from '@/shared/supabase-client';

export type InitiativeStatus =
  | 'submitted' | 'eligible' | 'in_voting' | 'awaiting_review' | 'awaiting_funding'
  | 'funded' | 'completed' | 'disqualified' | 'withdrawn' | 'deferred';

export type EntryOutcome =
  | 'voting' | 'pending_review' | 'awaiting_funding' | 'funded' | 'not_qualified'
  | 'no_quorum' | 'disqualified' | 'deferred' | 'withdrawn' | 'cancelled';

export type CycleStatus = 'open' | 'results_posted' | 'skipped' | 'cancelled';

export const MAX_BALLOT_SELECTIONS = 5;

export const STATUS_LABELS: Record<InitiativeStatus, string> = {
  submitted: 'Under Review',
  eligible: 'Eligible',
  in_voting: 'In Voting',
  awaiting_review: 'Awaiting Review',
  awaiting_funding: 'Awaiting Funding',
  funded: 'Funded',
  completed: 'Completed',
  disqualified: 'Disqualified',
  withdrawn: 'Withdrawn',
  deferred: 'Deferred',
};

export const OUTCOME_LABELS: Record<EntryOutcome, string> = {
  voting: 'On ballot',
  pending_review: 'Final review',
  awaiting_funding: 'Awaiting Funding',
  funded: 'Funded',
  not_qualified: 'Below 10% support',
  no_quorum: 'Quorum not reached',
  disqualified: 'Disqualified',
  deferred: 'Deferred',
  withdrawn: 'Withdrawn',
  cancelled: 'Cycle cancelled',
};

export interface RankingItem {
  initiative_id: string;
  title: string;
  description: string;
  organization_id: string;
  organization_name: string;
  organization_image_url: string | null;
  amount_requested_cents: number;
  backer_count: number;
  created_at: string;
  i_backed: boolean;
}

export interface BallotEntry {
  initiative_id: string;
  title: string;
  description: string;
  impact: string;
  organization_id: string;
  organization_name: string;
  organization_image_url: string | null;
  amount_requested_cents: number;
  frozen_rank: number;
  outcome: EntryOutcome;
}

export interface MyBallot {
  credits_spent: number;
  voting_power: number;
  submitted_at: string;
  selections: string[];
}

export interface ActiveCycle {
  id: string;
  opens_at: string;
  closes_at: string;
  eligible_voter_count: number;
  quorum_required: number;
  entries: BallotEntry[];
  my_ballot: MyBallot | null;
}

export interface ResultEntry {
  initiative_id: string;
  title: string;
  organization_name: string;
  amount_requested_cents: number;
  frozen_rank: number;
  final_rank: number | null;
  support_ballots: number;
  weighted_support: number;
  qualified: boolean | null;
  outcome: EntryOutcome;
}

export interface PastCycle {
  id: string;
  opens_at: string;
  closes_at: string;
  status: CycleStatus;
  skip_reason: string | null;
  cancel_reason: string | null;
  eligible_voter_count: number | null;
  quorum_required: number | null;
  ballot_count: number | null;
  quorum_met: boolean | null;
  results_posted_at: string | null;
  my_selections: string[];
  entries: ResultEntry[];
}

export interface InitiativeHub {
  metro: { id: string; name: string; state: string | null; timezone: string };
  available_cents: number;
  min_available_cents: number;
  next_cycle_opens_at: string | null;
  me: {
    in_metro: boolean;
    tier: string | null;
    tier_name: string | null;
    can_vote: boolean;
    credits: number;
    voting_power: number;
  };
  active_cycle: ActiveCycle | null;
  ranking: RankingItem[];
  cycles: PastCycle[];
}

export interface InitiativeEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
  actor_name: string | null;
}

export interface InitiativeCycleRecord {
  cycle_id: string;
  opens_at: string;
  closes_at: string;
  status: CycleStatus;
  ballot_count: number | null;
  quorum_met: boolean | null;
  frozen_rank: number;
  final_rank: number | null;
  support_ballots: number | null;
  weighted_support: number | null;
  outcome: EntryOutcome;
}

export interface InitiativeDetail {
  id: string;
  title: string;
  description: string;
  impact: string;
  timeline: string;
  conflict_disclosure: string;
  amount_requested_cents: number;
  funded_cents: number;
  status: InitiativeStatus;
  backer_count: number;
  staged_funding_approved: boolean;
  funded_at: string | null;
  completed_at: string | null;
  created_at: string;
  payment_reference: string | null;
  organization: { id: string; name: string; image_url: string | null; is_verified: boolean };
  metro: { id: string; name: string } | null;
  is_owner: boolean;
  i_backed: boolean;
  can_back: boolean;
  events: InitiativeEvent[];
  cycles: InitiativeCycleRecord[];
}

export interface AdminReviewItem {
  id: string;
  title: string;
  description: string;
  impact: string;
  timeline: string;
  conflict_disclosure: string;
  amount_requested_cents: number;
  status: InitiativeStatus;
  created_at: string;
  organization_name: string;
  metro_name: string;
  metro_available_cents: number;
}

export interface AdminFundingItem {
  cycle_id: string;
  initiative_id: string;
  title: string;
  organization_name: string;
  metro_name: string;
  final_rank: number;
  support_ballots: number;
  weighted_support: number;
  ballot_count: number;
  outcome: EntryOutcome;
  amount_requested_cents: number;
  funded_cents: number;
  staged_funding_approved: boolean;
  metro_available_cents: number;
  is_next: boolean;
  closes_at: string;
}

export interface AdminCycleItem {
  id: string;
  metro_name: string;
  opens_at: string;
  closes_at: string;
  status: CycleStatus;
  skip_reason: string | null;
  cancel_reason: string | null;
  eligible_voter_count: number | null;
  quorum_required: number | null;
  quorum_met: boolean | null;
  ballot_count: number | null;
  entry_count: number;
  can_cancel: boolean;
}

export interface AdminInitiativeOverview {
  review_queue: AdminReviewItem[];
  funding_queue: AdminFundingItem[];
  funded: { id: string; title: string; organization_name: string; funded_cents: number; funded_at: string; payment_reference: string | null }[];
  cycles: AdminCycleItem[];
}

export interface NewInitiative {
  organizationId: string;
  title: string;
  description: string;
  impact: string;
  timeline: string;
  amountCents: number;
  conflictDisclosure: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function fetchInitiativeHub(metroId?: string): Promise<InitiativeHub | null> {
  const { data, error } = await supabase.rpc('get_initiative_hub', metroId ? { p_metro_id: metroId } : {});
  if (error) throw error;
  if (!isObject(data) || !isObject(data.metro) || !isObject(data.me)) return null;
  const hub = data as unknown as InitiativeHub;
  return {
    ...hub,
    ranking: arr<RankingItem>(hub.ranking),
    cycles: arr<PastCycle>(hub.cycles).map((c) => ({
      ...c,
      entries: arr<ResultEntry>(c.entries),
      my_selections: arr<string>(c.my_selections),
    })),
    active_cycle: isObject(hub.active_cycle)
      ? {
          ...hub.active_cycle,
          entries: arr<BallotEntry>(hub.active_cycle.entries),
          my_ballot: isObject(hub.active_cycle.my_ballot)
            ? { ...hub.active_cycle.my_ballot, selections: arr<string>(hub.active_cycle.my_ballot.selections) }
            : null,
        }
      : null,
  };
}

export async function fetchInitiativeDetail(initiativeId: string): Promise<InitiativeDetail | null> {
  const { data, error } = await supabase.rpc('get_initiative_detail', { p_initiative_id: initiativeId });
  if (error) throw error;
  if (!isObject(data) || typeof data.id !== 'string' || !isObject(data.organization)) return null;
  const d = data as unknown as InitiativeDetail;
  return { ...d, events: arr<InitiativeEvent>(d.events), cycles: arr<InitiativeCycleRecord>(d.cycles) };
}

export async function toggleInitiativeBacking(initiativeId: string): Promise<{ backed: boolean; backer_count: number }> {
  const { data, error } = await supabase.rpc('toggle_initiative_backing', { p_initiative_id: initiativeId });
  if (error) throw error;
  if (!isObject(data) || typeof data.backed !== 'boolean') throw new Error('Unexpected response');
  return { backed: data.backed, backer_count: Number(data.backer_count ?? 0) };
}

export async function submitInitiativeBallot(cycleId: string, initiativeIds: string[]) {
  const { data, error } = await supabase.rpc('submit_initiative_ballot', {
    p_cycle_id: cycleId,
    p_initiative_ids: initiativeIds,
  });
  if (error) throw error;
  if (!isObject(data) || typeof data.ballot_id !== 'string') throw new Error('Unexpected response');
  return data as { ballot_id: string; credits_spent: number; credits_remaining: number; influence_awarded: number };
}

export async function submitInitiative(input: NewInitiative): Promise<string> {
  const { data, error } = await supabase.rpc('submit_initiative', {
    p_organization_id: input.organizationId,
    p_title: input.title,
    p_description: input.description,
    p_impact: input.impact,
    p_timeline: input.timeline,
    p_amount_cents: input.amountCents,
    p_conflict_disclosure: input.conflictDisclosure,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Unexpected response');
  return data;
}

export async function withdrawInitiative(initiativeId: string, reason: string) {
  const { error } = await supabase.rpc('withdraw_initiative', { p_initiative_id: initiativeId, p_reason: reason });
  if (error) throw error;
}

export async function postInitiativeUpdate(initiativeId: string, note: string) {
  const { error } = await supabase.rpc('post_initiative_update', { p_initiative_id: initiativeId, p_note: note });
  if (error) throw error;
}

export async function fetchOrganizationInitiatives(organizationId: string) {
  const { data, error } = await supabase
    .from('initiatives')
    .select('id, title, status, amount_requested_cents, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as { id: string; title: string; status: InitiativeStatus; amount_requested_cents: number; created_at: string }[];
}

export async function fetchAdminInitiativeOverview(): Promise<AdminInitiativeOverview> {
  const { data, error } = await supabase.rpc('admin_initiative_overview');
  if (error) throw error;
  if (!isObject(data)) throw new Error('Unexpected response');
  return {
    review_queue: arr(data.review_queue),
    funding_queue: arr(data.funding_queue),
    funded: arr(data.funded),
    cycles: arr(data.cycles),
  };
}

export async function adminReviewInitiative(initiativeId: string, decision: 'approve' | 'disqualify', reason: string) {
  const { error } = await supabase.rpc('admin_review_initiative', {
    p_initiative_id: initiativeId, p_decision: decision, p_reason: reason,
  });
  if (error) throw error;
}

export async function adminSetInitiativeOutcome(
  cycleId: string, initiativeId: string, action: 'disqualify' | 'defer' | 'approve_staged', reason: string,
) {
  const { error } = await supabase.rpc('admin_set_initiative_outcome', {
    p_cycle_id: cycleId, p_initiative_id: initiativeId, p_action: action, p_reason: reason,
  });
  if (error) throw error;
}

export async function adminReleaseInitiativeFunding(cycleId: string, initiativeId: string, amountCents: number, paymentReference: string) {
  const { error } = await supabase.rpc('admin_release_initiative_funding', {
    p_cycle_id: cycleId, p_initiative_id: initiativeId, p_amount_cents: amountCents, p_payment_reference: paymentReference,
  });
  if (error) throw error;
}

export async function adminCompleteInitiative(initiativeId: string, note: string) {
  const { error } = await supabase.rpc('admin_complete_initiative', { p_initiative_id: initiativeId, p_note: note });
  if (error) throw error;
}

export async function adminCancelInitiativeCycle(cycleId: string, reason: string) {
  const { data, error } = await supabase.rpc('admin_cancel_initiative_cycle', { p_cycle_id: cycleId, p_reason: reason });
  if (error) throw error;
  return isObject(data) ? Number(data.ballots_refunded ?? 0) : 0;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
