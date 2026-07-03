-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  operator_name text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_name text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE operation_logs ENABLE ROW LEVEL SECURITY;

-- 只有 super_admin 可读
CREATE POLICY "super_admin can read logs"
  ON operation_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- authenticated 可写（由应用控制写入时机）
CREATE POLICY "authenticated can insert logs"
  ON operation_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_operator ON operation_logs(operator_id);