import { supabase } from '@/shared/supabase-client';
import type {
  MembershipTier,
  MembershipTierId,
  VotingCredits,
  CreditLedgerEntry,
  LegacyFund,
  MemberMembership,
  BenefitItem,
  TierDetails,
  PartnerDashboard,
  PartnerInfo,
} from './types';

export type {
  MembershipTier,
  MembershipTierId,
  VotingCredits,
  CreditLedgerEntry,
  LegacyFund,
  MemberMembership,
  BenefitItem,
  TierDetails,
  PartnerDashboard,
  PartnerInfo,
};

export async function fetchMembershipTiers(): Promise<MembershipTier[]> {
  const { data, error } = await supabase
    .from('membership_tiers')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MembershipTier[];
}

export async function fetchMyMembership(userId: string): Promise<MemberMembership | null> {
  const { data, error } = await supabase
    .from('members')
    .select('membership_tier, membership_started_at, display_name, created_at, stripe_subscription_status, past_due_since, current_period_end, cancel_at_period_end, scheduled_tier')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as MemberMembership | null;
}

type BillingAction = 'cancel' | 'undo_cancel' | 'undo_downgrade' | 'update_card';

async function billingAction(action: BillingAction): Promise<{ url?: string; period_end?: string | null }> {
  const { data, error } = await supabase.functions.invoke('stripe-cancel', { body: { action } });
  if (error) {
    let message = 'Something went wrong. Please try again.';
    const context = 'context' in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

export async function cancelMembershipAtPeriodEnd() {
  return billingAction('cancel');
}

export async function undoMembershipCancel() {
  await billingAction('undo_cancel');
}

export async function undoScheduledDowngrade() {
  await billingAction('undo_downgrade');
}

export async function openCardUpdate(): Promise<string | null> {
  const data = await billingAction('update_card');
  return data.url ?? null;
}

export async function startStripeCheckout(tierId: MembershipTierId): Promise<string | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    console.error('Stripe checkout failed: no active session');
    return null;
  }

  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { tierId },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    let message = error.message || 'Unable to start checkout';
    const context = 'context' in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Keep the function error message when the response is not JSON.
      }
    }
    console.error('Stripe checkout failed:', message);
    throw new Error(message);
  }

  if (data?.error) {
    console.error('Stripe checkout failed:', data.error);
    throw new Error(data.error);
  }

  return data?.url ?? null;
}

export async function switchPaidTier(tierId: MembershipTierId): Promise<string | null> {
  return startStripeCheckout(tierId);
}

