
-- 修复：watermark_posts.user_id 缺少 DEFAULT auth.uid()
-- 导致前端未传 user_id 时 RLS WITH CHECK (uid() = user_id) 校验失败
ALTER TABLE watermark_posts 
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 同步修复 watermark_photos 表（如有相同问题）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'watermark_photos' AND column_name = 'user_id' AND column_default IS NULL
  ) THEN
    ALTER TABLE watermark_photos ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;
