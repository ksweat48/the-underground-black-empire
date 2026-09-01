export type RoleKey =
  | 'visitor'
  | 'founder'
  | 'member'
  | 'verified_member'
  | 'sponsor'
  | 'legacy_member'
  | 'city_leadership'
  | 'metro_leadership'
  | 'empire_admin'
  | 'moderator'
  | 'financial_admin'
  | 'local_correspondent';

export interface RoleDefinition {
  key: RoleKey;
  label: string;
  description: string;
  permissions: Permission[];
  milestone: 'founder_campaign' | 'post_launch';
}

export type Permission =
  | 'view_landing'
  | 'view_cities'
  | 'create_founder_account'
  | 'select_city'
  | 'view_founder_dashboard'
  | 'view_leaderboard'
  | 'view_city_growth'
  | 'view_founder_journey'
  | 'view_missions'
  | 'generate_referral_link'
  | 'view_empire_progress'
  | 'admin_view_reports'
  | 'admin_manage_cities'
  | 'admin_manage_founders'
  | 'admin_assign_xp'
  | 'admin_view_audit_log'
  | 'admin_manage_feature_flags'
  | 'select_archetype'
  | 'access_market'
  | 'cast_vote'
  | 'access_treasury'
  | 'access_legacy'
  | 'run_election'
  | 'access_merchant_guild'
  | 'purchase_voting_credits'
  | 'verify_members'
  | 'national_empire_actions'
  | 'publish_news'
  | 'admin_manage_correspondents';

export const ROLE_PERMISSIONS: Record<RoleKey, RoleDefinition> = {
  visitor: {
    key: 'visitor',
    label: 'Visitor',
    description: 'Unauthenticated user viewing the platform',
    permissions: ['view_landing', 'view_cities', 'create_founder_account'],
    milestone: 'founder_campaign',
  },
  founder: {
    key: 'founder',
    label: 'Founder',
    description: 'A founding member of a city in the Empire',
    permissions: [
      'view_landing',
      'view_cities',
      'view_founder_dashboard',
      'view_leaderboard',
      'view_city_growth',
      'view_founder_journey',
      'view_missions',
      'generate_referral_link',
      'view_empire_progress',
      'select_city',
    ],
    milestone: 'founder_campaign',
  },
  member: {
    key: 'member',
    label: 'Member',
    description: 'A registered member of the Empire (post-launch)',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  verified_member: {
    key: 'verified_member',
    label: 'Verified Member',
    description: 'A verified member with enhanced trust status',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  sponsor: {
    key: 'sponsor',
    label: 'Sponsor',
    description: 'A sponsor-tier member supporting the Empire',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  legacy_member: {
    key: 'legacy_member',
    label: 'Legacy Member',
    description: 'A member enrolled in the Legacy program',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  city_leadership: {
    key: 'city_leadership',
    label: 'City Leadership',
    description: 'An elected leader of a city',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  metro_leadership: {
    key: 'metro_leadership',
    label: 'Metro Leadership',
    description: 'An elected leader of a metro region',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  empire_admin: {
    key: 'empire_admin',
    label: 'Empire Admin',
    description: 'A system administrator with full access',
    permissions: [
      'view_landing',
      'view_cities',
      'view_founder_dashboard',
      'view_leaderboard',
      'view_city_growth',
      'view_founder_journey',
      'view_missions',
      'view_empire_progress',
      'admin_view_reports',
      'admin_manage_cities',
      'admin_manage_founders',
      'admin_assign_xp',
      'admin_view_audit_log',
      'admin_manage_feature_flags',
    ],
    milestone: 'founder_campaign',
  },
  moderator: {
    key: 'moderator',
    label: 'Moderator',
    description: 'A content and community moderator',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  financial_admin: {
    key: 'financial_admin',
    label: 'Financial Admin',
    description: 'An administrator over treasury and financial systems',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress'],
    milestone: 'post_launch',
  },
  local_correspondent: {
    key: 'local_correspondent',
    label: 'Local Correspondent',
    description: 'An approved news correspondent for a specific city',
    permissions: ['view_landing', 'view_cities', 'view_empire_progress', 'publish_news'],
    milestone: 'post_launch',
  },
} as const;

export function hasPermission(role: RoleKey, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].permissions.includes(permission);
}

export function getRolePermissions(role: RoleKey): Permission[] {
  return ROLE_PERMISSIONS[role].permissions;
}
