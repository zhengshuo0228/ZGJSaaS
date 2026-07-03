# ADR-003: Web 端长按录像与实时 Canvas 水印合成

## 状态
已接受

## 日期
2026-05-26

## 背景
「開小灶PMS」的水印相机页在 Web 端之前只能预览摄像头，拍照和录像分别通过图片选择器完成，体验与 Native 不一致。产品需要 Web 端也能实现：

1. 长按快门触发录制，松开结束，最长 10 秒。
2. 录制过程中实时叠加文字/图片水印。
3. 水印位置、透明度可配置。
4. 对主流浏览器和移动端有友好的降级方案。

## 决策
Web 端录制采用 **实时 Canvas 录屏（Canvas Capture Stream + MediaRecorder）**方案，而不是录制原始流后再用 FFmpeg.js 后期处理。

具体实现：
- 用 `navigator.mediaDevices.getUserMedia` 获取摄像头视频流，绑定到 `<video>` 元素实现预览。
- 创建隐藏 `<canvas>`，每帧 `drawImage(video)` 后绘制文字/图片水印。
- `canvas.captureStream(30)` 获取带水印的实时视频流。
- `MediaRecorder` 录制该流，输出 WebM（或浏览器支持的 MP4）。
- 录制过程结束后封装成 `File` ，进入媒体队列待发布上传。

同时在 `/tasks/web-camera-recorder.html` 输出一份独立的纯 HTML 示例，作为参考实现。

## 考虑过的替代方案

### 方案 A：录制原始流 + FFmpeg.js 后期处理
- 优点：后期处理灵活，可输出标准 MP4，支持更复杂的水印动画。
- 缺点：
  - FFmpeg.js 体积大（wasm 编码），首次加载慢，不利于移动端。
  - 实时性差，录制结束后还需要转码，用户体验不好。
  - 浏览器红外线缓存、后台线程等问题在低端设备上更突出。
- 拒绝原因：我们的核心场景是短视频（10 秒以内）快速采集，实时 Canvas 已能满足需求。

### 方案 B：实时 Canvas 录屏
- 优点：
  - 体验统一：水印在预览时就已看到什么样，录制出来就是什么样。
  - 无需额外依赖，性能可控。
  - 实时输出，录完即可预览/上传。
- 缺点：
  - 输出格式主要是 WebM（部分浏览器支持 MP4），无法保证所有平台都产出 MP4。
  - 高分辨率/高帧率时 CPU 消耗较大，低端设备可能掉帧。
- 接受原因：对于 10 秒短视频和企业内部使用，WebM/MP4 双可接受，且体验优先。

## 影响
- `watermark-camera.tsx` 增加 Web 端长按录制分支，`WatermarkConfig` 增加 `textOpacity` 和 `imageWatermark` 字段。
- Web 端的快门按钮现在与 Native 保持一致：短按拍照，长按录像，松手结束。
- 录制过程中的倒计时、进度条与 Native 共用同一套 UI。
- 独立 HTML 示例可供前端开发者参考和快速验证。

## 兼容性与降级
- 主流桌面浏览器（Chrome、Firefox、Safari 14+、Edge）均支持 `getUserMedia` 和 `MediaRecorder`。
- 移动端：iOS Safari 14.3+ 支持 `MediaRecorder`、Android Chrome 74+ 支持。
- 降级：
  - 若浏览器不支持 `MediaRecorder`，弹窗提示并保留图片选择器作为后备。
  - 若不支持某种 MIME 类型，自动选择 `video/webm` 或 `video/mp4`。
  - 若没有摄像头权限，显示权限被拒绝提示，并保留图片选择器。

## 测试建议
- Chrome/Edge 桌面：验证 WebM 输出和水印效果。
- iOS Safari：长按快门时注意 pointer/touch 事件是否被滚动拦截，验证 10 秒自动停止。
- Android Chrome：验证前/后置切换和录制后上传。
- 低端设备：监控帧率和 CPU，必要时降低 `canvas.captureStream` 帧率或分辨率。
