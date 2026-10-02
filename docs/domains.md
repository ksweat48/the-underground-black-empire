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

### Membership (`src/domains/membership/`)
- Membership tiers, subscriptions, benefits, voting credits, and billing status

### Notifications (`src/domains/notifications/`)
- Member notifications and engagement-related alerts

### Admin (`src/domains/admin/`)
- Administrative controls
- Basic reporting (founder counts, city counts, Influence awarded)
- Feature flag visibility
- Audit log (structure in place, populated by edge functions)

## Future Domains and Extensions

- **Treasury Systems** — city treasuries and Empire reserve
- **Legacy Program** — legacy benefits (NEVER described as guaranteed insurance)
- **Quests & Challenges** — expanded mission system
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
