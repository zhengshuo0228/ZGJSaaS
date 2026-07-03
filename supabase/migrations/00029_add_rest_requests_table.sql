-- 请假/调休申请表
CREATE TABLE IF NOT EXISTS rest_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rest_date   date NOT NULL,
  rest_type   text NOT NULL CHECK (rest_type IN ('full','am','pm')),
  reason      text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES profiles(id),
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rest_requests ENABLE ROW LEVEL SECURITY;

-- 员工：查看自己的申请
CREATE POLICY "users select own requests" ON rest_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 管理员：查看全部申请
CREATE POLICY "admins select all requests" ON rest_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

-- 员工：提交申请
CREATE POLICY "users insert own requests" ON rest_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 员工：撤回 pending 申请
CREATE POLICY "users delete own pending" ON rest_requests
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

-- 管理员：审批（更新 status/review_note/reviewed_by/reviewed_at）
CREATE POLICY "admins update requests" ON rest_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

-- rest_schedule RLS（确保全员可读，管理员可写）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'all read rest_schedule' AND polrelid = 'rest_schedule'::regclass) THEN
    ALTER TABLE rest_schedule ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "all read rest_schedule" ON rest_schedule FOR SELECT TO authenticated USING (true);
    CREATE POLICY "admins manage rest_schedule" ON rest_schedule FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
  END IF;
END $$;