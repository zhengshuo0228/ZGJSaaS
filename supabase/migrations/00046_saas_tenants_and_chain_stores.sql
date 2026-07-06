-- 鐏剁瀹?SaaS 澶氬搧鐗?澶氶棬搴楀熀纭€妯″瀷

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  contact_name text,
  contact_phone text,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'free_active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('free_active', 'trialing', 'active', 'suspended', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_id, name)
);

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'member',
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  brand_name text NOT NULL,
  store_name text NOT NULL,
  contact_name text NOT NULL,
  account text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'approved',
  created_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_registration_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE OR REPLACE FUNCTION public.slugify_tenant_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(input, 'tenant')), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.account_id = '000' OR p.role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tm.tenant_id), ARRAY[]::uuid[])
  FROM public.tenant_memberships tm
  WHERE tm.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_access_tenant(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR target_tenant_id = ANY(public.current_tenant_ids());
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tenant(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = target_tenant_id
        AND tm.role IN ('owner', 'tenant_admin', 'store_admin')
    );
$$;

DO $$
DECLARE
  legacy_tenant_id uuid;
  legacy_store_id uuid;
  kitchen_department_id uuid;
BEGIN
  INSERT INTO public.tenants (name, slug, status)
  VALUES ('開小灶', 'kaixiaozao', 'active')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO legacy_tenant_id;

  INSERT INTO public.stores (tenant_id, name, code)
  VALUES (legacy_tenant_id, '默认门店', 'default')
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO legacy_store_id;

  INSERT INTO public.departments (tenant_id, store_id, name, is_system)
  VALUES
    (legacy_tenant_id, legacy_store_id, '厨房', true),
    (legacy_tenant_id, legacy_store_id, '前厅', true)
  ON CONFLICT (tenant_id, store_id, name) DO NOTHING;

  SELECT id INTO kitchen_department_id
  FROM public.departments
  WHERE tenant_id = legacy_tenant_id AND store_id = legacy_store_id AND name = '厨房'
  LIMIT 1;

  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
  UPDATE public.profiles
  SET tenant_id = COALESCE(tenant_id, legacy_tenant_id),
      store_id = COALESCE(store_id, legacy_store_id),
      department_id = COALESCE(department_id, kitchen_department_id)
  WHERE tenant_id IS NULL OR store_id IS NULL OR department_id IS NULL;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, store_id, department_id, role, is_primary)
  SELECT
    COALESCE(p.tenant_id, legacy_tenant_id),
    p.id,
    COALESCE(p.store_id, legacy_store_id),
    COALESCE(p.department_id, kitchen_department_id),
    CASE
      WHEN p.account_id = '000' OR p.role = 'super_admin' THEN 'owner'
      WHEN p.role = 'admin' THEN 'tenant_admin'
      ELSE 'member'
    END,
    true
  FROM public.profiles p
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.positions SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;

  ALTER TABLE public.ingredient_categories ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.ingredient_subcategories ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.ingredient_suppliers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.ingredient_units ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;
  UPDATE public.ingredient_categories SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.ingredient_subcategories SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.ingredient_suppliers SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.ingredient_units SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.ingredients SET tenant_id = legacy_tenant_id, store_id = COALESCE(store_id, legacy_store_id) WHERE tenant_id IS NULL OR store_id IS NULL;

  ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;
  UPDATE public.purchase_orders po
  SET tenant_id = COALESCE(po.tenant_id, p.tenant_id, legacy_tenant_id),
      store_id = COALESCE(po.store_id, p.store_id, legacy_store_id)
  FROM public.profiles p
  WHERE po.submitter_id = p.id AND (po.tenant_id IS NULL OR po.store_id IS NULL);

  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.notifications n
  SET tenant_id = COALESCE(n.tenant_id, p.tenant_id, legacy_tenant_id)
  FROM public.profiles p
  WHERE n.user_id = p.id AND n.tenant_id IS NULL;

  ALTER TABLE public.operation_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.operation_logs ol
  SET tenant_id = COALESCE(ol.tenant_id, p.tenant_id, legacy_tenant_id)
  FROM public.profiles p
  WHERE ol.operator_id = p.id AND ol.tenant_id IS NULL;
  UPDATE public.operation_logs SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;

  ALTER TABLE public.performance_scores ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.perf_templates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.performance_scores ps
  SET tenant_id = COALESCE(ps.tenant_id, p.tenant_id, legacy_tenant_id)
  FROM public.profiles p
  WHERE ps.user_id = p.id AND ps.tenant_id IS NULL;
  UPDATE public.perf_templates SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;

  ALTER TABLE public.rest_schedule ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.rest_requests ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.no_rest_days ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.rest_schedule rs SET tenant_id = COALESCE(rs.tenant_id, p.tenant_id, legacy_tenant_id) FROM public.profiles p WHERE rs.user_id = p.id AND rs.tenant_id IS NULL;
  UPDATE public.rest_requests rr SET tenant_id = COALESCE(rr.tenant_id, p.tenant_id, legacy_tenant_id) FROM public.profiles p WHERE rr.user_id = p.id AND rr.tenant_id IS NULL;
  UPDATE public.no_rest_days SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;

  ALTER TABLE public.dish_categories ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.dishes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.dishes ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;
  ALTER TABLE public.dish_sop ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.dish_sop_history ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.dish_categories SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.dishes SET tenant_id = legacy_tenant_id, store_id = COALESCE(store_id, legacy_store_id) WHERE tenant_id IS NULL OR store_id IS NULL;
  UPDATE public.dish_sop SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.dish_sop_history SET tenant_id = legacy_tenant_id WHERE tenant_id IS NULL;

  ALTER TABLE public.watermark_photos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.watermark_posts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.watermark_post_media ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.watermark_likes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  ALTER TABLE public.watermark_comments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.watermark_photos wp SET tenant_id = COALESCE(wp.tenant_id, p.tenant_id, legacy_tenant_id) FROM public.profiles p WHERE wp.user_id = p.id AND wp.tenant_id IS NULL;
  UPDATE public.watermark_posts wp SET tenant_id = COALESCE(wp.tenant_id, p.tenant_id, legacy_tenant_id) FROM public.profiles p WHERE wp.user_id = p.id AND wp.tenant_id IS NULL;
  UPDATE public.watermark_post_media wpm SET tenant_id = COALESCE(wpm.tenant_id, wp.tenant_id, legacy_tenant_id) FROM public.watermark_posts wp WHERE wpm.post_id = wp.id AND wpm.tenant_id IS NULL;
  UPDATE public.watermark_likes wl SET tenant_id = COALESCE(wl.tenant_id, wp.tenant_id, legacy_tenant_id) FROM public.watermark_posts wp WHERE wl.post_id = wp.id AND wl.tenant_id IS NULL;
  UPDATE public.watermark_comments wc SET tenant_id = COALESCE(wc.tenant_id, wp.tenant_id, legacy_tenant_id) FROM public.watermark_posts wp WHERE wc.post_id = wp.id AND wc.tenant_id IS NULL;

  ALTER TABLE public.user_push_tokens ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.user_push_tokens upt SET tenant_id = COALESCE(upt.tenant_id, p.tenant_id, legacy_tenant_id) FROM public.profiles p WHERE upt.user_id = p.id AND upt.tenant_id IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_store_department ON public.profiles(store_id, department_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON public.tenant_memberships(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_stores_tenant ON public.stores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_store ON public.departments(tenant_id, store_id);
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS positions_tenant_name_key ON public.positions(tenant_id, name);
ALTER TABLE public.ingredient_categories DROP CONSTRAINT IF EXISTS ingredient_categories_name_key;
ALTER TABLE public.ingredient_suppliers DROP CONSTRAINT IF EXISTS ingredient_suppliers_name_key;
ALTER TABLE public.ingredient_units DROP CONSTRAINT IF EXISTS ingredient_units_name_key;
ALTER TABLE public.dish_categories DROP CONSTRAINT IF EXISTS dish_categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_categories_tenant_name_key ON public.ingredient_categories(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_suppliers_tenant_name_key ON public.ingredient_suppliers(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_units_tenant_name_key ON public.ingredient_units(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS dish_categories_tenant_name_key ON public.dish_categories(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON public.purchase_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user ON public.notifications(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingredients_tenant ON public.ingredients(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_watermark_posts_tenant ON public.watermark_posts(tenant_id, taken_at DESC);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_registration_requests ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
  policy_name text;
  protected_tables text[] := ARRAY[
    'tenants', 'stores', 'departments', 'tenant_memberships',
    'profiles', 'positions',
    'ingredient_categories', 'ingredient_subcategories', 'ingredient_suppliers', 'ingredient_units', 'ingredients',
    'purchase_orders', 'order_items', 'notifications', 'operation_logs',
    'performance_scores', 'perf_templates',
    'rest_schedule', 'rest_requests', 'no_rest_days',
    'dish_categories', 'dishes', 'dish_sop', 'dish_sop_history',
    'watermark_photos', 'watermark_posts', 'watermark_post_media', 'watermark_likes', 'watermark_comments',
    'user_push_tokens'
  ];
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    FOR policy_name IN
      SELECT pol.polname
      FROM pg_policy pol
      JOIN pg_class cls ON cls.oid = pol.polrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public' AND cls.relname = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated USING (public.can_access_tenant(id));
CREATE POLICY tenants_update ON public.tenants FOR UPDATE TO authenticated USING (public.can_manage_tenant(id)) WITH CHECK (public.can_manage_tenant(id));

CREATE POLICY stores_select ON public.stores FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY stores_write ON public.stores FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY departments_write ON public.departments FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY memberships_select ON public.tenant_memberships FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY memberships_write ON public.tenant_memberships FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY registration_insert_public ON public.tenant_registration_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY registration_select_admin ON public.tenant_registration_requests FOR SELECT TO authenticated USING (public.is_platform_admin() OR public.can_manage_tenant(tenant_id));

CREATE POLICY profiles_select_tenant ON public.profiles FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY profiles_update_self_or_admin ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.can_manage_tenant(tenant_id)) WITH CHECK (auth.uid() = id OR public.can_manage_tenant(tenant_id));
CREATE POLICY profiles_insert_admin ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY positions_select_tenant ON public.positions FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY positions_write_admin ON public.positions FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY categories_select_tenant ON public.ingredient_categories FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY categories_write_admin ON public.ingredient_categories FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY subcategories_select_tenant ON public.ingredient_subcategories FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY subcategories_write_admin ON public.ingredient_subcategories FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY suppliers_select_tenant ON public.ingredient_suppliers FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY suppliers_write_admin ON public.ingredient_suppliers FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY units_select_tenant ON public.ingredient_units FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY units_write_admin ON public.ingredient_units FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY ingredients_select_tenant ON public.ingredients FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY ingredients_write_admin ON public.ingredients FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY purchase_orders_select_tenant ON public.purchase_orders FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY purchase_orders_insert_tenant ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitter_id AND public.can_access_tenant(tenant_id));
CREATE POLICY purchase_orders_update_admin_or_owner ON public.purchase_orders FOR UPDATE TO authenticated USING (auth.uid() = submitter_id OR public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_access_tenant(tenant_id));
CREATE POLICY order_items_select_tenant ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = order_id AND public.can_access_tenant(po.tenant_id)));
CREATE POLICY order_items_write_tenant ON public.order_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = order_id AND public.can_access_tenant(po.tenant_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = order_id AND public.can_access_tenant(po.tenant_id)));

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id));
CREATE POLICY notifications_insert_tenant ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.can_access_tenant(tenant_id));
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id)) WITH CHECK (auth.uid() = user_id OR public.can_manage_tenant(tenant_id));

