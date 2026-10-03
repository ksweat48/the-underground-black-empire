# Data Model

## Core Tables

### cities
- `id` uuid PK
- `name` text NOT NULL
- `slug` text UNIQUE NOT NULL
- `state` text NOT NULL
- `metro_id` uuid FK -> metros (nullable)
- `canonical_status` text NOT NULL DEFAULT 'active'
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

Cities do not have named levels. They display member population, amount raised,
businesses/organizations, and Metro affiliation.

### metros
- `id` uuid PK
- `name` text NOT NULL
- `slug` text UNIQUE NOT NULL
- `state` text NOT NULL
- `timezone` text NOT NULL DEFAULT 'America/New_York'
- `population` int NOT NULL DEFAULT 0 (cached count of active members)
- `qualified` boolean NOT NULL DEFAULT false (true when population >= 100)
- `highest_treasury_capacity_cents` bigint NOT NULL DEFAULT 0 (permanent unlock)
- `created_at` timestamptz DEFAULT now()

### members
- `id` uuid PK DEFAULT auth.uid() (FK -> auth.users)
- `display_name` text
- `city_id` uuid FK -> cities (nullable until city selected)
- `is_founder` boolean NOT NULL DEFAULT false
- `member_number` int (nullable until assigned server-side)
- `referred_by` uuid FK -> members (nullable)
- `referral_code` text UNIQUE NOT NULL
- `membership_tier` text NOT NULL DEFAULT 'white' (writable only via `change_membership_tier`)
- `membership_started_at` timestamptz (nullable)
- `stripe_customer_id` text (nullable)
- `stripe_subscription_id` text (nullable)
- `stripe_subscription_status` text DEFAULT 'inactive'
- `avatar_url` text (nullable)
- `onboarding_complete` boolean NOT NULL DEFAULT false
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

### referrals
- `id` uuid PK
- `referring_member_id` uuid FK -> members
- `referred_member_id` uuid FK -> members
- `referral_code` text NOT NULL
- `status` text NOT NULL DEFAULT 'pending' (pending | verified | rejected)
- `verified_at` timestamptz (nullable)
- `created_at` timestamptz DEFAULT now()

### influence_ledger (append-only)
- `id` uuid PK
- `member_id` uuid FK -> members
- `amount` int NOT NULL (positive for awards, negative for reversals)
- `source` text NOT NULL (signup_completed | city_selected | marketplace_like | news_like | ballot_participation | leadership_ballot | verified_referral | builder_listing_approved | official_news_contribution | reversal)
- `event_type` text (nullable)
- `reference_id` uuid (nullable, links to source record)
- `idempotency_key` text UNIQUE (nullable, prevents double-awards)
- `notes` text (nullable)
- `created_at` timestamptz DEFAULT now()
- **Never UPDATEd or DELETEd.** Reversals are new negative rows.
- Influence is the single progression currency. Level and Voting Power are derived from total Influence.
- **Removed sources:** ~~city_level_upgrade~~, ~~empire_level_upgrade~~, ~~event_checkin_verified~~, ~~mission_completed~~, ~~verified_event_hosted~~ — these are no longer awarded.

### empire_progress (cached)
- `id` int PK DEFAULT 1 (singleton)
- `qualified_metro_count` int NOT NULL DEFAULT 0 — Metros with population >= 100
- `total_population` int NOT NULL DEFAULT 0 — ALL members
- `empire_stage` text NOT NULL DEFAULT 'outpost'
- `updated_at` timestamptz DEFAULT now()
- Refreshable via `refresh_empire_progress()`.
- **Removed:** ~~tribe_city_count~~, ~~total_founders~~ — no longer used.

### feature_flags
- `key` text PK
- `label` text NOT NULL
- `description` text NOT NULL
- `status` text NOT NULL DEFAULT 'active' (active | locked | disabled)
- `updated_at` timestamptz DEFAULT now()
- `updated_by` uuid FK -> auth.users (nullable)

### audit_log (append-only)
- `id` uuid PK
- `actor_id` uuid FK -> auth.users
- `action` text NOT NULL
- `target_type` text (nullable)
- `target_id` uuid (nullable)
- `metadata` jsonb (nullable)
- `created_at` timestamptz DEFAULT now()
- **Never UPDATEd or DELETEd.**

## Membership Tables

### membership_tiers (reference)
- `id` text PK (white | black | black_plus | black_pro | arch | arch_pro)
- `display_name` text NOT NULL
- `public_label` text NOT NULL
- `price_monthly` integer NOT NULL DEFAULT 0 (in whole dollars)
- `voting_credits` integer NOT NULL DEFAULT 0
- `card_color` text NOT NULL
- `purpose` text NOT NULL
- `sort_order` integer NOT NULL DEFAULT 0
- `stripe_price_id` text (nullable — null for free tier)

