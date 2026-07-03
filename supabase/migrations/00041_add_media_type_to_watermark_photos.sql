
-- 给 watermark_photos 表加 media_type 字段（image/video）
ALTER TABLE watermark_photos
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video'));

-- 写入企业名称默认配置到 app_config
INSERT INTO app_config (key, value)
VALUES ('watermark_company', '開小灶PMS')
ON CONFLICT (key) DO NOTHING;
