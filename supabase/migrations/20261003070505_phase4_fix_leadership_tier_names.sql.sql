/*
# Fix old tier names in toggle_leadership_opt_in

The function still referenced 'emerald' and 'plum' which no longer exist.
Updates to the current tier names: black, black_plus, black_pro, arch, arch_pro.
*/

CREATE OR REPLACE FUNCTION public.toggle_leadership_opt_in(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_record RECORD;
  v_influence integer;
BEGIN
  SELECT * INTO v_member_record FROM members WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF p_enabled THEN
    IF v_member_record.city_id IS NULL THEN
      RAISE EXCEPTION 'You must have a city selected';
    END IF;

    v_influence := public.get_member_influence(auth.uid());
    IF v_influence < 250 THEN
      RAISE EXCEPTION 'You need at least 250 Influence to be eligible for leadership';
    END IF;

    IF v_member_record.membership_tier IS NULL
       OR v_member_record.membership_tier NOT IN ('black', 'black_plus', 'black_pro', 'arch', 'arch_pro') THEN
      RAISE EXCEPTION 'You need a Black or higher membership to be eligible for leadership';
    END IF;
  END IF;

  UPDATE members SET leadership_opt_in = p_enabled WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_leadership_opt_in(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_leadership_opt_in(boolean) TO authenticated;
