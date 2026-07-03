-- 补充 super_admin 对 role_permissions 的 INSERT 和 DELETE 权限
CREATE POLICY "super_admin can insert role_permissions"
  ON role_permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ));

CREATE POLICY "super_admin can delete role_permissions"
  ON role_permissions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ));
