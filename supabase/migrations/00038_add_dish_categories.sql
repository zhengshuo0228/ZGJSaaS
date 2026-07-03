
-- 菜品分类表
CREATE TABLE dish_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 初始化默认分类
INSERT INTO dish_categories (name) VALUES
  ('热菜'), ('凉菜'), ('汤品'), ('主食'), ('点心'), ('饮品'), ('其它');

-- RLS
ALTER TABLE dish_categories ENABLE ROW LEVEL SECURITY;

-- 全员可读
CREATE POLICY "dish_categories_select_all" ON dish_categories
  FOR SELECT TO authenticated USING (true);

-- sop_manage 权限可新增
CREATE POLICY "dish_categories_insert_manage" ON dish_categories
  FOR INSERT TO authenticated WITH CHECK (has_sop_manage_permission());

-- sop_manage 权限可更新
CREATE POLICY "dish_categories_update_manage" ON dish_categories
  FOR UPDATE TO authenticated USING (has_sop_manage_permission());

-- sop_manage 权限可删除
CREATE POLICY "dish_categories_delete_manage" ON dish_categories
  FOR DELETE TO authenticated USING (has_sop_manage_permission());
