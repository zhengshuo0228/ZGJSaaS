-- notifications 表新增 perf_id 字段（绩效通知携带绩效记录ID）
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS perf_id uuid DEFAULT NULL;

-- 同步更新 NotificationType 枚举（notifications.type 是 text，不需要 enum 修改）
-- perf_submitted: 员工提交绩效申请 → 通知审核人
-- perf_approved:  绩效审核通过    → 通知申请人
-- perf_rejected:  绩效审核驳回    → 通知申请人
-- 以上三个值与现有 text 字段兼容，无需 DDL 变更

-- performance_scores 表补充 reviewed_at 字段（审核时间）
ALTER TABLE performance_scores ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN notifications.perf_id IS '绩效记录ID，绩效类通知携带';
COMMENT ON COLUMN performance_scores.reviewed_at IS '审核时间（approve/reject 时写入）';