import type { EmpireStageName } from '@/config/progression-rules';

export type GuideDialogueTier = {
  threshold: number;
  message: string;
};

export type GuideMissionConfig = {
  level: EmpireStageName;
  levelNumber: number;
  levelLabel: string;
  guideIntro: string;
  mission: string;
  missionDetail: string;
  missionShort: string;
  reward: string[];
  closingLine: string;
  qualifiedMetroTarget: number;
  dialogue: GuideDialogueTier[];
};

const QUALIFY_DETAIL = 'A Metro qualifies when its cities together reach 100 active members. Once qualified, it counts forever.';

export const GUIDE_MISSIONS: Record<EmpireStageName, GuideMissionConfig> = {
  outpost: {
    level: 'outpost',
    levelNumber: 1,
    levelLabel: 'Outpost',
    guideIntro:
      'We have arrived. Set up the tents and send word to every community. Our first task is to raise one Metro to 100 members.',
    mission: 'Qualify our first Metro.',
    missionDetail: QUALIFY_DETAIL,
    missionShort: '1 Qualified Metro',
    reward: ['Settlement Stage', 'First Metro Treasury unlocked'],
    closingLine: 'Gather our people. Raise the first Metro. Do not let the mission fail.',
    qualifiedMetroTarget: 1,
    dialogue: [
      { threshold: 0, message: 'We have arrived. Send word to every community. One Metro must reach 100 members.' },
      { threshold: 1, message: 'The first Metro stands. The Outpost becomes a Settlement.' },
    ],
  },
  settlement: {
    level: 'settlement',
    levelNumber: 2,
    levelLabel: 'Settlement',
    guideIntro:
      'The first Metro has qualified. Now we spread — three Metros standing together make a Village.',
    mission: 'Reach 3 Qualified Metros.',
    missionDetail: QUALIFY_DETAIL,
    missionShort: '3 Qualified Metros',
    reward: ['Village Stage', 'More Metro Treasuries unlocked'],
    closingLine: 'Grow the Settlement. Three Metros. The Empire depends on it.',
    qualifiedMetroTarget: 3,
    dialogue: [
      { threshold: 1, message: 'One Metro stands. Two more and we become a Village.' },
      { threshold: 2, message: 'Two Metros strong. One more and the Village rises.' },
      { threshold: 3, message: 'Three Metros. The Settlement has become a Village.' },
    ],
  },
  village: {
    level: 'village',
    levelNumber: 3,
    levelLabel: 'Village',
    guideIntro:
      'Three Metros stand together. Our people are spreading across the land. Five Metros make a Province.',
    mission: 'Reach 5 Qualified Metros.',
    missionDetail: QUALIFY_DETAIL,
    missionShort: '5 Qualified Metros',
    reward: ['Province Stage'],
    closingLine: 'Grow the Village. Five Metros. This is how civilizations rise.',
    qualifiedMetroTarget: 5,
    dialogue: [
      { threshold: 3, message: 'Three Metros stand together. Two more for the Province.' },
      { threshold: 4, message: 'Four Metros. The Province is within reach.' },
      { threshold: 5, message: 'Five Metros. The Village has become a Province.' },
    ],
  },
  province: {
    level: 'province',
    levelNumber: 4,
    levelLabel: 'Province',
    guideIntro:
      'We are a regional power now. Ten Qualified Metros will raise the Kingdom.',
    mission: 'Reach 10 Qualified Metros.',
    missionDetail: QUALIFY_DETAIL,
    missionShort: '10 Qualified Metros',
    reward: ['Kingdom Stage'],
    closingLine: 'Build the Province. Ten Metros. The Kingdom is within reach.',
    qualifiedMetroTarget: 10,
    dialogue: [
      { threshold: 5, message: 'The Province stands. Ten Metros will make a Kingdom.' },
      { threshold: 8, message: 'Eight Metros. We are close now.' },
      { threshold: 10, message: 'Ten Metros. The Kingdom has risen.' },
    ],
  },
  kingdom: {
    level: 'kingdom',
    levelNumber: 5,
    levelLabel: 'Kingdom',
    guideIntro:
      'The Kingdom has risen. The Dominion calls — twenty-five Qualified Metros acting as one.',
    mission: 'Reach 25 Qualified Metros.',
    missionDetail: QUALIFY_DETAIL,
    missionShort: '25 Qualified Metros',
    reward: ['Dominion Stage'],
    closingLine: 'The Kingdom must grow. Twenty-five Metros. Do not stop.',
    qualifiedMetroTarget: 25,
    dialogue: [
      { threshold: 10, message: 'The Kingdom has risen. Twenty-five Metros for the Dominion.' },
      { threshold: 18, message: 'Eighteen Metros. Keep uniting.' },
      { threshold: 25, message: 'Twenty-five Metros. The Dominion is complete.' },
    ],
  },
  dominion: {
    level: 'dominion',
    levelNumber: 6,
    levelLabel: 'Dominion',
    guideIntro:
      'The Dominion stretches across the land. Fifty Qualified Metros will complete the Empire.',
    mission: 'Reach 50 Qualified Metros.',
    missionDetail: QUALIFY_DETAIL,
    missionShort: '50 Qualified Metros',
    reward: ['Final Empire Status'],
    closingLine: 'Unite the Dominion. Fifty Metros. This is the final mission.',
    qualifiedMetroTarget: 50,
    dialogue: [
      { threshold: 25, message: 'The Dominion stands. Fifty Metros will complete the Empire.' },
      { threshold: 40, message: 'Forty Metros. One final push.' },
      { threshold: 50, message: 'Fifty Metros. The Empire has risen.' },
    ],
  },
  empire: {
    level: 'empire',
    levelNumber: 7,
    levelLabel: 'Empire',
    guideIntro:
      'The Empire has risen. Fifty Metros. One civilization. Now we build its legacy.',
    mission: 'Continue growing every Metro and qualifying new ones.',
    missionDetail: 'The civilization ladder is complete. The Empire continues to evolve.',
    missionShort: 'Civilization achieved',
    reward: ['Final Civilization Status'],
    closingLine: 'The Empire has risen. Now we build its legacy.',
    qualifiedMetroTarget: 50,
    dialogue: [
      { threshold: 50, message: 'The Empire stands. Continue building the legacy.' },
    ],
  },
};
