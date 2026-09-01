export type ListingCategory = 'products' | 'services' | 'events';
export type ListingStatus = 'pending' | 'approved' | 'needs_changes' | 'removed';
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
  comment_count: number;
  check_in_count: number;
  created_at: string;
  updated_at: string;
  rank_score?: number;
  city_name?: string;
  is_saved?: boolean;
  is_liked?: boolean;
}

export interface ListingUpdate {
  id: string;
  listing_id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  status: ContentStatus;
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
  feed_type: 'update' | 'news' | 'event';
  listing_id: string | null;
  listing_name: string | null;
  city_id: string;
  body: string;
  image_url: string | null;
  author_id: string;
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
}

export interface CreateUpdateInput {
  listing_id: string;
  body: string;
  image_url: string | null;
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
