/**
 * 绩效看板主入口 v4
 * 职责：权限加载 + 模板加载 + Tab 路由调度
 * 各 Tab 逻辑完全拆分至 src/components/perf/ 下的模块
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getUserPermsByPosition } from '@/db/api';
import { PerfTemplate, PERM, TimePeriod, PeriodType, getCurrentPeriod, stepPeriod } from '@/components/perf/types';
import MyPerformanceTab from '@/components/perf/MyPerformanceTab';
import AllRecordsTab from '@/components/perf/AllRecordsTab';
import LeaderboardTab from '@/components/perf/LeaderboardTab';
import PendingReviewTab from '@/components/perf/PendingReviewTab';
import ManageTab from '@/components/perf/ManageTab';

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

const ALL_TABS = [
  { key: 'my',          label: '我的绩效',  perm: null },
  { key: 'all',         label: '全员记录',  perm: PERM.ALL_RECORDS },
  { key: 'leaderboard', label: '积分排行榜', perm: null },
  { key: 'pending',     label: '待审核',    perm: PERM.REVIEW_TAB },   // 审核权限 '绩效审核申请'
  { key: 'manage',      label: '绩效管理',  perm: PERM.MANAGE },
] as const;
type TabKey = typeof ALL_TABS[number]['key'];

export default function PerformancePage() {
  const [perms, setPerms] = useState<string[]>([]);
  const [permsLoading, setPermsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('my');
  const [pendingCount, setPendingCount] = useState(0);

  // 时间维度筛选器
  const [period, setPeriod] = useState<TimePeriod>(() => getCurrentPeriod('month'));

  // 模板数据（全局共享，在顶层统一加载）
  const [addItemTpls, setAddItemTpls] = useState<PerfTemplate[]>([]);
  const [deductItemTpls, setDeductItemTpls] = useState<PerfTemplate[]>([]);
  const [remarkTpls, setRemarkTpls] = useState<PerfTemplate[]>([]);
  const [tplsLoading, setTplsLoading] = useState(false);
  const router = useRouter();

  const loadPerms = async () => {
    setPermsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPermsLoading(false); return; }
      const perms = await getUserPermsByPosition(user.id);
      setPerms(perms);
    } catch { /* 静默 */ }
    finally { setPermsLoading(false); }
  };

  const loadTemplates = async () => {
    setTplsLoading(true);
    try {
      const res = await callApi({ action: 'get_templates' });
      const tpls: PerfTemplate[] = Array.isArray(res?.templates) ? res.templates : [];
      setAddItemTpls(tpls.filter((t: PerfTemplate) => t.type === 'add_item'));
      setDeductItemTpls(tpls.filter((t: PerfTemplate) => t.type === 'deduct_item'));
      setRemarkTpls(tpls.filter((t: PerfTemplate) => t.type === 'remark'));
    } catch { /* 静默 */ }
    finally { setTplsLoading(false); }
  };

  const loadPendingCount = async () => {
    try {
      const res = await callApi({ action: 'pending_count' });
      setPendingCount(Number(res?.count ?? 0));
    } catch { /* 静默 */ }
  };

  useFocusEffect(useCallback(() => {
    loadPerms();
    loadTemplates();
    loadPendingCount();
  }, []));

  // 动态计算可见 Tab
  const visibleTabs = ALL_TABS.filter(t => !t.perm || perms.includes(t.perm));

  // 当权限加载后，如果当前 Tab 不可见则重置为第一个
  useEffect(() => {
    if (!permsLoading && !visibleTabs.find(t => t.key === activeTab)) {
      setActiveTab(visibleTabs[0]?.key ?? 'my');
    }
  }, [permsLoading, perms]);

  if (permsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#008060" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* 顶部标题 */}
      <View className="px-4 pt-2 pb-2 flex-row items-center gap-2">
        <Pressable onPress={() => router.replace('/(app)/home')}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center"
          style={{ borderCurve: 'continuous' }}>
          <ChevronLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">绩效看板</Text>
      </View>

      {/* 时间维度筛选器（排行榜 Tab 除外） */}
      {activeTab !== 'leaderboard' ? (
        <View className="mx-4 mb-2 bg-card border border-border rounded-2xl overflow-hidden"
          style={{ borderCurve: 'continuous' }}>
          {/* 类型切换 */}
          <View className="flex-row border-b border-border">
            {(['month', 'quarter', 'year'] as PeriodType[]).map(t => {
              const labels: Record<PeriodType, string> = { month: '月', quarter: '季', year: '年' };
              const isActive = period.type === t;
              return (
                <Pressable key={t} onPress={() => setPeriod(getCurrentPeriod(t))}
                  className={`flex-1 py-2 items-center ${isActive ? 'bg-primary/10' : ''}`}>
                  <Text className={`text-xs font-semibold ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {labels[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* 时段导航 */}
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => setPeriod(p => stepPeriod(p, -1))}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center">
              <ChevronLeft size={16} color="#374151" />
            </Pressable>
            <Text className="flex-1 text-center text-sm font-bold text-foreground">{period.label}</Text>
            <Pressable onPress={() => setPeriod(p => stepPeriod(p, 1))}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center">
              <ChevronRight size={16} color="#374151" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Tab 横向滚动切换 */}
      <View className="border-b border-border">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 0 }}>
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className="mr-6 pb-2.5 pt-1 flex-row items-center gap-1"
                style={isActive ? { borderBottomWidth: 2, borderBottomColor: '#008060' } : {}}>
                <Text className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {tab.label}
                </Text>
                {tab.key === 'pending' && pendingCount > 0 ? (
                  <View className="bg-destructive rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                    <Text className="text-white text-xs font-bold">{pendingCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Tab 内容区 */}
      <View className="flex-1">
        {activeTab === 'my' ? (
          <MyPerformanceTab
            perms={perms}
            addItemTpls={addItemTpls}
            deductItemTpls={deductItemTpls}
            onRefreshTemplates={loadTemplates}
            dateFrom={period.dateFrom}
            dateTo={period.dateTo}
          />
        ) : null}

        {activeTab === 'all' ? (
          <AllRecordsTab dateFrom={period.dateFrom} dateTo={period.dateTo} />
        ) : null}

        {activeTab === 'leaderboard' ? <LeaderboardTab /> : null}

        {activeTab === 'pending' ? (
          <PendingReviewTab perms={perms} remarkTpls={remarkTpls}
            dateFrom={period.dateFrom} dateTo={period.dateTo} />
        ) : null}

        {activeTab === 'manage' ? (
          <ManageTab
            addItemTpls={addItemTpls}
            deductItemTpls={deductItemTpls}
            remarkTpls={remarkTpls}
            onRefreshTemplates={loadTemplates}
            dateFrom={period.dateFrom}
            dateTo={period.dateTo}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
