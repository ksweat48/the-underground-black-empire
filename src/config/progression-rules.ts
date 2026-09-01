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
  city_level_upgrade: 50,
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
  emerald: 50,
  plum: 100,
} as const;

export type MembershipTierId = 'white' | 'black' | 'black_plus' | 'emerald' | 'plum';

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
// CITY TIER SYSTEM (city progression — determines City Level, not Your Level)
// ============================================================

export const PROGRESSION_RULES = {
  city: {
    group: {
      label: 'Group',
      minPopulation: 1,
      description: 'A new city has been claimed by its first member.',
    },
    tribe: {
      label: 'Tribe',
      minPopulation: 100,
      description: 'Your city has 100 members and is now recognized as a Tribe.',
    },
    organization: {
      label: 'Organization',
      minPopulation: 250,
      description: 'Your city has grown to 250 members.',
    },
    congregation: {
      label: 'Congregation',
      minPopulation: 1000,
      description: 'Your city has reached 1,000 members.',
    },
    coalition: {
      label: 'Coalition',
      minPopulation: 2500,
      description: 'Your city has reached 2,500 members.',
    },
    powerhouse: {
      label: 'Powerhouse',
      minPopulation: 5000,
      description: 'Your city has reached 5,000 members.',
    },
    legacy_city: {
      label: 'Legacy City',
      minPopulation: 10000,
      description: 'Your city has reached 10,000 members — the highest honor.',
    },
  },
  empire: {
    unlock: {
      requiredTribeCities: 10,
      requiredPopulation: 1000,
      label: 'Empire Formation',
      description:
        'The Empire advances when the population and the number of Tribe Cities both reach the next threshold.',
    },
    civilization: {
      outpost: {
        label: 'Outpost',
        description: 'The earliest stage of the Empire — a foothold in the wilderness.',
        requirement: 'Reach 1,000 members and form 10 Tribe Cities. A city becomes a Tribe when it reaches 100 people.',
        requirementShort: '1K members + 10 Tribe Cities',
        requiredPopulation: 1000,
        requiredTribeCities: 10,
      },
      settlement: {
        label: 'Settlement',
        description: 'A permanent community has taken root.',
        requirement: 'Reach 5,000 members and form 20 Tribe Cities.',
        requirementShort: '5K members + 20 Tribe Cities',
        requiredPopulation: 5000,
        requiredTribeCities: 20,
      },
      village: {
        label: 'Village',
        description: 'Multiple settlements have banded together.',
        requirement: 'Reach 25,000 members and form 30 Tribe Cities.',
        requirementShort: '25K members + 30 Tribe Cities',
        requiredPopulation: 25000,
        requiredTribeCities: 30,
      },
      province: {
        label: 'Province',
        description: 'A regional power with organized governance.',
        requirement: 'Reach 50,000 members and form 40 Tribe Cities.',
        requirementShort: '50K members + 40 Tribe Cities',
        requiredPopulation: 50000,
        requiredTribeCities: 40,
      },
      kingdom: {
        label: 'Kingdom',
        description: 'A dominant force spanning many provinces.',
        requirement: 'Reach 100,000 members and form 50 Tribe Cities.',
        requirementShort: '100K members + 50 Tribe Cities',
        requiredPopulation: 100000,
        requiredTribeCities: 50,
      },
      dominion: {
        label: 'Dominion',
        description: 'A vast territory under unified leadership.',
        requirement: 'Reach 500,000 members and form 100 Tribe Cities.',
        requirementShort: '500K members + 100 Tribe Cities',
        requiredPopulation: 500000,
        requiredTribeCities: 100,
      },
      empire: {
        label: 'Empire',
        description: 'The full civilization — all requirements met and the Empire is formed.',
        requirement: 'Reach 1,000,000 members and form 200 Tribe Cities.',
        requirementShort: '1M members + 200 Tribe Cities',
        requiredPopulation: 1000000,
        requiredTribeCities: 200,
      },
    },
  },
  cityLimits: {
    maxPopulationPerCity: 10000,
    numberAssignmentScope: 'city' as const,
  },
} as const;

export type CityTierName = keyof typeof PROGRESSION_RULES.city;
export type CityTier = typeof PROGRESSION_RULES.city[CityTierName];
export type EmpireCivilizationName = keyof typeof PROGRESSION_RULES.empire.civilization;

