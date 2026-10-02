/**
 * Single Source of Truth — Empire Progression Configuration
 *
 * Influence = the single progression currency. Earned through participation.
 * Your Level = determined only by total Influence.
 * Voting Power = determined only by Your Level.
 * Voting Credits = spendable resource (purchased/membership).
 * Marketplace engagement = ranking signal. These systems are separate.
 */

// ============================================================
// INFLUENCE REWARDS
// ============================================================

export const INFLUENCE_REWARDS = {
  signup_completed: 10,
  city_selected: 10,
  news_like: 1,
  marketplace_like: 1,
  ballot_participation: 10,
  empire_level_upgrade: 100,
  event_checkin_verified: 25,
  city_quest_completed: 50,
  secret_quest_completed: 100,
  official_news_contribution: 25,
  builder_listing_approved: 25,
  verified_event_hosted: 75,
  verified_referral: 25,
} as const;

export type InfluenceEventType = keyof typeof INFLUENCE_REWARDS;

// ============================================================
// LIKE DAILY INFLUENCE CAP
// ============================================================

export const LIKE_DAILY_INFLUENCE_CAP = 20;

// ============================================================
// MARKETPLACE ENGAGEMENT WEIGHTS
// ============================================================

export const MARKETPLACE_ENGAGEMENT_WEIGHTS = {
  like: 1,
  comment: 3,
  verified_checkin: 5,
} as const;

// ============================================================
// VP FORMULA CONSTANTS
// ============================================================

export const VP_RULES = {
  base: 1.00,
  level_rate: 0.05,
  total_cap: 5.00,
} as const;

// ============================================================
// BALLOT CREDIT CAP
// ============================================================

export const BALLOT_CREDIT_CAP = 100;

// ============================================================
// MEMBERSHIP MONTHLY VOTING CREDITS
// ============================================================

export const MEMBERSHIP_MONTHLY_CREDITS = {
  white: 0,
  black: 10,
  black_plus: 25,
  black_pro: 25,
  arch: 0,
  arch_pro: 0,
} as const;

export type MembershipTierId = 'white' | 'black' | 'black_plus' | 'black_pro' | 'arch' | 'arch_pro';

// ============================================================
// YOUR LEVEL THRESHOLDS (Influence required to reach each Your Level)
// ============================================================

export const LEVEL_THRESHOLDS: readonly number[] = [
  0,       // Your Level 1
  250,     // Your Level 2
  750,     // Your Level 3
  1500,    // Your Level 4
  2500,    // Your Level 5
  4000,    // Your Level 6
  6000,    // Your Level 7
  8500,    // Your Level 8
  11500,   // Your Level 9
  15000,   // Your Level 10
  19000,   // Your Level 11
  23500,   // Your Level 12
  28500,   // Your Level 13
  34000,   // Your Level 14
  40000,   // Your Level 15
  46500,   // Your Level 16
  53500,   // Your Level 17
  61000,   // Your Level 18
  69000,   // Your Level 19
  77500,   // Your Level 20
  86500,   // Your Level 21
  96000,   // Your Level 22
  106000,  // Your Level 23
  116500,  // Your Level 24
  127500,  // Your Level 25
  139000,  // Your Level 26
  151000,  // Your Level 27
  163500,  // Your Level 28
  176500,  // Your Level 29
  190000,  // Your Level 30
] as const;

/**
 * For Your Level 31+: increment = 15,000 + (L - 31) * 1,000, added to previous level threshold.
 * Your Level 31 = 205,000, Your Level 32 = 221,000, Your Level 33 = 238,000, etc.
 * There is NO maximum Your Level.
 */
export function getLevelThreshold(level: number): number {
  if (level <= 1) return 0;
  if (level <= LEVEL_THRESHOLDS.length) {
    return LEVEL_THRESHOLDS[level - 1];
  }
  // Level 31+ open-ended formula
  const level30Influence = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]; // 190,000
  let threshold = level30Influence;
  for (let l = 31; l <= level; l++) {
    const increment = 15000 + (l - 31) * 1000;
    threshold += increment;
  }
  return threshold;
}

/**
 * Returns Your Level for a given Influence total.
 * Your Levels are open-ended (no cap).
 */
export function getLevelFromInfluence(influence: number): { level: number; nextThreshold: number | null } {
  if (influence < LEVEL_THRESHOLDS[1]) {
    return { level: 1, nextThreshold: LEVEL_THRESHOLDS[1] };
  }

  // Check against fixed thresholds first
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (influence >= LEVEL_THRESHOLDS[i]) {
      const level = i + 1;
      // If within the fixed table, nextThreshold is the next entry or computed
      if (level < LEVEL_THRESHOLDS.length) {
        return { level, nextThreshold: LEVEL_THRESHOLDS[level] };
      }
      // Level 30+ — compute next using open-ended formula
      const nextThreshold = getLevelThreshold(level + 1);
      return { level, nextThreshold };
    }
  }

  // Should never reach here, but fallback
  return { level: 1, nextThreshold: LEVEL_THRESHOLDS[1] };
}

