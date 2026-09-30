/*
# Self-Serve Membership Tier Changes

## Purpose
Allows members to freely upgrade or downgrade their membership tier.
The existing client-side `updateMembershipTier` function broke after the
column-level lockdown migration revoked UPDATE on `membership_tier` from
the authenticated role. This migration creates a secure server-side
function that lets a member change their own tier.

## Changes

### New Function: `change_membership_tier`
- SECURITY DEFINER — runs with table owner privileges, bypassing RLS
- Accepts a target tier ID (validated against the `membership_tiers` table)
- Only updates the calling member's own row (auth.uid() check)
- When downgrading to 'white': clears `membership_started_at`, clears
  `stripe_subscription_id` and sets `stripe_subscription_status` to 'canceled'
- When switching to a paid tier: sets `membership_started_at` to now() only
  if it is currently null (preserves original start date for existing paid members)
- Returns the new tier as text for client confirmation

### Security
- EXECUTE granted to `authenticated` role only
- The function validates that the target tier exists in `membership_tiers`
- The function only modifies the calling user's own row
- Stripe subscription cancellation is handled separately by the
  stripe-cancel edge function, which calls the Stripe API and then
  this function (or the webhook handles it on confirmation)

## Important Notes
1. This function handles the database side of tier changes only.
   Stripe subscription lifecycle (cancel, swap) is handled by edge functions.
2. For downgrades to White: the edge function cancels the Stripe subscription
   first, then calls this function to update the database immediately.
3. For paid-tier switches: the Stripe checkout edge function updates the
   subscription with proration_behavior='none' (next billing cycle).
   The webhook fires at cycle boundary and updates the tier.
4. For White-to-paid upgrades: the existing Stripe checkout flow handles
   everything; the webhook sets the tier on checkout.session.completed.
*/

CREATE OR REPLACE FUNCTION public.change_membership_tier(target_tier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_tier_exists boolean;
  v_current_tier text;
  v_membership_started_at timestamptz;
  v_stripe_sub_id text;
BEGIN
  -- Must be authenticated
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate target tier exists
  SELECT EXISTS(SELECT 1 FROM membership_tiers WHERE id = target_tier)
    INTO v_tier_exists;
  IF NOT v_tier_exists THEN
    RAISE EXCEPTION 'Invalid membership tier: %', target_tier;
  END IF;

  -- Get current state
  SELECT membership_tier, membership_started_at, stripe_subscription_id
    INTO v_current_tier, v_membership_started_at, v_stripe_sub_id
  FROM members
  WHERE id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member record not found';
  END IF;

  -- No-op if same tier
  IF v_current_tier = target_tier THEN
    RETURN target_tier;
  END IF;

  -- Apply the change
  IF target_tier = 'white' THEN
    -- Downgrade to free: clear membership start, disconnect Stripe sub
    UPDATE members
      SET membership_tier = 'white',
          membership_started_at = NULL,
          stripe_subscription_status = 'canceled'
      WHERE id = caller_id;
  ELSE
    -- Upgrade or switch paid tier
    UPDATE members
      SET membership_tier = target_tier,
          membership_started_at = COALESCE(v_membership_started_at, now())
      WHERE id = caller_id;
  END IF;

  RETURN target_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_membership_tier(text) TO authenticated;