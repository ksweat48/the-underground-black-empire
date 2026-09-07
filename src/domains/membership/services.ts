import { supabase } from '@/shared/supabase-client';
import type {
  MembershipTier,
  MembershipTierId,
  VotingCredits,
  LegacyFund,
  MemberMembership,
  BenefitItem,
  TierDetails,
} from './types';

export type {
  MembershipTier,
  MembershipTierId,
  VotingCredits,
  LegacyFund,
  MemberMembership,
  BenefitItem,
  TierDetails,
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
    .select('membership_tier, membership_started_at, display_name, email, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as MemberMembership | null;
}

export async function updateMembershipTier(userId: string, tier: MembershipTierId): Promise<void> {
  const updates: Record<string, unknown> = { membership_tier: tier };
  if (tier === 'white') {
    updates.membership_started_at = null;
  } else {
    const { data: existing } = await supabase
      .from('members')
      .select('membership_started_at')
      .eq('id', userId)
      .maybeSingle();
    if (!existing?.membership_started_at) {
      updates.membership_started_at = new Date().toISOString();
    }
  }
  const { error } = await supabase
    .from('members')
    .update(updates)
    .eq('id', userId);
  if (error) throw error;
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

export async function ensureVotingCreditsRow(userId: string): Promise<void> {
  const { error } = await supabase
    .from('voting_credits')
    .insert({ member_id: userId, balance: 0 })
    .eq('member_id', userId);
  // Ignore duplicate key errors — row already exists
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
// Static tier details (benefits, CTA labels, learn-more content)
// ============================================================

export const TIER_DETAILS: Record<MembershipTierId, TierDetails> = {
  white: {
    benefits: [
      { text: 'Full general Empire participation' },
      { text: 'Marketplace access' },
      { text: 'News and community activity' },
      { text: 'Events' },
      { text: 'Quests' },
      { text: 'Earn Influence through participation' },
      { text: 'Build Empire Level normally' },
      { text: 'Treasury participation', locked: true },
      { text: 'Monthly Voting Credits', locked: true },
      { text: 'Committee/Council leadership eligibility', locked: true },
      { text: 'Family benefits', locked: true },
      { text: 'Legacy benefits', locked: true },
    ],
    ctaLabel: 'Join Free',
  },
  black: {
    benefits: [
      { text: 'Everything in Free, plus:' },
      { text: 'Treasury unlocked' },
      { text: 'Treasury voting participation' },
      { text: '10 Voting Credits every month' },
      { text: 'Digital Black Member Card' },
    ],
    ctaLabel: 'Become a Black Member',
  },
  black_plus: {
    benefits: [
      { text: 'Everything in Black, plus:' },
      { text: '25 Voting Credits every month' },
      { text: 'Can qualify for committees' },
      { text: 'Can qualify for councils' },
      { text: 'Can qualify for community leadership opportunities' },
    ],
    ctaLabel: 'Become an Active Member',
    learnMoreTitle: 'Black+ Eligibility',
    learnMoreBody: 'The $5 membership does NOT automatically make someone a leader. It only makes the member eligible to qualify. Actual eligibility can still require: Required Empire Level, Verification, Good standing, Participation requirements, Election or appointment where applicable.',
  },
  emerald: {
    benefits: [
      { text: 'Everything in Black+, plus:' },
      { text: '50 Voting Credits every month' },
      { text: 'Family / Legacy Fund eligibility' },
      { text: 'Marriage support eligibility' },
      { text: 'Child Welcome / birth support eligibility' },
      { text: 'Education recognition eligibility' },
      { text: 'Approved family support programs' },
      { text: 'Memorial recognition where applicable' },
    ],
    ctaLabel: 'Become a Family Member',
    learnMoreTitle: 'Family Benefits',
    learnMoreBody: 'These are NOT insurance policies. Benefits are NOT guaranteed payouts simply because someone pays the monthly membership. Members become eligible for approved benefits, subject to: Membership duration, Good standing, Empire Level where applicable, Verification/documentation, Program rules, Available Legacy Fund reserves. Eligible for benefits up to the available program maximum.\n\nInitial program benefit targets:\n• Marriage Support — up to $500\n• Child Welcome — up to $500\n• Education Recognition — up to $250',
  },
  plum: {
    benefits: [
      { text: 'Everything in Emerald, plus:' },
      { text: '100 Voting Credits every month' },
      { text: 'Highest Family / Legacy membership' },
      { text: 'Death-support eligibility' },
      { text: 'Full approved Legacy Fund benefit eligibility' },
      { text: 'Permanent Empire memorial/archive recognition for qualifying deceased members' },
    ],
    ctaLabel: 'Become a Legacy Member',
    learnMoreTitle: 'Legacy Benefits',
    learnMoreBody: 'These are NOT insurance policies. Benefits are NOT guaranteed payouts simply because someone pays the monthly membership. Members become eligible for approved benefits, subject to: Membership duration, Good standing, Empire Level where applicable, Verification/documentation, Program rules, Available Legacy Fund reserves. Eligible for benefits up to the available program maximum.\n\nInitial program benefit targets:\n• Death Support — up to $1,000\n• Marriage Support — up to $500\n• Child Welcome — up to $500\n• Education Recognition — up to $250\n\nBenefits are subject to qualification, program rules, and available Legacy Fund reserves. They are not guaranteed insurance benefits.',
  },
};

export const VOTING_CREDIT_AMOUNTS: Record<MembershipTierId, number> = {
  white: 0,
  black: 10,
  black_plus: 25,
  emerald: 50,
  plum: 100,
};
