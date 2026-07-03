-- 角色自定义权限配置表
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL UNIQUE CHECK (role IN ('user', 'admin', 'super_admin')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

-- 插入默认权限数据
INSERT INTO role_permissions (role, permissions) VALUES
  ('user',        '["提交申购单","查看申购历史"]'::jsonb),
  ('admin',       '["提交申购单","查看申购历史","审核申购单","查看采购汇总","管理食材库"]'::jsonb),
  ('super_admin', '["提交申购单","查看申购历史","审核申购单","查看采购汇总","管理食材库","账号管理","系统配置"]'::jsonb)
ON CONFLICT (role) DO NOTHING;

-- RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- 任何登录用户可读
CREATE POLICY "authenticated can read role_permissions"
  ON role_permissions FOR SELECT TO authenticated USING (true);

-- 只有 super_admin 可更新
CREATE POLICY "super_admin can update role_permissions"
  ON role_permissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));