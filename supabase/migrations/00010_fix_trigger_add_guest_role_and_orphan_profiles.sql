
-- 1. 添加 guest 到 user_role 枚举
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'guest';

-- 2. 修复孤儿用户（在 auth.users 中有记录但 profiles 中无对应行）
INSERT INTO public.profiles (id, email, role)
SELECT au.id, au.email, 'user'::public.user_role
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3. 重建 handle_new_user 触发器函数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. 确保触发器存在（先删后建，保证最新版本生效）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
