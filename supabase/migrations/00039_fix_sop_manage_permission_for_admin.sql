
-- 修复 has_sop_manage_permission：admin / super_admin 角色直接放行
CREATE OR REPLACE FUNCTION public.has_sop_manage_permission()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role     text;
  v_position text;
  v_perms    jsonb;
BEGIN
  SELECT role, position INTO v_role, v_position
  FROM profiles WHERE id = auth.uid();

  -- admin / super_admin 拥有全量权限
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN true;
  END IF;

  IF v_position IS NULL THEN RETURN false; END IF;

  SELECT permissions INTO v_perms
  FROM positions WHERE name = v_position;

  RETURN COALESCE(v_perms, '[]'::jsonb) @> '["sop_manage"]'::jsonb;
END;
$$;
