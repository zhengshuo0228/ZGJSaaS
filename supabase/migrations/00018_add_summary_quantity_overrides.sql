
-- 采购汇总数量修改记录表（按食材+时间段存储覆盖数量）
CREATE TABLE IF NOT EXISTS summary_quantity_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  start_date timestamptz,   -- 对应时间段开始（NULL 表示全部）
  end_date timestamptz,     -- 对应时间段结束
  override_quantity numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 按食材+时间段唯一（做 upsert 用）
CREATE UNIQUE INDEX IF NOT EXISTS idx_sqo_ingredient_range
  ON summary_quantity_overrides (ingredient_id, COALESCE(start_date, '1970-01-01'), COALESCE(end_date, '9999-12-31'));

-- RLS
ALTER TABLE summary_quantity_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can manage overrides" ON summary_quantity_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "all authenticated can read overrides" ON summary_quantity_overrides
  FOR SELECT TO authenticated USING (true);
