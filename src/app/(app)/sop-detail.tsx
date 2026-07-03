/**
 * SOP详情页
 * 展示菜品完整SOP制作指南：食材清单、制作步骤、摆盘要求、备注、版本号
 * 管理员/厨师长可编辑、导出PDF、查看版本历史
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
import {
  ArrowLeft,
  ChefHat,
  UtensilsCrossed,
  ListOrdered,
  Layers,
  StickyNote,
  BadgeInfo,
  Pencil,
  History,
  FileDown,
  Clock,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getUserPermsByPosition } from '@/db/api';
import { getDishWithSop } from '@/db/sopApi';
import { supabase } from '@/client/supabase';
import type { DishWithSop } from '@/types/types';

const CAT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  热菜:  { bg: '#FFF3E0', text: '#E65100', dot: '#FF8F00' },
  凉菜:  { bg: '#E8F5E9', text: '#2E7D32', dot: '#43A047' },
  汤品:  { bg: '#E3F2FD', text: '#1565C0', dot: '#1E88E5' },
  主食:  { bg: '#FFF8E1', text: '#F57F17', dot: '#FDD835' },
  点心:  { bg: '#FCE4EC', text: '#880E4F', dot: '#E91E63' },
  饮品:  { bg: '#F3E5F5', text: '#4A148C', dot: '#9C27B0' },
  其它:  { bg: '#F5F5F5', text: '#424242', dot: '#9E9E9E' },
};
const getCatColors = (cat: string) => CAT_COLORS[cat] ?? CAT_COLORS['其它'];

// ===== SOP内容板块卡片 =====
function SectionCard({
  icon,
  title,
  content,
  accentColor,
  dotColor,
}: {
  icon: React.ReactNode;
  title: string;
  content: string | null;
  accentColor: string;
  dotColor: string;
}) {
  if (!content?.trim()) return null;
  return (
    <View
      className="bg-card rounded-2xl mb-3 overflow-hidden"
      style={{
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.05)' }],
        borderCurve: 'continuous',
      } as object}
    >
      {/* 左侧色条 */}
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 4, backgroundColor: dotColor, borderRadius: 2 }} />
        <View style={{ flex: 1, padding: 16 }}>
          <View className="flex-row items-center gap-2 mb-3">
            <View
              className="w-8 h-8 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${accentColor}18` }}
            >
              {icon}
            </View>
            <Text className="text-base font-bold text-foreground">{title}</Text>
          </View>
          <Text className="text-sm text-foreground" style={{ lineHeight: 24 }}>
            {content}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function SopDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [dish, setDish] = useState<DishWithSop | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!id || hasLoadedRef.current) return;
      hasLoadedRef.current = true;
      (async () => {
        setLoading(true);
        setErrMsg('');
        try {
          const [data, user] = await Promise.all([
            getDishWithSop(id),
            supabase.auth.getUser(),
          ]);
          if (!data) { setErrMsg('未找到该菜品'); return; }
          setDish(data);
          if (user.data.user) {
            const perms = await getUserPermsByPosition(user.data.user.id);
            setCanManage(perms.includes('sop_manage'));
          }
        } catch {
          setErrMsg('加载失败，请返回重试');
        } finally {
          setLoading(false);
        }
      })();
    }, [id])
  );

  // 生成 PDF 并分享
  const handleExportPdf = async () => {
    if (!dish) return;
    setExporting(true);
    setExportErr('');
    try {
      const sop = dish.sop;
      const imgHtml = dish.image_url
        ? `<img src="${dish.image_url}" class="dish-img" />`
        : `<div class="no-img">暂无菜品图片</div>`;

      const section = (title: string, content: string | null | undefined) =>
        content?.trim()
          ? `<div class="section">
               <div class="section-title">${title}</div>
               <div class="section-body">${content.trim().replace(/\n/g, '<br/>')}</div>
             </div>`
          : '';

      const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'PingFang SC', 'Helvetica Neue', Arial, sans-serif; color: #1A1A2E; background: #fff; padding: 32px; }
  .header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; border-bottom: 3px solid #FFB88C; padding-bottom: 16px; }
  .logo { width: 48px; height: 48px; background: #FFB88C; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
  .title-block h1 { font-size: 24px; font-weight: 700; }
  .title-block .meta { font-size: 13px; color: #9CA3AF; margin-top: 4px; }
  .dish-img { width: 100%; max-height: 280px; object-fit: cover; border-radius: 16px; margin-bottom: 20px; }
  .no-img { width: 100%; height: 120px; background: #F3F4F6; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #9CA3AF; font-size: 14px; margin-bottom: 20px; }
  .tags { display: flex; gap: 10px; margin-bottom: 20px; }
  .tag { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .tag-cat { background: #FFF3E0; color: #E65100; }
  .tag-ver { background: #F3F4F6; color: #6B7280; }
  .section { background: #FAFAFA; border-radius: 14px; padding: 16px; margin-bottom: 14px; border-left: 4px solid #FFB88C; }
  .section-title { font-size: 13px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
  .section-body { font-size: 15px; line-height: 1.8; color: #374151; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #9CA3AF; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">🍳</div>
    <div class="title-block">
      <h1>${dish.name}</h1>
      <div class="meta">开小灶PMS · 标准SOP制作指南</div>
    </div>
  </div>
  ${imgHtml}
  <div class="tags">
    <span class="tag tag-cat">${dish.category}</span>
    ${sop?.version ? `<span class="tag tag-ver">${sop.version}</span>` : ''}
    ${sop?.updated_at ? `<span class="tag tag-ver">更新于 ${sop.updated_at.slice(0, 10)}</span>` : ''}
  </div>
  ${section('🧅 食材清单', sop?.ingredients)}
  ${section('📋 制作步骤', sop?.steps)}
  ${section('🍽 摆盘要求', sop?.plating)}
  ${section('📝 备注', sop?.notes)}
  ${!sop ? '<div class="section"><div class="section-body" style="color:#9CA3AF">该菜品暂无SOP内容</div></div>' : ''}
  <div class="footer">本文件由开小灶PMS自动生成 · ${new Date().toLocaleDateString('zh-CN')}</div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${dish.name} SOP`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        setExportErr('当前设备不支持文件分享');
      }
    } catch {
      setExportErr('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={['top']}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#FFB88C" />
        <Text className="text-sm text-muted-foreground mt-3">加载中…</Text>
      </SafeAreaView>
    );
  }

  if (errMsg || !dish) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <StatusBar style="dark" />
        <Pressable
          className="m-4 w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View className="flex-1 items-center justify-center gap-3">
          <ChefHat size={48} color="#D1D5DB" />
          <Text className="text-base text-muted-foreground">{errMsg || '菜品不存在'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sop = dish.sop;
  const catColors = getCatColors(dish.category);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* ===== 顶部导航栏 ===== */}
      <View className="flex-row items-center px-4 py-3 gap-2">
        <Pressable
          className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-foreground" numberOfLines={1}>
          {dish.name}
        </Text>
        {/* 版本历史 */}
        <Pressable
          className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() =>
            router.push(
              `/(app)/sop-history?id=${dish.id}&dishName=${encodeURIComponent(dish.name)}${sop?.id ? `&currentHistoryId=${sop.id}` : ''}` as never
            )
          }
        >
          <History size={17} color="#6B7280" />
        </Pressable>
        {canManage && (
          <>
            <Pressable
              className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
              onPress={handleExportPdf}
              disabled={exporting}
            >
              {exporting
                ? <ActivityIndicator size="small" color="#6B7280" />
                : <FileDown size={17} color="#6B7280" />
              }
            </Pressable>
            <Pressable
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl active:opacity-70"
              style={{ backgroundColor: '#FFB88C' }}
              onPress={() => router.push(`/(app)/sop-edit?id=${dish.id}` as never)}
            >
              <Pencil size={14} color="#1A1A2E" />
              <Text style={{ color: '#1A1A2E', fontSize: 13, fontWeight: '700' }}>编辑</Text>
            </Pressable>
          </>
        )}
      </View>

      {exportErr ? (
        <View className="mx-4 mb-1 px-3 py-2 bg-red-50 rounded-xl">
          <Text className="text-xs text-red-500">{exportErr}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerClassName="pb-10"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* ===== 菜品图片 Hero ===== */}
        <View className="mx-4 mb-4 rounded-3xl overflow-hidden bg-muted" style={{ height: 220 }}>
          {dish.image_url ? (
            <Image
              source={{ uri: dish.image_url }}
              style={{ width: '100%', height: 220 }}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View className="flex-1 items-center justify-center gap-2">
              <ChefHat size={56} color="#D1D5DB" />
              <Text className="text-sm text-muted-foreground">暂无菜品图片</Text>
            </View>
          )}
        </View>

        {/* ===== 菜品基本信息 ===== */}
        <View className="mx-4 mb-4 bg-card rounded-2xl p-4"
          style={{
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.05)' }],
            borderCurve: 'continuous',
          } as object}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              {/* 分类标签 */}
              <View
                className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
                style={{ backgroundColor: catColors.bg }}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: catColors.dot }} />
                <Text style={{ color: catColors.text, fontSize: 12, fontWeight: '700' }}>
                  {dish.category}
                </Text>
              </View>
              {/* 版本号 */}
              {sop?.version && (
                <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-muted">
                  <BadgeInfo size={11} color="#9CA3AF" />
                  <Text className="text-xs text-muted-foreground font-medium">{sop.version}</Text>
                </View>
              )}
            </View>
            {/* 更新时间 */}
            {sop?.updated_at && (
              <View className="flex-row items-center gap-1">
                <Clock size={11} color="#9CA3AF" />
                <Text className="text-xs text-muted-foreground">
                  {sop.updated_at.slice(0, 10)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ===== 无SOP内容提示 ===== */}
        {!sop && (
          <View className="mx-4 items-center py-12 gap-3 bg-card rounded-2xl mb-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.05)' }] } as object}
          >
            <UtensilsCrossed size={40} color="#D1D5DB" />
            <Text className="text-sm text-muted-foreground text-center px-4">
              该菜品暂无SOP内容{canManage ? '' : ''}
            </Text>
            {canManage && (
              <Pressable
                className="mt-1 px-5 py-2.5 rounded-xl active:opacity-70"
                style={{ backgroundColor: '#FFB88C' }}
                onPress={() => router.push(`/(app)/sop-edit?id=${dish.id}` as never)}
              >
                <Text style={{ color: '#1A1A2E', fontSize: 14, fontWeight: '700' }}>立即添加SOP</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ===== SOP 各板块 ===== */}
        <View className="px-4">
          <SectionCard
            icon={<UtensilsCrossed size={16} color="#E65100" />}
            title="食材清单"
            content={sop?.ingredients ?? null}
            accentColor="#E65100"
            dotColor="#FF8F00"
          />
          <SectionCard
            icon={<ListOrdered size={16} color="#1565C0" />}
            title="制作步骤"
            content={sop?.steps ?? null}
            accentColor="#1565C0"
            dotColor="#1E88E5"
          />
          <SectionCard
            icon={<Layers size={16} color="#2E7D32" />}
            title="摆盘要求"
            content={sop?.plating ?? null}
            accentColor="#2E7D32"
            dotColor="#43A047"
          />
          <SectionCard
            icon={<StickyNote size={16} color="#7B1FA2" />}
            title="备注"
            content={sop?.notes ?? null}
            accentColor="#7B1FA2"
            dotColor="#9C27B0"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
