# ADR-001：工作圈模块数据层架构与 Bug 修复记录

## 状态
已接受（2026-07-03）

---

## 背景

開小灶PMS 的「工作圈」功能（`watermark-album.tsx` + `watermark-camera.tsx`）用于员工发布带水印的工作照片/视频，支持点赞、评论和多选下载。

在 v90–v94 迭代过程中，该模块暴露出一系列数据层问题，导致：
- 发布后工作圈列表始终显示「暂无内容」
- 评论无法加载、无法发布
- 点赞计数不准确
- 筛选上传者功能失效

本 ADR 记录根因分析、决策过程和最终修复方案。

---

## 根因分析

### Bug 1：PostgREST 关联查询静默失败导致列表空白

**现象**：发布成功后，工作圈列表始终为空。

**根因**：
```typescript
// 旧代码——使用 PostgREST 关联查询语法
.select(`
  id, remark, taken_at, user_id,
  profiles(display_name, avatar_url),   // ← 关联查询
  watermark_post_media(...),
  watermark_likes(user_id),
  watermark_comments(id)                // ← 无有效 FK 到 watermark_posts
`)
```

PostgREST 在以下两种情况会静默返回 `data: null`（不报 error）：
1. 被关联表的 RLS 策略阻止了关联查询上下文中的访问
2. 关联表没有指向主表的外键约束

`watermark_comments` 当时只有 `photo_id → watermark_photos.id`，**没有** `post_id → watermark_posts.id`，导致整个 SELECT 语句静默失败。

代码又未检查 `error`，直接 `(data || []).map(...)` 得到空数组。

**关键教训**：PostgREST 关联子查询失败时不抛 error，`data` 直接为 null，必须检查 error 字段。

---

### Bug 2：watermark_comments 缺失 post_id 字段

**现象**：评论加载空白、发布评论无响应、帖子评论计数始终为 0。

**根因**：
- `watermark_comments` 表只有旧字段 `photo_id`（→ `watermark_photos.id`），没有指向 `watermark_posts.id` 的字段。
- `openComments` 用 `.eq('photo_id', postId)` 查询，但 `postId` 是 `watermark_posts.id`，两者类型相同但逻辑不关联。
- `handlePostComment` 插入时只写 `photo_id`，没有建立与 `watermark_posts` 的关联。

---

### Bug 3：myUserId state 异步滞后导致 liked_by_me 全 false

**现象**：点赞状态不正确（全部显示未点赞）。

**根因**：
```typescript
// useFocusEffect 中
await fetchMe();        // setState 是异步的，此处 myUserId state 仍为 null
fetchItems(0, true);    // 立即调用，拿到 myUserId=null，liked_by_me 全 false
```

React `setState` 是异步批处理，`fetchMe()` 完成后 `myUserId` state 尚未更新。

---

### Bug 4：fetchUploaders 关联查询失败

**现象**：筛选面板中上传者列表为空。

**根因**：同 Bug 1，`fetchUploaders` 使用 `profiles(display_name)` 关联查询静默失败。

---

## 决策

### 决策 1：弃用 PostgREST 关联查询，改为两步独立查询

**选项 A（已采用）**：两步查询——先查主表，再批量查 profiles
```typescript
// Step 1: 查帖子
const { data, error } = await supabase.from('watermark_posts').select('id, user_id, ...');
if (error) throw error;

// Step 2: 批量查 profiles（独立，无 PostgREST 关联依赖）
const userIds = [...new Set(rows.map(r => r.user_id))];
const { data: pData } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
```

**选项 B（已弃用）**：使用 PostgREST hint 语法 `profiles!user_id_fkey(...)`  
拒绝原因：仍依赖 PostgREST 关联机制，受 RLS 上下文影响，稳定性不可控。

**选项 C（已弃用）**：数据库视图  
拒绝原因：增加 schema 复杂度，不适合快速迭代阶段。

**结论**：两步查询虽多一次网络请求，但完全可控、错误可见、RLS 无歧义。网络延迟在局域网/CDN 下可忽略。

---

### 决策 2：给 watermark_comments 添加 post_id 字段

**迁移内容**：
```sql
ALTER TABLE watermark_comments
  ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES watermark_posts(id) ON DELETE CASCADE;

-- 存量数据回填（旧数据 photo_id 实际存的就是 watermark_posts.id）
UPDATE watermark_comments wc
SET post_id = wc.photo_id
WHERE post_id IS NULL
  AND EXISTS (SELECT 1 FROM watermark_posts wp WHERE wp.id = wc.photo_id);
```

所有评论读写改为使用 `post_id` 字段；`photo_id` 字段在写入时同步填充（向后兼容）。

---

### 决策 3：fetchMe 改为返回 uid 并直接传入 fetchItems

```typescript
// 修复前
await fetchMe();           // state 未更新
fetchItems(0, true);       // uid 为 null

// 修复后
const uid = await fetchMe();        // 直接返回值
fetchItems(0, true, uid);           // 显式传入
```

fetchItems 增加 `overrideUid` 可选参数，优先使用传入值，兜底使用 state。

---

## 影响

| 功能 | 修复前 | 修复后 |
|------|--------|--------|
| 列表加载 | 空白（静默失败） | 正常显示 |
| 点赞状态 | 全部 false | 正确反映登录用户状态 |
| 评论加载 | 空白 | 按 post_id 正确关联 |
| 评论发布 | 写入错误字段 | 写入 post_id + photo_id |
| 评论计数 | 始终 0 | 通过新 FK 子查询正确计数 |
| 筛选列表 | 空 | 两步查询正常显示 |
| 删除帖子 | 无此功能 | 滑动/长按 + AlertDialog 二次确认 |

---

## 注意事项与已知坑点

### PostgREST 关联查询规则
- 被关联表必须有指向主表的外键约束
- 被关联表必须有 RLS SELECT 策略允许当前角色读取
- 任一条件不满足，`data` 返回 null 但 `error` 为 null（静默失败）
- **始终检查 `error`，不要只判断 `data || []`**

### watermark_likes 双字段历史问题
`watermark_likes` 表同时存在 `photo_id`（旧）和 `post_id`（新）两个字段。
- fetchItems 子查询使用 hint 语法 `watermark_likes!watermark_likes_post_id_fkey(user_id)` 明确指定外键
- 点赞 insert/delete 统一使用 `post_id`

### watermark_comments.photo_id 保留
迁移后 `photo_id` 字段保留并在写入时同步填充，避免影响其他未迁移的查询路径。未来可在确认无其他依赖后删除该字段。

---

## 相关文件

- `src/app/(app)/watermark-album.tsx` — 工作圈列表页（fetchItems、评论、删除）
- `src/app/(app)/watermark-camera.tsx` — 水印相机发布页（handlePublish）
- 数据库迁移：`watermark_comments_add_post_id`（2026-07-03）
- 数据库迁移：`fix_watermark_posts_user_id_default`（2026-07-02，user_id DEFAULT auth.uid()）
