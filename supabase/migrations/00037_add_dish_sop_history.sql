
-- dish_sop_history：每次保存SOP时写入完整快照
CREATE TABLE dish_sop_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id     uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  version     text NOT NULL,
  ingredients text,
  steps       text,
  plating     text,
  notes       text,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 索引：按菜品 + 时间倒序查询
CREATE INDEX idx_dish_sop_history_dish ON dish_sop_history(dish_id, created_at DESC);

-- RLS
ALTER TABLE dish_sop_history ENABLE ROW LEVEL SECURITY;

-- 全员可读历史记录
CREATE POLICY "sop_history_select_all" ON dish_sop_history
  FOR SELECT TO authenticated USING (true);

-- 有 sop_manage 权限才能写入（自动触发写入，但也需要 INSERT 权限）
CREATE POLICY "sop_history_insert_manage" ON dish_sop_history
  FOR INSERT TO authenticated WITH CHECK (has_sop_manage_permission());

-- 有 sop_manage 权限才能删除（回滚时不需要删除，保留历史）
CREATE POLICY "sop_history_delete_manage" ON dish_sop_history
  FOR DELETE TO authenticated USING (has_sop_manage_permission());
