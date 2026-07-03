
-- watermark_comments 添加 post_id 字段，指向 watermark_posts
ALTER TABLE watermark_comments
  ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES watermark_posts(id) ON DELETE CASCADE;

-- 为存量数据：photo_id 实际存的是 watermark_posts.id（之前业务用法），直接回填
UPDATE watermark_comments wc
SET post_id = wc.photo_id
WHERE wc.post_id IS NULL
  AND EXISTS (SELECT 1 FROM watermark_posts wp WHERE wp.id = wc.photo_id);

CREATE INDEX IF NOT EXISTS idx_watermark_comments_post_id ON watermark_comments(post_id);

-- 确保 watermark_comments 的 SELECT/INSERT/DELETE RLS 允许认证用户操作
DO $$
BEGIN
  -- SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_comments' AND policyname='comments_select') THEN
    EXECUTE 'CREATE POLICY comments_select ON watermark_comments FOR SELECT TO authenticated USING (true)';
  END IF;
  -- INSERT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_comments' AND policyname='comments_insert') THEN
    EXECUTE 'CREATE POLICY comments_insert ON watermark_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  -- DELETE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_comments' AND policyname='comments_delete') THEN
    EXECUTE 'CREATE POLICY comments_delete ON watermark_comments FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;

-- 确保 watermark_likes RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_likes' AND policyname='likes_select') THEN
    EXECUTE 'CREATE POLICY likes_select ON watermark_likes FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_likes' AND policyname='likes_insert') THEN
    EXECUTE 'CREATE POLICY likes_insert ON watermark_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_likes' AND policyname='likes_delete') THEN
    EXECUTE 'CREATE POLICY likes_delete ON watermark_likes FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;

-- 确保 watermark_post_media RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_post_media' AND policyname='media_select') THEN
    EXECUTE 'CREATE POLICY media_select ON watermark_post_media FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_post_media' AND policyname='media_insert') THEN
    EXECUTE 'CREATE POLICY media_insert ON watermark_post_media FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM watermark_posts WHERE id = post_id AND user_id = auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watermark_post_media' AND policyname='media_delete') THEN
    EXECUTE 'CREATE POLICY media_delete ON watermark_post_media FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM watermark_posts WHERE id = post_id AND user_id = auth.uid()))';
  END IF;
END $$;
