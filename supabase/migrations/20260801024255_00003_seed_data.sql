/*
# Seed Data: Initial Cities and Feature Flags

## Purpose
Populates the database with:
1. Eight initial cities for the Founder Campaign (major US metros)
2. City progress rows for each city (all starting at settlement tier with 0 founders)
3. Feature flag rows matching the frontend config (all Founder Campaign flags active, all post-launch flags locked)

## New Data

### Cities (8 rows)
- Atlanta, GA
- Chicago, IL
- Houston, TX
- Los Angeles, CA
- Miami, FL
- New York, NY
- Philadelphia, PA
- Phoenix, AZ

Each city gets a corresponding city_progress row.

### Feature Flags (17 rows)
Matches the FeatureKey type in src/config/feature-flags.ts:
- 7 active flags (founder_campaign, referrals, founder_leaderboard, founder_missions, city_progression, empire_progression, admin_controls)
- 10 locked flags (archetype_selection, market_listings, local_voting, treasury_distributions, legacy_grants, elections, merchant_guild, paid_voting_credits, verification, national_empire_actions)

## Security
This migration only inserts data — no schema or policy changes.

## Important Notes
1. This is seed data, separated from production migrations per the architecture spec.
2. All cities start at 'settlement' tier with 0 founders.
3. Feature flag statuses match the frontend config exactly (SSOT alignment).
4. Uses ON CONFLICT to be idempotent — safe to re-run.
*/

-- ==================== SEED CITIES ====================
INSERT INTO cities (name, slug, state, tier, founder_count) VALUES
  ('Atlanta', 'atlanta', 'GA', 'settlement', 0),
  ('Chicago', 'chicago', 'IL', 'settlement', 0),
  ('Houston', 'houston', 'TX', 'settlement', 0),
  ('Los Angeles', 'los-angeles', 'CA', 'settlement', 0),
  ('Miami', 'miami', 'FL', 'settlement', 0),
  ('New York', 'new-york', 'NY', 'settlement', 0),
  ('Philadelphia', 'philadelphia', 'PA', 'settlement', 0),
  ('Phoenix', 'phoenix', 'AZ', 'settlement', 0)
ON CONFLICT (slug) DO NOTHING;

-- ==================== SEED CITY PROGRESS ====================
INSERT INTO city_progress (city_id, founder_count, tier)
SELECT id, 0, 'settlement' FROM cities
ON CONFLICT (city_id) DO NOTHING;

-- ==================== SEED FEATURE FLAGS ====================
INSERT INTO feature_flags (key, label, description, status) VALUES
  -- Active (Founder Campaign)
  ('founder_campaign', 'Founder Campaign', 'Core founder signup, city selection, and progression system', 'active'),
  ('referrals', 'Referral System', 'Founder referral links and verified attribution', 'active'),
  ('founder_leaderboard', 'Founder Leaderboard', 'Ranking of founders by XP and referrals', 'active'),
  ('founder_missions', 'Founder Missions', 'Quests and challenges for founders to earn XP', 'active'),
  ('city_progression', 'City Progression', 'City growth from settlement to Tribe status', 'active'),
  ('empire_progression', 'Empire Progression', 'Empire unlock at 50 Tribe cities with 100 founders each', 'active'),
  ('admin_controls', 'Admin Controls', 'Administrative controls and reporting', 'active'),
  -- Locked (Post-Launch)
  ('archetype_selection', 'Archetype Selection', 'Choose your role within the Empire', 'locked'),
  ('market_listings', 'Market Listings', 'Buy, sell, and trade within the Empire', 'locked'),
  ('local_voting', 'Local Voting', 'City-level voting on community decisions', 'locked'),
  ('treasury_distributions', 'Treasury Distributions', 'City treasury fund allocations', 'locked'),
  ('legacy_grants', 'Legacy Grants', 'Legacy program benefits and support', 'locked'),
  ('elections', 'Elections', 'City and metro leadership elections', 'locked'),
  ('merchant_guild', 'Merchant Guild', 'Guild transactions and merchant activities', 'locked'),
  ('paid_voting_credits', 'Paid Voting Credits', 'Purchase voting credits for elections', 'locked'),
  ('verification', 'Verification', 'Verified member status and trust system', 'locked'),
  ('national_empire_actions', 'National Empire Actions', 'Empire-wide initiatives and programs', 'locked')
ON CONFLICT (key) DO NOTHING;
