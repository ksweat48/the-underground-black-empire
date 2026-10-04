/*
# Admin Partner list

1. New function `get_partners_admin()` (Partner Admin or Founder only)
   - Returns every Partner with name, member number, Stripe connection status, active/suspended state,
     suspension reason/date, and pending / available / paid commission totals.
2. Security
   - Checks the caller with require_sub_role('partner_admin'); not callable by visitors.
*/
CREATE OR REPLACE FUNCTION public.get_partners_admin()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('partner_admin');
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'member_id', p.member_id,
      'display_name', m.display_name,
      'member_number', m.member_number,
      'avatar_url', m.avatar_url,
      'stripe_connect_status', p.stripe_connect_status,
      'is_active', p.is_active,
      'joined_at', p.joined_at,
      'suspended_at', p.suspended_at,
      'suspended_reason', p.suspended_reason,
      'referral_count', (SELECT count(*) FROM partner_referrals r WHERE r.partner_id = p.member_id AND r.status = 'active'),
      'pending_cents', COALESCE((SELECT sum(amount_cents) FROM partner_commission_ledger l WHERE l.partner_id = p.member_id AND l.status = 'pending'), 0),
      'available_cents', COALESCE((SELECT sum(amount_cents) FROM partner_commission_ledger l WHERE l.partner_id = p.member_id AND l.status = 'available'), 0),
      'paid_cents', COALESCE((SELECT sum(amount_cents) FROM partner_commission_ledger l WHERE l.partner_id = p.member_id AND l.status = 'paid'), 0)
    ) ORDER BY p.is_active ASC, p.joined_at DESC), '[]'::jsonb)
    FROM empire_partners p JOIN members m ON m.id = p.member_id
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.get_partners_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partners_admin() TO authenticated;
