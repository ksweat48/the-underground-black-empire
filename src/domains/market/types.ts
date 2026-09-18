export type ListingCategory = 'products' | 'services' | 'events';
export type ListingStatus = 'in_review' | 'approved' | 'needs_changes' | 'removed';
export type ContentStatus = 'pending' | 'approved' | 'needs_changes' | 'removed';
export type VoteStatus = 'draft' | 'active' | 'closed' | 'tallied';

export interface MarketListing {
  id: string;
  owner_id: string;
  city_id: string;
  name: string;
  category: ListingCategory;
  description: string;
  products_services: string;
  price_display: string;
  external_url: string;
  contact_info: string;
  image_url: string | null;
  status: ListingStatus;
  is_verified: boolean;
  like_count: number;
  save_count: number;
  comment_count: number;
  check_in_count: number;
  created_at: string;
  updated_at: string;
  rank_score?: number;
  city_name?: string;
  city_state?: string;
  is_saved?: boolean;
  is_liked?: boolean;
  review_reason?: string;
}

export interface ListingUpdate {
  id: string;
  listing_id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  status: ContentStatus;
  update_type: string;
  created_at: string;
  updated_at: string;
  listing_name?: string;
}

export interface LocalNewsItem {
  id: string;
  author_id: string;
  city_id: string;
  title: string;
  body: string;
  location_text: string;
  news_date: string | null;
  image_url: string | null;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

export interface MarketEvent {
  id: string;
  author_id: string;
  city_id: string;
  listing_id: string | null;
  name: string;
  description: string;
  event_date: string;
  event_time: string;
  location_text: string;
  external_url: string;
  image_url: string | null;
  status: ContentStatus;
  check_in_count: number;
  created_at: string;
  updated_at: string;
  listing_name?: string;
  has_checked_in?: boolean;
}

export interface ListingComment {
  id: string;
  member_id: string;
  listing_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export interface CommunityFeedItem {
  id: string;
  feed_type: 'update' | 'event';
  listing_id: string | null;
  listing_name: string | null;
  city_id: string;
  body: string;
  image_url: string | null;
  author_id: string;
  update_type: string | null;
  created_at: string;
  rank_score: number;
}

export interface VoteChoice {
  key: string;
  label: string;
  description?: string;
}

export interface Vote {
  id: string;
  question: string;
  description: string;
  choices: VoteChoice[];
  eligibility: string;
  opens_at: string;
  closes_at: string;
  status: VoteStatus;
  created_at: string;
  user_choice?: string | null;
  user_credits_used?: number;
  user_voting_power?: number;
  user_effective_weight?: number;
  total_votes?: number;
  total_weight?: number;
}

export interface ContentReportInput {
  content_type: 'listing' | 'update' | 'news' | 'event' | 'comment';
  content_id: string;
  reason: string;
  details: string;
}

export interface ListingForReview {
  id: string;
  name: string;
  category: string;
  description: string;
  products_services: string;
  price_display: string;
  external_url: string;
  image_url: string | null;
  status: string;
  is_verified: boolean;
  like_count: number;
  save_count: number;
  comment_count: number;
  created_at: string;
  owner_email: string;
  city_name: string;
  review_reason: string;
}

export type ReviewAction = 'approve' | 'needs_changes' | 'remove';

export interface CreateListingInput {
  city_id: string;
  name: string;
  category: ListingCategory;
  description: string;
  products_services: string;
  price_display: string;
  external_url: string;
  contact_info: string;
  image_url: string | null;
  status?: ListingStatus;
}

export type UpdateType = 'offer' | 'update' | 'progress';

export interface CreateUpdateInput {
  listing_id: string;
  body: string;
  image_url: string | null;
  update_type?: UpdateType;
}

export interface CreateNewsInput {
  city_id: string;
  title: string;
  body: string;
  location_text: string;
  news_date: string | null;
  image_url: string | null;
}

export interface CreateEventInput {
  city_id: string;
  listing_id: string | null;
  name: string;
  description: string;
  event_date: string;
  event_time: string;
  location_text: string;
  external_url: string;
  image_url: string | null;
}

// ============================================================
// ORGANIZATIONS
// ============================================================

export type OrgType =
  | 'nonprofit'
  | 'community_organization'
  | 'mission_based'
  | 'initiative'
  | 'foundation'
  | 'other';

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  nonprofit: 'Nonprofit',
  community_organization: 'Community Organization',
  mission_based: 'Mission-Based Organization',
  initiative: 'Initiative',
  foundation: 'Foundation',
  other: 'Other',
};

export interface Organization {
  id: string;
  owner_id: string;
  city_id: string;
  name: string;
  org_type: OrgType;
  description: string;
  funding_goal: number;
  total_raised: number;
  external_url: string;
  contact_info: string;
  image_url: string | null;
  status: ListingStatus;
  is_verified: boolean;
  like_count: number;
  save_count: number;
  comment_count: number;
  vote_support_total: number;
  created_at: string;
  updated_at: string;
  city_name?: string;
  city_state?: string;
  is_saved?: boolean;
  is_liked?: boolean;
  engagement_score?: number;
}

export interface OrganizationComment {
  id: string;
  member_id: string;
  organization_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export interface CreateOrganizationInput {
  city_id: string;
  name: string;
  org_type: OrgType;
  description: string;
  funding_goal: number;
  external_url: string;
  contact_info: string;
  image_url: string | null;
}

export interface OrganizationVoteCandidate {
  id: string;
  name: string;
  org_type: OrgType;
  funding_goal: number;
  total_raised: number;
  city_name?: string;
  city_state?: string;
  engagement_score: number;
  image_url: string | null;
}