
-- 1. performance_scores 新增 note 列（申请说明）
ALTER TABLE performance_scores ADD COLUMN IF NOT EXISTS note text;

-- 2. perf_templates 新增 description 列（事项描述说明）
ALTER TABLE perf_templates ADD COLUMN IF NOT EXISTS description text;

-- 3. 补充新权限节点到 role_permissions
-- super_admin: 获得全部5个新权限
UPDATE role_permissions
SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements_text(
    permissions || '["绩效查看权限","绩效审核申请权限","绩效审核权限","绩效管理权限","全员记录查看权限"]'::jsonb
  ) AS elem
)
WHERE role = 'super_admin';

-- admin: 获得绩效查看权限、绩效审核申请权限、全员记录查看权限
UPDATE role_permissions
SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements_text(
    permissions || '["绩效查看权限","绩效审核申请权限","全员记录查看权限"]'::jsonb
  ) AS elem
)
WHERE role = 'admin';

-- user: 获得绩效查看权限、绩效审核申请权限
UPDATE role_permissions
SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements_text(
    permissions || '["绩效查看权限","绩效审核申请权限"]'::jsonb
  ) AS elem
)
WHERE role = 'user';

-- chef 角色如果存在，也给基础权限
UPDATE role_permissions
SET permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements_text(
    permissions || '["绩效查看权限","绩效审核申请权限"]'::jsonb
  ) AS elem
)
WHERE role = 'chef';
