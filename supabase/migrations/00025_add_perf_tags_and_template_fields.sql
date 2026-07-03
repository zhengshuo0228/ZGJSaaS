
-- profiles 增加 earned_tags JSONB 字段
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS earned_tags jsonb DEFAULT '[]'::jsonb;

-- perf_templates 增加 linked_tag 和 tag_threshold
ALTER TABLE public.perf_templates
ADD COLUMN IF NOT EXISTS linked_tag text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tag_threshold int DEFAULT NULL;

-- earned_tags RLS 保持现有策略（profiles 已有 RLS，earned_tags 属于 profiles 列）
-- 但需确保用户可以更新自己的 earned_tags（profiles 已有策略 "用户更新自己的profile"）
