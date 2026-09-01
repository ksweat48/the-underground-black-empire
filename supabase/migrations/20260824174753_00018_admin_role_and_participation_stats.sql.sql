/*
# Admin Role + Participation Analytics

1. Purpose
   - Adds an `is_admin` boolean column to the `members` table so specific users can access the admin console.
   - Sets `is_admin = true` for the member with email `ksweat48@gmail.com`.
   - Creates a SECURITY DEFINER function `get_admin_participation_stats()` that returns aggregated participation data for the admin dashboard, including gender breakdown, ethnic identity breakdown, membership tier split, commenting/engagement activity by demographic, active user counts, and the highest-participating group by percentage.

2. Schema Changes
   - `members` table: adds `is_admin boolean NOT NULL DEFAULT false`.

3. Security
   - The `is_admin` column is NOT user-editable through normal RLS. A BEFORE UPDATE trigger prevents non-admin users from changing `is_admin`.
   - The `get_admin_participation_stats()` function is SECURITY DEFINER, callable by authenticated users only, and checks `is_admin` on the caller before returning data. Non-admins get an error.
   - All data returned is aggregate counts only — no individual member data is exposed.

4. Important Notes
   1. The function returns a single JSON object with all stats in one call for efficiency.
   2. "Active users" is calculated based on recent activity across listing_comments, listing_likes, event_check_ins, and vote_records.
   3. "Highest participating group" compares comment rates across gender+ethnicity combinations (comments per member within that group).
*/

-- ==================== ADD is_admin COLUMN ====================
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ==================== SET ksweat48@gmail.com AS ADMIN ====================
UPDATE members SET is_admin = true WHERE email = 'ksweat48@gmail.com';

-- ==================== GUARD is_admin FROM NON-ADMIN UPDATES ====================
CREATE OR REPLACE FUNCTION public.guard_member_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $guard$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF NOT EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Only admins can change the is_admin flag';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_guard_member_is_admin ON members;
CREATE TRIGGER trg_guard_member_is_admin
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_is_admin();

-- ==================== ADMIN PARTICIPATION STATS FUNCTION ====================
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
