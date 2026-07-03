
-- 修复自定义角色无法保存的 bug：将 profiles.role 字段从枚举改为 text

-- 步骤1：删除所有依赖 profiles.role 列或 get_user_role 函数的 RLS 策略
DROP POLICY IF EXISTS "管理员完全访问profiles" ON public.profiles;
DROP POLICY IF EXISTS "用户查看自己的profile" ON public.profiles;
DROP POLICY IF EXISTS "用户更新自己的profile（不能改角色）" ON public.profiles;
DROP POLICY IF EXISTS "管理员管理食材" ON public.ingredients;
DROP POLICY IF EXISTS "已登录用户查看食材" ON public.ingredients;
DROP POLICY IF EXISTS "用户查看自己的申购单" ON public.purchase_orders;
DROP POLICY IF EXISTS "管理员更新申购单" ON public.purchase_orders;
DROP POLICY IF EXISTS "用户创建申购单" ON public.purchase_orders;
DROP POLICY IF EXISTS "用户查看申购单明细" ON public.order_items;
DROP POLICY IF EXISTS "用户创建申购单明细" ON public.order_items;
DROP POLICY IF EXISTS "管理员更新申购单明细" ON public.order_items;
DROP POLICY IF EXISTS "super_admin can read logs" ON public.operation_logs;
DROP POLICY IF EXISTS "authenticated can insert logs" ON public.operation_logs;
DROP POLICY IF EXISTS "super_admin can update role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "super_admin can insert role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "super_admin can delete role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "authenticated can read role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "super_admin manage positions" ON public.positions;
DROP POLICY IF EXISTS "authenticated read positions" ON public.positions;
DROP POLICY IF EXISTS "admin_write_categories" ON public.ingredient_categories;
DROP POLICY IF EXISTS "admin_write_suppliers" ON public.ingredient_suppliers;
DROP POLICY IF EXISTS "用户可查看自己的通知" ON public.notifications;
DROP POLICY IF EXISTS "认证用户可插入通知" ON public.notifications;
DROP POLICY IF EXISTS "用户可标记自己的通知已读" ON public.notifications;
DROP POLICY IF EXISTS "authenticated_read_categories" ON public.ingredient_categories;
DROP POLICY IF EXISTS "authenticated_read_suppliers" ON public.ingredient_suppliers;
DROP POLICY IF EXISTS "public_select_subcategories" ON public.ingredient_subcategories;
DROP POLICY IF EXISTS "authenticated_crud_subcategories" ON public.ingredient_subcategories;

-- 步骤2：删除 get_user_role 函数（CASCADE 处理剩余依赖）
DROP FUNCTION IF EXISTS get_user_role(uuid) CASCADE;

-- 步骤3：修改 profiles 表 role 字段类型
ALTER TABLE public.profiles ALTER COLUMN role TYPE text;

-- 步骤4：重新创建 get_user_role 函数（返回 text）
CREATE FUNCTION get_user_role(uid uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- 步骤5：更新自动同步新用户的触发器
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'
  );
  RETURN NEW;
END;
$$;

-- 步骤6：重建所有 RLS 策略

-- profiles
CREATE POLICY "管理员完全访问profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "用户查看自己的profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "用户更新自己的profile（不能改角色）" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- ingredients
CREATE POLICY "已登录用户查看食材" ON public.ingredients
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "管理员管理食材" ON public.ingredients
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

-- purchase_orders
CREATE POLICY "用户查看自己的申购单" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (submitter_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "用户创建申购单" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (submitter_id = auth.uid());

CREATE POLICY "管理员更新申购单" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

-- order_items
CREATE POLICY "用户查看申购单明细" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = order_id
        AND (po.submitter_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'super_admin'))
    )
  );

CREATE POLICY "用户创建申购单明细" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = order_id AND po.submitter_id = auth.uid()
    )
  );

CREATE POLICY "管理员更新申购单明细" ON public.order_items
  FOR UPDATE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

-- operation_logs
CREATE POLICY "super_admin can read logs" ON public.operation_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "authenticated can insert logs" ON public.operation_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- role_permissions
CREATE POLICY "authenticated can read role_permissions" ON public.role_permissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "super_admin can update role_permissions" ON public.role_permissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "super_admin can insert role_permissions" ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "super_admin can delete role_permissions" ON public.role_permissions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- positions
CREATE POLICY "authenticated read positions" ON public.positions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "super_admin manage positions" ON public.positions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ingredient_categories
CREATE POLICY "authenticated_read_categories" ON public.ingredient_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_write_categories" ON public.ingredient_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ingredient_suppliers
CREATE POLICY "authenticated_read_suppliers" ON public.ingredient_suppliers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_write_suppliers" ON public.ingredient_suppliers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- notifications
CREATE POLICY "用户可查看自己的通知" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "认证用户可插入通知" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "用户可标记自己的通知已读" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ingredient_subcategories
CREATE POLICY "public_select_subcategories" ON public.ingredient_subcategories FOR SELECT TO public
  USING (true);

CREATE POLICY "authenticated_crud_subcategories" ON public.ingredient_subcategories FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
