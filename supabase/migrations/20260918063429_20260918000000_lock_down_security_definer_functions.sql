/*
# Lock Down SECURITY DEFINER Functions and Views

## Summary
This migration closes three critical security gaps before launch:

1. **Revoke EXECUTE from `anon` on ALL SECURITY DEFINER functions** — currently
   44 of 45 privileged functions can be called by unauthenticated visitors,
   allowing anonymous users to award influence, complete missions, cast votes,
   approve listings, and more.

2. **Revoke EXECUTE from `authenticated` on internal-only functions** — 23
   functions that should only be called by triggers, the service role, or
   admin-internal code (influence awards, progress refreshes, audit logging,
   mission completion, test cleanup, etc.) are removed from the authenticated
   role. The remaining app-facing functions keep `authenticated` access — they
   already contain `auth.uid()` identity checks.

3. **Fix SECURITY DEFINER views** — `activity_feed`, `community_feed_view`,
   and `market_feed_view` are altered to `security_invoker = true` so they
   respect the caller's RLS policies instead of bypassing them.

4. **Fix mutable search_path** on `compute_market_rank_scores` and
   `record_organization_vote_support`.
*/

-- ============================================================
-- 1. Revoke EXECUTE from anon on ALL SECURITY DEFINER functions
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.accept_leadership_nomination(p_cycle_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_founder_number(p_city_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_city_level_influence(p_city_id uuid, p_new_tier text, p_old_tier text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_empire_level_influence(p_new_civilization_level text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_influence(p_member_id uuid, p_event_type text, p_amount integer, p_reference_id uuid, p_idempotency_key text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_verified_event_host_influence(p_event_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_verified_referral(p_referring_member_id uuid, p_referred_member_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cast_leadership_ballot(p_cycle_id uuid, p_candidate_ids uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cast_weighted_vote(p_vote_id uuid, p_choice text, p_credits_used integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_in_to_event(p_event_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_test_account() FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_mission(p_member_id uuid, p_mission_slug text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_market_rank_scores(p_city_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_member(p_email text, p_display_name text, p_referred_by_code text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_leadership_nomination(p_cycle_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_leadership_election(p_cycle_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_activity_feed(p_metro_id uuid, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_participation_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_council_news_feed(p_metro_id uuid, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_listings_for_review(p_status text, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_member_activity(p_member_id uuid, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_member_credits(p_member_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_member_influence(p_member_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_member_level(p_member_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_member_voting_power(p_member_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_metro_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_member_is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.like_listing(p_listing_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.like_news(p_news_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(p_actor_id uuid, p_action text, p_target_type text, p_target_id uuid, p_metadata jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_onboarding_complete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_leadership_finalists(p_cycle_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_organization_vote_support(p_organization_id uuid, p_vote_id uuid, p_effective_weight numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_city_progress(p_city_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_empire_progress() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_metro_progress(p_metro_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_market_listing(p_listing_id uuid, p_action text, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_leadership_nomination(p_candidate_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_leadership_opt_in(p_enabled boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlike_listing(p_listing_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_ethnic_identity(p_ethnic_identity text, p_ethnic_identity_detail text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_gender(p_gender text, p_gender_detail text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_listing(p_listing_id uuid, p_name text, p_category text, p_description text, p_products_services text, p_price_display text, p_external_url text, p_contact_info text, p_image_url text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_member_profile(p_date_of_birth date, p_support_role text, p_support_role_detail text, p_avatar_url text, p_occupation text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_referral(p_referred_member_id uuid) FROM anon;

-- ============================================================
-- 2. Revoke EXECUTE from authenticated on internal-only functions
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.award_city_level_influence(p_city_id uuid, p_new_tier text, p_old_tier text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_empire_level_influence(p_new_civilization_level text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_influence(p_member_id uuid, p_event_type text, p_amount integer, p_reference_id uuid, p_idempotency_key text, p_notes text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_verified_event_host_influence(p_event_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_verified_referral(p_referring_member_id uuid, p_referred_member_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_mission(p_member_id uuid, p_mission_slug text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_market_rank_scores(p_city_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_test_account() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_leadership_election(p_cycle_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_activity_feed(p_metro_id uuid, p_limit integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_council_news_feed(p_metro_id uuid, p_limit integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_member_activity(p_member_id uuid, p_limit integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_member_credits(p_member_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_member_influence(p_member_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_member_level(p_member_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_member_voting_power(p_member_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit(p_actor_id uuid, p_action text, p_target_type text, p_target_id uuid, p_metadata jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_leadership_finalists(p_cycle_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_city_progress(p_city_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_empire_progress() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_metro_progress(p_metro_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_referral(p_referred_member_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_member_is_admin() FROM authenticated;

-- ============================================================
-- 3. Fix SECURITY DEFINER views — set security_invoker = true
-- ============================================================

ALTER VIEW public.activity_feed SET (security_invoker = true);
ALTER VIEW public.community_feed_view SET (security_invoker = true);
ALTER VIEW public.market_feed_view SET (security_invoker = true);

-- ============================================================
-- 4. Fix mutable search_path on two functions
-- ============================================================

ALTER FUNCTION public.compute_market_rank_scores(p_city_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.record_organization_vote_support(p_organization_id uuid, p_vote_id uuid, p_effective_weight numeric) SET search_path = public, pg_temp;
