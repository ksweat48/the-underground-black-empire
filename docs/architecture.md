# Architecture

## Overview

The Underground Black Empire is a modular monolith built on Vite + React + TypeScript, with Supabase as the backend for data, auth, and edge functions. It deploys to Netlify with GitHub as the source of truth.

## Key Principles

- **Single Source of Truth (SSOT):** Every business rule lives in one authoritative config module under `src/config/`. UI and backend both read from the same definitions.
- **Server-Authoritative:** Influence, founder numbers, referrals, treasury, and all sensitive calculations are validated and computed on the server. The client never writes authoritative state.
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
- `src/domains/admin/` — admin console and reporting
- `src/shared/` — reusable infrastructure only (Supabase client, error handling, layout, UI primitives)
- `supabase/migrations/` — versioned SQL migrations
- `supabase/functions/` — edge functions for server-side logic

## Data Flow

1. Client reads from Supabase via the anon-key client (RLS-enforced).
2. Sensitive mutations go through edge functions (server-side validation).
3. Append-only ledgers record every Influence, referral, and financial change.
4. Derived balances are computed from ledger sums, never stored directly.

## Membership System — Two-Axis Model

Membership Tier and Empire Level are two independent axes that together determine a member's experience. This separation is critical and must not be conflated.

### Axis 1: Membership Tier (Chosen)

- A member freely chooses their membership tier at any time — upgrade, downgrade, or switch between any of the five tiers (White, Black, Black+, Emerald, Plum).
- Membership tier determines: monthly voting credits, digital card color, and which benefit categories the member is entitled to.
- White is free. All other tiers have a monthly Stripe subscription.

### Axis 2: Empire Level (Earned)

- Empire Level is earned through participation (Influence). It cannot be purchased.
- Empire Level determines: Voting Power multiplier, and whether certain tier benefits are actually activated (treasury access, leadership eligibility, family/legacy benefits, etc.).
- The existing systems (treasury, leadership, family benefits, legacy) each have their own eligibility criteria that may reference Empire Level. Those systems remain the authority for when a feature activates.

### How They Interact

- A member can hold a Plum membership but still not have treasury access if the treasury system requires a higher Empire Level.
- A member can have a high Empire Level but still not have voting credits if they are on the free White tier.
- **Membership Tier = what you choose to pay for. Empire Level = what you earn. Feature Availability = requires both the tier AND the level, determined by each feature's own eligibility rules.**

### Tier Change Flows

1. **White to Paid (upgrade):** Stripe checkout creates a new subscription. The webhook sets the tier on `checkout.session.completed`. Takes effect immediately.

2. **Paid to Paid (switch):** The Stripe checkout edge function detects an existing active subscription and updates the subscription item's price with `proration_behavior: 'none'`. The change takes effect at the **next billing cycle**. The webhook fires `subscription.updated` at the cycle boundary and updates the tier in the database. The member keeps their current tier's benefits until then.

3. **Paid to White (downgrade):** The stripe-cancel edge function immediately cancels the Stripe subscription and calls the `change_membership_tier` database function to set the tier to White. This takes effect **immediately**. The member loses paid-tier benefits right away. The webhook also fires `subscription.deleted` as confirmation.

### Monthly Voting Credits

Voting credits are issued monthly on each member's personal anniversary date (the day of the month they first upgraded to a paid tier). Credits accumulate and carry forward if unused. The amounts are:
- White: 0 credits
- Black: 10 credits
- Black+: 25 credits
- Emerald: 50 credits
- Plum: 100 credits

A daily pg_cron job at midnight UTC grants credits to members whose anniversary falls on that day. New paid members receive their first credits immediately on checkout via the `grant_initial_voting_credits` function. Every grant and spend is recorded in the `voting_credit_ledger` append-only table for full auditability.

### Security

- The `membership_tier` column on `members` is not directly writable by the client (locked down via column-level privileges).
- Tier changes go through the `change_membership_tier` SECURITY DEFINER function, which validates the target tier and only modifies the calling user's own row.
- Stripe subscription lifecycle is managed entirely by edge functions using the service role key.

## Future Extension Points

- Post-launch domains (organizations, market, voting, treasury, elections, legacy) are clean extension points — not built, not stubbed with fake behavior.
- Each new domain follows the same structure: types, services, queries, UI.
