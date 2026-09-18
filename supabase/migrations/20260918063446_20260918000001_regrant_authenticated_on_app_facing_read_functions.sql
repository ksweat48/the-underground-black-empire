/*
# Re-grant authenticated on 5 app-facing read functions

The previous migration revoked authenticated from all internal-only functions.
However, 5 of those functions ARE called directly from the React app:
- get_activity_feed (feed pages)
- get_council_news_feed (feed pages)
- get_member_influence (leadership pages)
- get_member_credits (vote page)
- get_member_voting_power (vote page)

These are read-only functions that take a member ID and return data. They
need authenticated access to work from the app. They do not have auth.uid()
checks internally, but the data they return is public within the community
(any signed-in user can see influence, credits, voting power, and feeds).
*/

GRANT EXECUTE ON FUNCTION public.get_activity_feed(p_metro_id uuid, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_council_news_feed(p_metro_id uuid, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_influence(p_member_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_credits(p_member_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_voting_power(p_member_id uuid) TO authenticated;
