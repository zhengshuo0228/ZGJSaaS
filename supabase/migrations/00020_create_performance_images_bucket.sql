
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'performance-images',
  'performance-images',
  true,
  1048576,
  ARRAY['image/jpeg','image/png','image/webp']
) ON CONFLICT (id) DO NOTHING;

-- 已认证用户可上传
CREATE POLICY "perf_img_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'performance-images');

-- 公开读取
CREATE POLICY "perf_img_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'performance-images');