export async function fetchVotingCredits(userId: string): Promise<VotingCredits | null> {
  const { data, error } = await supabase
    .from('voting_credits')
    .select('*')
    .eq('member_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as VotingCredits | null;
}

export async function fetchCreditLedger(userId: string, limit = 10): Promise<CreditLedgerEntry[]> {
  const { data, error } = await supabase
    .from('voting_credit_ledger')
    .select('id, amount, source, reference_id, created_at')
    .eq('member_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CreditLedgerEntry[];
}

export async function ensureVotingCreditsRow(userId: string): Promise<void> {
  const { error } = await supabase
    .from('voting_credits')
    .insert({ member_id: userId, balance: 0 })
    .eq('member_id', userId);
  if (error && !error.message.includes('duplicate')) {
    // silently ignore — row may already exist
  }
}

export async function fetchLegacyFund(): Promise<LegacyFund> {
  const { data, error } = await supabase
    .from('legacy_fund')
    .select('total_reserve')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return { total_reserve: Number(data?.total_reserve ?? 0) };
}

// ============================================================
// Partner program functions
// ============================================================

export async function joinPartnerProgram(): Promise<PartnerInfo | null> {
  const { data, error } = await supabase.rpc('join_partner_program');
  if (error) throw error;
  return data as PartnerInfo | null;
}

export async function fetchPartnerDashboard(): Promise<PartnerDashboard> {
  const { data, error } = await supabase.rpc('get_partner_dashboard');
  if (error) throw error;
  return (data ?? { is_partner: false }) as PartnerDashboard;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

export async function startStripeConnectOnboarding(): Promise<string | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const { data, error } = await supabase.functions.invoke('stripe-connect', {
    body: { action: 'onboard' },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || data?.error) {
    console.error('Connect onboarding failed:', error ?? data?.error);
    return null;
  }
  return data?.url ?? null;
}

export async function checkConnectStatus(): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) return 'not_connected';

  const { data, error } = await supabase.functions.invoke('stripe-connect', {
    body: { action: 'check_status' },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || data?.error) return 'not_connected';
  return data?.status ?? 'not_connected';
}

export async function requestPartnerPayout(): Promise<{ success: boolean; net_cents?: number; error?: string }> {
  const { data, error } = await supabase.rpc('request_my_partner_payout');
  if (error) {
    const known = [
      'Minimum payout is $100',
      'You already have a payout in progress',
      'Finish payout setup before requesting a payout',
      'Your Partner account is not active',
      'Verify your identity before requesting a payout',
      'You can request one payout per month',
    ];
    const match = known.find((k) => error.message?.includes(k));
    return { success: false, error: match ?? (error.message?.includes('Rate limit') ? 'Too many requests. Try again later.' : 'Could not request a payout. Please try again.') };
  }
  return { success: true, net_cents: (data as { net_cents?: number } | null)?.net_cents };
}

// ============================================================
// Static tier details (benefits, CTA labels, learn-more content)
// ============================================================

export const TIER_DETAILS: Record<MembershipTierId, TierDetails> = {
  white: {
    benefits: [
      { text: 'Full general Empire participation' },
      { text: 'Marketplace access' },
      { text: 'Community quests and activities' },
      { text: 'Earn Influence to increase Level and Status' },
    ],
    ctaLabel: 'Join Free',
  },
  black: {
    benefits: [
      { text: 'Everything in Free, plus:' },
      { text: 'Treasury unlocked' },
      { text: 'Metro Initiative voting' },
      { text: '4 Initiative Voting Credits every month' },
    ],
    ctaLabel: 'Become a Black Member',
  },
  black_plus: {
    benefits: [
      { text: 'Everything in Black, plus:' },
      { text: '7 Initiative Voting Credits every month' },
      { text: 'Can qualify for leadership' },
      { text: 'Can qualify for committees' },
    ],
    ctaLabel: 'Become an Active Member',
    learnMoreTitle: 'Black+ Eligibility',
    learnMoreBody: 'The $10 membership does NOT automatically make someone a leader. It only makes the member eligible to qualify. Actual eligibility can still require: Required Empire Level, Verification, Good standing, Participation requirements, Election or appointment where applicable.',
  },
  black_pro: {
    benefits: [
      { text: 'Everything in Black+, plus:' },
      { text: '10 Initiative Voting Credits every month' },
      { text: 'Support all 5 initiatives in both monthly cycles' },
      { text: 'Family & Legacy Fund eligibility' },
      { text: 'Priority leadership consideration' },
    ],
    ctaLabel: 'Become a Pro Member',
    learnMoreTitle: 'Black Pro Benefits',
    learnMoreBody: 'These are NOT insurance policies. Benefits are NOT guaranteed payouts simply because someone pays the monthly membership. Members become eligible for approved benefits, subject to membership duration, good standing, Empire Level where applicable, verification, documentation, program rules, and available fund reserves.',
  },
  arch: {
    benefits: [
      { text: 'All Black Pro benefits included' },
      { text: '10 Initiative Voting Credits (same as Black Pro)' },
      { text: 'Arch Member recognition badge & frame' },
      { text: 'VIP prestige status' },
    ],
    ctaLabel: 'Become an Arch Member',
    learnMoreTitle: 'Arch Member Recognition',
    learnMoreBody: 'Arch Member is a VIP prestige tier. It carries all the functional benefits of Black Pro (including 10 Initiative Voting Credits and Family & Legacy eligibility) plus exclusive recognition. Arch Members do not receive more credits than Black Pro — this tier is about distinguished status, not additional voting power.',
  },
  arch_pro: {
    benefits: [
      { text: 'All Arch Member benefits included' },
      { text: '10 Initiative Voting Credits (same as Black Pro)' },
      { text: 'Arch Pro recognition badge & frame' },
      { text: 'Highest prestige designation' },
    ],
    ctaLabel: 'Become an Arch Pro',
    learnMoreTitle: 'Arch Pro Recognition',
    learnMoreBody: 'Arch Pro is the highest prestige designation in the Empire. It carries all Black Pro functional benefits plus the most exclusive recognition. Arch Pro does not receive more voting credits than Black Pro — this tier represents the pinnacle of distinguished status and commitment.',
  },
};

export const VOTING_CREDIT_AMOUNTS: Record<MembershipTierId, number> = {
  white: 0,
  black: 4,
  black_plus: 7,
  black_pro: 10,
  arch: 10,
  arch_pro: 10,
};
