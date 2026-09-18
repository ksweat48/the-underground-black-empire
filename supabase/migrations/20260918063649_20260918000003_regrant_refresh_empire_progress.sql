/*
# Re-grant authenticated on refresh_empire_progress

The founder-onboarding edge function calls refresh_empire_progress after
assigning a founder number. The edge function uses the user's JWT, so it
runs as the authenticated role. This grant was revoked in the lockdown
migration but is needed for the edge function to work.
*/

GRANT EXECUTE ON FUNCTION public.refresh_empire_progress() TO authenticated;
