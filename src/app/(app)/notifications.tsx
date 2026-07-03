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
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Bell, CheckCircle, XCircle, Edit3, CheckCheck, ChevronRight, Award } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import {
  getMyNotifications, markNotificationRead, markAllNotificationsRead,
} from '@/db/api';
import type { Notification, NotificationType } from '@/types/types';

function NotifIcon({ type }: { type: NotificationType }) {
  if (type === 'approved') return <CheckCircle size={22} color="#059669" />;
  if (type === 'rejected') return <XCircle size={22} color="#ef4444" />;
  if (type === 'modified') return <Edit3 size={22} color="#0d9488" />;
  if (type === 'submitted') return <Bell size={22} color="#059669" />;
  if (type === 'perf_submitted') return <Award size={22} color="#d97706" />;
  if (type === 'perf_approved') return <Award size={22} color="#059669" />;
  if (type === 'perf_rejected') return <Award size={22} color="#ef4444" />;
  return <Bell size={22} color="#6b7280" />;
}

const TYPE_BG: Record<NotificationType, string> = {
  approved: '#ecfdf5',
  rejected: '#fef2f2',
  modified: '#f0fdfa',
  submitted: '#ecfdf5',
  system: '#f9fafb',
  perf_submitted: '#fffbeb',
  perf_approved: '#ecfdf5',
  perf_rejected: '#fef2f2',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [])
  );

  const loadNotifications = async () => {
    setLoading(true);
    let data = await getMyNotifications();

    // ── 过滤已处理事项：关联单据已审核/完成的通知自动标记为已读 ──
    const unreadOrderIds = [
      ...new Set(data.filter((n) => n.order_id && !n.is_read).map((n) => n.order_id!)),
    ];
    const unreadPerfIds = [
      ...new Set(data.filter((n) => n.perf_id && !n.is_read).map((n) => n.perf_id!)),
    ];

    const resolvedOrderIds = new Set<string>();
    const resolvedPerfIds = new Set<string>();

    if (unreadOrderIds.length > 0) {
      const { data: orders } = await supabase
        .from('purchase_orders')
        .select('id, status')
        .in('id', unreadOrderIds);
      (orders || []).forEach((o: any) => {
        if (o.status !== 'pending') resolvedOrderIds.add(o.id);
      });
    }

    if (unreadPerfIds.length > 0) {
      const { data: perfs } = await supabase
        .from('performance_scores')
        .select('id, status')
        .in('id', unreadPerfIds);
      (perfs || []).forEach((p: any) => {
        if (p.status !== 'pending') resolvedPerfIds.add(p.id);
      });
    }

    const toResolve = data.filter((n) => {
      if (n.is_read) return false;
      if (n.order_id && resolvedOrderIds.has(n.order_id)) return true;
      if (n.perf_id && resolvedPerfIds.has(n.perf_id)) return true;
      return false;
    });

    if (toResolve.length > 0) {
      const ids = toResolve.map((n) => n.id);
      await supabase.from('notifications').update({ is_read: true }).in('id', ids);
      data = data.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n));
    }

    setNotifications(data);
    setLoading(false);
  };

  const handleMarkRead = async (notif: Notification) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
    }
    // 点击跳转
    if (notif.type === 'submitted') {
      // 申购单新提交 → 跳审核页（待审 Tab）
      router.push('/(app)/review');
    } else if (notif.order_id && (notif.type === 'approved' || notif.type === 'rejected' || notif.type === 'modified')) {
      // 申购单审核结果 → 跳历史记录
      router.push('/(app)/history');
    } else if (notif.type === 'perf_submitted') {
      // 绩效新申请（审核人收到）→ 跳绩效页待审 Tab
      router.push('/(app)/performance');
    } else if (notif.type === 'perf_approved' || notif.type === 'perf_rejected') {
      // 绩效审核结果（申请人收到）→ 跳绩效页我的绩效 Tab
      router.push('/(app)/performance');
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setMarkingAll(false);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View
        className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3"
        style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center"
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">消息通知</Text>
        {unreadCount > 0 && (
          <View className="bg-destructive px-2.5 py-0.5 rounded-full">
            <Text className="text-white text-xs font-bold">{unreadCount}</Text>
          </View>
        )}
        {unreadCount > 0 && (
          <Pressable
            onPress={handleMarkAllRead}
            disabled={markingAll}
            className="flex-row items-center gap-1 bg-muted px-3 py-2 rounded-xl"
          >
            {markingAll
              ? <ActivityIndicator size="small" color="#6b7280" />
              : <CheckCheck size={14} color="#6b7280" />}
            <Text className="text-xs text-muted-foreground">全部已读</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : notifications.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4">
          <View className="w-20 h-20 rounded-full bg-muted items-center justify-center">
            <Bell size={36} color="#d1d5db" />
          </View>
          <Text className="text-base text-muted-foreground">暂无消息通知</Text>
          <Text className="text-sm text-muted-foreground text-center px-8">
            当您的申购单审核完成后，{'\n'}系统会在这里推送通知
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 }}
          renderItem={({ item }) => {
            const bg = TYPE_BG[item.type] ?? '#f9fafb';
            return (
              <Pressable
                onPress={() => handleMarkRead(item)}
                className="bg-card rounded-2xl overflow-hidden"
                style={[
                  { boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.07)' }], borderCurve: 'continuous' },
                  !item.is_read && { borderLeftWidth: 3, borderLeftColor: '#059669' },
                ] as object}
              >
                <View className="flex-row items-start gap-3 p-4">
                  {/* 图标 */}
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: bg }}
                  >
                    <NotifIcon type={item.type} />
                  </View>

                  {/* 内容 */}
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between mb-0.5">
                      <Text className={`text-sm font-semibold ${item.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {item.title}
                      </Text>
                      {/* 未读红点 */}
                      {!item.is_read && (
                        <View className="w-2 h-2 rounded-full bg-destructive ml-2 flex-shrink-0" />
                      )}
                    </View>
                    <Text className={`text-xs leading-5 ${item.is_read ? 'text-muted-foreground' : 'text-foreground/80'}`}>
                      {item.body}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1.5">
                      {formatRelativeTime(item.created_at)}
                    </Text>
                  </View>

                  {/* 可跳转箭头（非 system 类型） */}
                  {item.type !== 'system' && (
                    <View className="self-center ml-1">
                      <ChevronRight size={16} color="#d1d5db" />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
