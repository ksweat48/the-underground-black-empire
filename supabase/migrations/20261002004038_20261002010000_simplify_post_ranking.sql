/*
# Simplify post ranking around likes

1. Purpose
- Make likes/favorites the primary engagement signal for marketplace ranking.
- Keep freshness and verification as supporting signals.
- Stop comments and event check-ins from disproportionately pushing a post upward.

2. Modified behavior
- Replaces `compute_market_rank_scores(uuid)` with the same cached ranking workflow,
  but the score now uses lifetime likes and recent seven-day likes only.
- `market_ranking_cache` continues storing comment and check-in totals for reporting,
  but those totals no longer increase the ranking score.

3. Preserved data
- No rows, columns, tables, or user engagement history are deleted.
- Existing save and boost records remain available for historical data safety, but
  the application no longer creates or displays those actions.

4. Ranking formula
- Lifetime likes: 1 point each.
- Likes from the last seven days: 1 additional point each.
- Fresh content updated or created within fourteen days: 10 points.
- Verified listings: 15 points.
- Comments and check-ins: retained as counters only, with no ranking weight.

5. Security
- The existing SECURITY DEFINER function and fixed public search path are retained.
- No new tables or policies are introduced.
*/

CREATE OR REPLACE FUNCTION public.compute_market_rank_scores(p_city_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing RECORD;
  v_recent_likes integer;
  v_recent_comments integer;
  v_recent_check_ins integer;
  v_lifetime_likes integer;
  v_lifetime_comments integer;
  v_lifetime_check_ins integer;
  v_score numeric;
  v_is_fresh boolean;
BEGIN
  FOR listing IN
    SELECT id, city_id, is_verified, created_at, updated_at
    FROM public.market_listings
    WHERE status = 'approved'
      AND (p_city_id IS NULL OR city_id = p_city_id)
  LOOP
    SELECT COUNT(*) INTO v_lifetime_likes
    FROM public.listing_likes
    WHERE listing_id = listing.id;

    SELECT COUNT(*) INTO v_lifetime_comments
    FROM public.listing_comments
    WHERE listing_id = listing.id;

    SELECT COUNT(*) INTO v_lifetime_check_ins
    FROM public.event_check_ins eci
    JOIN public.market_events me ON me.id = eci.event_id
    WHERE me.listing_id = listing.id;

    SELECT COUNT(*) INTO v_recent_likes
    FROM public.listing_likes
    WHERE listing_id = listing.id
      AND created_at >= now() - interval '7 days';

    SELECT COUNT(*) INTO v_recent_comments
    FROM public.listing_comments
    WHERE listing_id = listing.id
      AND created_at >= now() - interval '7 days';

    SELECT COUNT(*) INTO v_recent_check_ins
    FROM public.event_check_ins eci
    JOIN public.market_events me ON me.id = eci.event_id
    WHERE me.listing_id = listing.id
      AND eci.created_at >= now() - interval '7 days';

    v_score := (v_lifetime_likes * 1)
      + (v_recent_likes * 1);

    v_is_fresh := (
      listing.created_at >= now() - interval '14 days'
      OR listing.updated_at >= now() - interval '14 days'
    );

    IF v_is_fresh THEN
      v_score := v_score + 10;
    END IF;

    IF listing.is_verified THEN
      v_score := v_score + 15;
    END IF;

    INSERT INTO public.market_ranking_cache (
      listing_id, city_id, score,
      recent_likes, recent_comments, recent_check_ins,
      lifetime_likes, lifetime_comments, lifetime_check_ins,
      is_fresh, is_verified, computed_at
    ) VALUES (
      listing.id, listing.city_id, v_score,
      v_recent_likes, v_recent_comments, v_recent_check_ins,
      v_lifetime_likes, v_lifetime_comments, v_lifetime_check_ins,
      v_is_fresh, listing.is_verified, now()
    )
    ON CONFLICT (listing_id) DO UPDATE SET
      score = EXCLUDED.score,
      recent_likes = EXCLUDED.recent_likes,
      recent_comments = EXCLUDED.recent_comments,
      recent_check_ins = EXCLUDED.recent_check_ins,
      lifetime_likes = EXCLUDED.lifetime_likes,
      lifetime_comments = EXCLUDED.lifetime_comments,
      lifetime_check_ins = EXCLUDED.lifetime_check_ins,
      is_fresh = EXCLUDED.is_fresh,
      is_verified = EXCLUDED.is_verified,
      computed_at = EXCLUDED.computed_at;
  END LOOP;

  DELETE FROM public.market_ranking_cache
  WHERE listing_id NOT IN (
    SELECT id FROM public.market_listings WHERE status = 'approved'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_market_rank_scores(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_market_rank_scores(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_market_rank_scores(uuid) FROM authenticated;