/**
 * LeaderboardTab — 积分排行榜
 * 按月度展示员工积分排名、标签，点击查看当月明细
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { LeaderboardEntry, PerfRecord, STATUS_META, formatDateTime, getCurrentMonth } from './types';
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

function addMonths(m: string, delta: number) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function LeaderboardTab() {
  const { height } = useWindowDimensions();
  const [month, setMonth] = useState(getCurrentMonth());
  const [list, setList] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // 点击员工查看明细
  const [detailUser, setDetailUser] = useState<LeaderboardEntry | null>(null);
  const [detailRecords, setDetailRecords] = useState<PerfRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PerfRecord | null>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await callApi({ action: 'leaderboard', month: m });
      setList(Array.isArray(res?.leaderboard) ? res.leaderboard : []);
    } catch { /* 静默 */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadLeaderboard(month); }, [month]));

  const changeMonth = (delta: number) => {
    const m = addMonths(month, delta);
    setMonth(m);
    loadLeaderboard(m);
  };

  const openDetail = async (entry: LeaderboardEntry) => {
    setDetailUser(entry);
    setDetailRecords([]);
    setDetailLoading(true);
    try {
      const res = await callApi({ action: 'list', all: true, user_id: entry.user_id });
      // 过滤本月
      const [y, mo] = month.split('-').map(Number);
      const start = new Date(y, mo - 1, 1).getTime();
      const end = new Date(y, mo, 0, 23, 59, 59).getTime();
      const filtered = (Array.isArray(res?.records) ? res.records as PerfRecord[] : [])
        .filter(r => { const t = new Date(r.date).getTime(); return t >= start && t <= end; });
      setDetailRecords(filtered);
    } catch { /* 静默 */ }
    finally { setDetailLoading(false); }
  };

  const medal = (idx: number) => ['🥇', '🥈', '🥉'][idx] || `${idx + 1}`;

  return (
    <View className="flex-1 bg-background">
      {/* 月份切换 */}
      <View className="flex-row items-center justify-center gap-6 py-4 border-b border-border">
        <Pressable onPress={() => changeMonth(-1)} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ChevronLeft size={18} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-foreground min-w-[90px] text-center">{month}</Text>
        <Pressable onPress={() => changeMonth(1)} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ChevronRight size={18} color="#374151" />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#008060" /></View>
      ) : (
        <FlatList
          data={list} keyExtractor={i => i.user_id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: 24 }}
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <View className="items-center mt-16 gap-2">
              <Text className="text-4xl">🏆</Text>
              <Text className="text-muted-foreground text-sm">本月暂无数据</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable onPress={() => openDetail(item)}
              className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3"
              style={{ borderCurve: 'continuous' }}>
              <Text className="text-xl w-8 text-center">{medal(index)}</Text>
              <View className="flex-1 gap-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-bold text-foreground">{item.name}</Text>
                  {item.position ? <Text className="text-xs text-muted-foreground">{item.position}</Text> : null}
                </View>
                {item.earned_tags && item.earned_tags.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1">
                    {item.earned_tags.map((t) => (
                      <View key={t.name} className="bg-primary/10 px-2 py-0.5 rounded-full">
                        <Text className="text-primary text-xs font-medium">🏅 {t.name}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <View className="items-end gap-0.5">
                <Text className="text-xl font-bold" style={{ color: '#008060' }}>{item.total}</Text>
                <Text className="text-xs text-muted-foreground">分</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* 员工明细弹窗 */}
      <Modal visible={!!detailUser} transparent animationType="slide" onRequestClose={() => setDetailUser(null)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setDetailUser(null)}>
          <Pressable onPress={() => {}} style={{ maxHeight: height * 0.8 }}
            className="bg-background rounded-t-3xl overflow-hidden">
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-border">
              <Text className="text-base font-bold text-foreground">
                {detailUser?.name} · {month} 明细
              </Text>
              <Pressable onPress={() => setDetailUser(null)}
                className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            {detailLoading ? (
              <View className="h-40 items-center justify-center"><ActivityIndicator size="small" color="#008060" /></View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: 24 }}>
                {detailRecords.length === 0 ? (
                  <Text className="text-muted-foreground text-sm text-center mt-8">本月暂无记录</Text>
                ) : detailRecords.map(r => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.pending;
                  const score = Number(r.score);
                  return (
                    <Pressable key={r.id} onPress={() => setSelectedRecord(r)}
                      className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3"
                      style={{ borderCurve: 'continuous' }}>
                      <View className="flex-1 gap-0.5">
                        <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{r.description}</Text>
                        <Text className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</Text>
                      </View>
                      <View className="items-end gap-1">
                        <Text style={{ color: score >= 0 ? '#008060' : '#D9381E' }} className="text-base font-bold">
                          {score >= 0 ? `+${score}` : `${score}`}
                        </Text>
                        <View style={{ backgroundColor: meta.bg }} className="px-2 py-0.5 rounded-full">
                          <Text style={{ color: meta.color }} className="text-xs">{meta.label}</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <RecordDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} imageZoom={setZoomUri} />

      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        <Pressable className="flex-1 bg-black/90 items-center justify-center" onPress={() => setZoomUri(null)}>
          {zoomUri ? <View style={{ width: '95%', height: height * 0.7 }} /> : null}
          <Pressable onPress={() => setZoomUri(null)}
            className="absolute top-12 right-5 w-9 h-9 rounded-full bg-white/20 items-center justify-center">
            <X size={18} color="white" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
