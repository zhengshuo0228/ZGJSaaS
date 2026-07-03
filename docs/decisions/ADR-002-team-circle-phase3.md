# ADR-002：「我的团队」功能模块 Phase 3 升级

## 状态
已接受

## 日期
2026-05-26

## 背景

「工作圈」（现更名为「我的团队」）是開小灶PMS App的核心协作功能，允许团队成员发布带水印的图片/视频。Phase 2 已完成基础发布、点赞、评论、滑动删除。Phase 3 目标：
1. 将「工作圈」改名为「我的团队」，统一品牌语言
2. 水印定位 UI 升级为可视化九宫格，提升易用性
3. 多选模式增加批量删除，并同步清理 Supabase Storage 文件
4. 帖子列表展示发布者姓名和岗位，增强信息密度
5. 摄像头集成与初始化确认（自动权限申请 + 异常处理已就位）

---

## 决策一：功能命名 「工作圈」→「我的团队」

**决策：** 将所有入口（主页卡片、页面标题、发布提示）中的「工作圈」统一替换为「我的团队」。

**原因：** 「工作圈」语义偏向社交圈，「我的团队」更直接反映其餐饮团队内部协作的场景，与「账号管理」「考勤排休」等模块命名风格一致。

**影响：** 修改 `home.tsx` 入口 label、`watermark-album.tsx` 标题、`watermark-camera.tsx` 发布成功提示，不涉及路由和数据库变更。

---

## 决策二：水印位置选择器改为可视化九宫格

**决策：** 将设置弹窗中的文字 chip 列表替换为模拟取景框的 3×3 可点击网格，配合「全宽底部」「自由拖拽」两个独立按钮。

### 考虑过的替代方案

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 文字 chip（原方案） | 实现简单 | 不直观，用户需逐一读取文字 | 已废弃 |
| 可视化九宫格 | 空间位置一目了然，符合相机 UI 认知 | 实现略复杂 | **采用** |
| 实时拖拽无预设 | 最灵活 | 难以精准放置，无量化基准 | 作为补充（custom 模式） |

**九宫格设计：**
- 3×3 网格，Row1 展示左上/右上，Row3 展示左下/底中/右下，中间行作为空白比例占位
- 每格内用小色块指示水印文本位置
- 选中格高亮（橙色背景 + 深橙色指示块）
- 「自由拖拽」选中后提示在预览/取景框中拖动
- 实时预览在取景框叠加层已同步（`wmStyle` computed 逻辑保持不变）

**影响：** 仅改动 `watermark-camera.tsx` 设置弹窗的位置选择区域，水印渲染逻辑（`getWatermarkStyle`、`composeOnWeb`）不变。

---

## 决策三：批量删除 + 同步清理 Storage 文件

**决策：** 在多选工具栏新增红色「删除」按钮，仅当选中内容中存在「自己发布的帖子」时显示。确认后执行三步原子删除：①删 Storage 文件 ② 删 `watermark_post_media` 记录 ③ 删 `watermark_posts` 记录。

### 考虑过的替代方案

| 方案 | 说明 | 结论 |
|------|------|------|
| 仅删数据库记录，不清理 Storage | 实现简单，旧文件"孤儿"保留 | 拒绝，造成存储空间浪费，长期成本高 |
| Edge Function 异步删除 | 解耦前端操作与存储清理 | 对此体量过度设计，前端同步删除足够 |
| **前端同步三步删除（采用）** | 直接清理媒体 → 记录，RLS 保证安全 | 采用 |

**关键实现：**
```
handleBatchDelete:
1. filter 出 user_id === myUserId 的帖子（前端安全层）
2. supabase.storage.from('watermark-photos').remove(paths)
   — photo_path 字段存储 Storage 相对路径（如 images/wm-xxx.jpg）
3. 删除 watermark_post_media（cascade 已配置，步骤 3 也会自动清理）
4. 删除 watermark_posts（RLS WITH CHECK user_id=auth.uid() 二次验证）
5. 乐观 setItems 过滤已删条目
```

**`PostMedia` 接口补充 `photo_path` 字段**，`fetchItems` 查询中同步补全。

**安全性：** 前端过滤 + RLS 双重保证，非自己的帖子绝不进入删除流。

---

## 决策四：发布者岗位信息展示

**决策：** 帖子卡片在姓名旁增加岗位角标（`profiles.position` 字段），样式为浅紫底 + 深紫文字小标签。

**数据获取：** `fetchItems` Step2 的 profiles 批量查询已从 `select('id, display_name, avatar_url')` 扩展为 `select('id, display_name, position, avatar_url')`，profileMap 同步存储 position。PostItem 接口新增 `uploader_position?: string | null`。

**UI 设计：**
- 姓名（蓝色 #4A6CF7 font-600）+ 岗位标签水平排列，使用 `flexWrap: 'wrap'` 避免超长时溢出
- 岗位为空时不渲染标签，不占布局空间

---

## 决策五：摄像头集成完整性确认

**状态：** 已在 Phase 2 实现，Phase 3 无需额外开发。

**已实现机制：**
- `useFocusEffect` 进入页面自动调用 `requestPermission()`（Native 端）
- `useCameraPermissions` 状态机：`null`（加载中）→ `!granted`（权限拒绝 UI）→ `granted`（正常相机预览）
- 权限拒绝页提供「授权相机」按钮和「返回」链接，文案说明用途
- Web 端提供 `navigator.permissions` polyfill，防止 expo-camera 初始化崩溃
- `CameraView` 实时取景框全屏渲染，水印 UI 叠加（非 captureRef，避免性能问题）

---

## 影响总结

| 文件 | 变更类型 | 说明 |
|------|------|------|
| `src/app/(app)/home.tsx` | 改名 | 入口 label `工作圈` → `我的团队` |
| `src/app/(app)/watermark-album.tsx` | 功能增强 | 页面标题改名、岗位展示、BatchDelete + Storage 清理、AlertDialog |
| `src/app/(app)/watermark-camera.tsx` | UI 增强 | 水印位置九宫格、发布提示改名 |
| 数据库 | **无** | `profiles.position` 已存在，无需 migration |
| Storage | **无** | `photo_path` 字段 Phase 1 已写入 |

## 验证

- [x] `pnpm run lint` 零错误 零警告
- [x] PostMedia.photo_path 字段在 fetchItems 查询中补全
- [x] 批量删除只处理 `user_id === myUserId` 的帖子（前端 + RLS 双层保证）
- [x] 水印九宫格选择器与现有 `getWatermarkStyle` / `composeOnWeb` 渲染逻辑完全兼容
- [x] 岗位为空时不渲染标签，布局不变形

## 参考

- ADR-001：工作圈数据层修复（PostgREST FK hint、两步查询方案）
- `watermark-album.tsx` v5（本次变更）
- `watermark-camera.tsx` v5（本次变更）
