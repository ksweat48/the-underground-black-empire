export const landingImages = {
  screen1Hero: '/images/screens/screen_1/screen_01_full_image.png',
  screen2Mother: '/images/screens/screen_2/reality_page/single_mother.png',
  screen2School: '/images/screens/screen_2/reality_page/schools.png',
  screen2Elder: '/images/screens/screen_2/reality_page/elder_care.png',
  screen2Justice: '/images/screens/screen_2/reality_page/justice_image.png',
  screen3Community: '/images/screens/screen_3/the_shift_image_3.png',
  screen4Join: '/images/screens/screen_4/screen_4.png',
} as const;

export const landingCopy = {
  screen1: {
    headline: 'Rise Together or Fall Forever.',
    body: 'A digital city built to unite the people and give power back to our communities.',
    voice: 'Your voice matters. Change starts here.',
    cta: 'JOIN THE EMPIRE',
    secondaryCta: 'SIGN IN',
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
    subtext: 'We organize our cities. We decide what our communities need. Then we build it together.',
    closing: 'The Empire is the digital city where we organize, decide, and build together.',
  },
  screen4: {
    eyebrow: 'THE EMPIRE IS IN YOUR HANDS.',
    headline: ['One Empire.', 'Your Voice.', 'Our Future.'],
    accentWord: 'Our Future.',
    line1: 'Join the movement.',
    line2: "It's time to build what we deserve.",
    support: 'Choose your city. Join the Empire.',
    primaryCta: 'JOIN THE EMPIRE',
    secondaryCta: 'SIGN IN',
  },
} as const;
