
-- 工作圈发帖表（一次发布 = 一条 post，可含多张图/视频）
CREATE TABLE IF NOT EXISTS watermark_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  remark      TEXT,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 工作圈媒体附件表（多对一绑到 post）
CREATE TABLE IF NOT EXISTS watermark_post_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES watermark_posts(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  photo_path  TEXT,
  media_type  TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 评论表加 parent_id（支持回复）、reply_to_user_id（@提及）、post_id
ALTER TABLE watermark_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES watermark_comments(id) ON DELETE CASCADE;
ALTER TABLE watermark_comments ADD COLUMN IF NOT EXISTS reply_to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE watermark_comments ADD COLUMN IF NOT EXISTS reply_to_name TEXT;

-- 用户推送 token 表
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'expo',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- RLS
ALTER TABLE watermark_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE watermark_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select"      ON watermark_posts      FOR SELECT USING (true);
CREATE POLICY "posts_insert"      ON watermark_posts      FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_delete"      ON watermark_posts      FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "media_select"      ON watermark_post_media FOR SELECT USING (true);
CREATE POLICY "media_insert"      ON watermark_post_media FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM watermark_posts WHERE id = post_id AND user_id = auth.uid())
);
CREATE POLICY "media_delete"      ON watermark_post_media FOR DELETE USING (
  EXISTS (SELECT 1 FROM watermark_posts WHERE id = post_id AND user_id = auth.uid())
);

CREATE POLICY "tokens_select"     ON user_push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tokens_upsert"     ON user_push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tokens_update"     ON user_push_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tokens_delete"     ON user_push_tokens FOR DELETE USING (auth.uid() = user_id);

-- 点赞表绑定 post（向后兼容，photo_id 可为空）
ALTER TABLE watermark_likes ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES watermark_posts(id) ON DELETE CASCADE;
ALTER TABLE watermark_likes ALTER COLUMN photo_id DROP NOT NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_posts_user       ON watermark_posts(user_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_post       ON watermark_post_media(post_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_comments_parent  ON watermark_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post       ON watermark_likes(post_id);
