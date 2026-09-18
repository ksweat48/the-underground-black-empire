import type { EmailDefinition, EmailParams, EmailType } from './types';

export const EMAIL_DEFINITIONS: Record<EmailType, EmailDefinition> = {
  welcome: {
    type: 'welcome',
    label: 'Welcome / Account Created',
    subject: () => 'Welcome to The Underground Black Empire',
    previewText: () => 'Your journey with the Empire begins now. Here is what to do next.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Welcome to the Empire',
      message:
        `Your account has been created and you are now part of the movement.\n\n` +
        `As a member, you will build your city, grow your empire, and leave a legacy for generations to come.\n\n` +
        `Your next step is to select your city and claim your member number.`,
      buttonText: 'Choose Your City',
      buttonUrl: 'https://theundergroundblackempire.com/onboarding/city',
      secondaryText:
        'If you were referred by another member, keep your referral code handy -- you will enter it during onboarding.',
    }),
  },

  email_verification: {
    type: 'email_verification',
    label: 'Email Verification',
    subject: () => 'Verify your email address',
    previewText: () => 'Confirm your email to activate your Empire account.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Verify Your Email',
      message:
        `Please confirm your email address to complete your account setup.\n\n` +
        `Click the button below to verify. This link will expire in 24 hours.`,
      buttonText: 'Verify Email',
      buttonUrl: p.buttonUrl ?? 'https://theundergroundblackempire.com/auth/verify',
      secondaryText: 'If you did not create an account, you can safely ignore this email.',
    }),
  },

  password_reset: {
    type: 'password_reset',
    label: 'Password Reset',
    subject: () => 'Reset your password',
    previewText: () => 'Click the link below to set a new password for your account.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Reset Your Password',
      message:
        `We received a request to reset your password.\n\n` +
        `Click the button below to choose a new password. This link will expire in 1 hour.`,
      buttonText: 'Reset Password',
      buttonUrl: p.buttonUrl ?? 'https://theundergroundblackempire.com/auth/reset-password',
      secondaryText: 'If you did not request a password reset, ignore this email and your password will not change.',
    }),
  },

  listing_submitted: {
    type: 'listing_submitted',
    label: 'Marketplace Listing Submitted',
    subject: () => 'Your listing has been submitted for review',
    previewText: () => 'Your marketplace listing is now in the review queue.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Listing Submitted',
      message:
        `Your marketplace listing has been submitted and is now in the review queue.\n\n` +
        `Our team will review it shortly. You will receive another email once it is approved or if any changes are needed.`,
      buttonText: 'View Your Listing',
      buttonUrl: p.buttonUrl ?? 'https://theundergroundblackempire.com/market',
      secondaryText: 'Listings are typically reviewed within 24 hours.',
    }),
  },

  listing_approved: {
    type: 'listing_approved',
    label: 'Marketplace Listing Approved',
    subject: () => 'Your listing has been approved',
    previewText: () => 'Great news! Your marketplace listing is now live.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Listing Approved',
      message:
        `Your marketplace listing has been approved and is now live for all members to see.\n\n` +
        `You can view it on the marketplace at any time.`,
      buttonText: 'View on Marketplace',
      buttonUrl: p.buttonUrl ?? 'https://theundergroundblackempire.com/market',
      secondaryText: 'Thank you for contributing to the Empire.',
    }),
  },

  listing_needs_changes: {
    type: 'listing_needs_changes',
    label: 'Marketplace Listing Needs Changes',
    subject: () => 'Your listing needs a few changes',
    previewText: () => 'Please update your listing and resubmit for review.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Listing Needs Changes',
      message:
        `Your marketplace listing needs a few changes before it can be approved.\n\n` +
        `Please review the feedback below, update your listing, and resubmit it for review.`,
      buttonText: 'Edit Your Listing',
      buttonUrl: p.buttonUrl ?? 'https://theundergroundblackempire.com/market',
      secondaryText: p.secondaryText ?? 'See the review notes for specific changes needed.',
    }),
  },

  listing_removed: {
    type: 'listing_removed',
    label: 'Marketplace Listing Removed',
    subject: () => 'Your listing has been removed',
    previewText: () => 'Your marketplace listing did not meet our community guidelines.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Listing Removed',
      message:
        `Your marketplace listing has been removed because it did not meet our community guidelines.\n\n` +
        `If you believe this was an error, or if you would like to submit a new listing, please contact support.`,
      buttonText: 'Contact Support',
      buttonUrl: 'mailto:support@mail.theundergroundblackempire.com',
      secondaryText: p.secondaryText ?? 'Please review our listing guidelines before submitting again.',
    }),
  },

  voting_window_opened: {
    type: 'voting_window_opened',
    label: 'Voting Window Opened',
    subject: () => 'Voting is now open',
    previewText: () => 'Cast your vote on the latest Empire proposals.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Voting Window Is Open',
      message:
        `A new voting window has opened. Your voice matters -- every vote shapes the future of the Empire.\n\n` +
        `Review the proposals and cast your vote before the window closes.`,
      buttonText: 'Cast Your Vote',
      buttonUrl: 'https://theundergroundblackempire.com/vote',
      secondaryText: 'Your voting power is determined by your membership tier and contributions.',
    }),
  },

  vote_confirmation: {
    type: 'vote_confirmation',
    label: 'Vote Confirmation',
    subject: () => 'Your vote has been recorded',
    previewText: () => 'Thank you for participating in the Empire.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Vote Confirmed',
      message:
        `Your vote has been recorded. Thank you for participating in the Empire.\n\n` +
        `Results will be announced once the voting window closes. Stay tuned for the outcome.`,
      buttonText: 'View Voting Page',
      buttonUrl: 'https://theundergroundblackempire.com/vote',
      secondaryText: 'You can change your vote at any time before the window closes.',
    }),
  },

  city_upgrade: {
    type: 'city_upgrade',
    label: 'City Upgrade',
    subject: () => 'Your city has leveled up',
    previewText: () => 'Congratulations! Your city reached a new tier.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'City Upgrade',
      message:
        `Congratulations! Your city has reached a new tier.\n\n` +
        `This means more influence, more capabilities, and a stronger position in the Empire.\n\n` +
        `Keep growing your population and contributing to unlock even higher tiers.`,
      buttonText: 'View Your City',
      buttonUrl: 'https://theundergroundblackempire.com/empire',
      secondaryText: 'The next tier brings new opportunities for your community.',
    }),
  },

  empire_upgrade: {
    type: 'empire_upgrade',
    label: 'Empire Upgrade',
    subject: () => 'The Empire has reached a new civilization level',
    previewText: () => 'A new era for the Empire has begun.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Empire Civilization Upgrade',
      message:
        `The Underground Black Empire has reached a new civilization level!\n\n` +
        `This is a collective achievement made possible by every member who has built, contributed, and voted.\n\n` +
        `New features and capabilities are now unlocked for all members.`,
      buttonText: 'View Empire Dashboard',
      buttonUrl: 'https://theundergroundblackempire.com/empire',
      secondaryText: 'Thank you for being part of this milestone.',
    }),
  },

  quest_notification: {
    type: 'quest_notification',
    label: 'Quest Notification',
    subject: () => 'New quest available',
    previewText: () => 'A new quest is waiting for you.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'New Quest Available',
      message:
        `A new quest is available for you to complete.\n\n` +
        `Quests are time-limited missions that reward you with influence and recognition.\n\n` +
        `Complete it before the deadline to earn your reward.`,
      buttonText: 'View Quest',
      buttonUrl: 'https://theundergroundblackempire.com/empire',
      secondaryText: p.secondaryText ?? 'Check the Empire dashboard for full quest details.',
    }),
  },

  leadership_nomination: {
    type: 'leadership_nomination',
    label: 'Leadership Nomination',
    subject: () => 'You have been nominated for a leadership role',
    previewText: () => 'A member has nominated you for leadership.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Leadership Nomination',
      message:
        `You have been nominated for a leadership role within the Empire.\n\n` +
        `If you accept, your name will appear on the ballot for the upcoming election.\n\n` +
        `You can accept or decline the nomination before the election begins.`,
      buttonText: 'View Nomination',
      buttonUrl: 'https://theundergroundblackempire.com/empire',
      secondaryText: 'Leadership is a responsibility -- please consider carefully before accepting.',
    }),
  },

  leadership_election: {
    type: 'leadership_election',
    label: 'Leadership Election Notification',
    subject: () => 'Leadership election is now open',
    previewText: () => 'Cast your vote for the next Empire leaders.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Leadership Election',
      message:
        `The leadership election is now open.\n\n` +
        `Review the candidates and cast your vote. Your participation determines who will guide the Empire forward.\n\n` +
        `Voting closes soon -- make your voice heard.`,
      buttonText: 'Vote Now',
      buttonUrl: 'https://theundergroundblackempire.com/vote',
      secondaryText: 'Each member gets one vote. Choose wisely.',
    }),
  },

  treasury_funding_vote: {
    type: 'treasury_funding_vote',
    label: 'Treasury / Funding Vote',
    subject: () => 'Treasury funding vote is open',
    previewText: () => 'Decide how Empire resources should be allocated.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: 'Treasury Funding Vote',
      message:
        `A treasury funding vote is now open.\n\n` +
        `Review the proposed funding allocations and cast your vote on how Empire resources should be distributed.\n\n` +
        `Your vote directly impacts which initiatives receive funding this cycle.`,
      buttonText: 'Review & Vote',
      buttonUrl: 'https://theundergroundblackempire.com/vote',
      secondaryText: 'Funding decisions are final once the voting window closes.',
    }),
  },

  general_announcement: {
    type: 'general_announcement',
    label: 'General Empire Announcement',
    subject: () => 'Important announcement from The Empire',
    previewText: () => 'A new message from The Underground Black Empire.',
    build: (p) => ({
      firstName: p.firstName,
      emailTitle: p.emailTitle || 'Empire Announcement',
      message: p.message || 'An important update has been posted to the Empire dashboard.',
      buttonText: p.buttonText ?? 'View Empire Dashboard',
      buttonUrl: p.buttonUrl ?? 'https://theundergroundblackempire.com/empire',
      secondaryText: p.secondaryText,
    }),
  },
};

