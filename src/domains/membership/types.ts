export type MembershipTierId = 'white' | 'black' | 'black_plus' | 'emerald' | 'plum';
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
}

export interface VotingCredits {
  member_id: string;
  balance: number;
  last_reset_date: string | null;
}

export interface LegacyFund {
  total_reserve: number;
}

export interface MemberMembership {
  membership_tier: MembershipTierId;
  membership_started_at: string | null;
  display_name: string | null;
  email: string;
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
