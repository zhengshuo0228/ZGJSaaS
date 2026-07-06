/**
 * 采购汇总图片预览页
 * 渲染包含所有食材的完整长图，提供「保存到相册」与「分享」两个入口
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  type ScrollView as ScrollViewType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ArrowLeft, Download, Share2 } from 'lucide-react-native';
import { getShareSummaryPayload, clearShareSummaryPayload } from '@/lib/shareSummaryStore';
import type { SummaryGroup } from '@/lib/shareSummaryStore';
import { CATEGORY_COLORS } from '@/types/types';

export default function ShareImagePreviewScreen() {
  const router = useRouter();
  const captureViewRef = useRef<ScrollViewType>(null);

  const [groups, setGroups] = useState<SummaryGroup[]>([]);
  const [presetLabel, setPresetLabel] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    const payload = getShareSummaryPayload();
    if (payload) {
      setGroups(payload.groupedList);
      setPresetLabel(payload.presetLabel);
      setTotalItems(payload.totalItems);
      setTotalSuppliers(payload.totalSuppliers);
      // 数据已确认消费，安全清除
      clearShareSummaryPayload();
    } else {
      // 无可用的分享数据，退回上一页
      router.back();
    }
  }, [router]);

  const showMsg = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const captureImage = async (): Promise<string | null> => {
    try {
      // 稍作延迟确保 layout 完成
      await new Promise((r) => setTimeout(r, 300));
      const uri = await captureRef(captureViewRef, {
        format: 'png',
        quality: 1,
        snapshotContentContainer: true,
      });
      return uri;
    } catch {
      return null;
    }
  };

  // 保存到相册
  const handleSave = async () => {
    setGenerating(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (status !== 'granted') {
        showMsg('❌ 需要相册权限才能保存图片');
        return;
      }
      const uri = await captureImage();
      if (!uri) { showMsg('❌ 生成图片失败，请重试'); return; }
      await MediaLibrary.createAssetAsync(uri);
      showMsg('✅ 已保存到相册');
    } catch {
      showMsg('❌ 保存失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  // 调用系统原生分享
  const handleShare = async () => {
    setGenerating(true);
    try {
      const uri = await captureImage();
      if (!uri) { showMsg('❌ 生成图片失败，请重试'); return; }

      if (process.env.EXPO_OS === 'web') {
        const a = document.createElement('a');
        a.href = uri; a.download = '采购汇总.png'; a.click();
        return;
      }

      // 将临时 URI 复制到 cacheDirectory，再用 Sharing 分享（兼容所有 ROM）
      const dest = `${FileSystem.cacheDirectory}采购汇总_${Date.now()}.png`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dest, { mimeType: 'image/png', dialogTitle: '分享采购汇总图片' });
      } else {
        // expo-sharing 不可用时降级用 RN Share（部分设备）
        await Share.share({ url: dest, title: '采购汇总' });
      }
    } catch {
      showMsg('❌ 分享失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="flex-1 text-base font-bold text-foreground">图片预览</Text>
        <Text className="text-xs text-muted-foreground">向下滚动可查看完整内容</Text>
      </View>

      {/* 状态提示 */}
      {statusMsg ? (
        <View className="mx-4 mt-2 px-3 py-2 bg-primary/10 rounded-xl">
          <Text className="text-primary text-sm text-center font-medium">{statusMsg}</Text>
        </View>
      ) : null}

      {/* 可滚动预览区（ref 绑定在 ScrollView 上以捕获完整内容） */}
      <ScrollView ref={captureViewRef} collapsable={false} className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* 完整内容 */}
        <View style={{ backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 20, gap: 12 }}>
          {/* 标题区 */}
          <View style={{ backgroundColor: '#059669', borderRadius: 16, padding: 16, gap: 4 }}>
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 }}>
              采购汇总报表
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
              {dateStr}  · 时段：{presetLabel}
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' }} />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>{totalItems} 种食材</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' }} />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>{totalSuppliers} 个供应商</Text>
              </View>
            </View>
          </View>

          {/* 各供应商组 */}
          {groups.map((group, gi) => (
            <View key={gi} style={{ backgroundColor: '#f8fafb', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
              {/* 供应商标题 */}
              <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#d1fae5' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#065f46' }}>🏪 {group.supplier}</Text>
              </View>
              {/* 食材列表 */}
              {group.items.map((item, ii) => {
                const colorEntry = CATEGORY_COLORS[item.category ?? ''] ?? CATEGORY_COLORS['默认'] ?? { bg: '#f1f5f9', text: '#374151', dot: '#94a3b8' };
                const isLast = ii === group.items.length - 1;
                return (
                  <View key={ii} style={{
                    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9,
                    borderBottomWidth: isLast ? 0 : 1, borderBottomColor: '#f1f5f9',
                    backgroundColor: ii % 2 === 0 ? '#ffffff' : '#fafafa',
                  }}>
                    <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: colorEntry.dot, marginRight: 8, flexShrink: 0 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: '#111827', fontWeight: '600' }} numberOfLines={1}>
                      {item.ingredient_name}
                    </Text>
                    {item.category ? (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colorEntry.bg, marginRight: 8 }}>
                        <Text style={{ fontSize: 10, color: colorEntry.text }}>{item.category}</Text>
                      </View>
                    ) : null}
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#ecfdf5' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#065f46', fontVariant: ['tabular-nums'] }}>
                        {item.total_quantity}
                        <Text style={{ fontSize: 10, fontWeight: '400', color: '#6b7280' }}> {item.unit}</Text>
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {/* 页脚 */}
          <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
            由灶管家生成 · {dateStr}
          </Text>
        </View>
      </ScrollView>

      {/* 底部操作栏 */}
      <View className="absolute bottom-0 left-0 right-0 bg-card border-t border-border px-4 pt-3 pb-8 flex-row gap-3">
        <Pressable onPress={handleSave} disabled={generating}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 50, borderRadius: 14, backgroundColor: '#059669',
            opacity: generating ? 0.6 : 1,
          }}>
          {generating ? <ActivityIndicator size="small" color="#fff" />
            : <><Download size={18} color="#fff" /><Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>保存到相册</Text></>}
        </Pressable>
        <Pressable onPress={handleShare} disabled={generating}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 50, borderRadius: 14, backgroundColor: '#1d4ed8',
            opacity: generating ? 0.6 : 1,
          }}>
          {generating ? <ActivityIndicator size="small" color="#fff" />
            : <><Share2 size={18} color="#fff" /><Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>分享图片</Text></>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

