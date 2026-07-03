
-- ============================================================
-- 1. 绩效记录表（幂等）
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  description  text NOT NULL,
  score        numeric(6,1) NOT NULL,
  operator_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'approved'
               CHECK (status IN ('pending','approved','rejected')),
  image_url    text,
  remark       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ps_user_date ON performance_scores(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ps_status    ON performance_scores(status);

ALTER TABLE performance_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='performance_scores' AND policyname='ps_select') THEN
    CREATE POLICY "ps_select" ON performance_scores FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','chef')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='performance_scores' AND policyname='ps_insert_manager') THEN
    CREATE POLICY "ps_insert_manager" ON performance_scores FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','chef')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='performance_scores' AND policyname='ps_insert_staff') THEN
    CREATE POLICY "ps_insert_staff" ON performance_scores FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid() AND status = 'pending' AND operator_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='performance_scores' AND policyname='ps_update') THEN
    CREATE POLICY "ps_update" ON performance_scores FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','chef')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='performance_scores' AND policyname='ps_delete') THEN
    CREATE POLICY "ps_delete" ON performance_scores FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','chef')));
  END IF;
END $$;

-- ============================================================
-- 2. 版本历史表（CREATE IF NOT EXISTS，数据用 ON CONFLICT DO UPDATE）
-- ============================================================
CREATE TABLE IF NOT EXISTS app_versions (
  id           serial PRIMARY KEY,
  version      text NOT NULL,
  description  text NOT NULL,
  release_date date NOT NULL,
  status       text NOT NULL DEFAULT 'released' CHECK (status IN ('released','beta','draft'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_versions_version ON app_versions(version);

ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_versions' AND policyname='versions_read_all') THEN
    CREATE POLICY "versions_read_all" ON app_versions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_versions' AND policyname='versions_write_admin') THEN
    CREATE POLICY "versions_write_admin" ON app_versions FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin')));
  END IF;
END $$;

INSERT INTO app_versions (version, description, release_date, status) VALUES
('v1',  '项目初始化，完成基础架构搭建', '2026-01-01', 'released'),
('v2',  '用户注册与登录功能（微信小程序登录）', '2026-01-05', 'released'),
('v3',  '申购提交页基础功能：食材选择、数量录入', '2026-01-08', 'released'),
('v4',  '审核流程：管理员审核申购单（通过/驳回）', '2026-01-12', 'released'),
('v5',  '食材库初版：查看食材列表、分类筛选', '2026-01-15', 'released'),
('v6',  '采购汇总初版：按供应商聚合展示', '2026-01-18', 'released'),
('v7',  '个人中心：查看个人信息、修改密码', '2026-01-20', 'released'),
('v8',  '推送通知：申购单审核结果通知', '2026-01-25', 'released'),
('v9',  '食材库：新增/编辑/删除食材', '2026-01-28', 'released'),
('v10', '账号管理：超管可管理成员账号', '2026-02-01', 'released'),
('v11', '角色权限体系：user/admin/super_admin', '2026-02-05', 'released'),
('v12', '申购单历史：查看所有历史记录与状态', '2026-02-08', 'released'),
('v13', '采购汇总时间筛选：全部/午市/晚市/昨天', '2026-02-12', 'released'),
('v14', '系统设置：午市/晚市时间配置', '2026-02-15', 'released'),
('v15', '食材库分类管理：自定义分类增删', '2026-02-18', 'released'),
('v16', '采购汇总导出Excel', '2026-02-22', 'released'),
('v17', '采购汇总导出图片（采购清单截图）', '2026-02-25', 'released'),
('v18', '申购单审核：支持修改数量后批准', '2026-03-01', 'released'),
('v19', '食材库批量导入（Excel上传）', '2026-03-05', 'released'),
('v20', '食材库子分类支持：二级分类筛选', '2026-03-08', 'released'),
('v21', '供应商管理：设置/修改食材供应商', '2026-03-12', 'released'),
('v22', '申购提交：食材搜索与快速定位', '2026-03-15', 'released'),
('v23', '角色自定义：支持新增自定义角色', '2026-03-18', 'released'),
('v24', '食材使用频次统计（常用食材排序）', '2026-03-22', 'released'),
('v25', '更新日志页面初版', '2026-03-25', 'released'),
('v26', '操作日志：记录关键操作（审核/删除等）', '2026-03-28', 'released'),
('v27', '采购汇总：按分类分组筛选', '2026-04-01', 'released'),
('v28', '食材库批量编辑：批量改分类/供应商', '2026-04-05', 'released'),
('v29', '申购单：支持分批审核（部分通过）', '2026-04-08', 'released'),
('v30', '采购汇总：微信群发功能', '2026-04-12', 'released'),
('v31', '角色权限细化：导出报表/数据统计独立权限', '2026-04-15', 'released'),
('v32', '食材库：设置安全库存与预警', '2026-04-18', 'released'),
('v33', '个人中心：头像上传与个人资料修改', '2026-04-22', 'released'),
('v34', '数据统计初版：近8周/近6月申购趋势图', '2026-04-25', 'released'),
('v35', '分类占比图：饼图展示各品类采购比例', '2026-04-28', 'released'),
('v36', '采购汇总：品类详情页下钻查看', '2026-05-01', 'released'),
('v37', '账号批量导入：批量创建员工账号', '2026-05-03', 'released'),
('v39', '申购提交：支持二级子分类筛选', '2026-05-08', 'released'),
('v40', '采购汇总：子分类筛选与分组展示', '2026-05-10', 'released'),
('v41', '推送通知优化：新申购单通知管理员', '2026-05-12', 'released'),
('v42', '访客模式：只读浏览无需账号', '2026-05-14', 'released'),
('v43', '系统设置：自定义积分单价配置', '2026-05-16', 'released'),
('v44', '食材库：全局搜索与高亮', '2026-05-18', 'released'),
('v45', '采购汇总：按供应商排除整组功能', '2026-05-19', 'released'),
('v47', '采购汇总：食材行删除功能优化', '2026-05-21', 'released'),
('v48', '数据统计：统计数量修复（排除已删除条目）', '2026-05-22', 'released'),
('v49', '审核页面：微信消息模板发送优化', '2026-05-22', 'released'),
('v50', '采购汇总：周/月查询日期选择器', '2026-05-23', 'released'),
('v51', '食材库：编辑时保留原有子分类', '2026-05-23', 'released'),
('v52', '个人中心：职位显示与修改', '2026-05-24', 'released'),
('v53', '账号管理：编辑成员角色与权限', '2026-05-24', 'released'),
('v54', '采购汇总：导出图片截图优化', '2026-05-25', 'released'),
('v55', '申购提交：从食材库批量快速添加', '2026-05-25', 'released'),
('v56', '主页感谢语替换，个人中心保留退出登录按钮', '2026-05-26', 'released'),
('v57', '采购汇总：左滑/长按弹出操作菜单（修改数量+删除）', '2026-05-27', 'released'),
('v58', '申购草稿自动保存与恢复，数据统计时间Tab改造', '2026-05-28', 'released'),
('v59', '绩效看板、版本同步更新日志、批量修改数量、草稿红点、统计导出', '2026-05-29', 'released')
ON CONFLICT (version) DO UPDATE
  SET description = EXCLUDED.description,
      release_date = EXCLUDED.release_date,
      status = EXCLUDED.status;
