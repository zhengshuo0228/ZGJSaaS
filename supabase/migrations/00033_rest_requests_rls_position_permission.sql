-- 辅助函数：判断当前用户是否拥有「排休管理」权限（通过岗位或角色）
CREATE OR REPLACE FUNCTION can_manage_rest()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'super_admin')
        OR EXISTS (
          SELECT 1 FROM positions pos
          WHERE pos.name = p.position
            AND pos.permissions @> '["排休管理"]'::jsonb
        )
      )
  );
$$;

-- 删除原来只依赖 role 的 rest_requests 审批策略，改为依赖权限
DROP POLICY IF EXISTS "admins update requests" ON rest_requests;

CREATE POLICY "rest_managers update requests" ON rest_requests
  FOR UPDATE TO authenticated
  USING (can_manage_rest());

-- rest_requests 查看权限：管理员 / 拥有「排休管理」权限的岗位可查看全部申请
DROP POLICY IF EXISTS "admins select all requests" ON rest_requests;

CREATE POLICY "rest_managers select all requests" ON rest_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR can_manage_rest()
  );

-- rest_schedule 写入权限：审批通过时需要插入 rest_schedule，允许有「排休管理」权限的用户写入
DROP POLICY IF EXISTS "admins manage rest_schedule" ON rest_schedule;

CREATE POLICY "rest_managers manage rest_schedule" ON rest_schedule
  FOR ALL TO authenticated
  USING (can_manage_rest())
  WITH CHECK (can_manage_rest());