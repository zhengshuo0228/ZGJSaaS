import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft, CheckCircle, XCircle, ChevronDown, ChevronUp,
  ClipboardList, Calendar, X, Info, FileText,
  CheckSquare, Square, CheckCheck,
} from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import {
  getPendingOrders, getReviewedOrders, reviewOrder,
  sendNotification, addOperationLog, getOperationLogs,
} from '@/db/api';
import type { PurchaseOrder, OrderItemWithIngredient, OperationLog } from '@/types/types';
import {
  getTimeSettings, buildDateRange, buildDayRange, buildWeekRange,
  type TimePeriodSettings, DEFAULT_TIME_SETTINGS,
} from '@/lib/timeSettings';
import { useProfile } from '@/context/ProfileContext';
import { GUEST_DENY_MSG } from '@/lib/guestGuard';
import PermissionGuard from '@/components/PermissionGuard';

type TimePreset = '全部' | '午市' | '晚市' | '昨天' | '日期';
type ReviewTab = 'pending' | 'reviewed' | 'logs';

const PRESETS: TimePreset[] = ['全部', '午市', '晚市', '昨天', '日期'];

// 三态配置（颜色 + 文案）
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: '#fffbeb', text: '#d97706', label: '待审核' },
  approved: { bg: '#f6ffed', text: '#52C41A', label: '已通过' },
  modified: { bg: '#fff7e6', text: '#FA8C16', label: '已修改' },
  rejected: { bg: '#fff2f0', text: '#FF4D4F', label: '已驳回' },
};

// 遍历清单比对 apply_qty(original_quantity) 与 approved_qty(quantity)
// 驳回直接返回 rejected；非驳回时若有任何 item 被改量 → modified，否则 approved
function resolveOrderStatus(order: PurchaseOrder): 'approved' | 'modified' | 'rejected' {
  if (order.status === 'rejected') return 'rejected';
  const items = order.items || [];
  const hasModified = items.some((item) =>
    item.original_quantity != null && item.original_quantity !== item.quantity
  );
  return hasModified ? 'modified' : 'approved';
}

function getDateRange(
  preset: TimePreset,
  settings: TimePeriodSettings,
  customDate: Date,
  rangeMode: 'day' | 'week',
): { start: string; end: string } | null {
  if (preset === '全部') return null;
  if (preset === '午市') return buildDateRange('午市', settings);
  if (preset === '晚市') return buildDateRange('晚市', settings);
  if (preset === '昨天') {
    const yesterday = new Date(new Date().getTime() - 86400000);
    return buildDayRange(yesterday);
  }
  if (preset === '日期') {
    return rangeMode === 'week' ? buildWeekRange(customDate) : buildDayRange(customDate);
  }
  return null;
}

