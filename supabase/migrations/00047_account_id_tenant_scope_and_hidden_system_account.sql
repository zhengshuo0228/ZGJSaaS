-- 账号改为品牌内唯一；000 作为系统保留账号由业务层拦截注册/创建

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_tenant_account_id_key
  ON public.profiles (tenant_id, account_id)
  WHERE account_id IS NOT NULL AND tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_global_account_id_key
  ON public.profiles (account_id)
  WHERE account_id IS NOT NULL AND tenant_id IS NULL;

UPDATE public.profiles
SET account_id = lower(split_part(email, '@', 1))
WHERE account_id IS NULL
  AND email IS NOT NULL
  AND split_part(email, '@', 1) <> '';