// ============================================================
// VOTING POWER CALCULATIONS
// ============================================================

export function getVotingPower(level: number): number {
  return Math.min(VP_RULES.total_cap, VP_RULES.base + (level - 1) * VP_RULES.level_rate);
}

export function getVotingPowerBreakdown(level: number): {
  base: number;
  levelBonus: number;
  total: number;
  maxVp: number;
} {
  const levelBonus = Math.min(
    VP_RULES.total_cap - VP_RULES.base,
    (level - 1) * VP_RULES.level_rate,
  );
  return {
    base: VP_RULES.base,
    levelBonus,
    total: Math.min(VP_RULES.total_cap, VP_RULES.base + levelBonus),
    maxVp: VP_RULES.total_cap,
  };
}

// ============================================================
// EMPIRE GROWTH — Qualified Metros drive the Empire Stage.
// Cities have no levels; their members and contributions pool into their Metro.
// Qualification, Empire Stage and Treasury capacity are permanent once reached.
// ============================================================

export const QUALIFIED_METRO_MIN_MEMBERS = 100;

export const EMPIRE_STAGES = {
  outpost: {
    label: 'Outpost',
    description: 'The prelaunch phase — founders are claiming their cities.',
    requiredQualifiedMetros: 0,
  },
  settlement: {
    label: 'Settlement',
    description: 'The first Metro has qualified. The Empire has taken root.',
    requiredQualifiedMetros: 1,
  },
  village: {
    label: 'Village',
    description: 'Three Metros stand together.',
    requiredQualifiedMetros: 3,
  },
  province: {
    label: 'Province',
    description: 'A regional power with organized governance.',
    requiredQualifiedMetros: 5,
  },
  kingdom: {
    label: 'Kingdom',
    description: 'A dominant force spanning many regions.',
    requiredQualifiedMetros: 10,
  },
  dominion: {
    label: 'Dominion',
    description: 'A vast territory under unified leadership.',
    requiredQualifiedMetros: 25,
  },
  empire: {
    label: 'Empire',
    description: 'The full civilization — fifty Metros strong.',
    requiredQualifiedMetros: 50,
  },
} as const;

export type EmpireStageName = keyof typeof EMPIRE_STAGES;

export const EMPIRE_STAGE_ORDER: EmpireStageName[] = [
  'outpost',
  'settlement',
  'village',
  'province',
  'kingdom',
  'dominion',
  'empire',
];

export function isEmpireStageName(value: unknown): value is EmpireStageName {
  return typeof value === 'string' && value in EMPIRE_STAGES;
}

export function getEmpireStageIndex(stage: EmpireStageName): number {
  return EMPIRE_STAGE_ORDER.indexOf(stage);
}

export function getNextEmpireStage(
  stage: EmpireStageName,
): { name: EmpireStageName; requiredQualifiedMetros: number } | null {
  const idx = getEmpireStageIndex(stage);
  if (idx < 0 || idx >= EMPIRE_STAGE_ORDER.length - 1) return null;
  const name = EMPIRE_STAGE_ORDER[idx + 1];
  return { name, requiredQualifiedMetros: EMPIRE_STAGES[name].requiredQualifiedMetros };
}

export function getEmpireStageRequirement(stage: EmpireStageName): string {
  const n = EMPIRE_STAGES[stage].requiredQualifiedMetros;
  if (n === 0) return 'Prelaunch — no Qualified Metros yet';
  return `${n} Qualified Metro${n === 1 ? '' : 's'}`;
}

// ============================================================
// METRO TREASURY CAPACITY — set by the Metro's own population, upward only.
// capacityCents null = no artificial cap.
// ============================================================

export const TREASURY_CAPACITY_BANDS: readonly { band: number; minPopulation: number; capacityCents: number | null }[] = [
  { band: 0, minPopulation: 0, capacityCents: 0 },
  { band: 1, minPopulation: 100, capacityCents: 500_000 },
  { band: 2, minPopulation: 250, capacityCents: 1_000_000 },
  { band: 3, minPopulation: 500, capacityCents: 2_500_000 },
  { band: 4, minPopulation: 1000, capacityCents: 5_000_000 },
  { band: 5, minPopulation: 2500, capacityCents: 10_000_000 },
  { band: 6, minPopulation: 5000, capacityCents: null },
];
