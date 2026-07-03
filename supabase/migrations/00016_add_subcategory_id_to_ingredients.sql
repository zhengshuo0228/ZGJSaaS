
-- 1. 给ingredients表添加subcategory_id列（UUID，可为NULL）
ALTER TABLE public.ingredients 
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.ingredient_subcategories(id) ON DELETE SET NULL;

-- 2. 创建app_versions表（更新日志数据源）
CREATE TABLE IF NOT EXISTS public.app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  release_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'released',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_versions" ON public.app_versions
  FOR SELECT TO public USING (true);

CREATE POLICY "super_admin_write_versions" ON public.app_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- 3. 写入历史版本数据（v42-v45）
INSERT INTO public.app_versions (version, description, release_date, sort_order) VALUES
('v45', '修复食材保存报错（ingredients表补充subcategory_id字段）；更新日志页改为后端接口驱动；批量改分类弹窗、食材库筛选栏支持二级子分类；Excel批量导入支持子分类列；采购汇总页食材列表间距优化', '2026-05-28', 45),
('v44', '账号自定义角色（如主管）无效bug修复：数据库role字段从枚举改为text，前端同步移除类型限制；首页欢迎语随机化：时段问候+10条文案池按日期种子随机；个人信息页新增更新日志入口和独立日志列表页', '2026-05-28', 44),
('v43', '新增/修改食材弹窗支持二级子分类选择（动态加载、编辑回显）；申购提交页新增子分类横向筛选条（品类+子分类叠加过滤）', '2026-05-27', 43),
('v42', '品类&分类管理升级为两级结构（一级品类+子分类）；新增批量改分类/批量改供应商/批量删除功能；分类标签新增颜色标识；新增/供应商弹窗支持多行批量输入；采购汇总页支持长按删除记录', '2026-05-27', 42),
('v41', '账号管理新增自定义角色与角色权限配置；系统配置页岗位管理；操作日志记录功能；食材库支持按供应商批量筛选；通知中心支持批量标为已读', '2026-05-20', 41),
('v40', '采购汇总页重构：按供应商分组展示、支持发给供应商的文字/图片格式分享；食材价格字段；申购单修改数量后批准操作', '2026-05-12', 40),
('v39', '通知中心上线，审核结果实时推送；数据统计页面（月度采购趋势）；食材使用频次统计与常用标注；个人信息页修改密码', '2026-05-05', 39),
('v38', '分类&供应商管理页面；食材库分类筛选；申购历史时间范围筛选；首页菜单权限控制精细化', '2026-04-25', 38);
