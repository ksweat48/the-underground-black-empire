/*
# Fix Active User Double-Counting in Participation Stats

1. Purpose
   The `get_admin_participation_stats()` function calculates daily, weekly, and
   monthly active users by summing `count(DISTINCT member_id)` from four separate
   activity tables (listing_comments, listing_likes, event_check_ins, vote_records).
   A member who both comments and likes on the same day is counted twice — once per
   table — because each subquery is independent. This migration rewrites the
   active-users calculation to UNION all activity sources first and then count
   distinct member_ids, so each person is counted exactly once per time window.

2. Changes
   - Replaces the `active_users` portion of `get_admin_participation_stats()` with
     a single CTE-based query that deduplicates across all four activity tables.
   - No schema changes. No data changes. No security changes.

3. Security
   - The function remains SECURITY DEFINER, callable by authenticated users only,
     and still checks `is_admin` on the caller before returning data.
   - All returned data is aggregate counts only — no individual member data.
*/

CREATE OR REPLACE FUNCTION public.get_admin_participation_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $stats$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_admin boolean;
  v_total_members int;
BEGIN
  SELECT is_admin INTO v_is_admin FROM members WHERE id = v_caller_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT count(*) INTO v_total_members FROM members;

  SELECT jsonb_build_object(
    'total_members', v_total_members,
    'gender_breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'gender', COALESCE(gender, 'unspecified'),
        'count', cnt,
        'percentage', CASE WHEN v_total_members > 0 THEN round((cnt::numeric / v_total_members) * 100, 1) ELSE 0 END
      ) ORDER BY cnt DESC)
      FROM (SELECT gender, count(*) AS cnt FROM members GROUP BY gender) g
    ), '[]'::jsonb),
    'ethnicity_breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ethnicity', ethnicity,
        'count', cnt,
        'percentage', CASE WHEN v_total_members > 0 THEN round((cnt::numeric / v_total_members) * 100, 1) ELSE 0 END
      ) ORDER BY cnt DESC)
      FROM (
        SELECT ethnicity, count(*) AS cnt
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(ethnic_identity, '["unspecified"]'::jsonb)) AS ethnicity
          FROM members
        ) expanded
        GROUP BY ethnicity
      ) e
    ), '[]'::jsonb),
    'membership_breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tier', tier,
        'count', cnt,
        'percentage', CASE WHEN v_total_members > 0 THEN round((cnt::numeric / v_total_members) * 100, 1) ELSE 0 END,
        'is_paid', tier NOT IN ('white')
      ) ORDER BY cnt DESC)
      FROM (SELECT COALESCE(membership_tier, 'white') AS tier, count(*) AS cnt FROM members GROUP BY membership_tier) m
    ), '[]'::jsonb),
    'comments_by_gender', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'gender', COALESCE(gender, 'unspecified'),
        'comment_count', comment_count,
        'member_count', member_count,
        'participation_rate', CASE WHEN member_count > 0 THEN round((comment_count::numeric / member_count) * 100, 1) ELSE 0 END
      ) ORDER BY comment_count DESC)
      FROM (
        SELECT m.gender, count(lc.id) AS comment_count, count(DISTINCT m.id) AS member_count
        FROM members m
        LEFT JOIN listing_comments lc ON lc.member_id = m.id
        GROUP BY m.gender
      ) c
    ), '[]'::jsonb),
    'comments_by_ethnicity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ethnicity', ethnicity,
        'comment_count', comment_count,
        'member_count', member_count,
        'participation_rate', CASE WHEN member_count > 0 THEN round((comment_count::numeric / member_count) * 100, 1) ELSE 0 END
      ) ORDER BY comment_count DESC)
      FROM (
        SELECT ethnicity, count(lc.id) AS comment_count, count(DISTINCT expanded.id) AS member_count
        FROM (
          SELECT m.id, jsonb_array_elements_text(COALESCE(m.ethnic_identity, '["unspecified"]'::jsonb)) AS ethnicity
          FROM members m
        ) expanded
        LEFT JOIN listing_comments lc ON lc.member_id = expanded.id
        GROUP BY ethnicity
      ) e
    ), '[]'::jsonb),
    'active_users', jsonb_build_object(
      'daily', COALESCE((
        SELECT count(DISTINCT member_id) FROM (
          SELECT member_id, created_at FROM listing_comments
          UNION ALL SELECT member_id, created_at FROM listing_likes
          UNION ALL SELECT member_id, created_at FROM event_check_ins
          UNION ALL SELECT member_id, created_at FROM vote_records
        ) all_activity
        WHERE created_at >= now() - interval '1 day'
      ), 0),
      'weekly', COALESCE((
        SELECT count(DISTINCT member_id) FROM (
          SELECT member_id, created_at FROM listing_comments
          UNION ALL SELECT member_id, created_at FROM listing_likes
          UNION ALL SELECT member_id, created_at FROM event_check_ins
          UNION ALL SELECT member_id, created_at FROM vote_records
        ) all_activity
        WHERE created_at >= now() - interval '7 days'
      ), 0),
      'monthly', COALESCE((
        SELECT count(DISTINCT member_id) FROM (
          SELECT member_id, created_at FROM listing_comments
          UNION ALL SELECT member_id, created_at FROM listing_likes
          UNION ALL SELECT member_id, created_at FROM event_check_ins
          UNION ALL SELECT member_id, created_at FROM vote_records
        ) all_activity
        WHERE created_at >= now() - interval '30 days'
      ), 0)
    ),
    'highest_participating_group', COALESCE((
      SELECT jsonb_build_object(
        'group_name', COALESCE(gender, 'unspecified') || ' / ' || ethnicity,
        'participation_rate', CASE WHEN member_count > 0 THEN round((comment_count::numeric / member_count) * 100, 1) ELSE 0 END,
        'comment_count', comment_count,
        'member_count', member_count
      )
      FROM (
        SELECT
          m.gender,
          expanded.ethnicity,
          count(DISTINCT m.id) AS member_count,
          count(lc.id) AS comment_count
        FROM members m
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(m.ethnic_identity, '["unspecified"]'::jsonb)) AS expanded(ethnicity)
        LEFT JOIN listing_comments lc ON lc.member_id = m.id
        GROUP BY m.gender, expanded.ethnicity
        ORDER BY (count(lc.id)::numeric / count(DISTINCT m.id)) DESC
        LIMIT 1
      ) top_group
    ), '{"group_name": "No data", "participation_rate": 0, "comment_count": 0, "member_count": 0}'::jsonb)
  );
END;
$stats$;

GRANT EXECUTE ON FUNCTION public.get_admin_participation_stats TO authenticated;
