
-- 用户角色枚举：user=普通员工, admin=管理员, super_admin=超级管理员
CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'super_admin');

-- 申购单状态枚举
CREATE TYPE public.order_status AS ENUM ('pending', 'approved', 'rejected', 'modified');

-- profiles 表
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  display_name text,
  role public.user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 用户角色查询辅助函数（防止 RLS 无限递归）
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- 食材分类枚举
CREATE TYPE public.ingredient_category AS ENUM ('蔬菜', '禽肉', '河鲜', '冻品', '干货调料', '其它');

-- 食材库表
CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category public.ingredient_category NOT NULL DEFAULT '其它',
  unit text NOT NULL DEFAULT '斤',
  supplier text NOT NULL DEFAULT '',
  price numeric(10,2),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 申购单表
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.order_status NOT NULL DEFAULT 'pending',
  note text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 申购单明细表
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  original_quantity numeric(10,2),
  unit text NOT NULL DEFAULT '斤',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 自动同步新用户到 profiles
CREATE OR REPLACE FUNCTION handle_new_user()
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
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- updated_at 自动更新
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 启用 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- profiles RLS
CREATE POLICY "管理员完全访问profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "用户查看自己的profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "用户更新自己的profile（不能改角色）" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- ingredients RLS（所有已登录用户可查看）
CREATE POLICY "已登录用户查看食材" ON public.ingredients
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "管理员管理食材" ON public.ingredients
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

-- purchase_orders RLS
CREATE POLICY "用户查看自己的申购单" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (submitter_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "用户创建申购单" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (submitter_id = auth.uid());

CREATE POLICY "管理员更新申购单" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

-- order_items RLS
CREATE POLICY "用户查看申购单明细" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = order_id
        AND (po.submitter_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'super_admin'))
    )
  );

CREATE POLICY "用户创建申购单明细" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = order_id AND po.submitter_id = auth.uid()
    )
  );

CREATE POLICY "管理员更新申购单明细" ON public.order_items
  FOR UPDATE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

-- 插入示例食材数据
INSERT INTO public.ingredients (name, category, unit, supplier) VALUES
  ('大白菜', '蔬菜', '斤', '绿源蔬菜'),
  ('菠菜', '蔬菜', '斤', '绿源蔬菜'),
  ('西红柿', '蔬菜', '斤', '绿源蔬菜'),
  ('土豆', '蔬菜', '斤', '绿源蔬菜'),
  ('黄瓜', '蔬菜', '斤', '绿源蔬菜'),
  ('猪肉（精瘦）', '禽肉', '斤', '鲜丰肉类'),
  ('鸡胸肉', '禽肉', '斤', '鲜丰肉类'),
  ('鸡腿', '禽肉', '斤', '鲜丰肉类'),
  ('牛肉', '禽肉', '斤', '鲜丰肉类'),
  ('草鱼', '河鲜', '斤', '河鲜水产'),
  ('鲤鱼', '河鲜', '斤', '河鲜水产'),
  ('虾', '河鲜', '斤', '河鲜水产'),
  ('冷冻饺子', '冻品', '袋', '冻品配送'),
  ('速冻虾仁', '冻品', '斤', '冻品配送'),
  ('生抽', '干货调料', '瓶', '调料批发'),
  ('老抽', '干货调料', '瓶', '调料批发'),
  ('食盐', '干货调料', '袋', '调料批发'),
  ('花生油', '干货调料', '桶', '调料批发'),
  ('木耳（干）', '干货调料', '斤', '调料批发'),
  ('香菇（干）', '干货调料', '斤', '调料批发');