export default function ReviewScreen() {
  const router = useRouter();
  const { isGuest } = useProfile();

  // ── 三个 Tab
  const [activeTab, setActiveTab] = useState<ReviewTab>('pending');

  // ── 待审列表
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  // ── 已审列表
  const [reviewedOrders, setReviewedOrders] = useState<PurchaseOrder[]>([]);
  // ── 操作日志
  const [logs, setLogs] = useState<OperationLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [expandedId, _setExpandedId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [guestMsg, setGuestMsg] = useState('');
  const showGuestDeny = () => {
    setGuestMsg(GUEST_DENY_MSG);
    setTimeout(() => setGuestMsg(''), 3000);
  };

  // ── 批量操作
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchConfirmType, setBatchConfirmType] = useState<'approve' | 'reject' | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);

  // ── 已审详情弹窗
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);

  // 时间筛选
  const [activePreset, setActivePreset] = useState<TimePreset>('全部');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [rangeMode, setRangeMode] = useState<'day' | 'week' | 'range'>('day');
  const [rangeStart, setRangeStart] = useState<Date>(new Date());
  const [rangeEnd, setRangeEnd] = useState<Date>(new Date());
  const [pickingField, setPickingField] = useState<'start' | 'end'>('start');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timeSettings, setTimeSettings] = useState<TimePeriodSettings>(DEFAULT_TIME_SETTINGS);

  useEffect(() => {
    getTimeSettings().then(setTimeSettings);
  }, []);

  useFocusEffect(
    useCallback(() => {
      getTimeSettings().then((ts) => {
        setTimeSettings(ts);
        loadAll('全部', ts, new Date(), 'day');
      });
    }, [])
  );

  const loadAll = async (
    preset: TimePreset,
    settings: TimePeriodSettings,
    date: Date,
    mode: 'day' | 'week' | 'range',
    rs?: Date,
    re?: Date,
  ) => {
    setLoading(true);
    let range: { start: string; end: string } | null = null;
    if (mode === 'range' && rs && re) {
      const s = new Date(rs.getFullYear(), rs.getMonth(), rs.getDate());
      const e = new Date(re.getFullYear(), re.getMonth(), re.getDate());
      e.setDate(e.getDate() + 1);
      range = { start: s.toISOString(), end: e.toISOString() };
    } else {
      range = getDateRange(preset, settings, date, mode as 'day' | 'week');
    }
    const [pending, reviewed, opLogs] = await Promise.all([
      getPendingOrders(range?.start, range?.end),
      getReviewedOrders(range?.start, range?.end),
      getOperationLogs({ limit: 100 }),
    ]);
    setOrders(pending);
    setReviewedOrders(reviewed);
    // 过滤只显示申购单相关日志
    setLogs(opLogs.filter((l) => l.target_type === 'purchase_order' || l.target_type === '申购单'));
    setLoading(false);
  };

  const handlePresetChange = (preset: TimePreset) => {
    setActivePreset(preset);
    if (preset === '日期') {
      setPickingField('start');
      setDatePickerVisible(true);
      return;
    }
    loadAll(preset, timeSettings, customDate, rangeMode);
  };

  const handleDateConfirm = () => {
    if (rangeMode === 'range') {
      if (pickingField === 'start') { setPickingField('end'); return; }
      setDatePickerVisible(false);
      setActivePreset('日期');
      loadAll('日期', timeSettings, customDate, 'range', rangeStart, rangeEnd);
    } else {
      setDatePickerVisible(false);
      loadAll('日期', timeSettings, customDate, rangeMode);
    }
  };

  const formatDateLabel = () => {
    if (rangeMode === 'range') {
      const fmtMD = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
      return `${fmtMD(rangeStart)}-${fmtMD(rangeEnd)}`;
    }
    if (rangeMode === 'week') {
      const d = customDate;
      const day = d.getDay();
      const monday = new Date(d.getTime() - ((day === 0 ? 6 : day - 1) * 86400000));
      const sunday = new Date(monday.getTime() + 6 * 86400000);
      return `${monday.getMonth() + 1}/${monday.getDate()}~${sunday.getMonth() + 1}/${sunday.getDate()}`;
    }
    return `${customDate.getMonth() + 1}/${customDate.getDate()}`;
  };

  const handleApprove = async (order: PurchaseOrder) => {
    if (isGuest) { showGuestDeny(); return; }
    setProcessing(order.id);
    setMessage('');

    const finalItems = (order.items ?? [])
      .map((item) => ({
        id: item.id,
        quantity: parseFloat(editedQuantities[item.id] ?? String(item.quantity)) || 0,
      }))
      .filter((item) => item.quantity > 0);

    const hasZero = (order.items ?? []).some(
      (item) => (parseFloat(editedQuantities[item.id] ?? String(item.quantity)) || 0) === 0,
    );
    const hasModified = (order.items ?? []).some((item) => {
      const edited = parseFloat(editedQuantities[item.id] ?? String(item.quantity));
      return Math.abs(edited - item.quantity) > 0.001;
    });

    await reviewOrder(order.id, 'approved', finalItems);

    // 写操作日志
    await addOperationLog({
      action: (hasModified || hasZero) ? '调整并批准申购单' : '批准申购单',
      target_type: 'purchase_order',
      target_name: `${getSubmitterName(order)} 的申购单`,
      detail: { order_id: order.id, items_count: finalItems.length },
    });

    // 发送通知给申购人
    if (order.submitter_id) {
      const title = (hasModified || hasZero) ? '申购单已调整并批准' : '申购单已批准 ✅';
      const body = (hasModified || hasZero)
        ? `您的申购单（${finalItems.length} 种食材）经审核已调整数量并批准，请查看`
        : `您的申购单（${finalItems.length} 种食材）已通过审核，即将安排采购`;
      await sendNotification({
        user_id: order.submitter_id,
        type: (hasModified || hasZero) ? 'modified' : 'approved',
        title,
        body,
        order_id: order.id,
      });
    }

    setMessage('已批准');
    setEditingOrder(null);
    setEditedQuantities({});
    await loadAll(activePreset, timeSettings, customDate, rangeMode);
    setProcessing(null);
    setTimeout(() => setMessage(''), 2000);
  };

  const handleReject = async (orderId: string, order: PurchaseOrder) => {
    if (isGuest) { showGuestDeny(); return; }
    setProcessing(orderId);
    setMessage('');
    await reviewOrder(orderId, 'rejected');

    // 写操作日志
    await addOperationLog({
      action: '驳回申购单',
      target_type: 'purchase_order',
      target_name: `${getSubmitterName(order)} 的申购单`,
      detail: { order_id: orderId },
    });

    // 发送通知给申购人
    if (order.submitter_id) {
      await sendNotification({
        user_id: order.submitter_id,
        type: 'rejected',
        title: '申购单已驳回 ❌',
        body: `您的申购单（${order.items?.length ?? 0} 种食材）未通过审核，如有疑问请联系管理员`,
        order_id: orderId,
      });
    }

    setMessage('已驳回');
    await loadAll(activePreset, timeSettings, customDate, rangeMode);
    setProcessing(null);
    setTimeout(() => setMessage(''), 2000);
  };

  // ── 批量操作处理
  const toggleBatchMode = () => {
    setBatchMode((v) => !v);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  const handleBatchApprove = async () => {
    if (isGuest) { showGuestDeny(); return; }
    setBatchProcessing(true);
    setBatchConfirmType(null);
    const targets = orders.filter((o) => selectedIds.has(o.id));
    for (const order of targets) {
      const finalItems = (order.items ?? [])
        .map((item) => ({
          id: item.id,
          quantity: parseFloat(editedQuantities[item.id] ?? String(item.quantity)) || 0,
        }))
        .filter((item) => item.quantity > 0);
      await reviewOrder(order.id, 'approved', finalItems);
      await addOperationLog({
        action: '批量批准申购单',
        target_type: 'purchase_order',
        target_name: `${getSubmitterName(order)} 的申购单`,
        detail: { order_id: order.id, items_count: finalItems.length },
      });
      if (order.submitter_id) {
        await sendNotification({
          user_id: order.submitter_id,
          type: 'approved',
          title: '申购单已批准 ✅',
          body: `您的申购单（${finalItems.length} 种食材）已通过审核，即将安排采购`,
          order_id: order.id,
        });
      }
    }
    setMessage(`已批准 ${targets.length} 条申购单`);
    setBatchMode(false);
    setSelectedIds(new Set());
    await loadAll(activePreset, timeSettings, customDate, rangeMode);
    setBatchProcessing(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleBatchReject = async () => {
    if (isGuest) { showGuestDeny(); return; }
    setBatchProcessing(true);
    setBatchConfirmType(null);
    const targets = orders.filter((o) => selectedIds.has(o.id));
    for (const order of targets) {
      await reviewOrder(order.id, 'rejected');
      await addOperationLog({
        action: '批量驳回申购单',
        target_type: 'purchase_order',
        target_name: `${getSubmitterName(order)} 的申购单`,
        detail: { order_id: order.id },
      });
      if (order.submitter_id) {
        await sendNotification({
          user_id: order.submitter_id,
          type: 'rejected',
          title: '申购单已驳回 ❌',
          body: `您的申购单（${order.items?.length ?? 0} 种食材）未通过审核，如有疑问请联系管理员`,
          order_id: order.id,
        });
      }
    }
    setMessage(`已驳回 ${targets.length} 条申购单`);
    setBatchMode(false);
    setSelectedIds(new Set());
    await loadAll(activePreset, timeSettings, customDate, rangeMode);
    setBatchProcessing(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const setExpandedId = (id: string | null) => {
    _setExpandedId(id);
    if (id) {
      const order = orders.find((o) => o.id === id);
      if (order) {
        const initialQtys: Record<string, string> = {};
        for (const item of order.items ?? []) {
          if (editedQuantities[item.id] === undefined) {
            initialQtys[item.id] = String(item.quantity);
          }
        }
        if (Object.keys(initialQtys).length > 0) {
          setEditedQuantities((prev) => ({ ...prev, ...initialQtys }));
        }
        setEditingOrder(id);
      }
    }
  };

  const stepQty = (itemId: string, delta: number) => {
    if (isGuest) { showGuestDeny(); return; }
    setEditedQuantities((prev) => {
      const current = parseFloat(prev[itemId] ?? '0') || 0;
      const next = Math.min(999.9, Math.max(0, Math.round((current + delta) * 10) / 10));
      return { ...prev, [itemId]: next === 0 ? '0' : String(next) };
    });
  };

  const onStepQtyChange = (itemId: string, text: string) => {
    if (text === '' || /^\d{0,3}(\.\d{0,1})?$/.test(text)) {
      setEditedQuantities((prev) => ({ ...prev, [itemId]: text }));
    }
  };

  const commitStepQty = (itemId: string) => {
    setEditedQuantities((prev) => {
      const val = parseFloat(prev[itemId] ?? '');
      if (isNaN(val) || val < 0) return { ...prev, [itemId]: '0' };
      const clamped = Math.min(999.9, Math.round(val * 10) / 10);
      return { ...prev, [itemId]: String(clamped) };
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const getSubmitterName = (order: PurchaseOrder) =>
    order.submitter?.display_name || order.submitter?.email?.split('@')[0] || '未知';

  const TABS: { key: ReviewTab; label: string; count?: number }[] = [
    { key: 'pending',  label: '待审核', count: orders.length },
    { key: 'reviewed', label: '已审核', count: reviewedOrders.length },
    { key: 'logs',     label: '操作日志' },
  ];

  return (
    <PermissionGuard permissions={['审核申购单']} title="申购审核">
      <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">申购审核</Text>
      </View>

      {/* 访客提示 */}
      {isGuest && (
        <View className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <Text className="text-amber-700 text-xs text-center">👀 访客模式：仅可浏览，无法审核通过或驳回</Text>
        </View>
      )}
      {guestMsg ? (
        <View className="bg-red-50 border-b border-red-200 px-4 py-2.5">
          <Text className="text-red-600 text-xs text-center">{guestMsg}</Text>
        </View>
      ) : null}

      {/* 三个 Tab */}
      <View className="flex-row bg-card border-b border-border px-2 gap-0">
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            className={`py-2.5 px-3 border-b-2 flex-row items-center gap-1.5 ${activeTab === t.key ? 'border-primary' : 'border-transparent'}`}
          >
            <Text className={`text-sm font-medium ${activeTab === t.key ? 'text-primary' : 'text-muted-foreground'}`}>{t.label}</Text>
            {t.count != null && t.count > 0 && (
              <View className={`px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-primary' : 'bg-muted'}`}>
                <Text className={`text-xs font-bold ${activeTab === t.key ? 'text-white' : 'text-muted-foreground'}`}>{t.count}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* 时间筛选栏（待审/已审才显示）*/}
      {activeTab !== 'logs' && (
        <View className="bg-card border-b border-border px-4 py-2.5 flex-row gap-2">
          {PRESETS.map((p) => {
            const isActive = activePreset === p;
            const label = p === '日期' && isActive ? formatDateLabel() : p;
            return (
              <Pressable
                key={p}
                onPress={() => handlePresetChange(p)}
                className={`flex-row items-center gap-1 px-3 py-1.5 rounded-full ${isActive ? 'bg-primary' : 'bg-muted'}`}
              >
                {p === '日期' && <Calendar size={12} color={isActive ? '#fff' : '#6b7280'} />}
                <Text className={`text-xs font-medium ${isActive ? 'text-white' : 'text-muted-foreground'}`}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 操作反馈 */}
      {message ? (
        <View className="mx-4 mt-3 bg-primary/10 rounded-xl px-4 py-3">
          <Text className="text-primary font-medium text-sm text-center">{message}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <>
          {/* ── 待审核 Tab ─── */}
          {activeTab === 'pending' && (
            orders.length === 0 ? (
              <View className="flex-1 items-center justify-center gap-3">
                <ClipboardList size={48} color="#d1d5db" />
                <Text className="text-muted-foreground text-base">暂无待审核申购单</Text>
              </View>
            ) : (
              <View className="flex-1">
                {/* 批量操作工具栏 */}
                <View className="bg-card border-b border-border px-4 py-2 flex-row items-center justify-between">
                  {batchMode ? (
                    <>
                      <Pressable onPress={toggleSelectAll} className="flex-row items-center gap-2 py-1">
                        {selectedIds.size === orders.length
                          ? <CheckSquare size={20} color="#059669" />
                          : <Square size={20} color="#9ca3af" />}
                        <Text className="text-sm text-foreground">
                          {selectedIds.size > 0 ? `已选 ${selectedIds.size} 条` : '全选'}
                        </Text>
                      </Pressable>
                      <Pressable onPress={toggleBatchMode} className="px-3 py-1 rounded-lg bg-muted">
                        <Text className="text-sm text-muted-foreground">取消</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text className="text-sm text-muted-foreground">共 {orders.length} 条待审</Text>
                      <Pressable onPress={toggleBatchMode} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10">
                        <CheckCheck size={15} color="#059669" />
                        <Text className="text-sm font-medium text-primary">批量选择</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                <FlatList
                  data={orders}
                  keyExtractor={(item) => item.id}
                  contentInsetAdjustmentBehavior="automatic"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: batchMode ? 96 : 32, gap: 12 }}
                  renderItem={({ item: order }) => {
                    const isExpanded = expandedId === order.id && !batchMode;
                    const isProcessing = processing === order.id;
                    const isSelected = selectedIds.has(order.id);
                    return (
                      <View
                        className="bg-card rounded-2xl overflow-hidden"
                        style={{
                          boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.08)' }],
                          borderCurve: 'continuous',
                          borderWidth: batchMode && isSelected ? 2 : 0,
                          borderColor: batchMode && isSelected ? '#059669' : 'transparent',
                        } as object}
                      >
                        <Pressable
                          onPress={() => batchMode ? toggleSelect(order.id) : setExpandedId(isExpanded ? null : order.id)}
                          className="p-4"
                        >
                          <View className="flex-row items-start gap-3">
                            {batchMode && (
                              <View className="mt-0.5">
                                {isSelected
                                  ? <CheckSquare size={22} color="#059669" />
                                  : <Square size={22} color="#d1d5db" />}
                              </View>
                            )}
                            <View className="flex-1">
                              <View className="flex-row items-center gap-2 mb-1">
                                <Text className="text-base font-semibold text-foreground">{getSubmitterName(order)}</Text>
                                <View className="bg-yellow-50 px-2 py-0.5 rounded-full">
                                  <Text className="text-xs text-yellow-700 font-medium">待审核</Text>
                                </View>
                              </View>
                              <Text className="text-xs text-muted-foreground">
                                {formatTime(order.created_at)} · {order.items?.length ?? 0} 种食材
                              </Text>
                            </View>
                            {!batchMode && (isExpanded ? <ChevronUp size={18} color="#9ca3af" /> : <ChevronDown size={18} color="#9ca3af" />)}
                          </View>
                        </Pressable>

                        {isExpanded && (
                          <View className="border-t border-border">
                            <View className="px-4 py-3 gap-3">
                              {(order.items ?? []).map((item: OrderItemWithIngredient) => {
                                const qtyStr = editedQuantities[item.id] ?? String(item.quantity);
                                const qty = parseFloat(qtyStr) || 0;
                                const isRemoved = qty === 0 && qtyStr !== '';
                                return (
                                  <View key={item.id} className="flex-row items-center" style={{ gap: 8 }}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text className="text-sm font-medium" style={{ color: isRemoved ? '#9ca3af' : '#111827' }} numberOfLines={1}>
                                        {item.ingredient?.name ?? '未知食材'}
                                      </Text>
                                      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                                        {item.ingredient?.category} · {item.ingredient?.supplier}
                                      </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Pressable
                                        onPress={() => stepQty(item.id, -1)}
                                        className="active:opacity-70"
                                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: qty <= 0 ? '#f3f4f6' : '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        <Text style={{ fontSize: 18, fontWeight: '500', color: qty <= 0 ? '#d1d5db' : '#374151', lineHeight: 22 }}>−</Text>
                                      </Pressable>
                                      {isRemoved ? (
                                        <View style={{
                                          width: 72, height: 34, borderRadius: 8,
                                          backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
                                          alignItems: 'center', justifyContent: 'center',
                                        }}>
                                          <Text style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>已移除</Text>
                                        </View>
                                      ) : (
                                        <TextInput
                                          style={{
                                            width: 72, height: 34, borderRadius: 8,
                                            borderWidth: 1.5, borderColor: '#059669',
                                            backgroundColor: '#fff', textAlign: 'center',
                                            fontSize: 14, fontWeight: '600', color: '#111827',
                                            fontVariant: ['tabular-nums'], paddingHorizontal: 4,
                                          }}
                                          value={qtyStr}
                                          onChangeText={(v) => onStepQtyChange(item.id, v)}
                                          onBlur={() => commitStepQty(item.id)}
                                          onSubmitEditing={() => commitStepQty(item.id)}
                                          keyboardType="decimal-pad"
                                          selectTextOnFocus
                                        />
                                      )}
                                      <Pressable
                                        onPress={() => stepQty(item.id, 1)}
                                        className="active:opacity-70"
                                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: qty >= 999.9 ? '#f3f4f6' : '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        <Text style={{ fontSize: 18, fontWeight: '500', color: qty >= 999.9 ? '#d1d5db' : '#374151', lineHeight: 22 }}>+</Text>
                                      </Pressable>
                                      <Text style={{ fontSize: 12, color: '#9ca3af', minWidth: 20 }}>
                                        {item.ingredient?.unit ?? item.unit}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })}
                              {(order.items ?? []).some((item) => (parseFloat(editedQuantities[item.id] ?? String(item.quantity)) || 0) === 0) && (
                                <View style={{ backgroundColor: '#fff8e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 }}>
                                  <Text style={{ fontSize: 12, color: '#92400e' }}>
                                    ⚠️ 数量为 0 的食材批准后将自动从采购汇总中移除
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className="px-4 pb-5">
                              <View className="flex-row gap-3">
                                <Pressable
                                  onPress={() => handleApprove(order)}
                                  disabled={!!isProcessing}
                                  className="active:opacity-80"
                                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 52, borderRadius: 12, backgroundColor: isGuest ? '#9ca3af' : '#059669' }}
                                >
                                  {isProcessing ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                  ) : (
                                    <>
                                      <CheckCircle size={18} color="#fff" />
                                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>批准</Text>
                                    </>
                                  )}
                                </Pressable>
                                <Pressable
                                  onPress={() => handleReject(order.id, order)}
                                  disabled={!!isProcessing}
                                  className="active:opacity-80"
                                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 52, borderRadius: 12, backgroundColor: isGuest ? '#9ca3af' : '#E64340' }}
                                >
                                  <XCircle size={18} color="#fff" />
                                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>驳回</Text>
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  }}
                />

                {/* 批量操作底栏 */}
                {batchMode && (
                  <View
                    className="absolute bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 flex-row gap-3"
                    style={{ boxShadow: [{ offsetX: 0, offsetY: -2, blurRadius: 8, color: 'rgba(0,0,0,0.08)' }] } as object}
                  >
                    <Pressable
                      onPress={() => selectedIds.size > 0 && setBatchConfirmType('approve')}
                      disabled={selectedIds.size === 0 || batchProcessing}
                      className="active:opacity-80"
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 12, backgroundColor: selectedIds.size === 0 ? '#d1d5db' : '#059669' }}
                    >
                      <CheckCircle size={17} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>批量批准</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => selectedIds.size > 0 && setBatchConfirmType('reject')}
                      disabled={selectedIds.size === 0 || batchProcessing}
                      className="active:opacity-80"
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 12, backgroundColor: selectedIds.size === 0 ? '#d1d5db' : '#E64340' }}
                    >
                      <XCircle size={17} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>批量驳回</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )
          )}

          {/* ── 已审核 Tab ─── */}
          {activeTab === 'reviewed' && (
            reviewedOrders.length === 0 ? (
              <View className="flex-1 items-center justify-center gap-3">
                <ClipboardList size={48} color="#d1d5db" />
                <Text className="text-muted-foreground text-base">暂无已审核申购单</Text>
              </View>
            ) : (
              <FlatList
                data={reviewedOrders}
                keyExtractor={(item) => item.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 }}
                renderItem={({ item: order }) => {
                  const rs = resolveOrderStatus(order);
                  const sc = STATUS_CONFIG[rs] ?? STATUS_CONFIG.approved;
                  return (
                    <Pressable
                      onPress={() => setDetailOrder(order)}
                      className="bg-card rounded-xl p-4 flex-row items-center gap-3 active:opacity-75"
                      style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.07)' }] } as object}
                    >
                      {/* 状态标签 */}
                      <View className="items-center gap-1" style={{ width: 52 }}>
                        <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: sc.bg }}>
                          {rs === 'rejected' ? (
                            <XCircle size={20} color={sc.text} />
                          ) : (
                            <CheckCircle size={20} color={sc.text} />
                          )}
                        </View>
                        <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: sc.bg }}>
                          <Text className="text-xs font-medium" style={{ color: sc.text }}>{sc.label}</Text>
                        </View>
                      </View>

                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{getSubmitterName(order)}</Text>
                        <Text className="text-xs text-muted-foreground mt-0.5">
                          {formatTime(order.created_at)} · {order.items?.length ?? 0} 种食材
                        </Text>
                        {order.reviewer?.display_name && (
                          <Text className="text-xs text-muted-foreground mt-0.5">审核人：{order.reviewer.display_name}</Text>
                        )}
                        {order.reviewed_at && (
                          <Text className="text-xs text-muted-foreground">审核时间：{formatTime(order.reviewed_at)}</Text>
                        )}
                        {order.note && (
                          <Text className="text-xs italic text-muted-foreground mt-0.5" numberOfLines={1}>备注：{order.note}</Text>
                        )}
                      </View>

                      <View className="w-7 h-7 rounded-lg bg-muted/60 items-center justify-center">
                        <Info size={14} color="#9ca3af" />
                      </View>
                    </Pressable>
                  );
                }}
              />
            )
          )}

          {/* ── 操作日志 Tab ─── */}
          {activeTab === 'logs' && (
            logs.length === 0 ? (
              <View className="flex-1 items-center justify-center gap-3">
                <FileText size={48} color="#d1d5db" />
                <Text className="text-muted-foreground text-base">暂无操作记录</Text>
              </View>
            ) : (
              <FlatList
                data={logs}
                keyExtractor={(item) => item.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
                renderItem={({ item: log }) => (
                  <View className="flex-row items-start gap-3 py-3 border-b border-border">
                    {/* 时间轴圆点 */}
                    <View className="w-2 h-2 rounded-full bg-primary mt-1.5 ml-1" />
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <Text className="text-sm font-semibold text-foreground">{log.operator_name || '系统'}</Text>
                        <View className="px-2 py-0.5 rounded-full bg-muted">
                          <Text className="text-xs text-muted-foreground">{log.action}</Text>
                        </View>
                      </View>
                      {log.target_name ? (
                        <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>{log.target_name}</Text>
                      ) : null}
                      <Text className="text-xs text-muted-foreground/60 mt-0.5">{formatTime(log.created_at)}</Text>
                    </View>
                  </View>
                )}
              />
            )
          )}
        </>
      )}

      {/* ── 已审核详情弹窗 ─── */}
      <Modal visible={!!detailOrder} transparent animationType="slide" onRequestClose={() => setDetailOrder(null)}>
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-black/40" onPress={() => setDetailOrder(null)} />
          <View className="bg-background rounded-t-3xl" style={{ maxHeight: '80%' }}>
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 rounded-full bg-border" />
            </View>
            <View className="flex-row items-center justify-between px-5 py-3 border-b border-border">
              <Text className="text-base font-bold text-foreground">申购单详情</Text>
              <Pressable onPress={() => setDetailOrder(null)} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            {detailOrder && (() => {
              const rs = resolveOrderStatus(detailOrder);
              const sc = STATUS_CONFIG[rs] ?? STATUS_CONFIG.approved;
              return (
                <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                  {/* 状态头部 */}
                  <View className="flex-row items-center gap-3 mb-4 p-3 rounded-xl bg-muted">
                    <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: sc.bg }}>
                      {rs === 'rejected' ? (
                        <XCircle size={20} color={sc.text} />
                      ) : (
                        <CheckCircle size={20} color={sc.text} />
                      )}
                    </View>
                    <View>
                      <View className="px-2 py-0.5 rounded-full mb-1" style={{ backgroundColor: sc.bg }}>
                        <Text className="text-xs font-bold" style={{ color: sc.text }}>{sc.label}</Text>
                      </View>
                      <Text className="text-xs text-muted-foreground">共 {detailOrder.items?.length ?? 0} 种食材</Text>
                    </View>
                  </View>

                  {/* 申请人 */}
                  <View className="mb-3">
                    <Text className="text-xs text-muted-foreground mb-1">申请人</Text>
                    <Text className="text-sm font-semibold text-foreground">{getSubmitterName(detailOrder)}</Text>
                  </View>

                  {/* 时间 */}
                  <View className="flex-row gap-4 mb-3">
                    <View className="flex-1">
                      <Text className="text-xs text-muted-foreground mb-1">申请时间</Text>
                      <Text className="text-xs font-medium text-foreground">{formatTime(detailOrder.created_at)}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs text-muted-foreground mb-1">审核时间</Text>
                      <Text className="text-xs font-medium text-foreground">
                        {detailOrder.reviewed_at ? formatTime(detailOrder.reviewed_at) : '—'}
                      </Text>
                    </View>
                  </View>

                  {/* 审核人 */}
                  {detailOrder.reviewer?.display_name && (
                    <View className="mb-3">
                      <Text className="text-xs text-muted-foreground mb-1">审核人</Text>
                      <Text className="text-sm text-foreground">{detailOrder.reviewer.display_name}</Text>
                    </View>
                  )}

                  {/* 备注 */}
                  {detailOrder.note && (
                    <View className="mb-4 p-3 rounded-xl border border-border bg-card">
                      <Text className="text-xs text-muted-foreground mb-1">备注</Text>
                      <Text className="text-sm text-foreground">{detailOrder.note}</Text>
                    </View>
                  )}

                  {/* 申购清单 */}
                  <Text className="text-sm font-semibold text-foreground mb-3">申购清单</Text>
                  {(detailOrder.items ?? []).map((item: OrderItemWithIngredient) => (
                    <View key={item.id} className="flex-row items-center justify-between py-2.5 border-b border-border/50">
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                          {item.ingredient?.name ?? '未知食材'}
                        </Text>
                        <Text className="text-xs text-muted-foreground">{item.ingredient?.category} · {item.ingredient?.supplier}</Text>
                      </View>
                      <View className="items-end ml-3">
                        <Text className="text-sm font-bold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                          {item.quantity} <Text className="text-xs font-normal text-muted-foreground">{item.ingredient?.unit ?? item.unit}</Text>
                        </Text>
                        {item.original_quantity != null && Math.abs(item.original_quantity - item.quantity) > 0.001 && (
                          <Text className="text-xs text-muted-foreground line-through">原 {item.original_quantity}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              );
            })()}

            <View className="px-5 pb-8 pt-3 border-t border-border">
              <Pressable onPress={() => setDetailOrder(null)} className="bg-muted rounded-xl py-3 items-center">
                <Text className="text-foreground font-medium">关闭</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 日期选择器 Modal */}
      <Modal visible={datePickerVisible} transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-card rounded-t-3xl pb-8">
            <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
              <Text className="text-base font-bold text-foreground">
                {rangeMode === 'range'
                  ? (pickingField === 'start' ? '选择开始日期' : '选择结束日期')
                  : '选择日期'}
              </Text>
              <Pressable onPress={() => setDatePickerVisible(false)}>
                <X size={22} color="#374151" />
              </Pressable>
            </View>

            <View className="flex-row gap-2 px-4 mb-3">
              {([
                { key: 'day', label: '按天' },
                { key: 'week', label: '按周' },
                { key: 'range', label: '范围' },
              ] as const).map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => { setRangeMode(key); setPickingField('start'); }}
                  className={`px-4 py-1.5 rounded-full ${rangeMode === key ? 'bg-primary' : 'bg-muted'}`}
                >
                  <Text className={`text-xs font-medium ${rangeMode === key ? 'text-white' : 'text-muted-foreground'}`}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {rangeMode === 'range' && pickingField === 'end' && (
              <View className="bg-primary/10 rounded-xl mx-4 px-4 py-2 mb-2">
                <Text className="text-xs text-primary font-medium">
                  开始：{rangeStart.getMonth() + 1}/{rangeStart.getDate()}  请选择结束日期
                </Text>
              </View>
            )}

            <DateTimePicker
              mode="single"
              date={rangeMode === 'range' ? (pickingField === 'start' ? rangeStart : rangeEnd) : customDate}
              onChange={({ date }) => {
                if (!date) return;
                const d = new Date(date as string);
                if (rangeMode === 'range') {
                  if (pickingField === 'start') setRangeStart(d);
                  else setRangeEnd(d);
                } else {
                  setCustomDate(d);
                }
              }}
              styles={{ selected: { backgroundColor: '#E52222' }, selected_label: { color: '#fff' } }}
            />
            <View className="px-4 mt-2">
              <Pressable
                onPress={handleDateConfirm}
                className="active:opacity-80"
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                  {rangeMode === 'range' && pickingField === 'start' ? '下一步：选结束日期' : '确认查询'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 批量操作确认弹窗 */}
      <Modal
        visible={batchConfirmType !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setBatchConfirmType(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View className="bg-card rounded-2xl p-6 w-full" style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0,0,0,0.15)' }] } as object}>
            <View className="items-center mb-4">
              {batchConfirmType === 'approve' ? (
                <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#ecfdf5' }}>
                  <CheckCircle size={30} color="#059669" />
                </View>
              ) : (
                <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#fef2f2' }}>
                  <XCircle size={30} color="#E64340" />
                </View>
              )}
              <Text className="text-lg font-bold text-foreground">
                确认{batchConfirmType === 'approve' ? '批量批准' : '批量驳回'}
              </Text>
              <Text className="text-sm text-muted-foreground text-center mt-2">
                已选中 <Text className="font-semibold text-foreground">{selectedIds.size}</Text> 条申购单，
                确认{batchConfirmType === 'approve' ? '全部批准' : '全部驳回'}？
              </Text>
              {batchConfirmType === 'approve' && (
                <Text className="text-xs text-muted-foreground text-center mt-1">
                  批准将按当前数量执行，如需调整请逐条审核
                </Text>
              )}
            </View>
            {batchProcessing ? (
              <View className="flex-row items-center justify-center gap-2 py-3">
                <ActivityIndicator size="small" color="#059669" />
                <Text className="text-sm text-muted-foreground">处理中，请稍候...</Text>
              </View>
            ) : (
              <View className="flex-row gap-3 mt-2">
                <Pressable
                  onPress={() => setBatchConfirmType(null)}
                  className="flex-1 bg-muted rounded-xl py-3 items-center"
                >
                  <Text className="font-semibold text-foreground">取消</Text>
                </Pressable>
                <Pressable
                  onPress={() => batchConfirmType === 'approve' ? handleBatchApprove() : handleBatchReject()}
                  className="active:opacity-80"
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, backgroundColor: batchConfirmType === 'approve' ? '#059669' : '#E64340' }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
                    确认{batchConfirmType === 'approve' ? '批准' : '驳回'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </PermissionGuard>
  );
}
