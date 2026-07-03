
-- 食材分类表
CREATE TABLE IF NOT EXISTS ingredient_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 99,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 供应商表
CREATE TABLE IF NOT EXISTS ingredient_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 写入初始分类数据
INSERT INTO ingredient_categories (name, sort_order) VALUES
  ('蔬菜', 1),
  ('禽肉', 2),
  ('河鲜', 3),
  ('冻品', 4),
  ('干货调料', 5),
  ('其它', 99)
ON CONFLICT (name) DO NOTHING;

-- 从现有食材表中提取供应商写入供应商表
INSERT INTO ingredient_suppliers (name)
SELECT DISTINCT supplier FROM ingredients WHERE supplier IS NOT NULL AND supplier <> ''
ON CONFLICT (name) DO NOTHING;

-- 开启 RLS
ALTER TABLE ingredient_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_suppliers ENABLE ROW LEVEL SECURITY;

-- 所有已登录用户可读
CREATE POLICY "authenticated_read_categories"
  ON ingredient_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_suppliers"
  ON ingredient_suppliers FOR SELECT TO authenticated USING (true);

-- 管理员可写（通过 profiles.role 判断）
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

CREATE POLICY "admin_write_categories"
  ON ingredient_categories FOR ALL TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "admin_write_suppliers"
  ON ingredient_suppliers FOR ALL TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());
