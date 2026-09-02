export const landingImages = {
  screen1Hero: '/images/screens/screen_1/screen_01_full_image.png',
  screen2Mother: '/images/screens/screen_2/reality_page/single_mother.png',
  screen2School: '/images/screens/screen_2/reality_page/schools.png',
  screen2Elder: '/images/screens/screen_2/reality_page/elder_care.png',
  screen2Justice: '/images/screens/screen_2/reality_page/justice_image.png',
  screen3Community: '/images/screens/screen_3/screen_3_image.png',
  screen4Join: '/images/screens/screen_4/screen_4.png',
} as const;

export const landingCopy = {
  screen1: {
    headline: 'We build together.',
    body: 'A city-based movement bringing people together to create stronger communities and a future we can shape.',
    voice: 'Your voice belongs in the future we build.',
    cta: 'JOIN THE EMPIRE',
    support: 'Many voices. One shared future.'
  },
  screen2: {
    eyebrow: 'THE REALITY',
    headline: 'Our communities are carrying too much.',
    subtext: 'Housing, family strain, injustice, and limited opportunity shape everyday life.',
    categories: [
      { label: 'Single Mothers', image: landingImages.screen2Mother },
      { label: 'Schools', image: landingImages.screen2School },
      { label: 'Elder Care', image: landingImages.screen2Elder },
      { label: 'Opportunity & Justice', image: landingImages.screen2Justice },
    ],
    closing: 'These challenges are real.',
    closingAccent: 'But so is our power.',
    closingSub: 'We have the people. Now we need the structure.',
  },
  screen3: {
    eyebrow: 'THE SHIFT',
    headline: 'Now we build it ourselves.',
    subtext: 'The Empire gives communities a way to organize and build together.',
    cards: [
      {
        label: 'ORGANIZE',
        body: 'Bring people together around what matters.',
        accent: 'plum' as const,
      },
      {
        label: 'SUPPORT',
        body: 'Strengthen local businesses and community power.',
        accent: 'emerald' as const,
      },
    ],
  },
  screen4: {
    eyebrow: 'THE EMPIRE IS IN YOUR HANDS.',
    headline: ['Your Voice.', 'Our Future.'],
    accentWord: 'Our Future.',
    line1: 'Join the movement.',
    line2: "It's time to build what we deserve.",
    support: 'Choose your city. Join the Empire.',
    primaryCta: 'JOIN THE EMPIRE',
    secondaryCta: 'SIGN IN',
  },
} as const;
