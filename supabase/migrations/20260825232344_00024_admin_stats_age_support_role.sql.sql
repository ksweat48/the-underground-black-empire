/*
# Update Admin Participation Stats with Age and Support Role

## Purpose
Adds age distribution and support role breakdown to the admin participation
stats function. This gives admins visibility into:
- Age demographics of the Empire
- How many business owners, professionals, organizations, and supporters
  are in the Empire
- What professions members have

## Changes
Modifies the `get_admin_participation_stats()` function to add two new fields
to the returned JSON:
- `age_breakdown`: Groups members into age ranges (Under 18, 18-24, 25-34,
  35-44, 45-54, 55-64, 65+) with counts and percentages.
- `support_role_breakdown`: Counts of each support role (supporter,
  business_owner, professional, organization) with percentages.
- `profession_breakdown`: List of professions with counts, sorted by frequency.

## Security
- No changes to RLS or access control.
- Function remains SECURITY DEFINER, admin-only.
- All data is aggregate counts — no individual member data exposed.

## Important Notes
1. The function is recreated with CREATE OR REPLACE — no data is lost.
2. Age is calculated from date_of_birth at query time, not stored statically.
3. Members without date_of_birth are counted as 'unspecified' in age breakdown.
4. Members without support_role are counted as 'unspecified' in role breakdown.
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
    'age_breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'age_group', age_group,
        'count', cnt,
        'percentage', CASE WHEN v_total_members > 0 THEN round((cnt::numeric / v_total_members) * 100, 1) ELSE 0 END
      ) ORDER BY
        CASE age_group
          WHEN 'Under 18' THEN 1
          WHEN '18-24' THEN 2
          WHEN '25-34' THEN 3
          WHEN '35-44' THEN 4
          WHEN '45-54' THEN 5
          WHEN '55-64' THEN 6
          WHEN '65+' THEN 7
          ELSE 8
        END
      )
      FROM (
        SELECT
          CASE
            WHEN date_of_birth IS NULL THEN 'unspecified'
            WHEN date_part('year', age(CURRENT_DATE, date_of_birth)) < 18 THEN 'Under 18'
            WHEN date_part('year', age(CURRENT_DATE, date_of_birth)) BETWEEN 18 AND 24 THEN '18-24'
            WHEN date_part('year', age(CURRENT_DATE, date_of_birth)) BETWEEN 25 AND 34 THEN '25-34'
            WHEN date_part('year', age(CURRENT_DATE, date_of_birth)) BETWEEN 35 AND 44 THEN '35-44'
            WHEN date_part('year', age(CURRENT_DATE, date_of_birth)) BETWEEN 45 AND 54 THEN '45-54'
            WHEN date_part('year', age(CURRENT_DATE, date_of_birth)) BETWEEN 55 AND 64 THEN '55-64'
            ELSE '65+'
          END AS age_group,
          count(*) AS cnt
        FROM members
        GROUP BY age_group
      ) a
    ), '[]'::jsonb),
    'support_role_breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'role', COALESCE(support_role, 'unspecified'),
        'count', cnt,
        'percentage', CASE WHEN v_total_members > 0 THEN round((cnt::numeric / v_total_members) * 100, 1) ELSE 0 END
      ) ORDER BY cnt DESC)
      FROM (SELECT support_role, count(*) AS cnt FROM members GROUP BY support_role) s
    ), '[]'::jsonb),
    'profession_breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'profession', support_role_detail,
        'count', cnt
      ) ORDER BY cnt DESC)
      FROM (
        SELECT support_role_detail, count(*) AS cnt
        FROM members
        WHERE support_role = 'professional' AND support_role_detail IS NOT NULL AND btrim(support_role_detail) <> ''
        GROUP BY support_role_detail
      ) p
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
      'daily', (SELECT count(DISTINCT member_id) FROM listing_comments WHERE created_at >= now() - interval '1 day')
             + (SELECT count(DISTINCT member_id) FROM listing_likes WHERE created_at >= now() - interval '1 day')
             + (SELECT count(DISTINCT member_id) FROM event_check_ins WHERE created_at >= now() - interval '1 day')
             + (SELECT count(DISTINCT member_id) FROM vote_records WHERE created_at >= now() - interval '1 day'),
      'weekly', (SELECT count(DISTINCT member_id) FROM listing_comments WHERE created_at >= now() - interval '7 days')
              + (SELECT count(DISTINCT member_id) FROM listing_likes WHERE created_at >= now() - interval '7 days')
              + (SELECT count(DISTINCT member_id) FROM event_check_ins WHERE created_at >= now() - interval '7 days')
              + (SELECT count(DISTINCT member_id) FROM vote_records WHERE created_at >= now() - interval '7 days'),
      'monthly', (SELECT count(DISTINCT member_id) FROM listing_comments WHERE created_at >= now() - interval '30 days')
               + (SELECT count(DISTINCT member_id) FROM listing_likes WHERE created_at >= now() - interval '30 days')
               + (SELECT count(DISTINCT member_id) FROM event_check_ins WHERE created_at >= now() - interval '30 days')
               + (SELECT count(DISTINCT member_id) FROM vote_records WHERE created_at >= now() - interval '30 days')
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