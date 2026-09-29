export const APP_CONFIG = {
  name: 'The Underground Black Empire',
  shortName: 'The Empire',
  tagline: 'The Empire Is Forming',
  description:
    'A city-based, gamified civic and community platform. Build your city. Grow your empire. Leave a legacy.',
  url: 'https://theundergroundblackempire.com',
  supportEmail: 'theundergroundblackempire@gmail.com',
  version: '0.1.0',
  phase: 'Pioneer Campaign',
} as const;

export type AppPhase = typeof APP_CONFIG.phase;
