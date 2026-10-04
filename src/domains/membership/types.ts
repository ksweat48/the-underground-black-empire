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
  source: 'monthly_grant' | 'initial_grant' | 'upgrade_grant' | 'initiative_vote_spend' | 'initiative_vote_refund';
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
  stripe_subscription_status: string | null;
  past_due_since: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  scheduled_tier: MembershipTierId | null;
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
  adjustments_cents?: number;
  in_payout_cents?: number;
  paid_cents?: number;
  reversed_cents?: number;
  lifetime_cents?: number;
  next_available_at?: string | null;
  open_payout?: {
    id: string;
    status: 'requested' | 'processing';
    gross_cents: number;
    net_cents: number;
    requested_at: string;
  } | null;
  recent_payouts?: Array<{
    id: string;
    status: 'requested' | 'processing' | 'completed' | 'failed';
    net_cents: number;
    requested_at: string;
    completed_at: string | null;
  }>;
}

export interface PartnerInfo {
  member_id: string;
  stripe_connect_account_id: string | null;
  stripe_connect_status: string;
  is_active: boolean;
  joined_at: string;
}
