/**
 * PendingReviewTab — 待审核Tab
 * 三个子Tab：待审核 / 已审核 / 操作日志
 * 支持批量复选+批量审批/驳回
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { CheckSquare, Square, X } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { OpLog, PerfRecord, PerfTemplate, PERM, STATUS_META, formatDateTime, getDisplayName } from './types';
import ReviewDetailModal from './ReviewDetailModal';
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

type SubTab = 'pending' | 'reviewed' | 'logs';

interface Props {
  perms: string[];
  remarkTpls: PerfTemplate[];
  dateFrom?: string;
  dateTo?: string;
}

export default function PendingReviewTab({ perms, remarkTpls, dateFrom, dateTo }: Props) {
  const { height } = useWindowDimensions();
  const [subTab, setSubTab] = useState<SubTab>('pending');
  const canReview = perms.includes(PERM.REVIEW);

  // 待审核
  const [pendingList, setPendingList] = useState<PerfRecord[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingRefreshing, setPendingRefreshing] = useState(false);
  const [pendingCursor, setPendingCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewRecord, setReviewRecord] = useState<PerfRecord | null>(null);

  // 已审核
  const [reviewedList, setReviewedList] = useState<PerfRecord[]>([]);
  const [reviewedLoading, setReviewedLoading] = useState(false);
  const [reviewedRefreshing, setReviewedRefreshing] = useState(false);
  const [reviewedCursor, setReviewedCursor] = useState<string | null>(null);
  const [reviewedDetail, setReviewedDetail] = useState<PerfRecord | null>(null);

  // 操作日志
  const [logs, setLogs] = useState<OpLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [logsCursor, setLogsCursor] = useState<string | null>(null);

  // 批量操作弹窗
  const [batchAction, setBatchAction] = useState<'approve' | 'reject' | null>(null);
  const [batchRemark, setBatchRemark] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);

  const [zoomUri, setZoomUri] = useState<string | null>(null);

  // ────── 数据加载 ──────
  const loadPending = useCallback(async (reset = false) => {
    if (pendingLoading && !reset) return;
    if (reset) setPendingRefreshing(true); else setPendingLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'list', all: true, status: 'pending', cursor: reset ? undefined : pendingCursor };
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      const res = await callApi(body);
      const list: PerfRecord[] = Array.isArray(res?.records) ? res.records : [];
      setPendingList(prev => reset ? list : [...prev, ...list]);
      setPendingCursor(res?.nextCursor ?? null);
      if (reset) setSelected(new Set());
    } catch { /* 静默 */ }
    finally { setPendingLoading(false); setPendingRefreshing(false); }
  }, [pendingLoading, pendingCursor, dateFrom, dateTo]);

  const loadReviewed = useCallback(async (reset = false) => {
    if (reviewedLoading && !reset) return;
    if (reset) setReviewedRefreshing(true); else setReviewedLoading(true);
    try {
      const baseBody = { action: 'list', all: true, ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}) };
      const [approvedRes, rejectedRes] = await Promise.all([
        callApi({ ...baseBody, status: 'approved', cursor: reset ? undefined : reviewedCursor }),
        reset ? callApi({ ...baseBody, status: 'rejected' }) : Promise.resolve({ records: [] }),
      ]);
      const combined: PerfRecord[] = [
        ...(Array.isArray(approvedRes?.records) ? approvedRes.records : []),
        ...(Array.isArray(rejectedRes?.records) ? rejectedRes.records : []),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setReviewedList(prev => reset ? combined : [...prev, ...combined]);
      setReviewedCursor(approvedRes?.nextCursor ?? null);
    } catch { /* 静默 */ }
    finally { setReviewedLoading(false); setReviewedRefreshing(false); }
  }, [reviewedLoading, reviewedCursor, dateFrom, dateTo]);

  const loadLogs = useCallback(async (reset = false) => {
    if (logsLoading && !reset) return;
    if (reset) setLogsRefreshing(true); else setLogsLoading(true);
    try {
      const res = await callApi({ action: 'logs', cursor: reset ? undefined : logsCursor });
      const list: OpLog[] = Array.isArray(res?.logs) ? res.logs : [];
      setLogs(prev => reset ? list : [...prev, ...list]);
      setLogsCursor(res?.nextCursor ?? null);
    } catch { /* 静默 */ }
    finally { setLogsLoading(false); setLogsRefreshing(false); }
  }, [logsLoading, logsCursor]);

  useFocusEffect(useCallback(() => {
    loadPending(true);
    loadReviewed(true);
    loadLogs(true);
  }, [dateFrom, dateTo]));

  // ────── 审核操作 ──────
  const handleApprove = async (id: string, score: number, remark: string) => {
    await callApi({ action: 'approve', id, score, remark: remark || null });
    await loadPending(true);
    await loadReviewed(true);
    await loadLogs(true);
  };

  const handleReject = async (id: string, remark: string) => {
    await callApi({ action: 'reject', id, remark: remark || null });
    await loadPending(true);
    await loadReviewed(true);
    await loadLogs(true);
  };

  // 批量操作
  const handleBatch = async () => {
    if (selected.size === 0) return;
    setBatchProcessing(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map(id =>
        batchAction === 'approve'
          ? callApi({ action: 'approve', id, score: 1, remark: batchRemark || null })
          : callApi({ action: 'reject', id, remark: batchRemark || null })
      ));
      setBatchAction(null); setBatchRemark('');
      await loadPending(true); await loadReviewed(true); await loadLogs(true);
    } catch { /* 静默 */ }
    finally { setBatchProcessing(false); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(pendingList.map(r => r.id)));
  const clearAll = () => setSelected(new Set());

  // ────── 渲染 ──────
  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'pending', label: '待审核' },
    { key: 'reviewed', label: '已审核' },
    { key: 'logs', label: '操作日志' },
  ];

  return (
    <View className="flex-1 bg-background">
      {/* 子Tab */}
      <View className="flex-row border-b border-border px-4 pt-2">
        {subTabs.map(t => (
          <Pressable key={t.key} onPress={() => setSubTab(t.key)}
            className={`mr-6 pb-2.5 ${subTab === t.key ? 'border-b-2 border-primary' : ''}`}>
            <Text className={`text-sm font-semibold ${subTab === t.key ? 'text-primary' : 'text-muted-foreground'}`}>
              {t.label}
              {t.key === 'pending' && pendingList.length > 0 ? ` (${pendingList.length})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── 待审核 ── */}
      {subTab === 'pending' ? (
        <View className="flex-1">
          {/* 全选工具栏 */}
          {pendingList.length > 0 ? (
            <View className="flex-row items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
              <Pressable onPress={selected.size === pendingList.length ? clearAll : selectAll}
                className="flex-row items-center gap-2">
                {selected.size === pendingList.length && pendingList.length > 0
                  ? <CheckSquare size={18} color="#008060" />
                  : <Square size={18} color="#9ca3af" />}
                <Text className="text-sm text-foreground">全选</Text>
              </Pressable>
              {selected.size > 0 ? (
                <Text className="text-xs text-muted-foreground">已选 {selected.size} 条</Text>
              ) : null}
            </View>
          ) : null}

          <FlatList
            data={pendingList} keyExtractor={i => i.id}
            refreshing={pendingRefreshing} onRefresh={() => loadPending(true)}
            onEndReached={() => pendingCursor && !pendingLoading && loadPending(false)}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: selected.size > 0 ? 100 : 24 }}
            contentInsetAdjustmentBehavior="automatic"
            ListFooterComponent={pendingLoading && !pendingRefreshing ? <ActivityIndicator size="small" color="#008060" className="my-4" /> : null}
            ListEmptyComponent={!pendingLoading && !pendingRefreshing ? (
              <View className="items-center mt-16 gap-2">
                <Text className="text-4xl">✅</Text>
                <Text className="text-muted-foreground text-sm">暂无待审核申请</Text>
              </View>
            ) : null}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              const name = getDisplayName(item);
              return (
                <Pressable onPress={() => setReviewRecord(item)}
                  className={`bg-card border rounded-2xl px-4 py-3 flex-row items-center gap-3 ${isSelected ? 'border-primary' : 'border-border'}`}
                  style={{ borderCurve: 'continuous' }}>
                  <Pressable onPress={() => toggleSelect(item.id)} hitSlop={8}>
                    {isSelected ? <CheckSquare size={20} color="#008060" /> : <Square size={20} color="#9ca3af" />}
                  </Pressable>
                  <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
                    <Text className="text-primary font-bold">{name.charAt(0)}</Text>
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text className="text-sm font-semibold text-foreground">{name}</Text>
                    <Text className="text-xs text-foreground/80" numberOfLines={1}>{item.item_name || item.description}</Text>
                    <Text className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</Text>
                  </View>
                  <View className="bg-amber-50 px-2 py-0.5 rounded-full">
                    <Text className="text-amber-600 text-xs font-medium">待审核</Text>
                  </View>
                </Pressable>
              );
            }}
          />

          {/* 批量操作底栏 */}
          {selected.size > 0 && canReview ? (
            <View className="absolute bottom-0 left-0 right-0 flex-row gap-3 px-4 pb-6 pt-3 bg-background border-t border-border">
              <Pressable onPress={() => { setBatchAction('reject'); setBatchRemark(''); }}
                className="flex-1 py-3 rounded-xl border border-destructive items-center"
                style={{ backgroundColor: '#fff5f5' }}>
                <Text className="text-sm font-semibold text-destructive">批量驳回 ({selected.size})</Text>
              </Pressable>
              <Pressable onPress={() => { setBatchAction('approve'); setBatchRemark(''); }}
                className="flex-1 py-3 rounded-xl bg-primary items-center">
                <Text className="text-sm font-semibold text-white">批量通过 ({selected.size})</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── 已审核 ── */}
      {subTab === 'reviewed' ? (
        <FlatList
          data={reviewedList} keyExtractor={i => i.id}
          refreshing={reviewedRefreshing} onRefresh={() => loadReviewed(true)}
          onEndReached={() => reviewedCursor && !reviewedLoading && loadReviewed(false)}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: 24 }}
          contentInsetAdjustmentBehavior="automatic"
          ListFooterComponent={reviewedLoading && !reviewedRefreshing ? <ActivityIndicator size="small" color="#008060" className="my-4" /> : null}
          ListEmptyComponent={!reviewedLoading && !reviewedRefreshing ? (
            <View className="items-center mt-16 gap-2">
              <Text className="text-4xl">📋</Text>
              <Text className="text-muted-foreground text-sm">暂无已审核记录</Text>
            </View>
          ) : null}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status] ?? STATUS_META.approved;
            const name = getDisplayName(item);
            const score = Number(item.score);
            return (
              <Pressable onPress={() => setReviewedDetail(item)}
                className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3"
                style={{ borderCurve: 'continuous' }}>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-foreground">{name}</Text>
                  </View>
                  <Text className="text-xs text-foreground/80" numberOfLines={1}>{item.item_name || item.description}</Text>
                  <Text className="text-xs text-muted-foreground">{formatDateTime(item.reviewed_at)}</Text>
                </View>
                <View className="items-end gap-1">
                  {item.status === 'approved' ? (
                    <Text style={{ color: score >= 0 ? '#008060' : '#D9381E' }} className="text-base font-bold">
                      {score >= 0 ? `+${score}` : `${score}`}
                    </Text>
                  ) : null}
                  <View style={{ backgroundColor: meta.bg }} className="px-2 py-0.5 rounded-full">
                    <Text style={{ color: meta.color }} className="text-xs font-medium">{meta.label}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      ) : null}

      {/* ── 操作日志 ── */}
      {subTab === 'logs' ? (
        <FlatList
          data={logs} keyExtractor={i => i.id}
          refreshing={logsRefreshing} onRefresh={() => loadLogs(true)}
          onEndReached={() => logsCursor && !logsLoading && loadLogs(false)}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: 24 }}
          contentInsetAdjustmentBehavior="automatic"
          ListFooterComponent={logsLoading && !logsRefreshing ? <ActivityIndicator size="small" color="#008060" className="my-4" /> : null}
          ListEmptyComponent={!logsLoading && !logsRefreshing ? (
            <View className="items-center mt-16 gap-2">
              <Text className="text-4xl">📝</Text>
              <Text className="text-muted-foreground text-sm">暂无操作日志</Text>
            </View>
          ) : null}
          renderItem={({ item }) => {
            const isApprove = item.action === '审核通过';
            const isReject = item.action === '审核驳回';
            return (
              <View className="bg-card border border-border rounded-2xl px-4 py-3 gap-1.5"
                style={{ borderCurve: 'continuous' }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-foreground">{item.operator_name || '操作员'}</Text>
                    <View className={`px-2 py-0.5 rounded-full ${isApprove ? 'bg-emerald-50' : isReject ? 'bg-red-50' : 'bg-blue-50'}`}>
                      <Text className={`text-xs font-medium ${isApprove ? 'text-emerald-600' : isReject ? 'text-red-600' : 'text-blue-600'}`}>
                        {item.action}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</Text>
                </View>
                {item.target_name ? (
                  <Text className="text-xs text-muted-foreground" numberOfLines={2}>事项：{item.target_name}</Text>
                ) : null}
              </View>
            );
          }}
        />
      ) : null}

      {/* 审核详情弹窗 */}
      <ReviewDetailModal
        record={reviewRecord} canReview={canReview} remarkTpls={remarkTpls}
        onClose={() => setReviewRecord(null)}
        onApprove={handleApprove} onReject={handleReject}
        imageZoom={setZoomUri}
      />

      {/* 已审核详情弹窗 */}
      <RecordDetailModal record={reviewedDetail} onClose={() => setReviewedDetail(null)} imageZoom={setZoomUri} />

      {/* 批量操作确认弹窗 */}
      <Modal visible={!!batchAction} transparent animationType="slide" onRequestClose={() => setBatchAction(null)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setBatchAction(null)}>
          <Pressable onPress={() => {}} className="bg-background rounded-t-3xl px-5 pt-5 pb-8 gap-4">
            <Text className="text-base font-bold text-foreground">
              {batchAction === 'approve' ? `批量通过 ${selected.size} 条申请` : `批量驳回 ${selected.size} 条申请`}
            </Text>
            <View className="gap-1.5">
              <Text className="text-sm font-medium text-foreground">
                {batchAction === 'approve' ? '审核备注（可选）' : '驳回原因（可选）'}
              </Text>
              <TextInput value={batchRemark} onChangeText={setBatchRemark} multiline numberOfLines={3}
                placeholder={batchAction === 'approve' ? '填写统一备注...' : '填写统一驳回原因...'}
                placeholderTextColor="#9ca3af"
                className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card min-h-[72px]"
                style={{ textAlignVertical: 'top' }} />
            </View>
            <View className="flex-row gap-3">
              <Pressable onPress={() => setBatchAction(null)} className="flex-1 py-3 rounded-xl bg-muted items-center">
                <Text className="text-sm font-semibold text-foreground">取消</Text>
              </Pressable>
              <Pressable onPress={handleBatch} disabled={batchProcessing}
                className={`flex-1 py-3 rounded-xl items-center ${batchAction === 'approve' ? 'bg-primary' : ''} ${batchProcessing ? 'opacity-60' : ''}`}
                style={batchAction === 'reject' ? { backgroundColor: '#D9381E' } : {}}>
                {batchProcessing ? <ActivityIndicator size="small" color="white" />
                  : <Text className="text-sm font-semibold text-white">确认执行</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
    </View>
  );
}
