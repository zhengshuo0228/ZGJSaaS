# 灶管家 SaaS + 独立 Supabase 迁移执行文档

## 目标

- 将 APP 从秒哒托管库 `backend.appmiaoda.com` 切换到你自己的 Supabase 官方托管项目。
- 品牌升级为“灶管家”，包名改为 `com.zaoguanjia.app`。
- 数据库升级为多品牌 SaaS：租户、门店、部门、会员关系、开放品牌注册。

## 必备密钥

以下值只放本机环境变量或服务器密钥，不提交 GitHub：

- `SOURCE_DATABASE_URL`：旧秒哒 PostgreSQL 连接串。
- `TARGET_DATABASE_URL`：新 Supabase PostgreSQL 连接串。
- `EXPO_PUBLIC_SUPABASE_URL`：新 Supabase Project URL。
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`：新 Supabase anon key。
- `SUPABASE_SERVICE_ROLE_KEY`：新 Supabase service role key，用于 Edge Functions 和迁移脚本。

## 迁移步骤

0. 创建本地密钥文件：

   ```powershell
   Copy-Item .env.local.example .env.local
   ```

   然后把 `.env.local` 里的占位值替换成真实 Supabase 项目值。`.env.local` 已被 Git 忽略，不要提交。

1. 如果暂时不迁移旧数据，只初始化新的空 SaaS 数据库：

   ```powershell
   .\scripts\migration\push-migrations.ps1
   ```

2. 如果要迁移旧秒哒数据，先备份并导出旧库最新数据：

   ```powershell
   .\scripts\migration\export-latest.ps1
   ```

3. 导入新 Supabase：

   ```powershell
   .\scripts\migration\apply-target.ps1 -DataSql "tasks/migration/latest/data_YYYYMMDD_HHMMSS.sql"
   ```

4. 部署 Edge Functions：

   ```powershell
   supabase link --project-ref <new-project-ref>
   supabase functions deploy admin-user-ops
   supabase functions deploy api-versions
   supabase functions deploy performance-api
   supabase functions deploy reset-user-password
   supabase functions deploy rest-api
   supabase functions deploy send-push
   supabase functions deploy tenant-register
   ```

5. 验证新库行数和 SaaS 初始化：

   ```powershell
   .\scripts\migration\verify-target.ps1
   ```

6. 切换 APP 环境变量：

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://<new-project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<new-anon-key>
   EXPO_PUBLIC_APP_ID=zaoguanjia
   ```

7. 重新构建并发布 Web / Android。

## 登录策略

- 旧用户不迁移原密码，迁移后统一重置密码或发重置链接。
- `000` 平台超管保留为跨租户最高管理员。
- 开放品牌注册通过 `tenant-register` Edge Function 创建租户、默认门店、厨房/前厅部门和品牌管理员。

## 验收清单

- `000` 可看到全部租户。
- `開小灶` 旧数据归入初始租户。
- 新注册品牌只能看到自己的空数据。
- 品牌 A 与品牌 B 的员工、申购、绩效、排休、水印工作圈互不可见。
- Android 安装包名称、图标、启动页显示“灶管家”且权限弹窗中文正常。
