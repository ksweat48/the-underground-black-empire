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

export interface TreasuryReleaseRecord {
  id: string;
  metro_id: string;
  initiative_id: string | null;
  amount_cents: number;
  status: 'submitted' | 'under_review' | 'approved' | 'funded' | 'completed' | 'rejected';
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  payment_reference: string | null;
  funded_by: string | null;
  funded_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
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

export async function fetchTreasuryReleases(metroId: string, limit = 25): Promise<TreasuryReleaseRecord[]> {
  const { data, error } = await supabase.rpc('get_treasury_releases', {
    p_metro_id: metroId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as TreasuryReleaseRecord[];
}

export async function submitTreasuryRelease(
  metroId: string,
  amountCents: number,
  initiativeId?: string,
  notes?: string,
): Promise<TreasuryReleaseRecord> {
  const { data, error } = await supabase.rpc('submit_treasury_release', {
    p_metro_id: metroId,
    p_amount_cents: amountCents,
    p_initiative_id: initiativeId ?? null,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return data as TreasuryReleaseRecord;
}

export async function reviewTreasuryRelease(
  releaseId: string,
  reviewNotes?: string,
  approve = false,
): Promise<void> {
  const { error } = await supabase.rpc('review_treasury_release', {
    p_release_id: releaseId,
    p_review_notes: reviewNotes ?? null,
    p_approve: approve,
  });
  if (error) throw error;
}

export async function completeTreasuryRelease(
  releaseId: string,
  paymentReference?: string,
): Promise<void> {
  const { error } = await supabase.rpc('complete_treasury_release', {
    p_release_id: releaseId,
    p_payment_reference: paymentReference ?? null,
  });
  if (error) throw error;
}

export async function rejectTreasuryRelease(releaseId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_treasury_release', {
    p_release_id: releaseId,
    p_reason: reason,
  });
  if (error) throw error;
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
