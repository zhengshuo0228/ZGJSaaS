import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Award, AlertCircle } from 'lucide-react-native';
import { supabase } from '@/client/supabase';

interface PerfRecord {
  id: string;
  user_id: string;
  date: string;
  description: string;
  score: number;
  status: 'pending' | 'approved' | 'rejected';
  remark?: string;
  created_at: string;
  reviewed_at?: string;
  user?: { display_name?: string; email?: string; position?: string };
  operator?: { display_name?: string };
}

export default function LeaderboardDetailScreen() {
  const router = useRouter();
  const { user_id, name } = useLocalSearchParams<{ user_id: string; name: string }>();
  const targetName = decodeURIComponent(name || '');
  const targetUserId = decodeURIComponent(user_id || '');

  const [records, setRecords] = useState<PerfRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [noPermission, setNoPermission] = useState(false);

  const month = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();

  const load = useCallback(async () => {
    if (!targetUserId) {
      setErrorMsg('缺少用户ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setNoPermission(false);

    try {
      const { data: res, error } = await supabase.functions.invoke('performance-api', {
        body: { action: 'list', user_id: targetUserId, status: 'approved', month },
      });
      if (error) {
        const msg = await error?.context?.text?.();
        setErrorMsg(msg || error.message);
      } else {
        const list: PerfRecord[] = Array.isArray(res?.records) ? res.records : [];
        // 若后端因权限强制过滤为当前用户，且与目标不一致，则提示无权限
        if (list.length > 0 && list[0].user_id !== targetUserId) {
          setNoPermission(true);
          setRecords([]);
        } else {
          setRecords(list);
        }
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, month]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const total = records.reduce((s, r) => s + Number(r.score), 0);

  const formatDateTime = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const renderItem = ({ item }: { item: PerfRecord }) => {
    const scoreNum = Number(item.score);
    const isAdd = scoreNum >= 0;
    return (
      <View className="bg-card rounded-xl px-3 py-2.5 mb-2 flex-row items-center gap-2.5"
        style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0,0,0,0.05)' }] } as object}>
        <View className={`w-10 h-10 rounded-lg items-center justify-center ${isAdd ? 'bg-green-50' : 'bg-red-50'}`}>
          <Text className={`text-base font-bold ${isAdd ? 'text-green-600' : 'text-red-500'}`} style={{ fontVariant: ['tabular-nums'] }}>
            {isAdd ? `+${scoreNum}` : `${scoreNum}`}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>{item.description}</Text>
          {item.remark ? (
            <Text className="text-xs text-muted-foreground italic" numberOfLines={1}>{item.remark}</Text>
          ) : null}
          <Text className="text-xs text-muted-foreground mt-0.5">
            {item.date} · {item.operator?.display_name ? `审核：${item.operator.display_name}` : '系统'}
          </Text>
          {item.reviewed_at && (
            <Text className="text-xs text-muted-foreground">审核时间：{formatDateTime(item.reviewed_at)}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 标题栏 */}
      <View className="flex-row items-center px-4 py-3 bg-card border-b border-border">
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center mr-2">
          <ArrowLeft size={18} color="#374151" />
        </Pressable>
        <Award size={18} color="#f59e0b" style={{ marginRight: 6 }} />
        <View className="flex-1">
          <Text className="text-base font-bold text-foreground" numberOfLines={1}>{targetName || '员工'}的积分详情</Text>
          <Text className="text-xs text-muted-foreground">{month} · 共{records.length}条 · 净{total}分</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : errorMsg ? (
        <View className="flex-1 items-center justify-center px-8">
          <AlertCircle size={32} color="#dc2626" />
          <Text className="text-destructive text-sm mt-2 text-center">{errorMsg}</Text>
          <Pressable onPress={load} className="mt-4 bg-primary rounded-xl px-5 py-2.5">
            <Text className="text-white font-medium">重试</Text>
          </Pressable>
        </View>
      ) : noPermission ? (
        <View className="flex-1 items-center justify-center px-8">
          <AlertCircle size={32} color="#f59e0b" />
          <Text className="text-muted-foreground text-sm mt-2 text-center">暂无权限查看该员工的详细记录</Text>
        </View>
      ) : records.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Award size={36} color="#d1d5db" />
          <Text className="text-muted-foreground text-sm mt-3">本月暂无绩效记录</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        />
      )}
    </SafeAreaView>
  );
}
