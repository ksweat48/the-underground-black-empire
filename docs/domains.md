# Domains

## Active Domains

### Identity (`src/domains/identity/`)
- Auth context, session management, sign-in/sign-up
- Uses Supabase email/password auth
- Owner columns default to `auth.uid()`

### Founder Campaign (`src/domains/founder-campaign/`)
- Landing page, city selection, founder account creation, dashboard, city growth, founder journey, leaderboard, missions, referrals, and Empire progression

### Market (`src/domains/market/`)
- Market listings and organizations
- Events, listing updates, and feed posts
- Likes/favorites and comments
- Phone and website contact actions
- Listing and organization detail views
- Member-targeted leadership nominations from posts
- Like-based ranking with freshness and verification support

### Leadership (`src/domains/leadership/`)
- Leadership eligibility requirements
- Nomination submission and nomination counts
- Nomination acceptance and decline
- Election ballot eligibility after accepted nominations
- Metro Council display

### Initiatives (`src/domains/initiatives/`)
- Initiative creation, ranking, and backing
- Metro Initiative voting cycles and ballots
- Results calculation and admin review
- Organization initiative management

### Treasury (`src/domains/treasury/`)
- Metro Treasury balances (Available, Reserved, Total Raised)
- Permanent Treasury capacity tracking
- Treasury ledger entries
- Funding release workflow

### Membership (`src/domains/membership/`)
- Membership tiers, subscriptions, benefits, voting credits, and billing status
- Partner program dashboard

### Notifications (`src/domains/notifications/`)
- Member notifications and engagement-related alerts

### Admin (`src/domains/admin/`)
- Administrative controls
- Basic reporting (member counts, city counts, Influence awarded)
- Feature flag visibility
- Audit log (structure in place, populated by edge functions)

## Future Domains and Extensions

- **Moderation** — content and member moderation tools
- **Empire Advisory Council** — appointed 11-seat council with EAC applications
- **Empire-Wide Voting** — Yes/No ballots on Empire-level decisions
- **Legacy Program** — legacy benefits (NEVER described as guaranteed insurance)
- **Impact Tracking** — community impact metrics
- **Verification & Trust** — expanded verified-member workflows
- **Cities** (expanded) — full city management beyond the current metro and city flows
- **Rankings** (expanded) — additional ranking surfaces beyond Market engagement ranking

## Shared Infrastructure (`src/shared/`)

Reusable only — no business rules:
- Supabase client singleton
- Error handling and parsing
- Layout, Header, Footer components
- UI primitives (locked feature cards, CTA sections)
- `cn` class name utility
