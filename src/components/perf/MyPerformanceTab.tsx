/**
 * MyPerformanceTab — 我的绩效
 * 顶部积分概览 + 绩效记录列表 + 申请加分按钮
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View, Modal, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { PerfRecord, PerfTemplate, STATUS_META, PERM, formatDateTime } from './types';
import RecordDetailModal from './RecordDetailModal';
import ApplyModal from './ApplyModal';

interface Props {
  perms: string[];
  addItemTpls: PerfTemplate[];
  deductItemTpls: PerfTemplate[];
  onRefreshTemplates: () => Promise<void>;
  dateFrom?: string;
  dateTo?: string;
}

const PAGE_SIZE = 20;

async function callApi(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('performance-api', {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) {
    const msg = await error?.context?.text?.().catch(() => null);
    throw new Error(msg || error.message);
  }
  return data;
}

export default function MyPerformanceTab({ perms, addItemTpls, deductItemTpls, onRefreshTemplates, dateFrom, dateTo }: Props) {
  const { height } = useWindowDimensions();
  const [records, setRecords] = useState<PerfRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalApproved, setTotalApproved] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<PerfRecord | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  // canApply：是否显示「申请加分/扣分」入口按钮（需要「绩效提交申请」权限，与审核权限完全独立）
  const canApply = perms.includes(PERM.SUBMIT);

  const loadRecords = useCallback(async (reset = false) => {
    if (loading && !reset) return;
    if (reset) setRefreshing(true); else setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'list', cursor: reset ? undefined : nextCursor };
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      const res = await callApi(body);
      const list: PerfRecord[] = Array.isArray(res?.records) ? res.records : [];
      setRecords(prev => reset ? list : [...prev, ...list]);
      setNextCursor(res?.nextCursor ?? null);
      if (reset) {
        const approved = list.filter(r => r.status === 'approved').reduce((sum, r) => sum + Number(r.score), 0);
        setTotalApproved(approved);
      }
    } catch { /* 静默 */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [loading, nextCursor, dateFrom, dateTo]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    await loadRecords(false);
  }, [nextCursor, loading, loadRecords]);

  useFocusEffect(useCallback(() => { loadRecords(true); }, [dateFrom, dateTo]));

  const handleApplySubmit = async (params: { description: string; note: string; image_url: string | null }) => {
    await callApi({ action: 'apply', ...params });
    await loadRecords(true);
  };

  const renderItem = ({ item }: { item: PerfRecord }) => {
    const meta = STATUS_META[item.status] ?? STATUS_META.pending;
    const score = Number(item.score);
    const isAdd = score >= 0;
    const isPending = item.status === 'pending';
    return (
      <Pressable onPress={() => setSelectedRecord(item)}
        className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3"
        style={{ borderCurve: 'continuous' }}>
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{item.item_name || item.description}</Text>
          <Text className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</Text>
        </View>
        <View className="items-end gap-1">
          {/* 待审核申请不显示分值（score=0 无意义），已审核/驳回才显示分值 */}
          {!isPending ? (
            <Text style={{ color: isAdd ? '#008060' : '#D9381E' }}
              className="text-base font-bold">
              {isAdd ? `+${score}` : `${score}`}分
            </Text>
          ) : null}
          <View style={{ backgroundColor: meta.bg }} className="px-2 py-0.5 rounded-full">
            <Text style={{ color: meta.color }} className="text-xs font-medium">{meta.label}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* 积分概览卡片 */}
      <View className="mx-4 mt-4 mb-2 bg-primary rounded-2xl p-5" style={{ borderCurve: 'continuous' }}>
        <Text className="text-white/80 text-sm">已获绩效积分</Text>
        <Text className="text-white text-4xl font-bold mt-1">{totalApproved} <Text className="text-2xl">分</Text></Text>
        <Text className="text-white/70 text-xs mt-1.5">约等于 ¥{totalApproved * 5} 元</Text>
      </View>

      <FlatList
        data={records}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: canApply ? 88 : 24 }}
        refreshing={refreshing}
        onRefresh={() => loadRecords(true)}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentInsetAdjustmentBehavior="automatic"
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator size="small" color="#008060" className="my-4" /> : null}
        ListEmptyComponent={!loading && !refreshing ? (
          <View className="items-center mt-16 gap-2">
            <Text className="text-4xl">📋</Text>
            <Text className="text-muted-foreground text-sm">暂无绩效记录</Text>
          </View>
        ) : null}
      />

      {/* 申请加分按钮 */}
      {canApply ? (
        <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-background border-t border-border">
          <Pressable onPress={() => setShowApply(true)}
            className="bg-primary py-3.5 rounded-2xl items-center"
            style={{ borderCurve: 'continuous' }}>
            <Text className="text-white font-bold text-base">+ 申请加分 / 扣分</Text>
          </Pressable>
        </View>
      ) : null}

      <RecordDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} imageZoom={setZoomUri} />

      <ApplyModal visible={showApply} onClose={() => setShowApply(false)}
        addItemTpls={addItemTpls} deductItemTpls={deductItemTpls}
        onSubmit={handleApplySubmit} />

      {/* 图片放大查看 */}
      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        <Pressable className="flex-1 bg-black/90 items-center justify-center" onPress={() => setZoomUri(null)}>
          {zoomUri ? <Image source={{ uri: zoomUri }} style={{ width: '95%', height: height * 0.7 }} contentFit="contain" /> : null}
          <Pressable onPress={() => setZoomUri(null)}
            className="absolute top-12 right-5 w-9 h-9 rounded-full bg-white/20 items-center justify-center">
            <X size={18} color="white" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
