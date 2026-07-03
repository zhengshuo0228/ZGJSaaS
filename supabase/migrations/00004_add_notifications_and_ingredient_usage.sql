
-- ===== 通知表 =====
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('approved', 'rejected', 'modified', 'system')),
  title text NOT NULL,
  body text NOT NULL,
  order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户可查看自己的通知" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "认证用户可插入通知" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "用户可标记自己的通知已读" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===== 食材使用次数字段 =====
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;
