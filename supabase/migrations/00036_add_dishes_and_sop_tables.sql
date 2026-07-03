
-- ===== dishes 表 =====
CREATE TABLE dishes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  category   text NOT NULL DEFAULT '其它',
  image_url  text,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== dish_sop 表 =====
CREATE TABLE dish_sop (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id     uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  ingredients text,
  steps       text,
  plating     text,
  notes       text,
  version     text NOT NULL DEFAULT 'v1.0',
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- updated_at 触发器
CREATE OR REPLACE FUNCTION update_dishes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_dishes_updated_at BEFORE UPDATE ON dishes FOR EACH ROW EXECUTE FUNCTION update_dishes_updated_at();

CREATE OR REPLACE FUNCTION update_dish_sop_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_dish_sop_updated_at BEFORE UPDATE ON dish_sop FOR EACH ROW EXECUTE FUNCTION update_dish_sop_updated_at();

-- ===== SECURITY DEFINER：检查 sop_manage 权限（positions.permissions 为 jsonb） =====
CREATE OR REPLACE FUNCTION has_sop_manage_permission()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_position text;
  v_perms    jsonb;
BEGIN
  SELECT position INTO v_position FROM profiles WHERE id = auth.uid();
  IF v_position IS NULL THEN RETURN false; END IF;
  SELECT permissions INTO v_perms FROM positions WHERE name = v_position;
  RETURN COALESCE(v_perms, '[]'::jsonb) @> '["sop_manage"]'::jsonb;
END;
$$;

-- ===== RLS =====
ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dish_sop ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dishes_select_all"    ON dishes FOR SELECT TO authenticated USING (true);
CREATE POLICY "dishes_insert_manage" ON dishes FOR INSERT TO authenticated WITH CHECK (has_sop_manage_permission());
CREATE POLICY "dishes_update_manage" ON dishes FOR UPDATE TO authenticated USING (has_sop_manage_permission()) WITH CHECK (has_sop_manage_permission());
CREATE POLICY "dishes_delete_manage" ON dishes FOR DELETE TO authenticated USING (has_sop_manage_permission());

CREATE POLICY "dish_sop_select_all"    ON dish_sop FOR SELECT TO authenticated USING (true);
CREATE POLICY "dish_sop_insert_manage" ON dish_sop FOR INSERT TO authenticated WITH CHECK (has_sop_manage_permission());
CREATE POLICY "dish_sop_update_manage" ON dish_sop FOR UPDATE TO authenticated USING (has_sop_manage_permission()) WITH CHECK (has_sop_manage_permission());
CREATE POLICY "dish_sop_delete_manage" ON dish_sop FOR DELETE TO authenticated USING (has_sop_manage_permission());

-- ===== Storage bucket：dish-images =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dish-images','dish-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dish_images_select" ON storage.objects FOR SELECT USING (bucket_id = 'dish-images');
CREATE POLICY "dish_images_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'dish-images' AND has_sop_manage_permission());
CREATE POLICY "dish_images_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'dish-images' AND has_sop_manage_permission());
CREATE POLICY "dish_images_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'dish-images' AND has_sop_manage_permission());

-- ===== 为超级管理员/管理员/厨师长岗位追加 sop_manage 权限 =====
UPDATE positions
SET permissions = permissions || '["sop_manage"]'::jsonb
WHERE name IN ('超级管理员','管理员','厨师长')
  AND NOT (permissions @> '["sop_manage"]'::jsonb);
