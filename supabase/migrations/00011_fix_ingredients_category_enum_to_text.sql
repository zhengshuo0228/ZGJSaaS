
-- 将 category 列从 ENUM 改为 text，保留已有数据和默认值
ALTER TABLE ingredients
  ALTER COLUMN category TYPE text USING category::text,
  ALTER COLUMN category SET DEFAULT '其它';

-- 删除旧 ENUM 类型（已无依赖）
DROP TYPE IF EXISTS ingredient_category;
