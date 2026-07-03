
-- 子分类表
CREATE TABLE IF NOT EXISTS ingredient_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES ingredient_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 给食材表添加子分类关联
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES ingredient_subcategories(id) ON DELETE SET NULL;

-- 启用 RLS
ALTER TABLE ingredient_subcategories ENABLE ROW LEVEL SECURITY;

-- 公开读取
CREATE POLICY "public_select_subcategories"
  ON ingredient_subcategories FOR SELECT TO public
  USING (true);

-- 认证用户可增改删
CREATE POLICY "authenticated_crud_subcategories"
  ON ingredient_subcategories FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