### voting_credits
- `member_id` uuid PK FK -> members (ON DELETE CASCADE)
- `balance` integer NOT NULL DEFAULT 0
- `last_reset_date` date (nullable) — last date credits were granted
- `updated_at` timestamptz DEFAULT now()

### voting_credit_ledger (append-only)
- `id` uuid PK DEFAULT gen_random_uuid()
- `member_id` uuid FK -> members (ON DELETE CASCADE)
- `amount` int NOT NULL (positive for grants, negative for spends)
- `source` text NOT NULL (monthly_grant | initial_grant | initiative_vote_spend | initiative_vote_refund)
- `reference_id` uuid (nullable, links to initiative ballot for spends)
- `created_at` timestamptz DEFAULT now()
- **Never UPDATEd or DELETEd.**
- RLS: members can read their own entries. All writes go through SECURITY DEFINER functions.

### legacy_fund
- `id` integer PK DEFAULT 1 (singleton)
- `total_reserve` numeric NOT NULL DEFAULT 0
- `updated_at` timestamptz DEFAULT now()

### stripe_payment_events (append-only audit)
- `id` uuid PK DEFAULT gen_random_uuid()
- `member_id` uuid FK -> members (ON DELETE CASCADE)
- `stripe_event_id` text UNIQUE NOT NULL
- `event_type` text NOT NULL
- `subscription_id` text (nullable)
- `customer_id` text (nullable)
- `amount_total` bigint (nullable)
- `currency` text (nullable)
- `tier_id` text (nullable)
- `created_at` timestamptz DEFAULT now()

### change_membership_tier function (SECURITY DEFINER)
- Accepts a target tier ID, validates it exists, and updates the calling member's own row.
- When downgrading to White: clears `membership_started_at`, sets `stripe_subscription_status` to 'canceled'.
- When upgrading/switching: preserves `membership_started_at` if already set, otherwise sets it to now().
- EXECUTE granted to `authenticated` role only.

### grant_monthly_voting_credits function (SECURITY DEFINER)
- Runs daily via pg_cron at midnight UTC.
- Grants credits to paid members whose anniversary (day-of-month of `membership_started_at`) falls on today.
- Handles short-month edge cases: if anniversary is 31st but month has 30 days, grants on the last day.
- Idempotent: skips members already granted this month via `last_reset_date` check.
- **30-credit rollover cap:** balance is capped at 30 after grant.
- EXECUTE granted to `service_role`.

### grant_initial_voting_credits function (SECURITY DEFINER)
- Called after a member's first paid checkout to grant credits immediately.
- Only grants if `last_reset_date` is null (no prior grant), preventing double-grants.
- **30-credit cap** applied on initial grant.
- EXECUTE granted to `service_role`.

## Monthly Initiative Voting Credits

| Tier | Monthly Credits |
|---|---|
| White Card | 0 |
| Black Card | 4 |
| Black+ | 7 |
| Black Pro | 10 |
| Arch Member | 10 |
| Arch Pro | 10 |

Credits are for Metro Initiative voting only. Unused credits carry forward,
capped at a maximum balance of 30. Arch and Arch Pro receive the same 10
credits as Black Pro — their additional value is prestige and VIP recognition.

## Market and Engagement Tables

### market_listings
Listings represent member-owned businesses, services, products, and events
surfaced in the Market. Each listing stores its owner, city, category,
description, contact information, external website, image, review status,
verification status, and engagement counters.

### organizations
Organizations represent member-owned community and mission-based groups. They
use the same member, city, review, verification, contact, image, and engagement
concepts as listings, with additional fundraising and organization-type fields.

### listing_likes and organization_likes
Likes are the single visible favorite action. A member can have one like per
listing or organization. Separate Save and Boost actions are retired.

### listing_comments and organization_comments
Comments are visible engagement records attached to a listing or organization.
They contribute to displayed comment counts and remain available through the
expandable engagement control.

### market_ranking_cache
The ranking cache stores recent and lifetime engagement totals, freshness,
verification, computed score, city, and computation time for approved listings.
The current score prioritizes lifetime likes and recent likes, then adds
freshness and verification support. **Event check-ins are removed from V1 and
do not contribute to ranking.**

## Leadership Data

