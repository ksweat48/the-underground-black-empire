export type MembershipTierId = 'white' | 'black' | 'black_plus' | 'black_pro' | 'arch' | 'arch_pro';
export type CardColor = 'white' | 'black' | 'emerald' | 'plum';

export interface MembershipTier {
  id: MembershipTierId;
  display_name: string;
  public_label: string;
  price_monthly: number;
  voting_credits: number;
  card_color: CardColor;
  purpose: string;
  sort_order: number;
  commission_amount_cents: number;
}

export interface VotingCredits {
  member_id: string;
  balance: number;
  last_reset_date: string | null;
  updated_at?: string;
}

export interface CreditLedgerEntry {
  id: string;
  amount: number;
  source: 'monthly_grant' | 'initial_grant' | 'vote_spend';
  reference_id: string | null;
  created_at: string;
}

export interface LegacyFund {
  total_reserve: number;
}

export interface MemberMembership {
  membership_tier: MembershipTierId;
  membership_started_at: string | null;
  display_name: string | null;
  created_at: string;
}

export interface BenefitItem {
  text: string;
  locked?: boolean;
}

export interface TierDetails {
  benefits: BenefitItem[];
  ctaLabel: string;
  learnMoreTitle?: string;
  learnMoreBody?: string;
}

export interface PartnerDashboard {
  is_partner: boolean;
  active_referrals?: number;
  pending_cents?: number;
  available_cents?: number;
  paid_cents?: number;
  lifetime_cents?: number;
}

export interface PartnerInfo {
  member_id: string;
  stripe_connect_account_id: string | null;
  stripe_connect_status: string;
  is_active: boolean;
  joined_at: string;
}
