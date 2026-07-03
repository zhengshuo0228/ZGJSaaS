
-- Step 1: 给 positions 表添加 permissions 字段
ALTER TABLE positions ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Step 2: 根据 positions 表的 name 字段匹配 role_permissions，把权限迁移过来
-- 当 positions.name 与 role_permissions.role 同名时直接继承，否则按常见对应关系填充
UPDATE positions p
SET permissions = rp.permissions
FROM role_permissions rp
WHERE rp.role = p.name;

-- Step 3: 对没有匹配到的岗位（如"厨师"、"厨师长"等常用岗位），
-- 按 super_admin 的权限模板初始化（避免岗位权限为空导致用户丢失功能）
-- 实际上只有通过 UI 界面才能真正定制每个岗位的权限
-- 这里给所有仍为空数组的岗位设置 user 角色的基础权限
UPDATE positions
SET permissions = '["提交申购单","查看申购历史","绩效提交申请"]'::jsonb
WHERE permissions = '[]'::jsonb;

-- Step 4: 更新 RLS 策略 —— positions 表允许 authenticated 用户读取（已有），确保 permissions 字段可读
-- 新增：允许 super_admin 更新 positions（含 permissions 字段）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'positions' AND policyname = 'super_admin update positions'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "super_admin update positions"
      ON positions FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'admin')
        )
      )
    $pol$;
  END IF;
END $$;

-- Step 5: role_permissions 表废弃（保留结构，不删除，只是后续代码不再依赖）
-- 添加注释标记已废弃
COMMENT ON TABLE role_permissions IS 'DEPRECATED: 权限已迁移到 positions.permissions，此表不再使用';
