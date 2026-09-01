-- Allow admin users to read all rows in audit_log and referrals.
-- Non-admin users keep their existing per-row access unchanged.

CREATE POLICY "admin_read_all_audit"
  ON audit_log FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

CREATE POLICY "admin_read_all_referrals"
  ON referrals FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());