const CITY_TIER_ORDER: CityTierName[] = [
  'group',
  'tribe',
  'organization',
  'congregation',
  'coalition',
  'powerhouse',
  'legacy_city',
];

export function getCityTierLevel(tier: CityTierName): number {
  return CITY_TIER_ORDER.indexOf(tier) + 1;
}

export function getCityTier(populationCount: number): CityTierName {
  let result: CityTierName = 'group';
  for (const key of CITY_TIER_ORDER) {
    if (populationCount >= PROGRESSION_RULES.city[key].minPopulation) {
      result = key;
    }
  }
  return result;
}

export function getNextCityTier(
  populationCount: number,
): { name: CityTierName; minPopulation: number } | null {
  const current = getCityTier(populationCount);
  const idx = CITY_TIER_ORDER.indexOf(current);
  if (idx < 0 || idx >= CITY_TIER_ORDER.length - 1) return null;
  const nextKey = CITY_TIER_ORDER[idx + 1];
  return { name: nextKey, minPopulation: PROGRESSION_RULES.city[nextKey].minPopulation };
}

export function getCityTierProgress(populationCount: number): {
  current: CityTierName;
  next: CityTierName | null;
  percent: number;
} {
  const current = getCityTier(populationCount);
  const next = getNextCityTier(populationCount);
  if (!next) {
    return { current, next: null, percent: 100 };
  }
  const currentMin = PROGRESSION_RULES.city[current].minPopulation;
  const span = next.minPopulation - currentMin;
  const into = populationCount - currentMin;
  const percent = Math.min(100, Math.round((into / span) * 100));
  return { current, next: next.name, percent };
}

const CIVILIZATION_ORDER: EmpireCivilizationName[] = [
  'outpost',
  'settlement',
  'village',
  'province',
  'kingdom',
  'dominion',
  'empire',
];

export function getEmpireCivilizationLevel(
  tribeCityCount: number,
  totalPopulation: number,
): EmpireCivilizationName {
  const civ = PROGRESSION_RULES.empire.civilization;
  let result: EmpireCivilizationName = 'outpost';
  for (const key of CIVILIZATION_ORDER) {
    const req = civ[key];
    if (totalPopulation >= req.requiredPopulation && tribeCityCount >= req.requiredTribeCities) {
      result = key;
    }
  }
  return result;
}

export function getNextEmpireCivilizationLevel(
  tribeCityCount: number,
  totalPopulation: number,
): {
  name: EmpireCivilizationName;
  populationNeeded: number;
  tribeCitiesNeeded: number;
} | null {
  const current = getEmpireCivilizationLevel(tribeCityCount, totalPopulation);
  const idx = CIVILIZATION_ORDER.indexOf(current);
  if (idx < 0 || idx >= CIVILIZATION_ORDER.length - 1) return null;
  const nextKey = CIVILIZATION_ORDER[idx + 1];
  const nextReq = PROGRESSION_RULES.empire.civilization[nextKey];
  return {
    name: nextKey,
    populationNeeded: nextReq.requiredPopulation,
    tribeCitiesNeeded: nextReq.requiredTribeCities,
  };
}

export function getEmpireUnlockProgress(
  tribeCityCount: number,
  totalPopulation: number,
): {
  tribeCityCount: number;
  population: number;
  requiredTribeCities: number;
  requiredPopulation: number;
  tribeCityPercent: number;
  populationPercent: number;
  overallPercent: number;
  unlocked: boolean;
} {
  const requiredTribeCities = PROGRESSION_RULES.empire.unlock.requiredTribeCities;
  const requiredPopulation = PROGRESSION_RULES.empire.unlock.requiredPopulation;
  const tribeCityPercent = Math.min(100, Math.round((tribeCityCount / requiredTribeCities) * 100));
  const populationPercent = Math.min(100, Math.round((totalPopulation / requiredPopulation) * 100));
  return {
    tribeCityCount,
    population: totalPopulation,
    requiredTribeCities,
    requiredPopulation,
    tribeCityPercent,
    populationPercent,
    overallPercent: Math.min(tribeCityPercent, populationPercent),
    unlocked: tribeCityCount >= requiredTribeCities && totalPopulation >= requiredPopulation,
  };
}
