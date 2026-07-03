CREATE TABLE IF NOT EXISTS public.perf_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('add_item', 'deduct_item', 'remark')),
  content     text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perf_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read templates"
  ON public.perf_templates FOR SELECT TO authenticated USING (true);

-- 插入默认数据
INSERT INTO public.perf_templates (type, content, sort_order) VALUES
  ('add_item', '午市顶班炉台', 0),
  ('add_item', '晚市顶班配菜', 1),
  ('add_item', '临时加班', 2),
  ('add_item', '主动清洁', 3),
  ('add_item', '协助盘点', 4),
  ('add_item', '带新人', 5),
  ('add_item', '完成特殊任务', 6),
  ('add_item', '工作表现优秀', 7),
  ('deduct_item', '迟到', 0),
  ('deduct_item', '早退', 1),
  ('deduct_item', '客诉', 2),
  ('deduct_item', '备料失误', 3),
  ('deduct_item', '卫生不达标', 4),
  ('deduct_item', '工具损坏', 5),
  ('deduct_item', '违规操作', 6),
  ('deduct_item', '未按规定着装', 7),
  ('remark', '很棒继续加油！', 0),
  ('remark', '继续保持', 1),
  ('remark', '再接再厉', 2),
  ('remark', '辛苦了', 3),
  ('remark', '表现优秀', 4),
  ('remark', '下次注意', 5),
  ('remark', '需改进', 6),
  ('remark', '确认属实', 7),
  ('remark', '情况属实', 8),
  ('remark', '注意安全', 9)
ON CONFLICT DO NOTHING;
