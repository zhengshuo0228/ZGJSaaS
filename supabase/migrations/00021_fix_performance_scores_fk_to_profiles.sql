-- 删除旧的指向 auth.users 的外键，改为指向 public.profiles
ALTER TABLE public.performance_scores
  DROP CONSTRAINT IF EXISTS performance_scores_user_id_fkey,
  DROP CONSTRAINT IF EXISTS performance_scores_operator_id_fkey;

ALTER TABLE public.performance_scores
  ADD CONSTRAINT performance_scores_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT performance_scores_operator_id_fkey
    FOREIGN KEY (operator_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
