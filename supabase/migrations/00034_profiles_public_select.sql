
-- profiles 表添加公开查看策略，允许所有已登录用户查看他人基本信息
-- 企业内部 PMS 系统中，员工姓名和职位属于公开信息

DROP POLICY IF EXISTS "authenticated users select all profiles" ON public.profiles;

CREATE POLICY "authenticated users select all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
