export type EmailType =
  | 'welcome'
  | 'email_verification'
  | 'password_reset'
  | 'listing_submitted'
  | 'listing_approved'
  | 'listing_needs_changes'
  | 'listing_removed'
  | 'voting_window_opened'
  | 'vote_confirmation'
  | 'metro_capacity_unlocked'
  | 'empire_upgrade'
  | 'quest_notification'
  | 'leadership_nomination'
  | 'leadership_election'
  | 'treasury_funding_vote'
  | 'general_announcement';

export interface EmailParams {
  firstName: string;
  emailTitle: string;
  message: string;
  buttonText?: string;
  buttonUrl?: string;
  secondaryText?: string;
}

export interface EmailDefinition {
  type: EmailType;
  label: string;
  subject: (params: EmailParams) => string;
  previewText: (params: EmailParams) => string;
  build: (params: EmailParams) => EmailParams;
}

export const SENDER_NAME = 'The Underground Black Empire';
export const SENDER_EMAIL = 'noreply@mail.theundergroundblackempire.com';
export const REPLY_TO = 'theundergroundblackempire@gmail.com';
export const WEBSITE_URL = 'https://theundergroundblackempire.com';
