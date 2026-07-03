-- profiles 表增加 account_id 字段（人工编号，用于精确控制超管权限）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_id text UNIQUE;

-- 将已有的 000@miaoda.app 账号设为 account_id='000'（如果存在）
UPDATE public.profiles SET account_id = '000' WHERE email = '000@miaoda.app' AND account_id IS NULL;

COMMENT ON COLUMN public.profiles.account_id IS '人工账号编号，000 为超级管理员唯一标识';