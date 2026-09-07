/*
# Fix and Run Test Account Cleanup

## Purpose
1. Fixes the cleanup_test_account() function — the original tried to DELETE
   from activity_feed, which is a VIEW (not a table), causing an error.
   The audit_log DELETE that follows already covers all activity_feed rows.
2. Executes the fixed function to remove greenhaggai@gmail.com and all
   its associated data, then rolls back the member_number sequence.

## Changes
- Recreates cleanup_test_account() with the DELETE FROM activity_feed line removed
- Calls the function to perform the actual cleanup
*/

CREATE OR REPLACE FUNCTION public.cleanup_test_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_member_number int;
  v_city_id uuid;
  v_deleted_count int := 0;
  v_seq_current int;
BEGIN
  SELECT id, member_number, city_id
  INTO v_member_id, v_member_number, v_city_id
  FROM members
  WHERE email = 'greenhaggai@gmail.com'
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'message', 'No test account found for greenhaggai@gmail.com');
  END IF;

  DELETE FROM voting_credits WHERE member_id = v_member_id;
  DELETE FROM vote_records WHERE member_id = v_member_id;
  DELETE FROM news_likes WHERE member_id = v_member_id;
  DELETE FROM metro_council WHERE member_id = v_member_id;
  DELETE FROM member_missions WHERE member_id = v_member_id;
  DELETE FROM market_events WHERE author_id = v_member_id;
  DELETE FROM market_listings WHERE owner_id = v_member_id;
  DELETE FROM local_news WHERE author_id = v_member_id;
  DELETE FROM listing_updates WHERE author_id = v_member_id;
  DELETE FROM listing_saves WHERE member_id = v_member_id;
  DELETE FROM listing_likes WHERE member_id = v_member_id;
  DELETE FROM listing_comments WHERE member_id = v_member_id;
  DELETE FROM leadership_ballots WHERE voter_id = v_member_id;
  DELETE FROM leadership_candidates WHERE member_id = v_member_id;
  DELETE FROM leadership_nominations WHERE nominator_id = v_member_id OR candidate_id = v_member_id;
  DELETE FROM event_check_ins WHERE member_id = v_member_id;
  DELETE FROM daily_like_influence_log WHERE member_id = v_member_id;
  DELETE FROM content_reports WHERE reporter_id = v_member_id;
  DELETE FROM referrals WHERE referring_member_id = v_member_id OR referred_member_id = v_member_id;
  DELETE FROM influence_ledger WHERE member_id = v_member_id;
  DELETE FROM audit_log WHERE actor_id = v_member_id;
  DELETE FROM founder_numbers WHERE member_id = v_member_id;

  UPDATE members SET referred_by = NULL WHERE referred_by = v_member_id;

  DELETE FROM members WHERE id = v_member_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  DELETE FROM auth.users WHERE id = v_member_id;

  IF v_member_number IS NOT NULL THEN
    SELECT last_value INTO v_seq_current FROM member_number_seq;
    IF v_seq_current = v_member_number THEN
      PERFORM setval('member_number_seq', v_member_number - 1, true);
    END IF;
  END IF;

  IF v_city_id IS NOT NULL THEN
    PERFORM public.refresh_city_progress(v_city_id);
  END IF;
  PERFORM public.refresh_empire_progress();

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Test account greenhaggai@gmail.com has been fully removed',
    'member_id', v_member_id,
    'member_number_removed', v_member_number,
    'city_id', v_city_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_test_account() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cleanup_test_account() TO authenticated;

SELECT public.cleanup_test_account();
