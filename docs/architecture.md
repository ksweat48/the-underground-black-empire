# Architecture

## Overview

The Underground Black Empire is a modular monolith built on Vite + React + TypeScript, with Supabase as the backend for data, auth, and edge functions. It deploys to Netlify with GitHub as the source of truth.

## Key Principles

- **Single Source of Truth (SSOT):** Every business rule lives in one authoritative config module under `src/config/`. UI and backend both read from the same definitions.
- **Server-Authoritative:** Influence, member numbers, referrals, treasury, and all sensitive calculations are validated and computed on the server. The client never writes authoritative state.
- **Modular Monolith:** Code is organized by business domain, not by file type. Each domain owns its types, services, queries, and UI. No premature microservices.
- **Append-Only Ledgers:** Financial and influence-sensitive systems use append-only ledger records. Balances are derived, never overwritten without history.

## Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Build | Vite | Fast dev server, small bundles, already in template |
| UI | React + Tailwind CSS | Component model + utility-first styling, already in template |
| Icons | lucide-react | Single icon set, already in template |
| Routing | react-router-dom | Lightweight, lazy-loading support |
| Validation | zod | Shared schemas between client and edge functions |
| Backend | Supabase | Postgres, auth, edge functions, RLS — all in one |
| Hosting | Netlify | Preview deploys, production builds, build hooks |

## Domain Boundaries

- `src/config/` — SSOT for all domain rules, feature flags, permissions, navigation
- `src/domains/identity/` — auth context, session, sign-in/sign-up
- `src/domains/founder-campaign/` — landing, cities, dashboard, leaderboard, missions, referrals
- `src/domains/market/` — listings, organizations, events, updates, comments, likes/favorites
- `src/domains/leadership/` — nominations, elections, Metro Council
- `src/domains/initiatives/` — Metro initiative voting, ranking, ballots, results
- `src/domains/treasury/` — Metro Treasury balances, capacity, ledger, releases
- `src/domains/membership/` — tiers, subscriptions, voting credits, partner program
- `src/domains/notifications/` — member notifications and alerts
- `src/domains/admin/` — admin console, moderation, reporting
- `src/shared/` — reusable infrastructure only (Supabase client, error handling, layout, UI primitives)
- `supabase/migrations/` — versioned SQL migrations
- `supabase/functions/` — edge functions for server-side logic

## Data Flow

1. Client reads from Supabase via the anon-key client (RLS-enforced).
2. Sensitive mutations go through SECURITY DEFINER functions or edge functions (server-side validation).
3. Append-only ledgers record every Influence, referral, and financial change.
4. Derived balances are computed from ledger sums, never stored directly.

## Membership System — Two-Axis Model

Membership Tier and Empire Level are two independent axes that together determine a member's experience. This separation is critical and must not be conflated.

### Axis 1: Membership Tier (Chosen)

- A member freely chooses their membership tier at any time — upgrade, downgrade, or switch between any of the six tiers (White, Black, Black+, Black Pro, Arch Member, Arch Pro).
- Membership tier determines: monthly Initiative Voting Credits, digital card color, and which benefit categories the member is entitled to.
- White is free. All other tiers have a monthly Stripe subscription.
- Arch and Arch Pro provide the same 10 voting credits as Black Pro. Their additional value is VIP prestige and recognition, not additional governance power.

### Axis 2: Empire Level (Earned)

- Empire Level is earned through participation (Influence). It cannot be purchased.
- Empire Level determines: Voting Power multiplier, and whether certain tier benefits are actually activated (treasury access, leadership eligibility, family/legacy benefits, etc.).
- The existing systems (treasury, leadership, family benefits, legacy) each have their own eligibility criteria that may reference Empire Level. Those systems remain the authority for when a feature activates.

### How They Interact

- A member can hold an Arch Pro membership but still not have treasury access if the treasury system requires a higher Empire Level.
- A member can have a high Empire Level but still not have voting credits if they are on the free White tier.
- **Membership Tier = what you choose to pay for. Empire Level = what you earn. Feature Availability = requires both the tier AND the level, determined by each feature's own eligibility rules.**

### Tier Change Flows

1. **White to Paid (upgrade):** Stripe checkout creates a new subscription. The webhook sets the tier on `checkout.session.completed`. Takes effect immediately.

2. **Paid to Paid (switch):** The Stripe checkout edge function detects an existing active subscription and updates the subscription item's price with `proration_behavior: 'none'`. The change takes effect at the **next billing cycle**. The webhook fires `subscription.updated` at the cycle boundary and updates the tier in the database. The member keeps their current tier's benefits until then.

