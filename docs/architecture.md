# Architecture

## Overview

The Underground Black Empire is a modular monolith built on Vite + React + TypeScript, with Supabase as the backend for data, auth, and edge functions. It deploys to Netlify with GitHub as the source of truth.

## Key Principles

- **Single Source of Truth (SSOT):** Every business rule lives in one authoritative config module under `src/config/`. UI and backend both read from the same definitions.
- **Server-Authoritative:** XP, founder numbers, referrals, treasury, and all sensitive calculations are validated and computed on the server. The client never writes authoritative state.
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
3. Append-only ledgers record every XP, referral, and financial change.
4. Derived balances are computed from ledger sums, never stored directly.

## Future Extension Points

- Post-launch domains (organizations, market, voting, treasury, elections, legacy) are clean extension points — not built, not stubbed with fake behavior.
- Each new domain follows the same structure: types, services, queries, UI.
