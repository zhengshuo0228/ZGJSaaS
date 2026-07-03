
-- 岗位表
CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int DEFAULT 99,
  created_at timestamptz DEFAULT now()
);

-- 默认岗位
INSERT INTO positions (name, sort_order) VALUES
  ('厨师长', 1),
  ('采购员', 2),
  ('仓管员', 3),
  ('行政', 4)
ON CONFLICT (name) DO NOTHING;

-- profiles 增加 position 字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position text;

-- RLS for positions
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read positions"
  ON positions FOR SELECT TO authenticated USING (true);

CREATE POLICY "super_admin manage positions"
  ON positions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
