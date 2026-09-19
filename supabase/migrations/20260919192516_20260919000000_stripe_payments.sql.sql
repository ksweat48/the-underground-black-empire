-- Add Stripe columns to members table
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text DEFAULT 'inactive';

-- Add stripe_price_id column to membership_tiers
ALTER TABLE membership_tiers
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- Create payment events table for audit
CREATE TABLE IF NOT EXISTS stripe_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  subscription_id text,
  customer_id text,
  amount_total bigint,
  currency text,
  tier_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on new table
ALTER TABLE stripe_payment_events ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read their own payment events
CREATE POLICY "select_own_payment_events" ON stripe_payment_events
  FOR SELECT TO authenticated
  USING (auth.uid() = member_id);

-- No insert/update/delete from client - only edge functions (service role) manage these
-- The service role bypasses RLS, so edge functions can write freely

-- Grant read on stripe_price_id to authenticated (needed to send price to checkout)
-- membership_tiers is already readable by authenticated users
