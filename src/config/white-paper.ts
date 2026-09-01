export interface WhitePaperSection {
  id: string;
  number: string;
  title: string;
  /** Rendered as paragraphs. Each string is its own paragraph. */
  paragraphs: string[];
  /** Optional sub-blocks (e.g. subsections, bullet lists, highlighted examples). */
  blocks?: WhitePaperBlock[];
}

export interface WhitePaperBlock {
  heading?: string;
  bullets?: string[];
  paragraphs?: string[];
  /** Highlighted callout (e.g. the 40/30/30 split). */
  highlight?: boolean;
}

export const whitePaperSubtitle =
  'Treasury & Money Architecture White Paper';

export const whitePaperTagline =
  'Building Community Power With Transparency, Participation, and Accountability';

export const whitePaperSections: WhitePaperSection[] = [
  {
    id: 'mission',
    number: '1',
    title: 'Our Mission',
    paragraphs: [
      'The mission of The Underground Black Empire is to organize our people, resources, businesses, skills, and collective voice into a unified system that strengthens our communities, builds economic power, and allows us to create the future we want — together.',
      'The Empire begins with a simple belief: We already have what we need. We need to organize it.',
      'Across our communities are business owners, professionals, teachers, organizers, tradespeople, creators, parents, investors, students, leaders, and ordinary people who want something better. The Empire exists to bring those people and resources into one organized system.',
      'We are not waiting for someone else to build our future. We are building our own.',
    ],
  },
  {
    id: 'why-exists',
    number: '2',
    title: 'Why the Empire Exists',
    paragraphs: [
      'Many communities already have talented people, businesses, organizations, ideas, and money. The problem is that these resources often operate separately.',
      'One person knows about a great local business. Another knows about an effective youth program. Another has professional skills. Another wants to contribute financially. Another wants to volunteer. Thousands more want to help but do not know where to begin.',
      'The Underground Black Empire creates the infrastructure that connects these pieces.',
    ],
    blocks: [
      {
        bullets: [
          'Discover local businesses and services.',
          'Promote useful community solutions.',
          'Organize people city by city.',
          'Support local events and programs.',
          'Identify important community needs.',
          'Collectively prioritize initiatives.',
          'Direct designated community resources.',
          'Measure results.',
          'Build stronger local economic ecosystems.',
        ],
      },
      {
        paragraphs: [
          'The goal is not simply to collect money. The goal is to organize people and resources into action.',
        ],
      },
    ],
  },
  {
    id: 'simple-model',
    number: '3',
    title: 'The Simple Model',
    paragraphs: [
      "The Empire's financial system can be understood in one line:",
    ],
    blocks: [
      {
        highlight: true,
        paragraphs: [
          'Money Comes In → It Is Divided → Members Participate → Qualified Projects Are Selected → Funds Are Released → Results Are Publicly Reported',
        ],
      },
      {
        paragraphs: ['Every part of the system is designed around that process.'],
      },
    ],
  },
  {
    id: 'money-in',
    number: '4',
    title: 'Where Does the Money Come From?',
    paragraphs: [
      'The Underground Black Empire may generate revenue from several sources. These can include:',
    ],
    blocks: [
      {
        heading: 'Membership',
        paragraphs: [
          'Certain membership levels or premium Empire features may require payment. Membership supports the operation and continued development of the platform.',
        ],
      },
      {
        heading: 'Voting Credits',
        paragraphs: [
          'Members may purchase Voting Credits to participate in designated Treasury allocation votes. Voting Credits are a platform feature. They are not investments. They are not shares of stock. They do not create ownership of the Empire. They do not guarantee a financial return.',
        ],
      },
      {
        heading: 'Marketplace and Promotional Services',
        paragraphs: [
          'Businesses may purchase optional promotional opportunities, increased visibility, sponsorships, or other commercial services available through the Empire.',
        ],
      },
      {
        heading: 'Partnerships and Sponsorships',
        paragraphs: [
          'Companies, organizations, foundations, and other partners may financially support approved Empire programs or initiatives.',
        ],
      },
      {
        heading: 'Charitable Donations',
        paragraphs: [
          'If the Empire establishes a separate qualified charitable organization, that entity may accept donations specifically for charitable programs. Those funds would be handled separately from normal commercial revenue.',
        ],
      },
    ],
  },
  {
    id: 'money-out',
    number: '5',
    title: 'Where Does the Money Go?',
    paragraphs: [
      'Eligible revenue designated under the Empire Treasury system is divided into three major areas:',
    ],
    blocks: [
      {
        heading: '40% — City Treasuries',
        paragraphs: [
          'Money stays connected to the communities where members participate. City Treasury funds are used to support qualified local initiatives.',
        ],
        highlight: true,
      },
      {
        heading: '30% — Empire Treasury',
        paragraphs: [
          'The Empire Treasury supports larger initiatives that may benefit multiple cities or the broader Empire.',
        ],
        highlight: true,
      },
      {
        heading: '30% — Operations',
        paragraphs: [
          'Operations keep the system functioning. This may include technology, app development, servers and hosting, employees and contractors, accounting, legal and compliance expenses, payment processing, insurance, marketing, administration, fraud prevention, security, and customer support.',
        ],
        highlight: true,
      },
      {
        paragraphs: [
          'Operations are necessary because a community financial system cannot function without infrastructure.',
        ],
      },
    ],
  },
  {
    id: 'example',
    number: '6',
    title: 'A Simple Example',
    paragraphs: [
      'Imagine a member purchases $10 in eligible Voting Credits. After applicable refunds, chargebacks, taxes, or transaction expenses defined by Empire policy, the eligible amount is divided.',
    ],
    blocks: [
      {
        highlight: true,
        paragraphs: [
          'For a simplified $10 example: $4 → City Treasury · $3 → Empire Treasury · $3 → Empire Operations',
        ],
      },
      {
        paragraphs: [
          'If the member belongs to Atlanta, the City Treasury portion is credited to Atlanta\'s Treasury. Thousands of individual transactions can gradually create meaningful community resources.',
        ],
      },
      {
        highlight: true,
        paragraphs: [
          'For example, 10,000 members generating $10 in eligible revenue ($100,000 total) could result in approximately $40,000 City Treasuries, $30,000 Empire Treasury, and $30,000 Operations.',
        ],
      },
      {
        paragraphs: ['The power comes from organized participation at scale.'],
      },
    ],
  },
  {
    id: 'who-holds',
    number: '7',
    title: 'Who Holds the Money?',
    paragraphs: [
      'The legal organization operating The Underground Black Empire holds and administers Empire funds. Empire money must never be held in the personal bank account of a founder, leader, administrator, or community member.',
      'Organizational funds are held through authorized financial accounts. As the Empire grows, separate accounts or equivalent financial controls may be used for operating funds, City Treasury funds, Empire Treasury funds, charitable funds, and other restricted programs.',
      'The financial system must maintain clear records showing how much money belongs to each designated category.',
    ],
  },
  {
    id: 'member-ownership',
    number: '8',
    title: 'Do Members Own the Treasury?',
    paragraphs: [
      'No. Membership in The Underground Black Empire does not automatically make a member an owner of Treasury funds.',
      'Members receive participation and governance rights within the rules of the platform, not personal ownership of Treasury assets.',
    ],
    blocks: [
      {
        paragraphs: [
          'For example, suppose the Atlanta Treasury contains $100,000. An Atlanta member does not own a percentage of that $100,000. They cannot withdraw their portion. They cannot sell their portion. They cannot demand repayment. They may instead receive the right to participate in eligible decisions concerning how designated Treasury resources are used.',
        ],
      },
      {
        heading: 'Community Control Is Not Personal Ownership',
        paragraphs: [
          'The purpose of the Treasury is to create organized community power, not individual investment accounts.',
        ],
      },
    ],
  },
  {
    id: 'members-receive',
    number: '9',
    title: 'What Do Members Receive?',
    paragraphs: ['Membership may provide access to:'],
    blocks: [
      {
        bullets: [
          'The Empire community',
          'City participation',
          'Marketplace discovery',
          'Business and service listings',
          'Community news',
          'Local events',
          'Archetypes and Influence',
          'City quests and Empire initiatives',
          'Qualified voting opportunities',
          'Treasury information',
          'Leadership participation where eligible',
          'Community proposal systems',
          'Other Empire features',
        ],
      },
      {
        paragraphs: [
          "A member's participation can increase their standing and influence within the Empire. However, participation does not automatically create financial ownership.",
        ],
      },
    ],
  },
  {
    id: 'members-not-receive',
    number: '10',
    title: 'What Do Members NOT Receive?',
    paragraphs: [
      'Unless the Empire creates a separate and specifically documented investment opportunity in the future, normal membership or Voting Credit purchases do not provide:',
    ],
    blocks: [
      {
        bullets: [
          'Company stock',
          'Equity',
          'Profit sharing',
          'Dividends',
          'Ownership percentages',
          'Guaranteed financial returns',
          'Individual Treasury ownership',
          'Rights to withdraw Treasury funds',
          'Personal ownership of property funded by the Treasury',
        ],
      },
      {
        paragraphs: [
          'The Empire should never require members to guess whether they are donating, purchasing a service, or investing. The purpose of every payment should be clearly identified.',
        ],
      },
    ],
  },
  {
    id: 'vote-on',
    number: '11',
    title: 'What Can Members Vote On?',
    paragraphs: [
      'Members help determine how designated community resources should be prioritized.',
    ],
    blocks: [
      {
        paragraphs: [
          'For example, Atlanta may have $75,000 available in its City Treasury. Several qualified initiatives may be presented to members.',
        ],
      },
      {
        heading: 'Initiative A — Youth technology program',
        paragraphs: ['Requested support: $20,000'],
      },
      {
        heading: 'Initiative B — Local grocery and food-access initiative',
        paragraphs: ['Requested support: $15,000'],
      },
      {
        heading: 'Initiative C — Small-business training and incubator',
        paragraphs: ['Requested support: $25,000'],
      },
      {
        paragraphs: [
          'Eligible Atlanta members can participate in the voting process. The community determines which initiatives receive the strongest support.',
        ],
      },
    ],
  },
  {
    id: 'oversight',
    number: '12',
    title: 'Voting Does Not Replace Financial Oversight',
    paragraphs: [
      'A winning vote does not mean money is automatically sent. Before an initiative can receive Treasury funds, it must satisfy the Empire\'s eligibility requirements.',
    ],
    blocks: [
      {
        bullets: [
          'Identity',
          'Organization',
          'Business registration',
          'Banking information',
          'Project purpose',
          'Budget',
          'Contracts',
          'Required licenses',
          'Conflicts of interest',
          'Legal compliance',
          'Fraud risk',
          'Ability to complete the project',
        ],
      },
      {
        heading: 'Members Decide',
        paragraphs: ['What should our community support?'],
      },
      {
        heading: 'The Empire Verifies',
        paragraphs: [
          'Can the approved money legally and responsibly be released?',
        ],
      },
      {
        paragraphs: ['Both are necessary.'],
      },
    ],
  },
  {
    id: 'approve-release',
    number: '13',
    title: 'Who Can Approve the Release of Money?',
    paragraphs: [
      "Treasury money should never depend upon one person's unchecked authority. Approved payments should require established financial controls.",
    ],
    blocks: [
      {
        heading: 'Smaller Payments',
        paragraphs: ['Two authorized approvals may be required.'],
      },
      {
        heading: 'Medium Payments',
        paragraphs: [
          'Financial review plus multiple approvals may be required.',
        ],
      },
      {
        heading: 'Large Payments',
        paragraphs: [
          'Financial review, authorized leadership approval, and additional governance review may be required.',
        ],
      },
      {
        paragraphs: [
          'The exact thresholds may change as the Empire grows. The principle does not: No single individual should have unlimited authority over community Treasury funds.',
        ],
      },
    ],
  },
  {
    id: 'treasury-decision',
    number: '14',
    title: 'Example of a Treasury Decision',
    paragraphs: [
      'Atlanta has $50,000 available. A local nonprofit submits a proposal requesting $20,000. Purpose: Create a technology lab serving 150 local students.',
    ],
    blocks: [
      {
        paragraphs: [
          'Step 1 — Proposal Submitted: The organization provides its project information.',
          'Step 2 — Verification: The Empire verifies the organization and proposal.',
          'Step 3 — Community Support: Members can review and support the initiative.',
          'Step 4 — Voting Booth: The project reaches an official voting window.',
          'Step 5 — Members Vote: Eligible members decide whether the initiative should receive Treasury support.',
          'Step 6 — Final Compliance Review: Banking, documentation, contracts, and other requirements are confirmed.',
          'Step 7 — Funds Released: The approved amount is paid according to the project\'s funding agreement.',
          'Step 8 — Results Reported: The community can see what happened.',
        ],
      },
    ],
  },
  {
    id: 'transparency',
    number: '15',
    title: 'Transparency',
    paragraphs: [
      'Members should not have to wonder where community money went. The Empire should make Treasury information visible inside the platform.',
    ],
    blocks: [
      {
        heading: 'Atlanta Treasury',
        paragraphs: [
          'Available: $82,450 · Committed: $35,000 · Distributed: $146,700 · Projects Funded: 14',
        ],
        highlight: true,
      },
      {
        paragraphs: ['Members can then view individual projects.'],
      },
    ],
  },
  {
    id: 'project-report',
    number: '16',
    title: 'Example Project Report',
    blocks: [
      {
        heading: 'South Atlanta Youth Technology Lab',
        paragraphs: [
          'Approved: $20,000 · Community Participants: 4,382 · Released: $10,000 · Remaining Commitment: $10,000 · Status: In Progress',
        ],
        highlight: true,
      },
      {
        paragraphs: [
          'Members may also be able to see project description, recipient, approval date, payment history, milestones, photos, updates, completion reports, and measured results.',
        ],
      },
      {
        paragraphs: [
          'The purpose is simple: The community should be able to see what its resources accomplished.',
        ],
      },
    ],
  },
  {
    id: 'financial-reporting',
    number: '17',
    title: 'Financial Reporting',
    paragraphs: [
      'The Empire should maintain regular financial reporting. Depending upon the size and maturity of the organization, this may include:',
    ],
    blocks: [
      {
        heading: 'Internal Accounting',
        paragraphs: ['Every transaction is recorded and categorized.'],
      },
      {
        heading: 'Treasury Dashboard',
        paragraphs: [
          'Members can view current Treasury balances and funded projects.',
        ],
      },
      {
        heading: 'Periodic Reports',
        paragraphs: [
          'The Empire publishes summaries of money received, money allocated, money released, money remaining, and projects completed.',
        ],
      },
      {
        heading: 'Independent Financial Review',
        paragraphs: [
          'As Treasury assets become significant, qualified independent accountants or CPAs can review the financial records.',
        ],
      },
      {
        heading: 'Formal Audits',
        paragraphs: [
          'At sufficient scale, or whenever required by law, regulation, funding agreements, or organizational policy, independent financial audits can be conducted.',
        ],
      },
      {
        paragraphs: [
          'The level of oversight should grow with the amount of money being managed.',
        ],
      },
    ],
  },
  {
    id: 'city-vs-empire',
    number: '18',
    title: 'City Treasury vs. Empire Treasury',
    paragraphs: ['The two Treasuries serve different purposes.'],
    blocks: [
      {
        heading: 'City Treasury',
        paragraphs: ['Designed primarily for local priorities. Examples:'],
        bullets: [
          'Youth programs',
          'Business development',
          'Community events',
          'Local infrastructure',
          'Food access',
          'Education initiatives',
          'Entrepreneurship',
          'Neighborhood programs',
          'Local nonprofit support',
        ],
      },
      {
        heading: 'Empire Treasury',
        paragraphs: ['Designed for larger opportunities. Examples:'],
        bullets: [
          'Multi-city projects',
          'National educational initiatives',
          'Major partnerships',
          'Technology infrastructure',
          'Large economic-development projects',
          'Cross-city programs',
          'Empire-wide initiatives',
        ],
      },
      {
        paragraphs: [
          'This gives the Empire both local power and collective scale.',
        ],
      },
    ],
  },
  {
    id: 'operations-vs-treasury',
    number: '19',
    title: 'Operations Are Not the Treasury',
    paragraphs: [
      'Operations and Treasury funds have different purposes. The Treasury exists to support qualified community initiatives. Operations exist to maintain the organization that makes the Treasury possible.',
      'This distinction should remain visible in the accounting system. Members should be able to understand how much money is running the Empire versus available for community allocation.',
    ],
  },
  {
    id: 'marketplace',
    number: '20',
    title: 'The Marketplace Is Part of the Economic Strategy',
    paragraphs: [
      'The Empire does not define economic development only as giving money away. Community wealth also grows when people support existing businesses.',
      'The Marketplace allows members to discover local businesses, products, services, professionals, events, and community organizations.',
    ],
    blocks: [
      {
        paragraphs: [
          'A business does not necessarily need Treasury funding to benefit from the Empire. Sometimes the most valuable thing the Empire can provide is customers, visibility, connections, information, participation, and community support.',
        ],
      },
      {
        paragraphs: [
          'Treasury funding is one tool inside a much larger economic system.',
        ],
      },
    ],
  },
  {
    id: 'not-fundraiser',
    number: '21',
    title: 'The Empire Is Not Simply a Fundraiser',
    paragraphs: [
      'The Underground Black Empire should not be understood simply as an organization collecting money. Money is only one resource. The Empire organizes:',
    ],
    blocks: [
      {
        bullets: [
          'People',
          'Businesses',
          'Skills',
          'Information',
          'Events',
          'Ideas',
          'Votes',
          'Leadership',
          'Capital',
          'Community priorities',
        ],
      },
      {
        paragraphs: [
          'The Treasury provides financial power. The Marketplace provides economic connectivity. Voting provides collective decision-making. The City structure provides local organization. Participation provides momentum. Together they form the Empire.',
        ],
      },
    ],
  },
  {
    id: 'leadership',
    number: '22',
    title: 'Leadership and Treasury Control',
    paragraphs: [
      'Being a community leader should not automatically give someone unrestricted access to community money. Leadership and financial authority should remain appropriately separated.',
      'A Mayor, Council member, City leader, administrator, founder, or other official may participate in governance without personally controlling Treasury accounts. Financial controls should exist independently from popularity or political authority.',
      'This protects members, leaders, the founder, the organization, Treasury recipients, and the integrity of the Empire.',
    ],
  },
  {
    id: 'conflicts',
    number: '23',
    title: 'Conflicts of Interest',
    paragraphs: [
      'The Empire should maintain a conflict-of-interest policy. If an individual involved in reviewing or approving funding has a financial relationship with a proposed recipient, that relationship should be disclosed. That person may be required to remove themselves from the decision.',
    ],
    blocks: [
      {
        paragraphs: [
          'Example: An Empire official owns a company seeking $30,000 from a City Treasury. That official should not secretly participate in approving their own funding.',
        ],
      },
      {
        paragraphs: ['Transparency protects trust.'],
      },
    ],
  },
  {
    id: 'long-term',
    number: '24',
    title: 'The Long-Term Structure',
    paragraphs: [
      'The Empire may eventually operate through multiple legal entities.',
    ],
    blocks: [
      {
        heading: 'Operating Company',
        paragraphs: ['Runs the platform and commercial activities.'],
      },
      {
        heading: 'Community or Charitable Foundation',
        paragraphs: [
          'May operate eligible charitable and educational programs.',
        ],
      },
      {
        heading: 'Advocacy Organization',
        paragraphs: [
          'May eventually handle certain public-policy or advocacy activities if necessary.',
        ],
      },
      {
        heading: 'Specialized Investment Entities',
        paragraphs: [
          'Could potentially be created in the future for properly structured investment opportunities.',
        ],
      },
      {
        paragraphs: [
          'These entities would serve different legal purposes. They should not be treated as interchangeable.',
        ],
      },
    ],
  },
  {
    id: 'future-investments',
    number: '25',
    title: 'Future Investments',
    paragraphs: [
      'The Empire may eventually identify opportunities involving real estate, businesses, community facilities, investment funds, commercial property, or other income-producing assets.',
    ],
    blocks: [
      {
        paragraphs: [
          'If members are ever offered actual ownership or an expectation of financial return, that opportunity would require a separate legal structure and separate disclosures. It should not simply be mixed into normal membership or Voting Credits.',
        ],
      },
      {
        highlight: true,
        paragraphs: [
          'Until such a structure exists: Empire membership is not an investment. Voting Credits are not investments. Treasury participation is not personal ownership.',
        ],
      },
    ],
  },
  {
    id: 'promise',
    number: '26',
    title: 'Our Promise of Transparency',
    paragraphs: [
      'The Empire cannot ask communities to trust a system that they cannot see. Therefore, our goal is simple: Show the money.',
    ],
    blocks: [
      {
        paragraphs: [
          'Members should be able to understand: Where it came from. Where it was allocated. What was approved. What was paid. Who received it. What they promised to accomplish. What actually happened.',
        ],
      },
      {
        paragraphs: ['Trust should be earned through transparency.'],
      },
    ],
  },
  {
    id: 'philosophy',
    number: '27',
    title: 'Our Financial Philosophy',
    paragraphs: [
      'The Underground Black Empire is built around three principles.',
    ],
    blocks: [
      {
        heading: 'ORGANIZE',
        paragraphs: ['Bring people and resources together.'],
        highlight: true,
      },
      {
        heading: 'DECIDE',
        paragraphs: [
          'Allow communities to participate in identifying priorities.',
        ],
        highlight: true,
      },
      {
        heading: 'BUILD',
        paragraphs: ['Turn organized resources into measurable results.'],
        highlight: true,
      },
      {
        paragraphs: [
          'The objective is not merely to raise money. The objective is to create an infrastructure through which communities can repeatedly organize resources, make decisions, produce results, and grow stronger.',
        ],
      },
    ],
  },
  {
    id: 'complete-architecture',
    number: '28',
    title: 'The Complete Money Architecture',
    paragraphs: ['The entire process can be summarized as:'],
    blocks: [
      {
        highlight: true,
        paragraphs: [
          'Member Participates → Money Enters the Empire → Eligible Revenue Is Divided (40% City Treasury · 30% Empire Treasury · 30% Operations) → Treasury Balances Are Recorded → Qualified Initiatives Are Submitted → Initiatives Are Verified → Members Participate and Vote → Winning Initiatives Receive Final Compliance Review → Authorized Officials Approve Release → Funds Are Distributed → Recipients Report Results → Members See What Was Accomplished → The City and Empire Continue to Grow',
        ],
      },
    ],
  },
  {
    id: 'principle',
    number: '29',
    title: 'The Principle Behind Everything',
    paragraphs: [
      'The Underground Black Empire does not require every person to be wealthy. It requires enough people to become organized.',
    ],
    blocks: [
      {
        paragraphs: [
          'One business. One skill. One idea. One vote. One contribution. One city at a time.',
        ],
      },
      {
        paragraphs: [
          'When those pieces operate separately, their impact is limited. When they operate together, they become infrastructure.',
        ],
      },
      {
        highlight: true,
        paragraphs: ['We already have what we need. The Empire organizes it.'],
      },
    ],
  },
];

export const whitePaperClosing = {
  line: 'BUILD OUR OWN.',
  subline: 'Organize our people. Build our communities. Create our future.',
  signature: 'The Underground Black Empire',
};
