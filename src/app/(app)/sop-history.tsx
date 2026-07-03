/**
 * SOP版本历史页
 * 全员：查看历史版本列表 + 版本详情弹窗
 * 管理员/厨师长：版本差异对比 + 一键回滚
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Clock, User, RotateCcw, GitCompare, Eye, CheckCircle } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getUserPermsByPosition } from '@/db/api';
import { getDishSopHistory, rollbackSopToHistory } from '@/db/sopApi';
import type { DishSopHistory } from '@/types/types';

// 字段配置
const SOP_FIELDS: { key: keyof DishSopHistory; label: string }[] = [
  { key: 'ingredients', label: '食材清单' },
  { key: 'steps', label: '制作步骤' },
  { key: 'plating', label: '摆盘要求' },
  { key: 'notes', label: '备注' },
];

function DiffLine({ label, a, b }: { label: string; a: string | null; b: string | null }) {
  const changed = (a ?? '') !== (b ?? '');
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-1.5 mb-2">
        <Text className="text-sm font-bold text-foreground">{label}</Text>
        {changed && (
          <View className="px-1.5 py-0.5 rounded-full bg-orange-100">
            <Text style={{ color: '#EA580C', fontSize: 10, fontWeight: '700' }}>有差异</Text>
          </View>
        )}
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1 p-3 rounded-xl" style={{ backgroundColor: changed ? '#FFF7ED' : '#F9FAFB' }}>
          <Text className="text-xs text-muted-foreground mb-1">历史版本</Text>
          <Text className="text-sm text-foreground">{b?.trim() || '（空）'}</Text>
        </View>
        <View className="flex-1 p-3 rounded-xl" style={{ backgroundColor: changed ? '#F0FDF4' : '#F9FAFB' }}>
          <Text className="text-xs text-muted-foreground mb-1">当前版本</Text>
          <Text className="text-sm text-foreground">{a?.trim() || '（空）'}</Text>
        </View>
      </View>
    </View>
  );
}

export default function SopHistoryScreen() {
  const router = useRouter();
  const { id: dishId, dishName, currentHistoryId } = useLocalSearchParams<{
    id: string;
    dishName: string;
    currentHistoryId?: string;
  }>();

  const [histories, setHistories] = useState<DishSopHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 详情弹窗
  const [detailItem, setDetailItem] = useState<DishSopHistory | null>(null);

  // 对比弹窗
  const [compareItem, setCompareItem] = useState<DishSopHistory | null>(null);
  const [currentItem, setCurrentItem] = useState<DishSopHistory | null>(null);

  // 回滚
  const [rollbackItem, setRollbackItem] = useState<DishSopHistory | null>(null);
  const [rolling, setRolling] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!dishId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErrMsg('');
    try {
      const [data, user] = await Promise.all([
        getDishSopHistory(dishId),
        supabase.auth.getUser(),
      ]);
      setHistories(data);
      // 当前最新版本（用于对比）
      if (data.length > 0) setCurrentItem(data[0]);
      if (user.data.user) {
        const perms = await getUserPermsByPosition(user.data.user.id);
        setCanManage(perms.includes('sop_manage'));
      }
    } catch {
      setErrMsg('加载失败，请下拉刷新重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dishId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleRollback = async () => {
    if (!rollbackItem || !dishId) return;
    setRolling(true);
    const err = await rollbackSopToHistory(dishId, rollbackItem.id);
    setRolling(false);
    setRollbackItem(null);
    if (err) {
      setErrMsg(err);
    } else {
      showSuccess(`已回滚到 ${rollbackItem.version}`);
      load(true);
    }
  };

  const renderItem = ({ item }: { item: DishSopHistory }) => {
    const isCurrent = item.id === currentItem?.id;
    return (
      <View
        className="bg-card rounded-2xl mb-3 p-4"
        style={{
          boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }],
          borderCurve: 'continuous',
        } as object}
      >
        {/* 版本号 + 当前标签 */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <View
              className="px-3 py-1 rounded-full"
              style={{ backgroundColor: isCurrent ? '#FFB88C' : '#F3F4F6' }}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: isCurrent ? '#1A1A2E' : '#374151' }}
              >
                {item.version}
              </Text>
            </View>
            {isCurrent && (
              <View className="px-2 py-0.5 rounded-full bg-green-100">
                <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: '600' }}>当前</Text>
              </View>
            )}
          </View>
          {/* 操作按钮 */}
          <View className="flex-row gap-2">
            <Pressable
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-muted active:opacity-70"
              onPress={() => setDetailItem(item)}
            >
              <Eye size={14} color="#6B7280" />
              <Text className="text-xs font-medium text-muted-foreground">详情</Text>
            </Pressable>
            {canManage && !isCurrent && (
              <>
                <Pressable
                  className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl active:opacity-70"
                  style={{ backgroundColor: '#EFF6FF' }}
                  onPress={() => setCompareItem(item)}
                >
                  <GitCompare size={14} color="#2563EB" />
                  <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '600' }}>对比</Text>
                </Pressable>
                <Pressable
                  className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl active:opacity-70"
                  style={{ backgroundColor: '#FFF7ED' }}
                  onPress={() => setRollbackItem(item)}
                >
                  <RotateCcw size={14} color="#EA580C" />
                  <Text style={{ color: '#EA580C', fontSize: 12, fontWeight: '600' }}>回滚</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* 时间 + 操作人 */}
        <View className="flex-row gap-4">
          <View className="flex-row items-center gap-1">
            <Clock size={13} color="#9CA3AF" />
            <Text className="text-xs text-muted-foreground">
              {item.created_at.slice(0, 16).replace('T', ' ')}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <User size={13} color="#9CA3AF" />
            <Text className="text-xs text-muted-foreground">{item.updated_by_name ?? '未知'}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground">版本历史</Text>
          {dishName ? (
            <Text className="text-xs text-muted-foreground mt-0.5">{dishName}</Text>
          ) : null}
        </View>
      </View>

      {/* 反馈提示 */}
      {successMsg ? (
        <View className="mx-4 mb-2 flex-row items-center gap-2 p-3 bg-green-50 rounded-xl">
          <CheckCircle size={16} color="#16A34A" />
          <Text className="text-sm text-green-700 font-medium">{successMsg}</Text>
        </View>
      ) : null}
      {errMsg ? (
        <View className="mx-4 mb-2 p-3 bg-red-50 rounded-xl">
          <Text className="text-sm text-red-600">{errMsg}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFB88C" />
        </View>
      ) : (
        <FlatList
          data={histories}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerClassName="px-4 pb-10"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#FFB88C" />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 gap-3">
              <Clock size={44} color="#D1D5DB" />
              <Text className="text-base text-muted-foreground">暂无版本历史</Text>
            </View>
          }
        />
      )}

      {/* ===== 版本详情弹窗 ===== */}
      <Modal
        visible={!!detailItem}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailItem(null)}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-card rounded-t-3xl" style={{ maxHeight: '85%' }}>
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
              <View>
                <Text className="text-lg font-bold text-foreground">版本详情</Text>
                {detailItem && (
                  <Text className="text-xs text-muted-foreground mt-0.5">
                    {detailItem.version} · {detailItem.created_at.slice(0, 16).replace('T', ' ')}
                  </Text>
                )}
              </View>
              <Pressable
                className="w-8 h-8 rounded-xl bg-muted items-center justify-center active:opacity-60"
                onPress={() => setDetailItem(null)}
              >
                <Text className="text-muted-foreground font-bold">✕</Text>
              </Pressable>
            </View>
            <ScrollView
              className="px-5 pb-6"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="pb-8"
            >
              {SOP_FIELDS.map(({ key, label }) => (
                <View key={key} className="mb-4">
                  <Text className="text-sm font-bold text-foreground mb-1.5">{label}</Text>
                  <View className="p-3 bg-muted/50 rounded-xl">
                    <Text className="text-sm text-foreground leading-6">
                      {(detailItem?.[key] as string | null)?.trim() || '（未填写）'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== 版本对比弹窗 ===== */}
      <Modal
        visible={!!compareItem}
        transparent
        animationType="slide"
        onRequestClose={() => setCompareItem(null)}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-card rounded-t-3xl" style={{ maxHeight: '90%' }}>
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
              <View>
                <Text className="text-lg font-bold text-foreground">版本对比</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {compareItem?.version} vs {currentItem?.version}（当前）
                </Text>
              </View>
              <Pressable
                className="w-8 h-8 rounded-xl bg-muted items-center justify-center active:opacity-60"
                onPress={() => setCompareItem(null)}
              >
                <Text className="text-muted-foreground font-bold">✕</Text>
              </Pressable>
            </View>
            <ScrollView
              className="px-5"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="pb-10"
            >
              {SOP_FIELDS.map(({ key, label }) => (
                <DiffLine
                  key={key}
                  label={label}
                  a={(currentItem?.[key] as string | null) ?? null}
                  b={(compareItem?.[key] as string | null) ?? null}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== 回滚确认弹窗 ===== */}
      <Modal
        visible={!!rollbackItem}
        transparent
        animationType="fade"
        onRequestClose={() => !rolling && setRollbackItem(null)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-card rounded-3xl p-6 w-full">
            <Text className="text-lg font-bold text-foreground mb-2">确认回滚？</Text>
            <Text className="text-sm text-muted-foreground mb-5 leading-6">
              将把当前SOP内容回滚到 <Text className="font-bold text-foreground">{rollbackItem?.version}</Text>（{rollbackItem?.created_at.slice(0, 10)}），并自动生成新版本号。此操作不可撤销。
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 py-3 rounded-xl bg-muted items-center active:opacity-70"
                disabled={rolling}
                onPress={() => setRollbackItem(null)}
              >
                <Text className="text-sm font-semibold text-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 py-3 rounded-xl items-center active:opacity-70"
                style={{ backgroundColor: '#EA580C' }}
                disabled={rolling}
                onPress={handleRollback}
              >
                {rolling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-sm font-bold text-white">确认回滚</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
