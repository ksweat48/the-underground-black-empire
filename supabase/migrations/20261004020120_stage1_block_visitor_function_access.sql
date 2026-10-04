/*
# Stage 1: Block signed-out visitors from privileged functions

## Plain-English summary
Signed-out visitors could previously call many back-end actions directly. This
migration removes that access so only signed-in members (and the system) can
call them. It also closes a hole where a member could change their own
membership tier for free without paying.

## Changes
1. For every privileged (SECURITY DEFINER) function in the public schema:
   - EXECUTE revoked from PUBLIC and anon.
   - EXECUTE granted to authenticated and service_role, but only if the
     function was already callable by authenticated users (functions that
     were locked to the system earlier stay locked).
   - Exceptions kept callable by anon: is_current_user_admin and has_sub_role,
     because row-level policies reference them during visitor reads.
2. change_membership_tier: no longer callable by members. Tier changes come
   only from the payment system (service role).
3. correct_milestone: no longer callable by members; corrections move to the
   admin correction tools.

## Security notes
- No tables, columns, or data are changed.
- Safe to re-run.
*/

DO $$
DECLARE
  r record;
  v_auth_had boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname NOT IN ('is_current_user_admin', 'has_sub_role')
  LOOP
    v_auth_had := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
    IF v_auth_had THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.change_membership_tier(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_membership_tier(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.correct_milestone(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_milestone(uuid, text, text, text) TO service_role;
