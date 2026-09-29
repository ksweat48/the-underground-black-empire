/*
# Lock Down app_secrets and Sensitive Member Columns

## Purpose
Fixes three critical security issues identified in the go-live audit:

1. **app_secrets table publicly readable/writable** — The table had RLS enabled
   but zero policies, and anon+authenticated had full CRUD grants. Anyone could
   read the Stripe webhook signing secret. This revokes all privileges from
   anon and authenticated and leaves the table accessible only to the service
   role (which bypasses RLS).

2. **Members can self-upgrade membership tier** — The members UPDATE policy
   allowed users to change all columns on their own row, including
   membership_tier, stripe_customer_id, stripe_subscription_id, and
   stripe_subscription_status. This narrows the column-level UPDATE grant
   to only user-editable columns, revoking write access to sensitive columns.

3. **is_admin column on members** — Also revoked from client UPDATE to
   prevent privilege escalation.

## Changes

### app_secrets
- REVOKE all privileges from anon and authenticated roles.
- No policies needed — the table is only accessed by the service role
  (edge functions using SUPABASE_SERVICE_ROLE_KEY).

### members (column-level UPDATE restriction)
- REVOKE UPDATE on the entire members table from authenticated.
- GRANT UPDATE only on user-editable columns: display_name, avatar_url,
  occupation, leadership_opt_in.
- Sensitive columns (membership_tier, stripe_*, is_admin, founder_number,
  member_number, is_founder, onboarding_complete, etc.) are now only
  writable through SECURITY DEFINER functions (which run as the table
  owner and bypass RLS).

## Security Notes
- The existing UPDATE policy "update_own_member" on members still exists
  and controls WHICH rows a user can update (only their own). The
  column-level grant now controls WHICH COLUMNS they can update.
- Column privileges are checked BEFORE row-level policies, so even though
  the policy allows updating the user's own row, the revoked columns
  are still protected.
- All legitimate writes to sensitive columns go through existing
  SECURITY DEFINER RPC functions (update_member_profile, create_member,
  etc.) which run with elevated privileges.
*/

-- 1. Lock down app_secrets: revoke all access from anon and authenticated
REVOKE ALL ON public.app_secrets FROM anon;
REVOKE ALL ON public.app_secrets FROM authenticated;

-- 2. Lock down sensitive columns on members table
-- First revoke the blanket UPDATE grant
REVOKE UPDATE ON public.members FROM authenticated;

-- Re-grant UPDATE only on user-editable columns
GRANT UPDATE (
  display_name,
  avatar_url,
  occupation,
  leadership_opt_in
) ON public.members TO authenticated;
