
-- 在 order_items 表增加从汇总中排除的标记
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS excluded_from_summary boolean NOT NULL DEFAULT false;
