-- 组织管理闭环：部门支持停用，不做物理删除，避免历史数据断链

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_departments_active
  ON public.departments(tenant_id, store_id, is_active);
