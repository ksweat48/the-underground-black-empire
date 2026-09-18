import type { EmpireCivilizationName } from '@/config/progression-rules';

export type GuideDialogueTier = {
  threshold: number;
  message: string;
};

export type GuideMissionConfig = {
  level: EmpireCivilizationName;
  levelNumber: number;
  levelLabel: string;
  guideIntro: string;
  mission: string;
  missionDetail: string;
  missionShort: string;
  reward: string[];
  closingLine: string;
  progressTarget: number;
  progressLabel: string;
  dialogue: GuideDialogueTier[];
};

export const GUIDE_MISSIONS: Record<EmpireCivilizationName, GuideMissionConfig> = {
  outpost: {
    level: 'outpost',
    levelNumber: 1,
    levelLabel: 'Outpost',
    guideIntro:
      'We have arrived. Set up the tents and send word to every community. We must gather our people and establish our first Tribe Cities. The foundation of this civilization begins with us.',
    mission: 'Reach 1,000 members and form 10 Tribe Cities.',
    missionDetail: 'A city becomes a Tribe when its population reaches 100 people.',
    missionShort: '1K members + 10 Tribe Cities',
    reward: ['Organizations', 'Marketplace'],
    closingLine: 'Gather our people. Raise the first 10 Tribes. Do not let the mission fail.',
    progressTarget: 1000,
    progressLabel: 'Members',
    dialogue: [
      { threshold: 0, message: 'We have arrived. Set up the tents and send word to every community. We must gather our people and establish our first Tribe Cities.' },
      { threshold: 100, message: 'The first members are arriving. The Outpost is stirring to life.' },
      { threshold: 500, message: 'Five hundred strong. The first Tribes are beginning to rise.' },
      { threshold: 800, message: 'We are close now. Keep sending word to every community.' },
      { threshold: 950, message: 'Fifty remain. Finish what we started.' },
      { threshold: 1000, message: 'One thousand members. The foundation is complete. Prepare the Settlement.' },
    ],
  },
  settlement: {
    level: 'settlement',
    levelNumber: 2,
    levelLabel: 'Settlement',
    guideIntro:
      'The Outpost has become a Settlement. Now we must grow our numbers and our geography. More members, more Tribe Cities — that is how we advance.',
    mission: 'Reach 5,000 members and form 20 Tribe Cities.',
    missionDetail: 'Every new member strengthens the Empire. Every city that reaches 100 people becomes a Tribe.',
    missionShort: '5K members + 20 Tribe Cities',
    reward: ['City Treasuries', 'Local Voting'],
    closingLine: 'Grow the Settlement. More people, more Tribes. The Empire depends on it.',
    progressTarget: 5000,
    progressLabel: 'Members',
    dialogue: [
      { threshold: 0, message: 'The Outpost has become a Settlement. Now we must grow our numbers and our geography.' },
      { threshold: 1000, message: 'One thousand members. The Settlement is taking root.' },
      { threshold: 2500, message: 'Halfway to our goal. The Tribes are multiplying.' },
      { threshold: 4000, message: 'Four thousand members. We are close now.' },
      { threshold: 4800, message: 'Two hundred remain. The Settlement is nearly complete.' },
      { threshold: 5000, message: 'The Settlement thrives. Prepare the Village.' },
    ],
  },
  village: {
    level: 'village',
    levelNumber: 3,
    levelLabel: 'Village',
    guideIntro:
      'The Settlement has grown into a Village. Our people are spreading across the land. We must keep growing — more members, more Tribe Cities — until the Village becomes a Province.',
    mission: 'Reach 25,000 members and form 30 Tribe Cities.',
    missionDetail: 'Population and geography are the only measures of our civilization.',
    missionShort: '25K members + 30 Tribe Cities',
    reward: ['Family', 'City Leadership and Elections'],
    closingLine: 'Grow the Village. More people, more Tribes. This is how civilizations rise.',
    progressTarget: 25000,
    progressLabel: 'Members',
    dialogue: [
      { threshold: 0, message: 'The Settlement has grown into a Village. Our people are spreading across the land.' },
      { threshold: 5000, message: 'Five thousand members. The Village is finding its voice.' },
      { threshold: 12000, message: 'Halfway to our goal. The Tribes are growing stronger.' },
      { threshold: 20000, message: 'Twenty thousand members. We are close now.' },
      { threshold: 24000, message: 'One thousand remain. The Village is nearly complete.' },
      { threshold: 25000, message: 'The Village has proven itself. Prepare the Province.' },
    ],
  },
  province: {
    level: 'province',
    levelNumber: 4,
    levelLabel: 'Province',
    guideIntro:
      'The Village has become a Province. We are a regional power now. But we must keep growing our population and our geography to reach the Kingdom.',
    mission: 'Reach 50,000 members and form 40 Tribe Cities.',
    missionDetail: 'Every member counts. Every city that reaches 100 people becomes a Tribe.',
    missionShort: '50K members + 40 Tribe Cities',
    reward: ['Legacy Program', 'Expanded Treasury Capacity'],
    closingLine: 'Build the Province. More people, more Tribes. The Kingdom is within reach.',
    progressTarget: 50000,
    progressLabel: 'Members',
    dialogue: [
      { threshold: 0, message: 'The Village has become a Province. We are a regional power now.' },
      { threshold: 10000, message: 'Ten thousand members. The Province is taking shape.' },
      { threshold: 25000, message: 'Halfway there. The Tribes are spreading across the land.' },
      { threshold: 40000, message: 'Forty thousand members. We are nearly there.' },
      { threshold: 49000, message: 'One thousand remain. The Province is almost complete.' },
      { threshold: 50000, message: 'The Province stands strong. Prepare the Kingdom.' },
    ],
  },
  kingdom: {
    level: 'kingdom',
    levelNumber: 5,
    levelLabel: 'Kingdom',
    guideIntro:
      'The Province has risen to a Kingdom. We are a dominant force now. But the Dominion calls — we must reach one hundred thousand members and fifty Tribe Cities.',
    mission: 'Reach 100,000 members and form 50 Tribe Cities.',
    missionDetail: 'Population and geography. These are the only measures of our civilization.',
    missionShort: '100K members + 50 Tribe Cities',
    reward: ['Empire Council', 'Inter-City Initiatives'],
    closingLine: 'The Kingdom must grow. One hundred thousand members. Fifty Tribes. Do not stop.',
    progressTarget: 100000,
    progressLabel: 'Members',
    dialogue: [
      { threshold: 0, message: 'The Province has risen to a Kingdom. We are a dominant force now.' },
      { threshold: 20000, message: 'Twenty thousand members. The Kingdom is growing.' },
      { threshold: 50000, message: 'Halfway to our goal. The Tribes are multiplying.' },
      { threshold: 80000, message: 'Eighty thousand members. We are close now.' },
      { threshold: 99000, message: 'One thousand remain. The Kingdom is almost complete.' },
      { threshold: 100000, message: 'The Kingdom has honored its people. Prepare the Dominion.' },
    ],
  },
  dominion: {
    level: 'dominion',
    levelNumber: 6,
    levelLabel: 'Dominion',
    guideIntro:
      'The Kingdom has expanded into a Dominion. Now we must unite half a million members and one hundred Tribe Cities. The final mission is upon us.',
    mission: 'Reach 500,000 members and form 100 Tribe Cities.',
    missionDetail: 'The Dominion must prove that many cities can act as one.',
    missionShort: '500K members + 100 Tribe Cities',
    reward: ['Final Empire Status', 'All approved core systems fully active'],
    closingLine: 'Unite the Dominion. Half a million members. One hundred Tribes. This is the final mission.',
    progressTarget: 500000,
    progressLabel: 'Members',
    dialogue: [
      { threshold: 0, message: 'The Kingdom has expanded into a Dominion. Now we must unite half a million members.' },
      { threshold: 100000, message: 'One hundred thousand. The Dominion is growing. Keep uniting.' },
      { threshold: 250000, message: 'Halfway to half a million. The Empire is within reach.' },
      { threshold: 400000, message: 'Four hundred thousand. Do not lose momentum now.' },
      { threshold: 490000, message: 'Ten thousand remain. One final push.' },
      { threshold: 500000, message: 'The Dominion is complete. The Empire has risen.' },
    ],
  },
  empire: {
    level: 'empire',
    levelNumber: 7,
    levelLabel: 'Empire',
    guideIntro:
      'The Empire has risen. One million members. Two hundred Tribe Cities. One civilization. We have achieved what we set out to do. Now we build its legacy.',
    mission: 'Continue growing the population and expanding Tribe Cities across the land.',
    missionDetail: 'The civilization ladder is complete. The Empire continues to evolve.',
    missionShort: 'Civilization achieved',
    reward: ['Final Civilization Status', 'All approved core systems fully active'],
    closingLine: 'The Empire has risen. Now we build its legacy.',
    progressTarget: 1000000,
    progressLabel: 'Members',
    dialogue: [
      { threshold: 0, message: 'The Empire has risen. One million members. Two hundred Tribe Cities. One civilization.' },
      { threshold: 1000000, message: 'The Empire stands eternal. Continue building the legacy.' },
    ],
  },
};

export function getGuideDialogue(
  level: EmpireCivilizationName,
  currentProgress: number,
): string {
  const config = GUIDE_MISSIONS[level];
  if (!config) return '';
  let message = config.dialogue[0]?.message ?? '';
  for (const tier of config.dialogue) {
    if (currentProgress >= tier.threshold) {
      message = tier.message;
    }
  }
  return message;
}
