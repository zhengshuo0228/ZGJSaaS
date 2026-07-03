
-- ===== rest_schedule（排休记录）=====
CREATE TABLE public.rest_schedule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rest_date    date NOT NULL,
  rest_type    text NOT NULL CHECK (rest_type IN ('full','am','pm')),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rest_schedule_date_idx ON public.rest_schedule(rest_date);
CREATE INDEX rest_schedule_user_idx ON public.rest_schedule(user_id);

-- ===== no_rest_days（全员不休日）=====
CREATE TABLE public.no_rest_days (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date  date NOT NULL UNIQUE
);
CREATE INDEX no_rest_days_date_idx ON public.no_rest_days(date);

-- ===== app_config（系统配置项）=====
CREATE TABLE public.app_config (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key   text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT ''
);
-- 初始化提示条
INSERT INTO public.app_config (key, value) VALUES ('rest_notice', '如有调休，服从安排');

-- ===== RLS =====
ALTER TABLE public.rest_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.no_rest_days  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config    ENABLE ROW LEVEL SECURITY;

-- rest_schedule：已登录用户可读全部，写操作由前端通过 service_role 或检查权限
CREATE POLICY "authenticated read rest_schedule"
  ON public.rest_schedule FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert rest_schedule"
  ON public.rest_schedule FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update rest_schedule"
  ON public.rest_schedule FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "authenticated delete rest_schedule"
  ON public.rest_schedule FOR DELETE
  TO authenticated
  USING (true);

-- no_rest_days：已登录用户可读全部，写操作需权限（前端控制）
CREATE POLICY "authenticated read no_rest_days"
  ON public.no_rest_days FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert no_rest_days"
  ON public.no_rest_days FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated delete no_rest_days"
  ON public.no_rest_days FOR DELETE
  TO authenticated
  USING (true);

-- app_config：已登录用户可读，管理员可写（前端权限控制）
CREATE POLICY "authenticated read app_config"
  ON public.app_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated update app_config"
  ON public.app_config FOR UPDATE
  TO authenticated
  USING (true);
