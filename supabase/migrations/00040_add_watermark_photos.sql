-- 水印照片存储 bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('watermark-photos', 'watermark-photos', true);

-- 水印照片表
CREATE TABLE watermark_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url   text NOT NULL,
  photo_path  text NOT NULL,
  remark      text DEFAULT '',
  taken_at    timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX watermark_photos_user_id_idx ON watermark_photos(user_id);
CREATE INDEX watermark_photos_taken_at_idx ON watermark_photos(taken_at DESC);

-- RLS
ALTER TABLE watermark_photos ENABLE ROW LEVEL SECURITY;

-- 已登录用户可查看所有水印照片（团队相册）
CREATE POLICY "authenticated_select_watermark_photos"
  ON watermark_photos FOR SELECT
  TO authenticated
  USING (true);

-- 已登录用户只能插入自己的照片
CREATE POLICY "authenticated_insert_own_watermark_photos"
  ON watermark_photos FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 用户可删除自己的照片；admin/super_admin 可删除任何照片
CREATE POLICY "authenticated_delete_own_watermark_photos"
  ON watermark_photos FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Storage RLS: 已登录用户可上传水印照片
CREATE POLICY "watermark_photos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'watermark-photos');

-- Storage RLS: 公开读取
CREATE POLICY "watermark_photos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'watermark-photos');

-- Storage RLS: 用户可删除自己上传的照片
CREATE POLICY "watermark_photos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'watermark-photos');