/*
# Voting Power 5× Formula Revision

## Purpose
Updates get_member_voting_power to use a level-bonus lookup table and a higher
influence cap, raising the maximum VP from 2.50× to 5.00×.

New formula:
  VP = 1.00 + level_bonus + influence_bonus, capped at 5.00
    level_bonus: L1=0.00, L2=0.25, L3=1.00, L4=2.50, L5=4.00
    influence_bonus = FLOOR(influence / 10) × 0.01, capped at 1.50

Tier ranges produced:
  Base member:           1.00× VP
  Growing contributor:  1.25–2.00×
  Established:           2.00–3.50×
  Major Empire:          3.50–4.50×
  Highest earned:        5.00× VP maximum

Max weighted voting power = 100 credits × 5.00 VP = 500.
*/

CREATE OR REPLACE FUNCTION public.get_member_voting_power(
  p_member_id uuid
) RETURNS numeric(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_xp int;
  v_total_influence int;
  v_level int;
  v_level_bonus numeric(5,2);
  v_influence_bonus numeric(5,2);
  v_vp numeric(5,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_xp
  FROM xp_ledger WHERE member_id = p_member_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_influence
  FROM influence_ledger WHERE member_id = p_member_id;

  v_level := 1;
  IF v_total_xp >= 1000 THEN v_level := 5;
  ELSIF v_total_xp >= 500 THEN v_level := 4;
  ELSIF v_total_xp >= 250 THEN v_level := 3;
  ELSIF v_total_xp >= 100 THEN v_level := 2;
  END IF;

  v_level_bonus := CASE v_level
    WHEN 1 THEN 0.00
    WHEN 2 THEN 0.25
    WHEN 3 THEN 1.00
    WHEN 4 THEN 2.50
    WHEN 5 THEN 4.00
  END;

  v_influence_bonus := LEAST(1.50, FLOOR(v_total_influence / 10) * 0.01);
  v_vp := LEAST(5.00, 1.00 + v_level_bonus + v_influence_bonus);

  RETURN v_vp;
END;
$$;
