# Data Model

## Founder Campaign Tables (Milestone B)

### cities
- `id` uuid PK
- `name` text NOT NULL
- `slug` text UNIQUE NOT NULL
- `state` text NOT NULL
- `metro_id` uuid FK -> metros (nullable, future)
- `founder_count` int NOT NULL DEFAULT 0 (cached, reproducible from founder_numbers)
- `tier` text NOT NULL DEFAULT 'settlement' (settlement | outpost | tribe)
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

### members
- `id` uuid PK DEFAULT auth.uid() (FK -> auth.users)
- `email` text NOT NULL
- `display_name` text
- `city_id` uuid FK -> cities (nullable until city selected)
- `is_founder` boolean NOT NULL DEFAULT false
- `founder_number` int (nullable until assigned server-side)
- `referred_by` uuid FK -> members (nullable)
- `referral_code` text UNIQUE NOT NULL
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

### founder_numbers
- `id` uuid PK
- `city_id` uuid FK -> cities
- `member_id` uuid FK -> members
- `number` int NOT NULL
- `assigned_at` timestamptz DEFAULT now()
- UNIQUE (city_id, number) — prevents duplicate founder numbers per city
- UNIQUE (city_id, member_id) — one number per member per city

### referrals
- `id` uuid PK
- `referring_member_id` uuid FK -> members
- `referred_member_id` uuid FK -> members
- `referral_code` text NOT NULL
- `status` text NOT NULL DEFAULT 'pending' (pending | verified | rejected)
- `verified_at` timestamptz (nullable)
- `created_at` timestamptz DEFAULT now()

### xp_ledger (append-only)
- `id` uuid PK
- `member_id` uuid FK -> members
- `amount` int NOT NULL (positive for awards, negative for reversals)
- `source` text NOT NULL (founder_signup | city_selection | referral_verified | mission_completed | admin_adjustment | reversal)
- `reference_id` uuid (nullable, links to source record)
- `notes` text (nullable)
- `created_at` timestamptz DEFAULT now()
- **Never UPDATEd or DELETEd.** Reversals are new negative rows.

### city_progress (cached)
- `city_id` uuid PK FK -> cities
- `founder_count` int NOT NULL DEFAULT 0
- `tier` text NOT NULL DEFAULT 'settlement'
- `updated_at` timestamptz DEFAULT now()
- Refreshable from founder_numbers.

### empire_progress (cached)
- `id` int PK DEFAULT 1 (singleton)
- `tribe_city_count` int NOT NULL DEFAULT 0 — cities with founder_count >= 100
- `total_founders` int NOT NULL DEFAULT 0 — members with member_number (legacy)
- `total_population` int NOT NULL DEFAULT 0 — ALL members (primary population metric)
- `updated_at` timestamptz DEFAULT now()
- Refreshable from cities + members via `refresh_empire_progress()`.

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
- `id` text PK (white | black | black_plus | emerald | plum)
- `display_name` text NOT NULL
- `public_label` text NOT NULL
- `price_monthly` integer NOT NULL DEFAULT 0 (in whole dollars)
- `voting_credits` integer NOT NULL DEFAULT 0
- `card_color` text NOT NULL (white | black | emerald | plum)
- `purpose` text NOT NULL
- `sort_order` integer NOT NULL DEFAULT 0
- `stripe_price_id` text (nullable — null for free tier)

### voting_credits
- `member_id` uuid PK FK -> members (ON DELETE CASCADE)
- `balance` integer NOT NULL DEFAULT 0
- `last_reset_date` date (nullable)
- `updated_at` timestamptz DEFAULT now()

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

### members (membership-related columns)
- `membership_tier` text NOT NULL DEFAULT 'white' — writable only via `change_membership_tier` function
- `membership_started_at` timestamptz (nullable) — set when first joining a paid tier, cleared on downgrade to White
- `stripe_customer_id` text (nullable) — managed by edge functions
- `stripe_subscription_id` text (nullable) — managed by edge functions
- `stripe_subscription_status` text DEFAULT 'inactive' — managed by webhook

### change_membership_tier function (SECURITY DEFINER)
- Accepts a target tier ID, validates it exists, and updates the calling member's own row.
- When downgrading to White: clears `membership_started_at`, sets `stripe_subscription_status` to 'canceled'.
- When upgrading/switching: preserves `membership_started_at` if already set, otherwise sets it to now().
- EXECUTE granted to `authenticated` role only.

## Conventions

- All IDs are uuid, defaulting to `gen_random_uuid()`.
- All timestamps are `timestamptz`, defaulting to `now()`.
- Money is stored as integer minor units (cents). Never floating-point.
- Status fields use text enums, not Postgres enum types (for migration flexibility).
- Soft deletion is NOT used by default; append-only ledgers handle history.
- RLS is enabled on every table with real ownership predicates.
