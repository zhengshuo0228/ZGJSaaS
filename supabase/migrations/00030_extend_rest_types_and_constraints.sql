-- 1. 删除旧的 rest_type CHECK 约束
ALTER TABLE rest_schedule DROP CONSTRAINT IF EXISTS rest_schedule_rest_type_check;
ALTER TABLE rest_requests DROP CONSTRAINT IF EXISTS rest_requests_rest_type_check;

-- 2. 添加9种类型的新 CHECK 约束
ALTER TABLE rest_schedule ADD CONSTRAINT rest_schedule_rest_type_check
  CHECK (rest_type IN ('full','am','pm','late','early','absent','sick','personal','overtime'));

ALTER TABLE rest_requests ADD CONSTRAINT rest_requests_rest_type_check
  CHECK (rest_type IN ('full','am','pm','late','early','absent','sick','personal','overtime'));

-- 3. rest_schedule 联合唯一索引 (user_id, rest_date, rest_type)
CREATE UNIQUE INDEX IF NOT EXISTS rest_schedule_user_date_type_uniq
  ON rest_schedule (user_id, rest_date, rest_type);

-- 4. rest_requests 表添加 reminder_sent 字段（超24小时催办标记）
ALTER TABLE rest_requests ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- 5. 创建辅助函数：校验排班冲突
CREATE OR REPLACE FUNCTION check_rest_conflict(
  p_user_id uuid,
  p_rest_date date,
  p_rest_type text,
  p_exclude_id uuid DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing_name text;
BEGIN
  SELECT p.display_name INTO v_existing_name
  FROM rest_schedule r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.user_id = p_user_id
    AND r.rest_date = p_rest_date
    AND r.rest_type = p_rest_type
    AND (p_exclude_id IS NULL OR r.id <> p_exclude_id)
  LIMIT 1;

  IF v_existing_name IS NOT NULL THEN
    RETURN '该员工在 ' || p_rest_date::text || ' 已有相同类型记录，存在排班冲突';
  END IF;
  RETURN NULL;
END;
$$;