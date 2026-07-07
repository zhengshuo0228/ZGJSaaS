-- 品牌登录账号：用于登录页选择品牌后生成品牌内账号命名空间

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS login_code text;

UPDATE public.tenants
SET login_code = 'kxz'
WHERE login_code IS NULL
  AND (name = '開小灶' OR slug LIKE 'kai-xiao-zao%' OR slug LIKE 'kxz%');

UPDATE public.tenants
SET login_code = COALESCE(NULLIF(login_code, ''), slug)
WHERE login_code IS NULL OR login_code = '';

ALTER TABLE public.tenants
  ALTER COLUMN login_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_login_code_key
  ON public.tenants (login_code);