### leadership_election_cycles
- `id` uuid PK
- `metro_id` uuid FK -> metros
- `phase` text NOT NULL (nomination | election | finalized)
- `seats` int NOT NULL DEFAULT 7
- `nomination_opens_at` timestamptz
- `nomination_closes_at` timestamptz
- `election_opens_at` timestamptz
- `election_closes_at` timestamptz
- `created_at` timestamptz DEFAULT now()

### leadership_nominations
- `id` uuid PK
- `cycle_id` uuid FK -> leadership_election_cycles
- `nominator_id` uuid FK -> members
- `candidate_id` uuid FK -> members
- `created_at` timestamptz DEFAULT now()

### leadership_candidates
- `id` uuid PK
- `cycle_id` uuid FK -> leadership_election_cycles
- `member_id` uuid FK -> members
- `service_statement` text
- `nomination_count` int
- `influence_at_nomination` int
- `created_at` timestamptz DEFAULT now()

### leadership_ballots
- `id` uuid PK
- `cycle_id` uuid FK -> leadership_election_cycles
- `voter_id` uuid FK -> members
- `selected_candidate_ids` uuid[] NOT NULL
- `created_at` timestamptz DEFAULT now()

### metro_council
- `metro_id` uuid FK -> metros
- `member_id` uuid FK -> members
- `seat_number` int NOT NULL
- `vote_count` int
- `seated_at` timestamptz DEFAULT now()

## Metro Treasury Tables

### metro_treasury_ledger (append-only)
- `id` uuid PK
- `metro_id` uuid FK -> metros
- `entry_type` text NOT NULL (contribution | reservation | release | refund | adjustment)
- `amount_cents` bigint NOT NULL
- `city_id` uuid (nullable, for city contribution attribution)
- `reference_id` uuid (nullable)
- `note` text (nullable)
- `created_at` timestamptz DEFAULT now()

### metro_treasury_capacity
- `metro_id` uuid PK FK -> metros
- `highest_capacity_cents` bigint NOT NULL DEFAULT 0 (permanent, never decreases)
- `updated_at` timestamptz DEFAULT now()

## Initiative Tables

### initiatives
- `id` uuid PK
- `organization_id` uuid FK -> organizations
- `metro_id` uuid FK -> metros
- `title` text NOT NULL
- `description` text
- `impact` text
- `timeline` text
- `conflict_disclosure` text
- `amount_requested_cents` bigint NOT NULL
- `funded_cents` bigint NOT NULL DEFAULT 0
- `status` text NOT NULL (submitted | eligible | in_voting | awaiting_review | awaiting_funding | funded | completed | disqualified | withdrawn | deferred)
- `staged_funding_approved` boolean NOT NULL DEFAULT false
- `payment_reference` text (nullable)
- `funded_at` timestamptz (nullable)
- `completed_at` timestamptz (nullable)
- `created_at` timestamptz DEFAULT now()

### initiative_cycles
- `id` uuid PK
- `metro_id` uuid FK -> metros
- `opens_at` timestamptz NOT NULL
- `closes_at` timestamptz NOT NULL
- `status` text NOT NULL (open | results_posted | skipped | cancelled)
- `skip_reason` text (nullable)
- `cancel_reason` text (nullable)
- `eligible_voter_count` int (nullable)
- `quorum_required` int (nullable)
- `ballot_count` int (nullable)
- `quorum_met` boolean (nullable)
- `results_posted_at` timestamptz (nullable)
- `created_at` timestamptz DEFAULT now()

### initiative_cycle_entries
- `cycle_id` uuid FK -> initiative_cycles
- `initiative_id` uuid FK -> initiatives
- `frozen_rank` int NOT NULL
- `final_rank` int (nullable)
- `support_ballots` int (nullable)
- `weighted_support` numeric (nullable)
- `outcome` text NOT NULL

### initiative_ballots
- `id` uuid PK
- `cycle_id` uuid FK -> initiative_cycles
- `member_id` uuid FK -> members
- `voting_power` numeric NOT NULL
- `credits_spent` int NOT NULL
- `selections` uuid[] NOT NULL (initiative IDs)
- `submitted_at` timestamptz DEFAULT now()

### initiative_backers
- `initiative_id` uuid FK -> initiatives
- `member_id` uuid FK -> members
- `created_at` timestamptz DEFAULT now()

## Conventions

- All IDs are uuid, defaulting to `gen_random_uuid()`.
- All timestamps are `timestamptz`, defaulting to `now()`.
- Money is stored as integer minor units (cents). Never floating-point.
- Status fields use text enums, not Postgres enum types (for migration flexibility).
- Soft deletion is NOT used by default; append-only ledgers handle history.
- RLS is enabled on every table with real ownership predicates.