3. **Paid to White (downgrade):** The stripe-cancel edge function immediately cancels the Stripe subscription and calls the `change_membership_tier` database function to set the tier to White. This takes effect **immediately**. The member loses paid-tier benefits right away. The webhook also fires `subscription.deleted` as confirmation.

### Initiative Voting Credits

Voting credits are issued monthly on each member's personal anniversary date (the day of the month they first upgraded to a paid tier). Credits accumulate and carry forward if unused, capped at a maximum balance of 30. The amounts are:

| Tier | Monthly Credits |
|---|---|
| White Card | 0 |
| Black Card | 4 |
| Black+ | 7 |
| Black Pro | 10 |
| Arch Member | 10 |
| Arch Pro | 10 |

A daily pg_cron job at midnight UTC grants credits to members whose anniversary falls on that day. New paid members receive their first credits immediately on checkout via the `grant_initial_voting_credits` function. Every grant and spend is recorded in the `voting_credit_ledger` append-only table for full auditability.

Credits are for **Metro Initiative Voting only**. Leadership Elections and Empire-Wide Votes do not consume credits.

### Security

- The `membership_tier` column on `members` is not directly writable by the client (locked down via column-level privileges).
- Tier changes go through the `change_membership_tier` SECURITY DEFINER function, which validates the target tier and only modifies the calling user's own row.
- Stripe subscription lifecycle is managed entirely by edge functions using the service role key.

## Empire Progression

The Empire advances through **Qualified Metro count** only. A Metro qualifies at
100 active members. The civilization stages are:

| Stage | Qualified Metros |
|---|---|
| Outpost | 0 (prelaunch) |
| Settlement | 1 |
| Village | 3 |
| Province | 5 |
| Kingdom | 10 |
| Dominion | 25 |
| Empire | 50 |

Cities do not have named levels. Metro Treasury capacity is permanent once
unlocked and never decreases. See `docs/empire-progression.md` for full details.

## Voting Systems

Three separate voting systems, each with distinct mechanics:

1. **Metro Initiative Voting** — Uses Initiative Voting Credits (1 per initiative, up to 5 per 48-hour cycle). Black Card+ only. +25 Influence per cycle.
2. **Metro Leadership Elections** — Free automatic ballot, up to 7 candidates. Black Card+ only. +25 Influence per election.
3. **Empire-Wide Votes** — Free automatic ballot, Yes/No format, 7 days. Black Card+ only. +25 Influence per vote.

See `docs/voting-systems.md` for full details.

## News Publishing

Only active elected Metro leadership may publish local/Metro News. Empire-wide
News may only be published by the Founder/Admin or authorized Media & Public
Affairs EAC members. Normal members do not publish News.

## Event Check-ins

Event Check-ins are removed from V1. They are not used for Influence,
Marketplace ranking, initiative ranking, or any current progression system.

## Current Extension Points

- `src/domains/market/` owns listings, organizations, events, updates, comments, likes/favorites, contact actions, ranking inputs, and Market detail views.
- `src/domains/leadership/` owns nomination eligibility, nomination submission, nomination counts, election ballots, and Metro Council display.
- `src/domains/initiatives/` owns initiative creation, ranking, backing, voting cycles, ballots, results, and admin review.
- `src/domains/treasury/` owns Metro Treasury balances, capacity, ledger entries, and funding releases.
- `src/domains/membership/` owns tier selection, Stripe checkout, voting credits, and the partner program.
- `src/shared/components/` owns reusable presentation behavior such as the contact action row, engagement controls, nomination dialog, and modal primitives.
- `supabase/migrations/` remains the authoritative history for all schema changes.

### Market Engagement Invariants

- The visible post actions are Like/Favorite, Comment, and Nominate.
- Like/Favorite is one action and one engagement signal; separate Save and Boost controls are retired from the product interface.
- Contact actions remain separate from engagement actions, with phone and website links aligned to the left and engagement controls aligned to the right on the same row.
- Nominations target the member who authored or owns the post, never the business or organization name.
- Leadership nomination acceptance is available only after the member satisfies the server-enforced eligibility requirements.
- Ranking uses likes, recent likes, freshness, and verification. Comments remain visible counters but do not overpower likes in ranking. Event check-ins are removed from V1.

Each domain follows the same structure: types, services, queries, UI, and documentation of its authoritative rules.