CREATE POLICY operation_logs_select_tenant ON public.operation_logs FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY operation_logs_insert_tenant ON public.operation_logs FOR INSERT TO authenticated WITH CHECK (public.can_access_tenant(tenant_id));

CREATE POLICY performance_scores_select_tenant ON public.performance_scores FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY performance_scores_write_admin ON public.performance_scores FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id) OR auth.uid() = user_id) WITH CHECK (public.can_access_tenant(tenant_id));
CREATE POLICY perf_templates_select_tenant ON public.perf_templates FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY perf_templates_write_admin ON public.perf_templates FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY rest_schedule_select_tenant ON public.rest_schedule FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY rest_schedule_write_admin ON public.rest_schedule FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id) OR auth.uid() = user_id) WITH CHECK (public.can_access_tenant(tenant_id));
CREATE POLICY rest_requests_select_tenant ON public.rest_requests FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY rest_requests_write_tenant ON public.rest_requests FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id) OR auth.uid() = user_id) WITH CHECK (public.can_access_tenant(tenant_id));
CREATE POLICY no_rest_days_select_tenant ON public.no_rest_days FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY no_rest_days_write_admin ON public.no_rest_days FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY dish_categories_select_tenant ON public.dish_categories FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY dish_categories_write_admin ON public.dish_categories FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY dishes_select_tenant ON public.dishes FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY dishes_write_admin ON public.dishes FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY dish_sop_select_tenant ON public.dish_sop FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY dish_sop_write_admin ON public.dish_sop FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY dish_sop_history_select_tenant ON public.dish_sop_history FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY dish_sop_history_write_admin ON public.dish_sop_history FOR ALL TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

