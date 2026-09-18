# Domains

## Active Domains (Founder Campaign)

### Identity (`src/domains/identity/`)
- Auth context, session management, sign-in/sign-up
- Uses Supabase email/password auth
- Owner columns default to `auth.uid()`

### Founder Campaign (`src/domains/founder-campaign/`)
- Landing page ("The Empire Is Forming")
- City selection
- Founder account creation
- Founder dashboard ("The Empire")
- City growth tracking
- Founder journey timeline
- Founder leaderboard
- Founder missions
- Referral links and verified attribution
- Empire progression toward 50 Tribe cities

### Admin (`src/domains/admin/`)
- Administrative controls
- Basic reporting (founder counts, city counts, XP awarded)
- Feature flag visibility
- Audit log (structure in place, populated by edge functions)

## Future Domains (Post-Launch)

These domains are not yet built. They are clean extension points:

- **Members** — member profiles and status
- **Cities** (expanded) — full city management, metro regions
- **Empire Progression** (expanded) — national empire actions
- **Organizations** — organization listings and community building
- **Influence** (expanded) — influence ledger with referral and voting awards
- **Content & Support** — support content system
- **Market Listings** — buy/sell/trade
- **Events & Programs** — events and community programs
- **Voting** — local voting with voting credits
- **City Treasuries** — treasury fund management
- **Empire Reserve** — empire-level reserve
- **Legacy Program** — legacy benefits (NEVER described as guaranteed insurance)
- **Governance & Elections** — city/metro leadership elections
- **Quests & Challenges** — expanded mission system
- **Rankings** — expanded leaderboard system
- **Notifications** — batched notification system
- **Verification & Trust** — verified member status
- **Impact Tracking** — community impact metrics

## Shared Infrastructure (`src/shared/`)

Reusable only — no business rules:
- Supabase client singleton
- Error handling and parsing
- Layout, Header, Footer components
- UI primitives (locked feature cards, CTA sections)
- `cn` class name utility
