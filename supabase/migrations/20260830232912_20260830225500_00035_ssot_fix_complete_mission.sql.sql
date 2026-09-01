/*
# SSOT — Fix complete_mission to use new award_xp signature
*/

CREATE OR REPLACE FUNCTION public.complete_mission(p_member_id uuid, p_mission_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_mission_id uuid;
  v_xp_reward int;
  v_already_done boolean;
  v_idem_key text;
BEGIN
  SELECT id, xp_reward INTO v_mission_id, v_xp_reward
  FROM missions WHERE slug = p_mission_slug;

  IF v_mission_id IS NULL THEN
    RAISE EXCEPTION 'Mission not found: %', p_mission_slug;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM member_missions WHERE member_id = p_member_id AND mission_id = v_mission_id
  ) INTO v_already_done;

  IF v_already_done THEN
    RETURN false;
  END IF;

  INSERT INTO member_missions (member_id, mission_id, xp_awarded)
  VALUES (p_member_id, v_mission_id, v_xp_reward);

  v_idem_key := 'mission_completed:' || p_mission_slug || ':' || p_member_id::text;

  PERFORM public.award_xp(
    p_member_id,
    'mission_completed',
    v_xp_reward,
    v_mission_id,
    v_idem_key,
    'Mission completed: ' || p_mission_slug
  );

  PERFORM public.log_audit(
    p_member_id,
    'mission_completed',
    'mission',
    v_mission_id,
    jsonb_build_object('slug', p_mission_slug, 'xp', v_xp_reward)
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_mission(uuid, text) TO authenticated;
