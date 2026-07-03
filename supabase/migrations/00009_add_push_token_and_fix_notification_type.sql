
-- 1. 给 profiles 加 expo_push_token 列
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token text;

-- 2. 修复 notifications.type CHECK：加入 'submitted'
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('approved', 'rejected', 'modified', 'submitted', 'system'));
