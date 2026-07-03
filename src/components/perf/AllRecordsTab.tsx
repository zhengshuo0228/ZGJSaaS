/**
 * AllRecordsTab — 全员记录
 * 需有「全员记录查看权限」，支持员工姓名和日期范围筛选
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { X, Filter } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { PerfRecord, STATUS_META, formatDateTime, getDisplayName } from './types';
import RecordDetailModal from './RecordDetailModal';

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

export default function AllRecordsTab({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const { height } = useWindowDimensions();
  const [records, setRecords] = useState<PerfRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<PerfRecord | null>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  // 筛选
  const [filterName, setFilterName] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [activeFilter, setActiveFilter] = useState({ name: '', status: '' });

  const loadRecords = useCallback(async (reset = false, filter = activeFilter) => {
    if (loading && !reset) return;
    if (reset) setRefreshing(true); else setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'list', all: true, cursor: reset ? undefined : nextCursor };
      if (filter.status) body.status = filter.status;
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      const res = await callApi(body);
      let list: PerfRecord[] = Array.isArray(res?.records) ? res.records : [];
      // 名字过滤（前端过滤）
      if (filter.name) {
        const q = filter.name.toLowerCase();
        list = list.filter(r => getDisplayName(r).toLowerCase().includes(q) || r.user?.email?.toLowerCase().includes(q));
      }
      setRecords(prev => reset ? list : [...prev, ...list]);
      setNextCursor(res?.nextCursor ?? null);
    } catch { /* 静默 */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [loading, nextCursor, activeFilter, dateFrom, dateTo]);

  useFocusEffect(useCallback(() => { loadRecords(true); }, [dateFrom, dateTo]));

  const applyFilter = () => {
    const f = { name: filterName.trim(), status: filterStatus };
    setActiveFilter(f);
    setShowFilter(false);
    loadRecords(true, f);
  };

  const clearFilter = () => {
    setFilterName(''); setFilterStatus('');
    const f = { name: '', status: '' };
    setActiveFilter(f);
    setShowFilter(false);
    loadRecords(true, f);
  };

  const hasFilter = activeFilter.name || activeFilter.status;

  const renderItem = ({ item }: { item: PerfRecord }) => {
    const meta = STATUS_META[item.status] ?? STATUS_META.pending;
    const score = Number(item.score);
    const isAdd = score >= 0;
    const name = getDisplayName(item);
    return (
      <Pressable onPress={() => setSelectedRecord(item)}
        className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3"
        style={{ borderCurve: 'continuous' }}>
        <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
          <Text className="text-primary font-bold text-sm">{name.charAt(0)}</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-foreground">{name}</Text>
            {item.user?.position ? <Text className="text-xs text-muted-foreground">{item.user.position}</Text> : null}
          </View>
          <Text className="text-xs text-foreground/80" numberOfLines={1}>{item.item_name || item.description}</Text>
          <Text className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</Text>
        </View>
        <View className="items-end gap-1">
          <Text style={{ color: isAdd ? '#008060' : '#D9381E' }} className="text-base font-bold">
            {isAdd ? `+${score}` : `${score}`}
          </Text>
          <View style={{ backgroundColor: meta.bg }} className="px-2 py-0.5 rounded-full">
            <Text style={{ color: meta.color }} className="text-xs font-medium">{meta.label}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const STATUS_OPTS = [
    { label: '全部', value: '' },
    { label: '待审核', value: 'pending' },
    { label: '已通过', value: 'approved' },
    { label: '已驳回', value: 'rejected' },
  ];

  return (
    <View className="flex-1 bg-background">
      {/* 筛选栏 */}
      <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
        <View className="flex-1 flex-row gap-2 flex-wrap">
          {activeFilter.name ? (
            <View className="flex-row items-center gap-1 bg-primary/10 px-2.5 py-1 rounded-full">
              <Text className="text-xs text-primary font-medium">{activeFilter.name}</Text>
              <Pressable onPress={clearFilter}><X size={12} color="#008060" /></Pressable>
            </View>
          ) : null}
          {activeFilter.status ? (
            <View className="flex-row items-center gap-1 bg-primary/10 px-2.5 py-1 rounded-full">
              <Text className="text-xs text-primary font-medium">{STATUS_OPTS.find(o => o.value === activeFilter.status)?.label}</Text>
              <Pressable onPress={clearFilter}><X size={12} color="#008060" /></Pressable>
            </View>
          ) : null}
          {!hasFilter ? <Text className="text-xs text-muted-foreground py-1">全部记录</Text> : null}
        </View>
        <Pressable onPress={() => setShowFilter(true)}
          className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${hasFilter ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
          <Filter size={13} color={hasFilter ? 'white' : '#6b7280'} />
          <Text className={`text-xs font-medium ${hasFilter ? 'text-white' : 'text-muted-foreground'}`}>筛选</Text>
        </Pressable>
      </View>

      <FlatList
        data={records} keyExtractor={i => i.id} renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: 24 }}
        refreshing={refreshing} onRefresh={() => loadRecords(true)}
        onEndReached={() => nextCursor && !loading && loadRecords(false)}
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

      <RecordDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} imageZoom={setZoomUri} />

      {/* 图片放大 */}
      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        <Pressable className="flex-1 bg-black/90 items-center justify-center" onPress={() => setZoomUri(null)}>
          {zoomUri ? <Image source={{ uri: zoomUri }} style={{ width: '95%', height: height * 0.7 }} contentFit="contain" /> : null}
          <Pressable onPress={() => setZoomUri(null)}
            className="absolute top-12 right-5 w-9 h-9 rounded-full bg-white/20 items-center justify-center">
            <X size={18} color="white" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 筛选弹窗 */}
      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setShowFilter(false)}>
          <Pressable onPress={() => {}} className="bg-background rounded-t-3xl px-5 pt-5 pb-8 gap-4">
            <Text className="text-base font-bold text-foreground">筛选条件</Text>

            <View className="gap-1.5">
              <Text className="text-sm font-medium text-foreground">员工姓名</Text>
              <TextInput value={filterName} onChangeText={setFilterName}
                placeholder="输入姓名关键词..." placeholderTextColor="#9ca3af"
                className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card" />
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-medium text-foreground">审核状态</Text>
              <View className="flex-row flex-wrap gap-2">
                {STATUS_OPTS.map(opt => (
                  <Pressable key={opt.value} onPress={() => setFilterStatus(opt.value)}
                    className={`px-3 py-1.5 rounded-full border ${filterStatus === opt.value ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                    <Text className={`text-sm ${filterStatus === opt.value ? 'text-white font-semibold' : 'text-foreground'}`}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="flex-row gap-3 mt-2">
              <Pressable onPress={clearFilter} className="flex-1 py-3 rounded-xl bg-muted items-center">
                <Text className="text-sm font-semibold text-foreground">清除筛选</Text>
              </Pressable>
              <Pressable onPress={applyFilter} className="flex-1 py-3 rounded-xl bg-primary items-center">
                <Text className="text-sm font-semibold text-white">应用筛选</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
