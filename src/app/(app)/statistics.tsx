import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, BarChart2, TrendingUp, Package, X, Download } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getStatsForRange,
  getApprovedOrders,
  type PeriodStats,
  type CategoryStats,
} from '@/db/api';
import PermissionGuard from '@/components/PermissionGuard';
import {
  getTimeSettings, buildDateRange, buildDayRange,
  type TimePeriodSettings, DEFAULT_TIME_SETTINGS,
} from '@/lib/timeSettings';

type StatPreset = '今天' | '午市' | '晚市' | '昨天' | '查询';
const STAT_PRESETS: StatPreset[] = ['今天', '午市', '晚市', '昨天', '查询'];

function computeStatRange(
  preset: StatPreset,
  settings: TimePeriodSettings,
  rangeStart: Date,
  rangeEnd: Date,
): { start: string; end: string } | null {
  if (preset === '今天') return buildDayRange(new Date());
  if (preset === '午市') return buildDateRange('午市', settings);
  if (preset === '晚市') return buildDateRange('晚市', settings);
  if (preset === '昨天') return buildDayRange(new Date(Date.now() - 86400000));
  if (preset === '查询') {
    const s = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const e = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  return null;
}

// 简单柱状图组件（纯 View 实现，无需第三方图表库）
function BarChart({
  data,
  valueKey,
  labelKey,
  color,
  maxBarHeight,
}: {
  data: Record<string, unknown>[];
  valueKey: string;
  labelKey: string;
  color: string;
  maxBarHeight: number;
}) {
  const maxVal = Math.max(...data.map((d) => (d[valueKey] as number) || 0), 1);

  return (
    <View className="flex-row items-end justify-between px-2" style={{ height: maxBarHeight + 32 }}>
      {data.map((item, i) => {
        const val = (item[valueKey] as number) || 0;
        const barH = maxVal === 0 ? 0 : Math.max((val / maxVal) * maxBarHeight, val > 0 ? 4 : 0);
        const label = item[labelKey] as string;
        return (
          <View key={i} className="flex-1 items-center gap-1" style={{ maxWidth: 48 }}>
            {/* 数值标签 */}
            <Text className="text-xs font-semibold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
              {val > 0 ? val : ''}
            </Text>
            {/* 柱子 */}
            <View
              style={{
                width: '60%',
                height: barH,
                backgroundColor: val > 0 ? color : '#e5e7eb',
                borderRadius: 4,
              }}
            />
            {/* X 轴标签 */}
            <Text className="text-xs text-muted-foreground text-center" numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// 分类占比横向条形图
function CategoryChart({ data }: { data: CategoryStats[] }) {
  const total = data.reduce((sum, d) => sum + d.total_quantity, 0);
  const colors = ['#059669', '#d97706', '#0d9488', '#7c3aed', '#92400e', '#7c3aed', '#be185d'];

  if (total === 0) {
    return (
      <View className="items-center py-6">
        <Text className="text-muted-foreground text-sm">暂无数据</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {data.map((item, i) => {
        const pct = total > 0 ? (item.total_quantity / total) * 100 : 0;
        const color = colors[i % colors.length];
        return (
          <View key={item.category} className="gap-1">
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-2">
                <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <Text className="text-sm text-foreground font-medium">{item.category}</Text>
              </View>
              <Text className="text-sm text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                {item.total_quantity.toFixed(1)} ({pct.toFixed(1)}%)
              </Text>
            </View>
            {/* 进度条 */}
            <View className="h-2 bg-muted rounded-full overflow-hidden">
              <View
                style={{ width: `${pct}%`, backgroundColor: color, height: '100%', borderRadius: 4 }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function StatisticsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [activePreset, setActivePreset] = useState<StatPreset>('今天');
  const [timeSettings, setTimeSettings] = useState<TimePeriodSettings>(DEFAULT_TIME_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PeriodStats>({ order_count: 0, item_count: 0, trend: [], categories: [] });
  // 查询自定义日期范围
  const [rangeStart, setRangeStart] = useState<Date>(new Date());
  const [rangeEnd, setRangeEnd] = useState<Date>(new Date());
  const [pickingField, setPickingField] = useState<'start' | 'end'>('start');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  // 导出状态
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  // 当前生效的时间区间（导出用）
  const [activeRange, setActiveRange] = useState<{ start?: string; end?: string }>({});

  useFocusEffect(
    useCallback(() => {
      getTimeSettings().then((ts) => {
        setTimeSettings(ts);
        loadStats('今天', ts, new Date(), new Date());
      });
    }, [])
  );

  const loadStats = async (
    preset: StatPreset,
    settings: TimePeriodSettings,
    rs: Date,
    re: Date,
  ) => {
    setLoading(true);
    const range = computeStatRange(preset, settings, rs, re);
    setActiveRange({ start: range?.start, end: range?.end });
    const data = await getStatsForRange(range?.start, range?.end);
    setStats(data);
    setLoading(false);
  };

  // ── 导出 Excel
  const handleExport = async () => {
    setExporting(true);
    setExportMsg('');
    try {
      const orders = await getApprovedOrders(activeRange.start, activeRange.end);

      // 汇总行
      const summarySheet = XLSX.utils.aoa_to_sheet([
        ['时段', '已批准申购单数', '食材条目数'],
        [presetLabel, stats.order_count, stats.item_count],
      ]);

      // 分类明细
      const total = stats.categories.reduce((s, c) => s + c.total_quantity, 0);
      const catRows = [['品类名称', '总数量', '占比']];
      for (const c of stats.categories) {
        catRows.push([c.category, String(c.total_quantity.toFixed(2)), `${total > 0 ? ((c.total_quantity / total) * 100).toFixed(1) : 0}%`]);
      }
      const catSheet = XLSX.utils.aoa_to_sheet(catRows);

      // 食材明细（展平所有 order_items）
      const itemMap = new Map<string, { name: string; category: string; unit: string; supplier: string; qty: number }>();
      for (const order of orders) {
        for (const item of (order.items ?? [])) {
          if (item.excluded_from_summary) continue;
          const ing = item.ingredient;
          if (!ing) continue;
          const key = ing.id;
          const prev = itemMap.get(key);
          if (prev) {
            prev.qty += item.quantity;
          } else {
            itemMap.set(key, {
              name: ing.name,
              category: ing.category ?? '',
              unit: ing.unit ?? '',
              supplier: ing.supplier ?? '',
              qty: item.quantity,
            });
          }
        }
      }
      const detailRows = [['食材名', '分类', '数量', '单位', '供应商']];
      for (const v of Array.from(itemMap.values()).sort((a, b) => a.category.localeCompare(b.category))) {
        detailRows.push([v.name, v.category, String(v.qty), v.unit, v.supplier]);
      }
      const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, '汇总');
      XLSX.utils.book_append_sheet(wb, catSheet, '分类明细');
      XLSX.utils.book_append_sheet(wb, detailSheet, '食材明细');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const today = new Date().toISOString().slice(0, 10);
      const fileName = `灶管家数据统计_${today}_${presetLabel}.xlsx`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: '导出数据统计 Excel',
        });
      } else {
        setExportMsg('❌ 设备不支持文件分享');
      }
    } catch {
      setExportMsg('❌ 导出失败，请重试');
    }
    setExporting(false);
    if (exportMsg) setTimeout(() => setExportMsg(''), 3000);
  };

  const handlePreset = (preset: StatPreset) => {
    setActivePreset(preset);
    if (preset === '查询') {
      setPickingField('start');
      setDatePickerVisible(true);
      return;
    }
    loadStats(preset, timeSettings, rangeStart, rangeEnd);
  };

  const handlePickerConfirm = () => {
    if (pickingField === 'start') {
      setPickingField('end');
      return;
    }
    setDatePickerVisible(false);
    setActivePreset('查询');
    loadStats('查询', timeSettings, rangeStart, rangeEnd);
  };

  // 格式化时段标签
  const presetLabel = (() => {
    if (activePreset !== '查询') return activePreset;
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(rangeStart)}~${fmt(rangeEnd)}`;
  })();

  // 柱状图高度根据屏幕宽度自适应
  const chartBarHeight = Math.min(120, (width - 64) * 0.35);

  return (
    <PermissionGuard permissions={['数据统计']} title="数据统计">
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
        <Text className="text-xl font-bold text-foreground flex-1">数据统计</Text>
        <Pressable
          onPress={handleExport}
          disabled={exporting || loading || (stats.order_count === 0 && stats.item_count === 0)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
            opacity: (exporting || loading || (stats.order_count === 0 && stats.item_count === 0)) ? 0.45 : 1,
          }}
        >
          <Download size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
            {exporting ? '导出中...' : '导出'}
          </Text>
        </Pressable>
      </View>
      {exportMsg ? (
        <View className="mx-4 mt-2 px-3 py-2 bg-destructive/10 rounded-xl">
          <Text className="text-destructive text-sm text-center">{exportMsg}</Text>
        </View>
      ) : null}

      {/* 时间筛选 Tab */}
      <View style={{ backgroundColor: '#f0f4f2', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 7, flexDirection: 'row' }}
        >
          {STAT_PRESETS.map((preset) => {
            const isActive = activePreset === preset;
            const label = (preset === '查询' && activePreset === '查询') ? presetLabel : preset;
            return (
              <Pressable
                key={preset}
                onPress={() => handlePreset(preset)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
                  backgroundColor: isActive ? '#059669' : '#e4ede9',
                  borderWidth: 1, borderColor: isActive ? '#047857' : '#c8d9d3',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#fff' : '#1f4d3a' }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 16, gap: 16 }}
        >
          {/* 汇总卡片 */}
          <View className="flex-row gap-3">
            <View
              className="flex-1 bg-card rounded-2xl p-4"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
            >
              <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mb-2">
                <TrendingUp size={18} color="#059669" />
              </View>
              <Text className="text-2xl font-bold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                {stats.order_count}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">已批准申购单</Text>
            </View>

            <View
              className="flex-1 bg-card rounded-2xl p-4"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
            >
              <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mb-2">
                <Package size={18} color="#059669" />
              </View>
              <Text className="text-2xl font-bold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                {stats.item_count}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">食材申购条目</Text>
            </View>
          </View>

          {/* 申购单趋势图（按天）*/}
          <View
            className="bg-card rounded-2xl p-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
          >
            <Text className="text-sm font-semibold text-foreground mb-1">申购单数量趋势</Text>
            <Text className="text-xs text-muted-foreground mb-4">
              {presetLabel} · 已批准申购单数（按天）
            </Text>
            {stats.trend.length === 0 || stats.trend.every((d) => d.order_count === 0) ? (
              <View className="items-center py-4">
                <Text className="text-muted-foreground text-sm">该时段暂无审批数据</Text>
              </View>
            ) : (
              <BarChart
                data={(stats.trend as unknown) as Record<string, unknown>[]}
                valueKey="order_count"
                labelKey="label"
                color="#059669"
                maxBarHeight={chartBarHeight}
              />
            )}
          </View>

          {/* 食材条目数趋势图（按天）*/}
          <View
            className="bg-card rounded-2xl p-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
          >
            <Text className="text-sm font-semibold text-foreground mb-1">食材条目数趋势</Text>
            <Text className="text-xs text-muted-foreground mb-4">
              {presetLabel} · 有效食材条目数（按天，已排除删除项）
            </Text>
            {stats.trend.length === 0 || stats.trend.every((d) => d.item_count === 0) ? (
              <View className="items-center py-4">
                <Text className="text-muted-foreground text-sm">该时段暂无数据</Text>
              </View>
            ) : (
              <BarChart
                data={(stats.trend as unknown) as Record<string, unknown>[]}
                valueKey="item_count"
                labelKey="label"
                color="#0d9488"
                maxBarHeight={chartBarHeight}
              />
            )}
          </View>

          {/* 分类采购占比 */}
          <View
            className="bg-card rounded-2xl p-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
          >
            <Text className="text-sm font-semibold text-foreground mb-1">食材分类采购占比</Text>
            <Text className="text-xs text-muted-foreground mb-4">
              {presetLabel} · 按食材分类统计已批准总数量
            </Text>
            <CategoryChart data={stats.categories} />
          </View>
        </ScrollView>
      )}

      {/* ===== 日期范围选择器弹窗 ===== */}
      <Modal visible={datePickerVisible} transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                {pickingField === 'start' ? '选择开始日期' : '选择结束日期'}
              </Text>
              <Pressable onPress={() => setDatePickerVisible(false)}>
                <X size={22} color="#374151" />
              </Pressable>
            </View>
            {pickingField === 'end' && (
              <View style={{ backgroundColor: '#f0fdf4', marginHorizontal: 16, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#059669', fontWeight: '500' }}>
                  开始：{rangeStart.getMonth() + 1}/{rangeStart.getDate()} · 请选择结束日期
                </Text>
              </View>
            )}
            <DateTimePicker
              mode="single"
              date={pickingField === 'start' ? rangeStart : rangeEnd}
              onChange={({ date }) => {
                if (!date) return;
                const d = new Date(date as string);
                if (pickingField === 'start') setRangeStart(d);
                else setRangeEnd(d);
              }}
              styles={{ selected: { backgroundColor: '#059669' }, selected_label: { color: '#fff' } }}
            />
            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <Pressable
                onPress={handlePickerConfirm}
                className="active:opacity-80"
                style={{
                  height: 48, borderRadius: 10, backgroundColor: '#059669',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>
                  {pickingField === 'start' ? '下一步：选结束日期' : '确认查询'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </PermissionGuard>
  );
}

