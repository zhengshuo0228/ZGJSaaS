
-- 点赞表（每人每条媒体只能点赞一次）
CREATE TABLE IF NOT EXISTS watermark_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   UUID NOT NULL REFERENCES watermark_photos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (photo_id, user_id)
);

-- 评论表
CREATE TABLE IF NOT EXISTS watermark_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   UUID NOT NULL REFERENCES watermark_photos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE watermark_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE watermark_comments ENABLE ROW LEVEL SECURITY;

-- 点赞：所有登录用户可查看；本人可增删
CREATE POLICY "likes_select" ON watermark_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON watermark_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON watermark_likes FOR DELETE USING (auth.uid() = user_id);

-- 评论：所有登录用户可查看；本人可增删
CREATE POLICY "comments_select" ON watermark_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON watermark_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON watermark_comments FOR DELETE USING (auth.uid() = user_id);

-- 索引
CREATE INDEX IF NOT EXISTS idx_likes_photo    ON watermark_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_comments_photo ON watermark_comments(photo_id);
CREATE INDEX IF NOT EXISTS idx_comments_photo_created ON watermark_comments(photo_id, created_at);