CREATE POLICY watermark_photos_select_tenant ON public.watermark_photos FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY watermark_photos_write_own ON public.watermark_photos FOR ALL TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id)) WITH CHECK (auth.uid() = user_id AND public.can_access_tenant(tenant_id));
CREATE POLICY watermark_posts_select_tenant ON public.watermark_posts FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY watermark_posts_write_own ON public.watermark_posts FOR ALL TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id)) WITH CHECK (auth.uid() = user_id AND public.can_access_tenant(tenant_id));
CREATE POLICY watermark_media_select_tenant ON public.watermark_post_media FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY watermark_media_write_post_owner ON public.watermark_post_media FOR ALL TO authenticated USING (public.can_access_tenant(tenant_id)) WITH CHECK (public.can_access_tenant(tenant_id));
CREATE POLICY watermark_likes_select_tenant ON public.watermark_likes FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY watermark_likes_write_own ON public.watermark_likes FOR ALL TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id)) WITH CHECK (auth.uid() = user_id AND public.can_access_tenant(tenant_id));
CREATE POLICY watermark_comments_select_tenant ON public.watermark_comments FOR SELECT TO authenticated USING (public.can_access_tenant(tenant_id));
CREATE POLICY watermark_comments_write_own ON public.watermark_comments FOR ALL TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id)) WITH CHECK (auth.uid() = user_id AND public.can_access_tenant(tenant_id));

CREATE POLICY push_tokens_select_own ON public.user_push_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id));
CREATE POLICY push_tokens_write_own ON public.user_push_tokens FOR ALL TO authenticated USING (auth.uid() = user_id OR public.can_manage_tenant(tenant_id)) WITH CHECK (auth.uid() = user_id AND public.can_access_tenant(tenant_id));

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;


