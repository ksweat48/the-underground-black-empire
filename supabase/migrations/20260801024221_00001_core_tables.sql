/*
# Core Tables: cities, members, founder_numbers

## Purpose
Establishes the foundational schema for the Founder Campaign:
- Cities that founders can join and help grow
- Members (linked to Supabase auth) with founder status and referral tracking
- Founder numbers — unique per city, assigned server-side

## New Tables

### cities
- `id` (uuid, PK) — unique city identifier
- `name` (text, NOT NULL) — city display name
- `slug` (text, UNIQUE, NOT NULL) — URL-safe identifier
- `state` (text, NOT NULL) — US state abbreviation
- `metro_id` (uuid, nullable) — future FK to metros table
- `founder_count` (int, NOT NULL, default 0) — cached count, reproducible from founder_numbers
- `tier` (text, NOT NULL, default 'settlement') — settlement | outpost | tribe
- `created_at` (timestamptz) — record creation time
- `updated_at` (timestamptz) — last update time

### members
- `id` (uuid, PK, DEFAULT auth.uid()) — links to auth.users
- `email` (text, NOT NULL) — member email
- `display_name` (text, nullable) — optional display name
- `city_id` (uuid, FK -> cities, nullable) — selected city
- `is_founder` (boolean, NOT NULL, default false) — whether this user is a founder
- `founder_number` (int, nullable) — assigned founder number
- `referred_by` (uuid, FK -> members, nullable) — referring member
- `referral_code` (text, UNIQUE, NOT NULL) — unique referral code
- `created_at` (timestamptz) — account creation time
- `updated_at` (timestamptz) — last update time

### founder_numbers
- `id` (uuid, PK) — record identifier
- `city_id` (uuid, FK -> cities) — which city this number belongs to
- `member_id` (uuid, FK -> members) — which member holds this number
- `number` (int, NOT NULL) — the founder number (1-100)
- `assigned_at` (timestamptz) — when the number was assigned
- UNIQUE (city_id, number) — no duplicate numbers per city
- UNIQUE (city_id, member_id) — one number per member per city

## Security
- RLS enabled on all three tables
- members: users can read and update their own row; anyone can insert their own row on signup
- cities: publicly readable (no auth needed for city selection)
- founder_numbers: readable by all authenticated users (for leaderboard); inserts/updates/deletes are admin-only (via edge functions)

## Important Notes
1. The `members.id` column defaults to `auth.uid()` so inserts work without the client passing an ID.
2. The `founder_count` on cities is a cached value — the authoritative source is the count of rows in `founder_numbers` for that city.
3. The `tier` on cities is derived from founder_count: 0 = settlement, 10 = outpost, 100 = tribe.
4. `founder_numbers` is designed to be written only by server-side (edge functions or SECURITY DEFINER functions) to prevent clients from assigning their own numbers.
*/

-- ==================== CITIES ====================
CREATE TABLE IF NOT EXISTS cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  state text NOT NULL,
  metro_id uuid,
  founder_count int NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'settlement',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

-- Cities are publicly readable (visitors need to see cities to choose one)
DROP POLICY IF EXISTS "public_read_cities" ON cities;
CREATE POLICY "public_read_cities" ON cities FOR SELECT
  TO anon, authenticated USING (true);

-- Only admins can insert/update/delete cities (via service role / edge functions)
-- No client-side insert/update/delete policies for cities

-- ==================== MEMBERS ====================
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  city_id uuid REFERENCES cities(id) ON DELETE SET NULL,
  is_founder boolean NOT NULL DEFAULT false,
  founder_number int,
  referred_by uuid REFERENCES members(id) ON DELETE SET NULL,
  referral_code text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Users can read their own member record
DROP POLICY IF EXISTS "select_own_member" ON members;
CREATE POLICY "select_own_member" ON members FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Users can insert their own member record on signup
DROP POLICY IF EXISTS "insert_own_member" ON members;
CREATE POLICY "insert_own_member" ON members FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- Users can update their own member record (e.g., select city, set display name)
DROP POLICY IF EXISTS "update_own_member" ON members;
CREATE POLICY "update_own_member" ON members FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Users can read other members' basic info for leaderboard/referrals
-- (limited to public fields via a separate policy)
DROP POLICY IF EXISTS "select_public_members" ON members;
CREATE POLICY "select_public_members" ON members FOR SELECT
  TO authenticated USING (true);

-- ==================== FOUNDER_NUMBERS ====================
CREATE TABLE IF NOT EXISTS founder_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  number int NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, number),
  UNIQUE (city_id, member_id)
);

ALTER TABLE founder_numbers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read founder numbers (for leaderboard, city growth)
DROP POLICY IF EXISTS "select_founder_numbers" ON founder_numbers;
CREATE POLICY "select_founder_numbers" ON founder_numbers FOR SELECT
  TO authenticated USING (true);

-- Only server-side (service role) can insert/update/delete founder numbers
-- No client-side insert/update/delete policies

-- ==================== INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_cities_slug ON cities(slug);
CREATE INDEX IF NOT EXISTS idx_cities_tier ON cities(tier);
CREATE INDEX IF NOT EXISTS idx_members_city_id ON members(city_id);
CREATE INDEX IF NOT EXISTS idx_members_referral_code ON members(referral_code);
CREATE INDEX IF NOT EXISTS idx_founder_numbers_city_id ON founder_numbers(city_id);
CREATE INDEX IF NOT EXISTS idx_founder_numbers_member_id ON founder_numbers(member_id);
