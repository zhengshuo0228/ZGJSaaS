/**
 * 水印相机页 v4 — 长按录制 + 性能优化版
 * 1. 进入自动申请摄像头权限
 * 2. 拍照（点按）/ 短视频（长按，最多 10 秒）
 * 3. 拍完回取景框，底部缩略图队列，支持排序删除
 * 4. 发布后自动跳转工作圈（解决不同步问题）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { captureRef } from 'react-native-view-shot';
import { fetch as expoFetch } from 'expo/fetch';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  Images,
  Plus,
  Settings,
  SwitchCamera,
  Trash2,
  Video,
  X,
} from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { useProfile } from '@/context/ProfileContext';

// Web 环境 polyfill：部分浏览器缺少 navigator.permissions，会导致 expo-camera 初始化崩溃
if (process.env.EXPO_OS === 'web' && typeof navigator !== 'undefined' && !('permissions' in navigator)) {
  (navigator as any).permissions = {
    query: async () => ({ state: 'prompt', addEventListener: () => {}, removeEventListener: () => {} }),
  };
}

// ─── 视频预览子组件 ────────────────────────────────────────────────────────────
function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p: { play: () => void }) => { p.play(); });
  return (
    <View style={{ flex: 1 }}>
      <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />
    </View>
  );
}

const BUCKET = 'watermark-photos';
const DEFAULT_COMPANY = '灶管家';

type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center-bottom' | 'full' | 'custom';

interface ImageWatermark {
  uri: string;      // 本地 blob / data url / http url
  width: number;
  height: number;
  opacity: number;  // 0 – 1
}

interface WatermarkConfig {
  position: WatermarkPosition;
  showTime: boolean;
  showDate: boolean;
  showUsername: boolean;
  showCompany: boolean;
  showLocation: boolean;
  showSlogan: boolean;
  locationText: string;
  storeName: string;
  weatherText: string;
  slogan: string;
  remark: string;
  company: string;
  customX: number;
  customY: number;
  textOpacity: number;          // 文字水印透明度 0-1
  imageWatermark?: ImageWatermark; // 图片水印（Web 录制时用）
}

// 已收集的媒体项
interface CapturedItem {
  id: string;           // 本地临时 ID
  uri: string;
  type: 'image' | 'video';
  file?: File;          // Web 下 File 对象
}

const DEFAULT_CONFIG: WatermarkConfig = {
  position: 'bottom-left',
  showTime: true,
  showDate: true,
  showUsername: true,
  showCompany: true,
  showLocation: true,
  showSlogan: true,
  locationText: '上饶市信州区 · 五三花苑',
  storeName: DEFAULT_COMPANY,
  weatherText: '阴 25°C',
  slogan: '专注地道美味 食品安全 健康饮食 流程合规',
  remark: '',
  company: DEFAULT_COMPANY,
  customX: 0.05,
  customY: 0.8,
  textOpacity: 1,
};

const POSITION_OPTIONS: { key: WatermarkPosition; label: string }[] = [
  { key: 'top-left',      label: '左上角' },
  { key: 'top-right',     label: '右上角' },
  { key: 'bottom-left',   label: '左下角' },
  { key: 'bottom-right',  label: '右下角' },
  { key: 'center-bottom', label: '底部居中' },
  { key: 'full',          label: '全宽底部' },
  { key: 'custom',        label: '自定义' },
];

function padTwo(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function getTimeStr() {
  const d = new Date();
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}:${padTwo(d.getSeconds())}`;
}
function getDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}
function getWeekdayStr() {
  const weeks = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return weeks[new Date().getDay()];
}

// 通用水印绘制函数（在 canvas 上下文上绘制）
function drawWatermarkOnCanvas(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  lines: string[],
  position: WatermarkPosition,
  customX: number,
  customY: number,
) {
  const fontSize = Math.max(20, Math.round(W * 0.028));
  const lineH = fontSize * 1.6;
  const padX = fontSize * 1.2;
  const padY = fontSize * 0.8;
  const totalH = lines.length * lineH + padY * 2;
  const boxW = Math.min(W * 0.7, Math.max(...lines.map(l => l.length)) * fontSize * 0.62 + padX * 2);
  let bx = 0, by = 0;
  if (position === 'top-left')      { bx = 0; by = 0; }
  else if (position === 'top-right')     { bx = W - boxW; by = 0; }
  else if (position === 'bottom-left')   { bx = 0; by = H - totalH; }
  else if (position === 'bottom-right')  { bx = W - boxW; by = H - totalH; }
  else if (position === 'center-bottom') { bx = (W - boxW) / 2; by = H - totalH; }
  else if (position === 'custom')        { bx = customX * W; by = customY * H; }
  else { bx = 0; by = H - totalH; }
  ctx.fillStyle = 'rgba(15,23,42,0.58)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = Math.max(1, Math.round(W * 0.0015));
  const radius = Math.max(12, Math.round(fontSize * 0.75));
  const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  if (position === 'full') ctx.fillRect(0, H - totalH, W, totalH);
  else drawRoundRect(bx, by, boxW, totalH, radius);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${fontSize}px -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const tx = (position === 'full') ? padX : bx + padX;
    ctx.fillText(line, tx, by + padY + lineH * i + lineH / 2);
  });
}

function drawStyledWatermarkOnCanvas(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cfg: WatermarkConfig,
  username: string,
) {
  const scale = Math.max(0.75, Math.min(1.35, W / 1280));
  const timeFont = Math.round(64 * scale);
  const dateFont = Math.round(30 * scale);
  const placeFont = Math.round(28 * scale);
  const sloganFont = Math.round(24 * scale);
  const smallFont = Math.round(22 * scale);
  const gap = Math.round(12 * scale);
  const xPad = Math.round(28 * scale);
  const yPad = Math.round(24 * scale);
  const timeH = cfg.showTime ? timeFont * 1.08 : 0;
  const metaH = (cfg.showDate || cfg.weatherText.trim()) ? dateFont * 2.1 : 0;
  const storeLine = [
    cfg.showCompany ? (cfg.storeName || cfg.company) : '',
    cfg.showUsername ? username : '',
  ].filter(Boolean).join(' · ');
  const storeH = storeLine ? smallFont * 1.25 : 0;
  const placeH = cfg.showLocation && cfg.locationText ? placeFont * 1.25 : 0;
  const sloganH = cfg.showSlogan && cfg.slogan.trim() ? sloganFont * 1.55 : 0;
  const remarkH = cfg.remark.trim() ? smallFont * 1.25 : 0;
  const topH = Math.max(timeH, metaH);
  const totalH = topH + storeH + placeH + sloganH + remarkH + gap * 3;
  const totalW = Math.min(W - xPad * 2, Math.max(W * 0.56, (cfg.slogan.length || 16) * sloganFont * 0.8));

  let bx = xPad;
  let by = H - totalH - yPad;
  const { position, customX, customY } = cfg;
  if (position === 'top-left')      { bx = xPad; by = yPad; }
  else if (position === 'top-right')     { bx = W - totalW - xPad; by = yPad; }
  else if (position === 'bottom-left')   { bx = xPad; by = H - totalH - yPad; }
  else if (position === 'bottom-right')  { bx = W - totalW - xPad; by = H - totalH - yPad; }
  else if (position === 'center-bottom') { bx = (W - totalW) / 2; by = H - totalH - yPad; }
  else if (position === 'full')          { bx = xPad; by = H - totalH - yPad; }
  else if (position === 'custom')        { bx = customX * W; by = customY * H; }

  ctx.save();
  ctx.globalAlpha = cfg.textOpacity;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = Math.round(8 * scale);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';

  let y = by;
  if (cfg.showTime) {
    ctx.font = `900 ${timeFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(getTimeStr().slice(0, 5), bx, y);
  }
  if (cfg.showDate || cfg.weatherText.trim()) {
    const rightX = bx + (cfg.showTime ? timeFont * 2.25 : 0);
    if (cfg.showTime) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#F7B733';
      ctx.fillRect(rightX - Math.round(18 * scale), y + Math.round(5 * scale), Math.round(5 * scale), Math.round(62 * scale));
      ctx.shadowBlur = Math.round(8 * scale);
      ctx.fillStyle = '#fff';
    }
    ctx.font = `900 ${dateFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    if (cfg.showDate) ctx.fillText(getDateStr(), rightX, y);
    const meta = [getWeekdayStr(), cfg.weatherText.trim()].filter(Boolean).join('  ');
    if (meta) ctx.fillText(meta, rightX, y + dateFont * 1.22);
  }
  y += topH + gap;

  if (storeLine) {
    ctx.font = `800 ${smallFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(storeLine, bx, y);
    y += storeH;
  }
  if (cfg.showLocation && cfg.locationText) {
    ctx.font = `800 ${placeFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(cfg.locationText, bx, y);
    y += placeH + Math.round(6 * scale);
  }
  if (cfg.showSlogan && cfg.slogan.trim()) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(232,169,58,0.78)';
    const sloganW = Math.min(totalW, cfg.slogan.trim().length * sloganFont * 0.95 + Math.round(22 * scale));
    ctx.fillRect(bx, y, sloganW, sloganH);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${sloganFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(cfg.slogan.trim(), bx + Math.round(10 * scale), y + Math.round(6 * scale));
    y += sloganH + gap;
  }
  if (cfg.remark.trim()) {
    ctx.shadowBlur = Math.round(8 * scale);
    ctx.font = `700 ${smallFont}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(cfg.remark.trim(), bx, y);
  }
  ctx.restore();
}

// ─── Web Canvas 合成水印 ───────────────────────────────────────────────────────
async function composeOnWeb(
  photoUri: string,
  lines: string[],
  position: WatermarkPosition,
  customX: number,
  customY: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, lines, position, customX, customY);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('canvas toBlob 失败')); },
        'image/jpeg', 0.88,
      );
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = photoUri;
  });
}

function getWatermarkStyle(position: WatermarkPosition, customX: number, customY: number): Record<string, unknown> {
  const base: Record<string, unknown> = {
    position: 'absolute',
    gap: 8,
    maxWidth: '92%',
    minWidth: 250,
  };
  if (position === 'top-left')      return { ...base, top: 20, left: 16 };
  if (position === 'top-right')     return { ...base, top: 20, right: 16 };
  if (position === 'bottom-left')   return { ...base, bottom: 20, left: 16 };
  if (position === 'bottom-right')  return { ...base, bottom: 20, right: 16 };
  if (position === 'center-bottom') return { ...base, bottom: 20, alignSelf: 'center', left: '8%', right: '8%', maxWidth: '84%' };
  if (position === 'full')          return { ...base, bottom: 16, left: 16, right: 16, maxWidth: '100%' };
  return { ...base, top: `${customY * 100}%`, left: `${customX * 100}%` };
}

function WatermarkOverlay({ cfg, username, style }: { cfg: WatermarkConfig; username: string; style: Record<string, unknown> }) {
  const meta = [getWeekdayStr(), cfg.weatherText.trim()].filter(Boolean).join('  ');
  const storeLine = [
    cfg.showCompany ? (cfg.storeName || cfg.company) : '',
    cfg.showUsername ? username : '',
  ].filter(Boolean).join(' · ');
  return (
    <View pointerEvents="none" style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cfg.showTime && (
          <Text style={{ color: '#fff', fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6 }}>
            {getTimeStr().slice(0, 5)}
          </Text>
        )}
        {(cfg.showDate || meta) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: cfg.showTime ? 12 : 0 }}>
            {cfg.showTime && <View style={{ width: 4, height: 50, borderRadius: 2, backgroundColor: '#F7B733', marginRight: 12 }} />}
            <View style={{ gap: 4 }}>
              {cfg.showDate && <Text style={{ color: '#fff', fontSize: 21, lineHeight: 25, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 5 }}>{getDateStr()}</Text>}
              {!!meta && <Text style={{ color: '#fff', fontSize: 20, lineHeight: 24, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 5 }}>{meta}</Text>}
            </View>
          </View>
        )}
      </View>
      {!!storeLine && (
        <Text style={{ color: '#fff', fontSize: 15, lineHeight: 20, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5 }}>
          {storeLine}
        </Text>
      )}
      {cfg.showLocation && !!cfg.locationText && (
        <Text style={{ color: '#fff', fontSize: 19, lineHeight: 25, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5 }}>
          {cfg.locationText}
        </Text>
      )}
      {cfg.showSlogan && !!cfg.slogan.trim() && (
        <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(232,169,58,0.78)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 }}>
          <Text style={{ color: '#fff', fontSize: 16, lineHeight: 21, fontWeight: '900' }}>{cfg.slogan.trim()}</Text>
        </View>
      )}
      {!!cfg.remark.trim() && (
        <Text style={{ color: '#fff', fontSize: 14, lineHeight: 19, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5 }}>
          {cfg.remark.trim()}
        </Text>
      )}
    </View>
  );
}

export default function WatermarkCameraScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const isWeb = process.env.EXPO_OS === 'web';
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const watermarkViewRef = useRef<View>(null);
  const [recording, setRecording] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');

  // 短视频录制：长按计时（10 秒上限）
  const MAX_RECORD_SECS = 10;
  const recordTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef   = useRef(0);
  const [recordSecs, setRecordSecs] = useState(0);
  const recordProgressAnim = useRef(new Animated.Value(0)).current;

  // 长按 vs 短按区分：按下 300ms 后进入录制，否则执行拍照
  const pressTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  // 多媒体收集队列
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
  // 当前正在预览/编辑的项（用于添加水印）
  const [previewItem, setPreviewItem] = useState<CapturedItem | null>(null);

  // 水印配置
  const [wConfig, setWConfig] = useState<WatermarkConfig>(DEFAULT_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [tempConfig, setTempConfig] = useState<WatermarkConfig>(DEFAULT_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);
  const [locating, setLocating] = useState(false);

  // 拖拽
  const dragRef = useRef({ startX: 0, startY: 0, startCX: 0, startCY: 0 });
  const previewLayout = useRef({ width: 1, height: 1 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => wConfig.position === 'custom',
      onMoveShouldSetPanResponder:  () => wConfig.position === 'custom',
      onPanResponderGrant: (e) => {
        dragRef.current = { startX: e.nativeEvent.pageX, startY: e.nativeEvent.pageY, startCX: wConfig.customX, startCY: wConfig.customY };
      },
      onPanResponderMove: (e) => {
        const dx = e.nativeEvent.pageX - dragRef.current.startX;
        const dy = e.nativeEvent.pageY - dragRef.current.startY;
        const { width, height } = previewLayout.current;
        const nx = Math.max(0, Math.min(0.8, dragRef.current.startCX + dx / width));
        const ny = Math.max(0, Math.min(0.9, dragRef.current.startCY + dy / height));
        setWConfig(c => ({ ...c, customX: nx, customY: ny }));
      },
    })
  ).current;

  // ─── Web 端摄像头实时预览 ────────────────────────────────────────────────────
  const webVideoRef   = useRef<any>(null);
  const webStreamRef  = useRef<MediaStream | null>(null);
  const [webCamReady,  setWebCamReady]  = useState(false);
  const [webCamDenied, setWebCamDenied] = useState(false);

  // Web 端实时 Canvas 录屏（帧级水印合成）
  const webCanvasRef  = useRef<any>(null);
  const webCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const webRafRef     = useRef<number | null>(null);
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webRecordedChunksRef = useRef<Blob[]>([]);
  const webImageWatermarkRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!isWeb) return;
    let active = true;
    // 停止旧轨道，避免重复申请
    if (webStreamRef.current) {
      webStreamRef.current.getTracks().forEach(t => t.stop());
      webStreamRef.current = null;
    }
    setWebCamReady(false);
    const facingMode = facing === 'front' ? 'user' : 'environment';
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        webStreamRef.current = stream;
        if (webVideoRef.current) {
          webVideoRef.current.srcObject = stream;
          await webVideoRef.current.play();
          setWebCamReady(true);
          setWebCamDenied(false);
        }
      } catch {
        if (active) setWebCamDenied(true);
      }
    })();
    return () => {
      active = false;
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach(t => t.stop());
        webStreamRef.current = null;
      }
    };
  }, [isWeb, facing]);

  const [saving, setSaving]           = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const username = profile?.display_name ?? '用户';

  const buildWatermarkLines = useCallback((cfg: WatermarkConfig): string[] => {
    const lines: string[] = [];
    if (cfg.showCompany)  lines.push(cfg.storeName || cfg.company || DEFAULT_COMPANY);
    if (cfg.showDate)     lines.push(getDateStr());
    if (cfg.showTime)     lines.push(getTimeStr());
    if (cfg.showUsername) lines.push(username);
    if (cfg.showLocation) lines.push(cfg.locationText || DEFAULT_CONFIG.locationText);
    if (cfg.showSlogan && cfg.slogan.trim()) lines.push(cfg.slogan.trim());
    if (cfg.remark.trim()) lines.push(cfg.remark.trim());
    return lines;
  }, [username]);

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) { setErrMsg(msg); setTimeout(() => setErrMsg(''), 3500); }
    else { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3500); }
  };

  const formatLocationAddress = (place?: Location.LocationGeocodedAddress) => {
    if (!place) return '';
    const cityArea = [place.city || place.region, place.district || place.subregion].filter(Boolean).join('');
    const detail = place.name || place.street || '';
    if (cityArea && detail) return `${cityArea} · ${detail}`;
    return cityArea || detail;
  };

  const requestCurrentLocation = async (showToast = false) => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        if (showToast) showMsg('定位权限未开启', true);
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = current.coords;
      let text = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      try {
        const places = await Location.reverseGeocodeAsync({ latitude, longitude });
        text = formatLocationAddress(places[0]) || text;
      } catch {
        // 反查地址失败时保留经纬度
      }

      setWConfig(c => ({ ...c, locationText: text }));
      setTempConfig(c => ({ ...c, locationText: text }));
      if (showToast) showMsg('定位已更新');
    } catch {
      if (showToast) showMsg('定位获取失败，请稍后重试', true);
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (wConfig.showLocation && wConfig.locationText === DEFAULT_CONFIG.locationText) {
      requestCurrentLocation(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    (async () => {
      // 进入页面自动申请摄像头权限
      if (!isWeb && requestPermission && !permission?.granted) {
        await requestPermission();
      }
      // 加载水印配置
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['watermark_company', 'watermark_store_name', 'watermark_weather', 'watermark_slogan', 'watermark_location']);
      if (data?.length) {
        const configMap = new Map((data as { key: string; value: string }[]).map(row => [row.key, row.value]));
        const patch = {
          company: configMap.get('watermark_company') || configMap.get('watermark_store_name') || DEFAULT_CONFIG.company,
          storeName: configMap.get('watermark_store_name') || configMap.get('watermark_company') || DEFAULT_CONFIG.storeName,
          weatherText: configMap.get('watermark_weather') || DEFAULT_CONFIG.weatherText,
          slogan: configMap.get('watermark_slogan') || DEFAULT_CONFIG.slogan,
          locationText: configMap.get('watermark_location') || DEFAULT_CONFIG.locationText,
        };
        setWConfig(c => ({ ...c, ...patch }));
        setTempConfig(c => ({ ...c, ...patch }));
      }
    })();
  }, []));

  // ─── Web 端截取摄像头当前帧并合成水印 ───────────────────────────────────────
  async function captureWebFrame(video: HTMLVideoElement): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || video.clientWidth || 1280;
    canvas.height = video.videoHeight || video.clientHeight || 720;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawStyledWatermarkOnCanvas(ctx, canvas.width, canvas.height, wConfig, username);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('截取帧失败')); },
        'image/jpeg', 0.88,
      );
    });
  }

  // ─── 在 canvas 上绘制水印（文字 + 图片） ─────────────────────────────────────
  const renderWatermarkToCanvas = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const lines = buildWatermarkLines(wConfig);
    if (lines.length > 0) {
      drawStyledWatermarkOnCanvas(ctx, W, H, wConfig, username);
    }
    // 图片水印
    if (wConfig.imageWatermark?.uri && webImageWatermarkRef.current?.complete) {
      ctx.save();
      ctx.globalAlpha = wConfig.imageWatermark.opacity;
      const img = webImageWatermarkRef.current;
      const ratio = Math.min(W * 0.25 / img.width, H * 0.25 / img.height, 1);
      const iw = img.width * ratio;
      const ih = img.height * ratio;
      ctx.drawImage(img, W - iw - 16, H - ih - 16, iw, ih);
      ctx.restore();
    }
  }, [wConfig, buildWatermarkLines]);

  // ─── 启动 canvas 实时录屏渲染循环 ─────────────────────────────────────────
  const startWebCanvasLoop = useCallback(() => {
    if (!webVideoRef.current || !webCanvasRef.current) return;
    const video = webVideoRef.current as HTMLVideoElement;
    const canvas = webCanvasRef.current as HTMLCanvasElement;
    canvas.width = video.videoWidth || video.clientWidth || 1280;
    canvas.height = video.videoHeight || video.clientHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    webCanvasCtxRef.current = ctx;
    const loop = () => {
      if (!video || !ctx || video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      renderWatermarkToCanvas(ctx, canvas.width, canvas.height);
      webRafRef.current = requestAnimationFrame(loop);
    };
    webRafRef.current = requestAnimationFrame(loop);
  }, [renderWatermarkToCanvas]);

  const stopWebCanvasLoop = useCallback(() => {
    if (webRafRef.current) {
      cancelAnimationFrame(webRafRef.current);
      webRafRef.current = null;
    }
  }, []);

  // ─── 拍照（点按，性能优化：降质+skipProcessing，拍完留取景框）───────────────
  const handleTakePicture = async () => {
    if (isWeb) {
      // Web：直接截取摄像头当前帧
      if (!webVideoRef.current || !webCamReady) {
        showMsg('摄像头未就绪，请允许权限后重试', true);
        return;
      }
      try {
        const blob = await captureWebFrame(webVideoRef.current);
        const file = new File([blob], `web-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const item: CapturedItem = { id: `${Date.now()}`, uri: URL.createObjectURL(file), type: 'image', file };
        setCapturedItems(prev => [...prev, item]);
      } catch { showMsg('截取失败，请重试', true); }
      return;
    }
    if (!cameraRef.current) return;
    try {
      // skipProcessing=true 大幅减少处理时间，避免卡顿
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (photo) {
        const item: CapturedItem = { id: `${Date.now()}`, uri: photo.uri, type: 'image' };
        setCapturedItems(prev => [...prev, item]);
        // 拍完留取景框，不自动跳预览，减少界面切换卡顿
      }
    } catch { showMsg('拍照失败，请重试', true); }
  };

  // ─── 选择 Web 端录制 MIME 类型 ──────────────────────────────────────────
  const getSupportedMimeType = useCallback((): string => {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }, []);

  // ─── 长按开始录制（最多 10 秒）─────────────────────────────────────────────
  const handleRecordStart = async () => {
    if (isWeb) {
      // Web：实时 Canvas 录屏，每帧合成水印
      if (!webVideoRef.current || !webCamReady) {
        showMsg('摄像头未就绪，无法录制', true);
        return;
      }
      const mimeType = getSupportedMimeType();
      if (!mimeType || !window.MediaRecorder.isTypeSupported(mimeType)) {
        showMsg('当前浏览器不支持视频录制', true);
        return;
      }
      if (!webCanvasRef.current) {
        // 懒加载隐藏 canvas
        webCanvasRef.current = document.createElement('canvas');
      }
      startWebCanvasLoop();
      const stream = webCanvasRef.current.captureStream(30);
      webMediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      webRecordedChunksRef.current = [];
      webMediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) webRecordedChunksRef.current.push(e.data); };
      webMediaRecorderRef.current.onstop = () => {
        stopWebCanvasLoop();
        const blob = new Blob(webRecordedChunksRef.current, { type: mimeType });
        const file = new File([blob], `web-video-${Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`, { type: mimeType });
        const item: CapturedItem = { id: `${Date.now()}`, uri: URL.createObjectURL(file), type: 'video', file };
        setCapturedItems(prev => [...prev, item]);
      };
      webMediaRecorderRef.current.start(100);

      setRecording(true);
      recordSecsRef.current = 0;
      setRecordSecs(0);
      recordProgressAnim.setValue(0);
      recordTimerRef.current = setInterval(() => {
        recordSecsRef.current += 0.1;
        const secs = recordSecsRef.current;
        setRecordSecs(Math.floor(secs));
        Animated.timing(recordProgressAnim, {
          toValue: secs / MAX_RECORD_SECS,
          duration: 100,
          useNativeDriver: false,
        }).start();
        if (secs >= MAX_RECORD_SECS) handleRecordStop();
      }, 100);
      return;
    }
    if (!cameraRef.current || recording) return;

    setRecording(true);
    recordSecsRef.current = 0;
    setRecordSecs(0);
    recordProgressAnim.setValue(0);

    // 进度计时器（每 100ms 更新一次）
    recordTimerRef.current = setInterval(() => {
      recordSecsRef.current += 0.1;
      const secs = recordSecsRef.current;
      setRecordSecs(Math.floor(secs));
      Animated.timing(recordProgressAnim, {
        toValue: secs / MAX_RECORD_SECS,
        duration: 100,
        useNativeDriver: false,
      }).start();
      if (secs >= MAX_RECORD_SECS) {
        // 达到上限自动停止
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        cameraRef.current?.stopRecording();
      }
    }, 100);

    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_RECORD_SECS });
      if (video) {
        const item: CapturedItem = { id: `${Date.now()}`, uri: video.uri, type: 'video' };
        setCapturedItems(prev => [...prev, item]);
      }
    } catch { /* 中断录制时正常，忽略 */ }
    finally {
      setRecording(false);
      setRecordSecs(0);
      recordProgressAnim.setValue(0);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    }
  };

  // ─── 统一快门：短按拍照，长按录像（微信交互） ────────────────────────────────
  const handleShutterPressIn = () => {
    isLongPressRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      handleRecordStart();
    }, 300);
  };

  const handleShutterPressOut = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    if (isLongPressRef.current) {
      // 长按松手 → 停止录制
      handleRecordStop();
    }
    // 短按松手不在此处理，由 onPress 触发拍照
  };

  const handleShutterPress = () => {
    // 只在非长按时触发拍照（长按录像走 pressIn/pressOut）
    if (!isLongPressRef.current) { handleTakePicture(); }
  };

  // ─── 松手停止录制 ─────────────────────────────────────────────────────────
  const handleRecordStop = () => {
    if (!recording) return;
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    if (isWeb) {
      webMediaRecorderRef.current?.stop();
      return;
    }
    cameraRef.current?.stopRecording();
  };

  // 组件卸载时清理计时器
  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (pressTimerRef.current)  clearTimeout(pressTimerRef.current);
  }, []);

  // ─── 图库批量添加 ─────────────────────────────────────────────────────────────
  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: 9,
    });
    if (!result.canceled) {
      const newItems: CapturedItem[] = result.assets.map(a => {
        const asset = a as ImagePicker.ImagePickerAsset & { file?: File };
        return { id: `${Date.now()}-${Math.random()}`, uri: a.uri, type: (a.type === 'video' ? 'video' : 'image'), file: asset.file };
      });
      setCapturedItems(prev => [...prev, ...newItems]);
    }
  };

  // ─── 单项上传（处理水印合成）────────────────────────────────────────────────
  const uploadOneItem = async (item: CapturedItem, lines: string[]): Promise<string> => {
    const isVideo = item.type === 'video';
    const videoType = item.file?.type || (item.uri.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4');
    const ext = isVideo ? (videoType.includes('webm') ? 'webm' : 'mp4') : 'jpg';
    const contentType = isVideo ? videoType : 'image/jpeg';
    const fileName = `wm-${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `${isVideo ? 'videos' : 'images'}/${fileName}`;
    let arrayBuffer: ArrayBuffer;

    if (isVideo) {
      const resp = await expoFetch(item.uri);
      arrayBuffer = await resp.arrayBuffer();
    } else if (isWeb) {
      let srcUri = item.uri;
      if (item.file) srcUri = URL.createObjectURL(item.file);
      const blob = await composeOnWeb(srcUri, lines, wConfig.position, wConfig.customX, wConfig.customY);
      arrayBuffer = await blob.arrayBuffer();
    } else {
      // Native：直接上传原图，水印以 UI overlay 形式在工作圈展示（captureRef 不稳定，已移除）
      const resp = await expoFetch(item.uri);
      arrayBuffer = await resp.arrayBuffer();
    }

    const { data: storageData, error: storageErr } = await supabase.storage
      .from(BUCKET).upload(storagePath, arrayBuffer, { contentType, upsert: false });
    if (storageErr) throw storageErr;
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storageData.path);
    return urlData.publicUrl;
  };

  // ─── 批量发布 ─────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (capturedItems.length === 0) return;
    setSaving(true); setErrMsg('');
    try {
      // 1. 创建 post（显式传 user_id，与 RLS WITH CHECK uid()=user_id 对齐）
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('未登录，请重新登录后发布');
      const { data: postData, error: postErr } = await supabase
        .from('watermark_posts')
        .insert({ user_id: userId, remark: wConfig.remark.trim(), taken_at: new Date().toISOString() })
        .select('id').single();
      if (postErr || !postData) throw postErr ?? new Error('创建发布失败');

      const postId = postData.id;
      const lines = buildWatermarkLines(wConfig);
      const mediaInserts: { post_id: string; photo_url: string; media_type: string; sort_order: number }[] = [];

      // 2. 逐张上传（Native view-shot 只能截当前预览，所以 Native 非 Web 时只能顺序处理）
      for (let i = 0; i < capturedItems.length; i++) {
        setSaveProgress(`上传 ${i + 1}/${capturedItems.length}…`);
        const url = await uploadOneItem(capturedItems[i], lines);
        mediaInserts.push({ post_id: postId, photo_url: url, media_type: capturedItems[i].type, sort_order: i });
        // 同时向后兼容：也写 watermark_photos
        await supabase.from('watermark_photos').insert({
          photo_url: url, photo_path: '', remark: wConfig.remark.trim(),
          taken_at: new Date().toISOString(), media_type: capturedItems[i].type,
        });
      }

      // 3. 批量写入 watermark_post_media
      const { error: mediaErr } = await supabase.from('watermark_post_media').insert(mediaInserts);
      if (mediaErr) throw mediaErr;

      setSaveProgress('');
      showMsg(`已发布 ${capturedItems.length} 个文件到我的团队 ✓`);
      setTimeout(() => {
        setCapturedItems([]);
        setPreviewItem(null);
        setWConfig(c => ({ ...c, remark: '' }));
        // 发布成功后跳回工作圈，触发 useFocusEffect 刷新
        router.replace('/(app)/watermark-album' as Parameters<typeof router.replace>[0]);
      }, 1200);
    } catch (e: unknown) {
      showMsg(`发布失败：${(e as Error).message || '请重试'}`, true);
    } finally { setSaving(false); setSaveProgress(''); }
  };

  // ─── 保存水印设置 ─────────────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    const nextConfig = { ...tempConfig, company: tempConfig.storeName || tempConfig.company };
    await supabase.from('app_config').upsert([
      { key: 'watermark_company', value: nextConfig.company },
      { key: 'watermark_store_name', value: nextConfig.storeName },
      { key: 'watermark_weather', value: nextConfig.weatherText },
      { key: 'watermark_slogan', value: nextConfig.slogan },
      { key: 'watermark_location', value: nextConfig.locationText },
    ], { onConflict: 'key' });
    setWConfig(nextConfig);
    setSavingConfig(false);
    setShowSettings(false);
  };

  const removeItem = (id: string) => {
    setCapturedItems(prev => prev.filter(it => it.id !== id));
    setPreviewItem(p => (p?.id === id ? null : p));
  };

  const watermarkLines = buildWatermarkLines(wConfig);
  const wmStyle = getWatermarkStyle(wConfig.position, wConfig.customX, wConfig.customY);

  // ─── 权限未授予 ───────────────────────────────────────────────────────────────
  if (!isWeb) {
    if (!permission) return <View className="flex-1 bg-black items-center justify-center"><ActivityIndicator color="#fff" /></View>;
    if (!permission.granted) {
      return (
        <SafeAreaView className="flex-1 bg-black items-center justify-center gap-5 px-8">
          <StatusBar style="light" />
          <Camera size={52} color="#fff" />
          <Text className="text-white text-lg font-semibold text-center">需要相机权限</Text>
          <Text className="text-white/60 text-sm text-center">请允许灶管家访问相机以使用水印拍照功能</Text>
          <Pressable className="bg-white px-8 py-3 rounded-2xl active:opacity-80" onPress={requestPermission}>
            <Text className="text-black font-semibold text-base">授权相机</Text>
          </Pressable>
          <Pressable className="active:opacity-60" onPress={() => router.back()}>
            <Text className="text-white/60 text-sm">返回</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
  }

  // ─── 单张预览页（含水印叠加）─────────────────────────────────────────────────
  if (previewItem) {
    return (
      <View className="flex-1 bg-black">
        <StatusBar style="light" />
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
            <Pressable onPress={() => setPreviewItem(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
              <X size={18} color="#fff" />
            </Pressable>
            <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' }}>
              预览 ({capturedItems.findIndex(i => i.id === previewItem.id) + 1}/{capturedItems.length})
            </Text>
            <Pressable onPress={() => removeItem(previewItem.id)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(239,68,68,0.3)', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
              <Trash2 size={16} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>

        <View
          ref={previewItem.type === 'image' ? watermarkViewRef : undefined}
          style={{ flex: 1, position: 'relative' }}
          collapsable={false}
          onLayout={e => { previewLayout.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }}
          {...(wConfig.position === 'custom' && previewItem.type === 'image' ? panResponder.panHandlers : {})}
        >
          {previewItem.type === 'video' ? (
            process.env.EXPO_OS !== 'web' ? (
              <VideoPreview uri={previewItem.uri} />
            ) : (
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                <iframe src={previewItem.uri} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay" title="video-preview" />
              </View>
            )
          ) : (
            <Image source={{ uri: previewItem.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          )}
          {previewItem.type === 'image' && watermarkLines.length > 0 && (
            <WatermarkOverlay cfg={wConfig} username={username} style={wmStyle} />
          )}
          {previewItem.type === 'video' && (
            <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Video size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12 }}>视频（水印 UI 预览）</Text>
            </View>
          )}
        </View>

        <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#000' }}>
          <View style={{ padding: 16 }}>
            <Pressable onPress={() => setPreviewItem(null)} style={{ paddingVertical: 14, borderRadius: 16, backgroundColor: '#FFA07A', alignItems: 'center' }} className="active:opacity-80">
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>返回继续拍摄</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── 相机取景框 ───────────────────────────────────────────────────────────────
  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" />

      {/* 顶部导航（去掉拍照/录像切换 tab，统一用短按拍照 / 长按录像） */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
            <ArrowLeft size={22} color="#1F2937" />
          </Pressable>
          <Text style={{ color: '#111827', fontSize: 18, fontWeight: '800' }}>水印相机</Text>
          <View style={{ width: 44 }} />
        </View>
      </SafeAreaView>

      {/* 相机预览区（CameraView mode 跟随 recording 状态切换） */}
      <View
        style={{ flex: 1, position: 'relative' }}
        onLayout={e => { previewLayout.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }}
        {...(wConfig.position === 'custom' ? panResponder.panHandlers : {})}
      >
        {!isWeb ? (
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} mode={recording ? 'video' : 'picture'} />
        ) : (
          /* Web 端：真实摄像头实时预览 */
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <video
              ref={webVideoRef}
              playsInline
              autoPlay
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as any}
            />
            {/* 启动中遮罩 */}
            {!webCamReady && !webCamDenied && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>摄像头启动中…</Text>
              </View>
            )}
            {/* 权限拒绝提示 */}
            {webCamDenied && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 }}>
                <Camera size={52} color="rgba(255,255,255,0.35)" />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
                  {'摄像头权限被拒绝\n请在浏览器设置中允许访问摄像头后刷新'}
                </Text>
              </View>
            )}
          </View>
        )}
        {watermarkLines.length > 0 && (
          <WatermarkOverlay cfg={wConfig} username={username} style={wmStyle} />
        )}
        {wConfig.position === 'custom' && (
          <Text style={{ position: 'absolute', bottom: 8, alignSelf: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>拖动水印调整位置</Text>
        )}

        {/* 录像计时 */}
        {recording && (
          <View style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>录制中 {recordSecs}s / {MAX_RECORD_SECS}s</Text>
            </View>
            {/* 线性进度条 */}
            <View style={{ marginTop: 8, width: 200, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
              <Animated.View style={{
                height: '100%', backgroundColor: '#EF4444', borderRadius: 2,
                width: recordProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }} />
            </View>
          </View>
        )}

        {/* 已拍缩略图横向滚动 */}
        {capturedItems.length > 0 && (
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <FlatList
              data={capturedItems}
              keyExtractor={it => it.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => setPreviewItem(item)} style={{ position: 'relative', width: 56, height: 56, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: '#FFA07A' }} className="active:opacity-80">
                  <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  {item.type === 'video' && (
                    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <Video size={14} color="#fff" />
                    </View>
                  )}
                  <Pressable onPress={() => removeItem(item.id)} style={{ position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-70">
                    <X size={10} color="#fff" />
                  </Pressable>
                </Pressable>
              )}
            />
          </View>
        )}
      </View>

      {/* 底部快门区 */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
        {/* 消息提示 */}
        {(successMsg || errMsg || saveProgress) ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={{ backgroundColor: successMsg ? 'rgba(22,163,74,0.12)' : errMsg ? 'rgba(239,68,68,0.12)' : '#F3F6FA', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {successMsg && <CheckCircle size={16} color="#16A34A" />}
              <Text style={{ color: successMsg ? '#16A34A' : errMsg ? '#EF4444' : '#334155', fontSize: 13, flex: 1 }}>{successMsg || errMsg || saveProgress}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 22, gap: 0 }}>
          {/* 左：功能按钮（图库、设置、翻转） */}
          <View style={{ flex: 1, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <Pressable onPress={handlePickFromLibrary} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
              <Images size={21} color="#334155" />
            </Pressable>
            <Pressable onPress={() => { setTempConfig({ ...wConfig }); setShowSettings(true); }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
              <Settings size={21} color="#334155" />
            </Pressable>
            {!isWeb && (
              <Pressable onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
                <SwitchCamera size={21} color="#334155" />
              </Pressable>
            )}
          </View>

          {/* 中：快门（短按拍照 / 长按录像） */}
          <Pressable
            onPress={handleShutterPress}
            onPressIn={handleShutterPressIn}
            onPressOut={handleShutterPressOut}
            style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: recording ? '#EF4444' : '#FFFFFF',
              borderWidth: 5, borderColor: recording ? '#FCA5A5' : '#E4ECF7',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
            }}
            className="active:opacity-80"
          >
            {recording ? (
              <View style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: '#fff' }} />
            ) : (
              <Camera size={28} color="#1F2937" />
            )}
          </Pressable>
          {/* 提示文字 */}
          {!recording && (
            <Text style={{ position: 'absolute', bottom: 3, left: 0, right: 0, color: '#94A3B8', fontSize: 10, textAlign: 'center' }}>
              点按拍照 · 长按录像
            </Text>
          )}

          {/* 右：发布按钮 or 工作圈入口 */}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {capturedItems.length > 0 ? (
              <Pressable
                onPress={handlePublish}
                disabled={saving}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: saving ? '#aaa' : '#FFA07A', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                className="active:opacity-80"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Plus size={14} color="#fff" />
                )}
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  {saving ? '发布中' : `发布(${capturedItems.length})`}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push('/(app)/watermark-album' as Parameters<typeof router.push>[0])}
                style={{ width: 58, alignItems: 'center', justifyContent: 'center', gap: 4 }}
                className="active:opacity-60"
              >
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 24, height: 24, position: 'relative' }}>
                    <View style={{ position: 'absolute', left: 4, top: 3, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22D9AE' }} />
                    <View style={{ position: 'absolute', right: 3, top: 7, width: 12, height: 12, borderRadius: 6, backgroundColor: '#67D6CA' }} />
                    <View style={{ position: 'absolute', left: 7, bottom: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#AC88FF' }} />
                  </View>
                </View>
                <Text style={{ color: '#334155', fontSize: 11, fontWeight: '600' }}>工作圈</Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* ─── 水印设置弹窗 ────────────────────────────────────────────────────────── */}
      <Modal visible={showSettings} animationType="slide" transparent presentationStyle="overFullScreen">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowSettings(false)}>
          <Pressable onPress={e => e.stopPropagation()}>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: 'auto' }}>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
                <View style={{ padding: 20, gap: 18 }}>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>水印设置</Text>

                  {/* 店名 */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>店名</Text>
                    <TextInput
                      value={tempConfig.storeName}
                      onChangeText={v => setTempConfig(c => ({ ...c, storeName: v, company: v }))}
                      placeholder="输入门店/品牌名称"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 }}
                    />
                  </View>

                  {/* 天气 */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>天气/温度</Text>
                    <TextInput
                      value={tempConfig.weatherText}
                      onChangeText={v => setTempConfig(c => ({ ...c, weatherText: v }))}
                      placeholder="例如：阴 25°C"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 }}
                    />
                  </View>

                  {/* 字段开关 */}
                  {[
                    { key: 'showCompany', label: '显示店名' },
                    { key: 'showDate',    label: '显示日期' },
                    { key: 'showTime',    label: '显示时间' },
                    { key: 'showUsername', label: '显示用户名' },
                    { key: 'showLocation', label: '显示定位' },
                    { key: 'showSlogan', label: '显示标语' },
                  ].map(({ key, label }) => (
                    <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 14 }}>{label}</Text>
                      <Switch
                        value={tempConfig[key as keyof WatermarkConfig] as boolean}
                        onValueChange={v => setTempConfig(c => ({ ...c, [key]: v }))}
                        trackColor={{ false: '#3A3A3C', true: '#FFA07A' }}
                        thumbColor="#fff"
                      />
                    </View>
                  ))}

                  {/* 定位 */}
                  {tempConfig.showLocation && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>定位地址</Text>
                      <TextInput
                        value={tempConfig.locationText}
                        onChangeText={v => setTempConfig(c => ({ ...c, locationText: v }))}
                        placeholder="自动定位或手动输入地址"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 }}
                      />
                      <Pressable
                        onPress={() => requestCurrentLocation(true)}
                        disabled={locating}
                        style={{ paddingVertical: 10, borderRadius: 10, backgroundColor: locating ? 'rgba(255,160,122,0.45)' : 'rgba(255,160,122,0.18)', alignItems: 'center' }}
                        className="active:opacity-70"
                      >
                        <Text style={{ color: '#FFA07A', fontSize: 13, fontWeight: '700' }}>{locating ? '定位中…' : '重新定位'}</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* 标语 */}
                  {tempConfig.showSlogan && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>标语行</Text>
                      <TextInput
                        value={tempConfig.slogan}
                        onChangeText={v => setTempConfig(c => ({ ...c, slogan: v }))}
                        placeholder="输入水印底部标语"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 }}
                      />
                    </View>
                  )}

                  {/* 备注 */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>备注文字</Text>
                    <TextInput
                      value={tempConfig.remark}
                      onChangeText={v => setTempConfig(c => ({ ...c, remark: v }))}
                      placeholder="添加备注内容（可选）"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 }}
                    />
                  </View>

                  {/* 水印位置 — 可视化九宫格 */}
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>水印位置</Text>

                    {/* 取景框示意图：3×3 + 全宽/自定义 */}
                    <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                      {/* 行1：左上 / 空 / 右上 */}
                      <View style={{ flexDirection: 'row' }}>
                        {(['top-left', null, 'top-right'] as (WatermarkPosition | null)[]).map((pos, ci) => (
                          <Pressable
                            key={`r0c${ci}`}
                            onPress={() => pos && setTempConfig(c => ({ ...c, position: pos }))}
                            style={{
                              flex: 1, height: 44,
                              alignItems: pos === 'top-left' ? 'flex-start' : pos === 'top-right' ? 'flex-end' : 'center',
                              justifyContent: 'flex-start',
                              padding: 6,
                              backgroundColor: pos && tempConfig.position === pos ? 'rgba(255,160,90,0.3)' : 'transparent',
                              borderRightWidth: ci < 2 ? 0.5 : 0,
                              borderRightColor: 'rgba(255,255,255,0.12)',
                              borderBottomWidth: 0.5,
                              borderBottomColor: 'rgba(255,255,255,0.12)',
                            }}
                            className={pos ? 'active:opacity-70' : undefined}
                          >
                            {pos && (
                              <View style={{ width: 24, height: 10, borderRadius: 3, backgroundColor: pos && tempConfig.position === pos ? '#FFA07A' : 'rgba(255,255,255,0.35)' }} />
                            )}
                          </Pressable>
                        ))}
                      </View>
                      {/* 行2：空白中间行 */}
                      <View style={{ flexDirection: 'row' }}>
                        {[0, 1, 2].map(ci => (
                          <View key={`r1c${ci}`} style={{ flex: 1, height: 36, borderRightWidth: ci < 2 ? 0.5 : 0, borderRightColor: 'rgba(255,255,255,0.12)', borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.12)' }} />
                        ))}
                      </View>
                      {/* 行3：左下 / 底居中 / 右下 */}
                      <View style={{ flexDirection: 'row' }}>
                        {(['bottom-left', 'center-bottom', 'bottom-right'] as WatermarkPosition[]).map((pos, ci) => (
                          <Pressable
                            key={`r2c${ci}`}
                            onPress={() => setTempConfig(c => ({ ...c, position: pos }))}
                            style={{
                              flex: 1, height: 44,
                              alignItems: pos === 'bottom-left' ? 'flex-start' : pos === 'bottom-right' ? 'flex-end' : 'center',
                              justifyContent: 'flex-end',
                              padding: 6,
                              backgroundColor: tempConfig.position === pos ? 'rgba(255,160,90,0.3)' : 'transparent',
                              borderRightWidth: ci < 2 ? 0.5 : 0,
                              borderRightColor: 'rgba(255,255,255,0.12)',
                            }}
                            className="active:opacity-70"
                          >
                            <View style={{ width: 24, height: 10, borderRadius: 3, backgroundColor: tempConfig.position === pos ? '#FFA07A' : 'rgba(255,255,255,0.35)' }} />
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* 全宽底部 + 自定义拖拽 */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => setTempConfig(c => ({ ...c, position: 'full' }))}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: tempConfig.position === 'full' ? '#FFA07A' : 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                        className="active:opacity-70"
                      >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: tempConfig.position === 'full' ? '700' : '400' }}>全宽底部</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTempConfig(c => ({ ...c, position: 'custom' }))}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: tempConfig.position === 'custom' ? '#FFA07A' : 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                        className="active:opacity-70"
                      >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: tempConfig.position === 'custom' ? '700' : '400' }}>自由拖拽</Text>
                      </Pressable>
                    </View>
                    {tempConfig.position === 'custom' && (
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center' }}>保存后在预览/取景框中拖动水印调整位置</Text>
                    )}
                  </View>

                  {/* 确认 */}
                  <Pressable
                    onPress={handleSaveConfig}
                    disabled={savingConfig}
                    style={{ paddingVertical: 14, borderRadius: 16, backgroundColor: '#FFA07A', alignItems: 'center' }}
                    className="active:opacity-80"
                  >
                    {savingConfig ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>确认</Text>}
                  </Pressable>
                </View>
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

