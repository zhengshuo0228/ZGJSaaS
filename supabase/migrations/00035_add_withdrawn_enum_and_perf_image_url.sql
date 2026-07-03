-- status 是 enum 类型，需用 ALTER TYPE 添加值
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'withdrawn';

-- performance_scores 确保 image_url 列存在
ALTER TABLE performance_scores
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 申购单操作日志索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_purchase
  ON operation_logs (target_type, created_at DESC)
  WHERE target_type = 'purchase';