export function getEmailDefinition(type: EmailType): EmailDefinition {
  return EMAIL_DEFINITIONS[type];
}

export function buildEmail(type: EmailType, params: Partial<EmailParams>): {
  subject: string;
  previewText: string;
  params: EmailParams;
} {
  const def = EMAIL_DEFINITIONS[type];
  const baseParams: EmailParams = {
    firstName: params.firstName ?? 'Member',
    emailTitle: params.emailTitle ?? '',
    message: params.message ?? '',
    buttonText: params.buttonText,
    buttonUrl: params.buttonUrl,
    secondaryText: params.secondaryText,
  };
  const builtParams = def.build(baseParams);
  return {
    subject: def.subject(builtParams),
    previewText: def.previewText(builtParams),
    params: builtParams,
  };
}

export const SAMPLE_PARAMS: Record<EmailType, Partial<EmailParams>> = {
  welcome: { firstName: 'Marcus' },
  email_verification: { firstName: 'Marcus', buttonUrl: 'https://theundergroundblackempire.com/auth/verify?token=abc123' },
  password_reset: { firstName: 'Marcus', buttonUrl: 'https://theundergroundblackempire.com/auth/reset-password?token=xyz789' },
  listing_submitted: { firstName: 'Marcus', buttonUrl: 'https://theundergroundblackempire.com/market/listing/123' },
  listing_approved: { firstName: 'Marcus', buttonUrl: 'https://theundergroundblackempire.com/market/listing/123' },
  listing_needs_changes: { firstName: 'Marcus', secondaryText: 'Please add a clearer description and at least one photo to your listing.', buttonUrl: 'https://theundergroundblackempire.com/market/edit-listing/123' },
  listing_removed: { firstName: 'Marcus', secondaryText: 'Reason: Listing did not meet community safety guidelines.' },
  voting_window_opened: { firstName: 'Marcus' },
  vote_confirmation: { firstName: 'Marcus' },
  city_upgrade: { firstName: 'Marcus' },
  empire_upgrade: { firstName: 'Marcus' },
  quest_notification: { firstName: 'Marcus', secondaryText: 'Quest: Recruit 3 new members. Reward: 50 Influence. Deadline: 7 days.' },
  leadership_nomination: { firstName: 'Marcus' },
  leadership_election: { firstName: 'Marcus' },
  treasury_funding_vote: { firstName: 'Marcus' },
  general_announcement: { firstName: 'Marcus', emailTitle: 'Empire Town Hall Scheduled', message: 'A town hall meeting has been scheduled for all members.\n\nJoin us to discuss the future direction of the Empire and share your ideas.\n\nThe meeting will be held virtually and recorded for those who cannot attend live.', buttonText: 'View Details', buttonUrl: 'https://theundergroundblackempire.com/empire' },
};
