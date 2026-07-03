/**
 * 媒体详情页
 * 支持图片（全屏大图）和视频（expo-video 播放器）
 * 元数据：上传者 / 拍摄时间 / 备注 / 媒体类型
 * 操作：保存到本地相册（图片/视频） / Web 浏览器下载
 */
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Download,
  Film,
  MessageSquare,
  User,
} from 'lucide-react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { supabase } from '@/client/supabase';

interface MediaDetail {
  id: string;
  photo_url: string;
  media_type: 'image' | 'video';
  remark: string | null;
  taken_at: string;
  uploader_name: string;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
  const weeks = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 周${weeks[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── 视频播放组件（Native + Web 分支）────────────────────────────────────────
function NativeVideoPlayer({ uri }: { uri: string }) {
  // useVideoPlayer 仅在 Native 下使用，Web 分支不渲染此组件
  const player = useVideoPlayer(uri, (p: { play: () => void }) => { p.play(); });
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9 }}>
      <VideoView player={player} style={{ flex: 1 }} nativeControls />
    </View>
  );
}

export default function WatermarkPhotoDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const idStr = Array.isArray(id) ? id[0] : id;

  const [media, setMedia] = useState<MediaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  // 防止 useFocusEffect 重复触发
  const loadedId = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!idStr || loadedId.current === idStr) return;
    loadedId.current = idStr;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('watermark_photos')
        .select('id, photo_url, media_type, remark, taken_at, profiles(display_name)')
        .eq('id', idStr)
        .maybeSingle();
      if (data) {
        const p = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
        setMedia({
          id: data.id,
          photo_url: data.photo_url,
          media_type: (data.media_type as 'image' | 'video') || 'image',
          remark: data.remark,
          taken_at: data.taken_at,
          uploader_name: (p as { display_name?: string })?.display_name ?? '未知',
        });
      }
      setLoading(false);
    })();
  }, [idStr]));

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) { setSaveErr(msg); setTimeout(() => setSaveErr(''), 3500); }
    else { setSavedMsg(msg); setTimeout(() => setSavedMsg(''), 3500); }
  };

  const handleSave = async () => {
    if (!media || saving) return;
    setSaving(true);

    // Web 端：直接打开链接触发浏览器下载
    if (process.env.EXPO_OS === 'web') {
      const a = document.createElement('a');
      a.href = media.photo_url;
      a.download = `watermark-${media.id}.${media.media_type === 'video' ? 'mp4' : 'jpg'}`;
      a.target = '_blank';
      a.click();
      showMsg('已开始下载');
      setSaving(false);
      return;
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (status !== 'granted') { showMsg('需要相册权限，请在系统设置中开启', true); setSaving(false); return; }
      const ext = media.media_type === 'video' ? 'mp4' : 'jpg';
      const localUri = (FileSystem.documentDirectory ?? '') + `wm-${media.id}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(media.photo_url, localUri);
      await MediaLibrary.createAssetAsync(uri);
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      showMsg('已保存到相册 ✓');
    } catch (e: unknown) {
      showMsg(`保存失败：${(e as Error).message || '请重试'}`, true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={['top']}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#FFA07A" />
      </SafeAreaView>
    );
  }

  if (!media) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={['top']}>
        <StatusBar style="dark" />
        <Text style={{ color: '#9CA3AF', fontSize: 15 }}>内容不存在或已被删除</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#FFA07A', fontSize: 14, fontWeight: '600' }}>返回</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isVideo = media.media_type === 'video';

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />

      {/* 顶部导航（叠加在媒体上）*/}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
            <ArrowLeft size={20} color="#fff" />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
            {isVideo && <Film size={13} color="#fff" />}
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{isVideo ? '视频' : '照片'}</Text>
          </View>
          <Pressable onPress={handleSave} disabled={saving} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: saving ? 'rgba(0,0,0,0.3)' : 'rgba(255,160,122,0.9)', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-70">
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Download size={18} color="#fff" />}
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* 媒体区域 */}
        {isVideo ? (
          process.env.EXPO_OS !== 'web' ? (
            // Native：expo-video 播放器
            <View style={{ marginTop: 72 }}>
              <NativeVideoPlayer uri={media.photo_url} />
            </View>
          ) : (
            // Web：使用 iframe 形式的 HTML video，避免 TS JSX 类型冲突
            <View style={{ marginTop: 72, width: '100%', aspectRatio: 16 / 9 }}>
              <iframe
                src={media.photo_url}
                style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#000' }}
                allow="autoplay"
                title="video"
              />
            </View>
          )
        ) : (
          // 图片
          <View style={{ width: '100%', aspectRatio: 1, marginTop: 72 }}>
            <Image
              source={{ uri: media.photo_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }}
              transition={200}
            />
          </View>
        )}

        {/* 元数据卡片 */}
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16, marginTop: isVideo ? 0 : -8 }}>
          {/* 反馈消息 */}
          {(savedMsg || saveErr) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: savedMsg ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12 }}>
              {savedMsg ? <CheckCircle size={16} color="#16A34A" /> : null}
              <Text style={{ color: savedMsg ? '#16A34A' : '#EF4444', fontSize: 14, flex: 1 }}>{savedMsg || saveErr}</Text>
            </View>
          ) : null}

          {/* 元信息 */}
          <View style={{ gap: 14 }}>
            <MetaRow icon={<User size={16} color="#FFA07A" />} label="上传者" value={media.uploader_name} />
            <MetaRow icon={<Calendar size={16} color="#FFA07A" />} label="拍摄时间" value={formatDateTime(media.taken_at)} />
            <MetaRow icon={<Film size={16} color="#FFA07A" />} label="类型" value={isVideo ? '视频' : '照片'} />
            {media.remark ? <MetaRow icon={<MessageSquare size={16} color="#FFA07A" />} label="备注" value={media.remark} /> : null}
          </View>

          {/* 保存按钮 */}
          <Pressable onPress={handleSave} disabled={saving} style={{ paddingVertical: 15, borderRadius: 16, backgroundColor: saving ? '#FDD5B0' : '#FFA07A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }} className="active:opacity-80">
            {saving ? (
              <><ActivityIndicator size="small" color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>保存中…</Text></>
            ) : (
              <><Download size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{isVideo ? '保存视频到本地' : '保存照片到本地'}</Text></>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF4EE', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500' }}>{value}</Text>
      </View>
    </View>
  );
}
