-- 确保 performance-images bucket 有 authenticated 上传权限
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'authenticated upload performance images'
  ) THEN
    CREATE POLICY "authenticated upload performance images"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'performance-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'public read performance images'
  ) THEN
    CREATE POLICY "public read performance images"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'performance-images');
  END IF;
END$$;
