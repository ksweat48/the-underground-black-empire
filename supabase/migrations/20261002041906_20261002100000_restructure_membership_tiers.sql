/*
# Restructure Membership Tiers — 6-Tier System

## Purpose
Replaces the old 5-tier membership system (White, Black, Black+, Emerald, Plum) with
a new 6-tier system that separates functional benefits (Black tiers) from prestige/VIP
recognition (Arch tiers). No paid members exist, so this is a clean replacement.

## Changes to membership_tiers rows
- White Card — Free ($0), 0 voting credits, white card
- Black Card — $5/month, 10 voting credits, black card
- Black Card+ — $10/month, 25 voting credits, black card
- Black Card Pro — $20/month, 25 voting credits, black card
- Arch Member — $50/month, 0 voting credits (VIP prestige only), emerald card
- Arch Pro Member — $100/month, 0 voting credits (VIP prestige only), plum card

The old Emerald and Plum tier IDs are replaced with `arch` and `arch_pro`.
The old price IDs are cleared — new Stripe products/prices will be created.

## New columns on membership_tiers
- `commission_amount_cents` (integer, default 0) — the monthly Partner commission
  amount in cents when a referred member holds this tier.

## Modified tables
- `membership_tiers` — upsert all 6 rows with new pricing, names, and commission amounts.
  Old emerald/plum rows are deleted since no members hold those tiers.

## Important Notes
1. No paid members exist, so deleting old emerald/plum rows is safe.
2. Arch tiers get zero voting credits — they are about prestige and recognition only.
3. Black Card Pro gets 25 voting credits (same as Black+) — it adds Family & Legacy
   eligibility, not extra voting power.
4. commission_amount_cents stores the per-referral monthly commission for the
   Empire Partner program (e.g. Black Card = 100 cents = $1/month).
*/

-- Add commission_amount_cents column to membership_tiers
ALTER TABLE membership_tiers
  ADD COLUMN IF NOT EXISTS commission_amount_cents integer NOT NULL DEFAULT 0;

-- Remove old tier rows that no one holds
DELETE FROM membership_tiers WHERE id IN ('emerald', 'plum');

-- Upsert the 6 new tiers
INSERT INTO membership_tiers (id, display_name, public_label, price_monthly, voting_credits, card_color, purpose, sort_order, commission_amount_cents)
VALUES
  ('white',     'White Card',       'White Card Member',       0,   0,  'white',   'Participate',              1,  0),
  ('black',     'Black Card',       'Black Card Member',       5,  10,  'black',   'Contribute',               2,  100),
  ('black_plus','Black Card+',      'Black Card+ Member',     10,  25,  'black',   'Serve',                    3,  200),
  ('black_pro', 'Black Card Pro',   'Black Card Pro Member',  20,  25,  'black',   'Protect Family & Legacy',  4,  400),
  ('arch',      'Arch Member',      'Arch Member',            50,  25,  'emerald', 'VIP Prestige',             5, 1000),
  ('arch_pro',  'Arch Pro Member',  'Arch Pro Member',       100,  25,  'plum',    'VIP Supreme',              6, 2000)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  public_label = EXCLUDED.public_label,
  price_monthly = EXCLUDED.price_monthly,
  voting_credits = EXCLUDED.voting_credits,
  card_color = EXCLUDED.card_color,
  purpose = EXCLUDED.purpose,
  sort_order = EXCLUDED.sort_order,
  commission_amount_cents = EXCLUDED.commission_amount_cents;

-- Clear old stripe_price_id values — new Stripe prices will be created
UPDATE membership_tiers SET stripe_price_id = NULL WHERE stripe_price_id IS NOT NULL;
