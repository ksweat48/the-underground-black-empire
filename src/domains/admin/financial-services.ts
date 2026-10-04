import { supabase } from '@/shared/supabase-client';
import { formatCents } from '@/domains/treasury/services';

export interface SplitPolicy {
  id: number;
  label: string;
  city_treasury_pct: number;
  empire_treasury_pct: number;
  family_legacy_pct: number;
  operations_pct: number;
  partner_commission_pct: number;
  city_treasury_pct_with_referral: number;
  empire_treasury_pct_with_referral: number;
  family_legacy_pct_with_referral: number;
  operations_pct_with_referral: number;
  partner_commission_pct_with_referral: number;
  is_active: boolean;
  effective_from: string;
}

export interface ReconciliationRun {
  id: string;
  run_date: string;
  stripe_total_cents: number;
  ledger_total_cents: number;
  difference_cents: number;
  status: 'balanced' | 'discrepancy' | 'resolved';
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  discrepancies: ReconciliationDiscrepancy[];
}

export interface ReconciliationDiscrepancy {
  id: string;
  stripe_event_id: string | null;
  stripe_amount_cents: number | null;
  ledger_amount_cents: number | null;
  difference_cents: number | null;
  notes: string | null;
}

export type FundKey = 'metro' | 'empire' | 'family_legacy';

export const FUND_LABELS: Record<FundKey, string> = {
  metro: 'Metro Treasury',
  empire: 'Empire Treasury',
  family_legacy: 'Family & Legacy',
};

export interface FundTotals {
  raised_cents: number;
  paid_cents: number;
  committed_cents: number;
  available_cents: number;
}

export interface FundRelease {
  id: string;
  fund: FundKey;
  metro_id: string | null;
  metro_name: string | null;
  initiative_id: string | null;
  assistance_request_id: string | null;
  amount_cents: number;
  purpose: string | null;
  status: 'submitted' | 'under_review' | 'approved' | 'funded' | 'completed' | 'rejected';
  submitted_by: string;
  submitted_by_name: string | null;
  submitted_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  payment_reference: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface AssistanceRequestForReview {
  id: string;
  member_id: string;
  display_name: string | null;
  membership_tier: string;
  identity_verified: boolean;
  good_standing_days: number;
  category: string;
  amount_requested_cents: number;
  description: string;
  status: 'submitted' | 'approved' | 'denied' | 'paid' | 'withdrawn';
  approved_amount_cents: number | null;
  decision_notes: string | null;
  created_at: string;
}

export interface MetroOption {
  id: string;
  name: string;
}

export async function fetchSplitPolicies(): Promise<SplitPolicy[]> {
  const { data, error } = await supabase
    .from('treasury_split_policies')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SplitPolicy[];
}

export async function fetchReconciliationRuns(limit = 30): Promise<ReconciliationRun[]> {
  const { data, error } = await supabase.rpc('get_reconciliation_runs', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ReconciliationRun[];
}

export async function resolveReconciliationRun(runId: string, notes: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_reconciliation_run', { p_run_id: runId, p_notes: notes });
  if (error) throw new Error(error.message?.includes('resolution note') ? 'Add a short note explaining the resolution.' : 'Could not mark this run resolved.');
}

export interface PayoutQueueItem {
  id: string;
  partner_id: string;
  display_name: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed';
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  requested_at: string;
  completed_at: string | null;
  failure_reason: string | null;
}

export async function fetchPayoutQueue(): Promise<PayoutQueueItem[]> {
  const { data, error } = await supabase.rpc('get_payouts_for_processing');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as PayoutQueueItem[];
}

export async function runMonthlyPayouts(): Promise<{ processed: number; paid: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('partner-payout', { body: { action: 'process' } });
  if (error || data?.error) throw new Error('The payout run could not be completed.');
  return { processed: data?.processed ?? 0, paid: data?.paid ?? 0, failed: data?.failed ?? 0 };
}

function rpcMessage(error: { message?: string } | null, fallback: string): string {
  const msg = error?.message ?? '';
  return msg && !msg.includes('function') && !msg.includes('permission') ? msg : fallback;
}

export async function fetchFundBalances(): Promise<{ empire: FundTotals; family_legacy: FundTotals }> {
  const { data, error } = await supabase.rpc('get_fund_balances');
  if (error || !data?.empire || !data?.family_legacy) throw new Error('Could not load fund balances.');
  return data as { empire: FundTotals; family_legacy: FundTotals };
}

export async function fetchReleaseQueue(includeClosed: boolean): Promise<FundRelease[]> {
  const { data, error } = await supabase.rpc('get_release_queue', { p_include_closed: includeClosed });
  if (error) throw new Error('Could not load releases.');
  return (Array.isArray(data) ? data : []) as FundRelease[];
}

export async function fetchMetroOptions(): Promise<MetroOption[]> {
  const { data, error } = await supabase.from('metros').select('id, name').order('name');
  if (error) throw new Error('Could not load metros.');
  return (data ?? []) as MetroOption[];
}

export async function submitFundRelease(input: {
  fund: FundKey;
  amountCents: number;
  purpose: string;
  metroId?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('submit_fund_release', {
    p_fund: input.fund,
    p_amount_cents: input.amountCents,
    p_purpose: input.purpose,
    p_metro_id: input.fund === 'metro' ? input.metroId ?? null : null,
  });
  if (error) throw new Error(rpcMessage(error, 'Could not submit this release.'));
}

export async function reviewTreasuryRelease(releaseId: string, notes: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('review_treasury_release', {
    p_release_id: releaseId,
    p_review_notes: notes || null,
    p_approve: approve,
  });
  if (error) throw new Error(rpcMessage(error, 'Could not update this release.'));
}

export async function completeTreasuryRelease(releaseId: string, paymentReference: string): Promise<void> {
  const { error } = await supabase.rpc('complete_treasury_release', {
    p_release_id: releaseId,
    p_payment_reference: paymentReference,
  });
  if (error) throw new Error(rpcMessage(error, 'Could not mark this release paid.'));
}

export async function rejectTreasuryRelease(releaseId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_treasury_release', {
    p_release_id: releaseId,
    p_reason: reason,
  });
  if (error) throw new Error(rpcMessage(error, 'Could not reject this release.'));
}

export async function fetchAssistanceRequestsForReview(includeClosed: boolean): Promise<AssistanceRequestForReview[]> {
  const { data, error } = await supabase.rpc('admin_list_family_assistance_requests', { p_include_closed: includeClosed });
  if (error) throw new Error('Could not load assistance requests.');
  return (Array.isArray(data) ? data : []) as AssistanceRequestForReview[];
}

export async function decideAssistanceRequest(
  requestId: string,
  approve: boolean,
  amountCents: number | null,
  notes: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_decide_family_assistance_request', {
    p_request_id: requestId,
    p_approve: approve,
    p_amount_cents: amountCents,
    p_notes: notes || null,
  });
  if (error) throw new Error(rpcMessage(error, 'Could not save this decision.'));
}

export async function correctPartnerAttribution(
  referredMemberId: string,
  correctedPartnerId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('correct_partner_attribution', {
    p_referred_member_id: referredMemberId,
    p_corrected_partner_id: correctedPartnerId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function generateTaxRecord(
  partnerId: string,
  taxYear?: number,
): Promise<{ success: boolean; total_paid_cents: number; payout_count: number }> {
  const { data, error } = await supabase.rpc('generate_tax_record', {
    p_partner_id: partnerId,
    p_tax_year: taxYear ?? new Date().getFullYear(),
  });
  if (error) throw error;
  return data as { success: boolean; total_paid_cents: number; payout_count: number };
}

export { formatCents };
