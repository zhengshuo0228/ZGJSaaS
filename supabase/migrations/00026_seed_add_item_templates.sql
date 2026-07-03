-- 补充加分事项模板种子数据（仅在尚无 add_item 行时插入，幂等）
INSERT INTO perf_templates (type, content, sort_order, linked_tag, tag_threshold)
SELECT * FROM (VALUES
  ('add_item'::text, '超额完成任务',    0, NULL::text, NULL::int),
  ('add_item',       '主动帮助同事',    1, NULL, NULL),
  ('add_item',       '提出合理建议',    2, NULL, NULL),
  ('add_item',       '提前完成备料',    3, NULL, NULL),
  ('add_item',       '客户好评',        4, '明星员工', 3),
  ('add_item',       '零失误出餐',      5, NULL, NULL),
  ('add_item',       '卫生检查满分',    6, NULL, NULL),
  ('add_item',       '自愿加班顶岗',    7, NULL, NULL)
) AS v(type, content, sort_order, linked_tag, tag_threshold)
WHERE NOT EXISTS (SELECT 1 FROM perf_templates WHERE type = 'add_item');