import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, ChevronDown, ChevronUp, History, X, Share2, MessageSquareText, Image as ImageIcon, FileSpreadsheet, CheckCircle, Edit3, XCircle, Clock, RotateCcw, Save, Clock3 } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { getMyOrders, withdrawOrder, updatePendingOrderItems, getOrderOperationLogs } from '@/db/api';
import type { PurchaseOrder, OrderItemWithIngredient, OperationLog } from '@/types/types';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/types';
import PermissionGuard from '@/components/PermissionGuard';

// ===== 时间段工具 =====
type TimePreset = '午市' | '晚市' | '昨天' | '日期范围';

function buildRange(preset: TimePreset, rangeStart?: Date, rangeEnd?: Date): { start: string; end: string } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const yesterday = new Date(today.getTime() - 86400000);
  const lunchEnd = new Date(today.getTime() + 14 * 3600000);
  if (preset === '午市') return { start: today.toISOString(), end: lunchEnd.toISOString() };
  if (preset === '晚市') return { start: lunchEnd.toISOString(), end: tomorrow.toISOString() };
  if (preset === '昨天') return { start: yesterday.toISOString(), end: today.toISOString() };
  if (preset === '日期范围' && rangeStart && rangeEnd) {
    const s = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const e = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
    e.setDate(e.getDate() + 1); // 包含结束当天
    return { start: s.toISOString(), end: e.toISOString() };
  }
  return null;
}

function fmtMD(d: Date) { return `${d.getMonth() + 1}/${d.getDate()}`; }

export default function HistoryScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 时间筛选
  const [activePreset, setActivePreset] = useState<TimePreset | '全部'>('全部');
  const [rangeStart, setRangeStart] = useState<Date>(new Date());
  const [rangeEnd, setRangeEnd] = useState<Date>(new Date());
  const [pickingField, setPickingField] = useState<'start' | 'end'>('start');
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  // 导出分享
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState<'text' | 'image' | 'xlsx' | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const snapshotRef = useRef<View>(null);

  // ===== 撤回状态 =====
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawConfirmId, setWithdrawConfirmId] = useState<string | null>(null);

  // ===== 修改弹窗状态 =====
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null);
  const [editItems, setEditItems] = useState<Array<{ id: string; name: string; unit: string; quantity: number }>>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState('');

  // ===== 操作历史弹窗状态 =====
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<OperationLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useFocusEffect(useCallback(() => { loadData('全部'); }, []));

  const loadData = async (preset: TimePreset | '全部', rs?: Date, re?: Date) => {
    setLoading(true);
    const range = preset !== '全部' ? buildRange(preset as TimePreset, rs ?? rangeStart, re ?? rangeEnd) : null;
    const data = await getMyOrders(range?.start, range?.end);
    setOrders(data);
    setLoading(false);
  };

  const handlePreset = (preset: TimePreset | '全部') => {
    if (preset === '日期范围') {
      setPickingField('start');
      setDatePickerVisible(true);
      return;
    }
    setActivePreset(preset);
    loadData(preset);
  };

  const handlePickerConfirm = (d: Date) => {
    if (pickingField === 'start') {
      setRangeStart(d);
      setPickingField('end');
      // keep picker open for end date
    } else {
      const end = d < rangeStart ? rangeStart : d;
      setRangeEnd(end);
      setDatePickerVisible(false);
      setActivePreset('日期范围');
      loadData('日期范围', rangeStart, end);
    }
  };

  const rangeLabel = activePreset === '日期范围'
    ? `${fmtMD(rangeStart)}-${fmtMD(rangeEnd)}`
    : '日期';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // ===== 导出：聚合数据（按食材分组，汇总数量/供应商/次数） =====
  const buildAggregated = () => {
    const map: Record<string, { name: string; category: string; supplier: string; unit: string; totalQty: number; count: number }> = {};
    for (const order of orders) {
      for (const item of (order.items ?? [])) {
        const ing = item.ingredient;
        if (!ing) continue;
        if (!map[ing.id]) {
          map[ing.id] = { name: ing.name, category: ing.category, supplier: ing.supplier, unit: ing.unit, totalQty: 0, count: 0 };
        }
        map[ing.id].totalQty += item.quantity;
        map[ing.id].count += 1;
      }
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  };

  const currentRangeLabel = activePreset === '日期范围' ? `${fmtMD(rangeStart)}-${fmtMD(rangeEnd)}` : (activePreset === '全部' ? '全部时段' : activePreset);

  const showMsg = (msg: string) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 3000); };

  // ===== 撤回处理 =====
  const handleWithdraw = async (orderId: string) => {
    setWithdrawingId(orderId);
    try {
      await withdrawOrder(orderId);
      setWithdrawConfirmId(null);
      showMsg('✅ 申购单已撤回');
      await loadData(activePreset, rangeStart, rangeEnd);
    } catch {
      showMsg('❌ 撤回失败，请重试');
    } finally {
      setWithdrawingId(null);
    }
  };

  // ===== 打开修改弹窗 =====
  const openEditOrder = (order: PurchaseOrder) => {
    setEditOrder(order);
    setEditItems((order.items ?? []).map((it: OrderItemWithIngredient) => ({
      id: it.id,
      name: it.ingredient?.name ?? '未知食材',
      unit: it.unit ?? it.ingredient?.unit ?? '',
      quantity: it.quantity,
    })));
    setEditMsg('');
  };

  // ===== 保存修改 =====
  const handleSaveEdit = async () => {
    if (!editOrder) return;
    setEditSaving(true);
    try {
      await updatePendingOrderItems(editOrder.id, editItems.map(i => ({ id: i.id, quantity: i.quantity })));
      setEditOrder(null);
      showMsg('✅ 修改已保存');
      await loadData(activePreset, rangeStart, rangeEnd);
    } catch {
      setEditMsg('❌ 保存失败，请重试');
    } finally {
      setEditSaving(false);
    }
  };

  // ===== 查看操作历史 =====
  const openOrderHistory = async (orderId: string) => {
    setHistoryOrderId(orderId);
    setHistoryLoading(true);
    setHistoryLogs([]);
    try {
      const logs = await getOrderOperationLogs(orderId);
      setHistoryLogs(logs);
    } catch { /* 静默 */ }
    finally { setHistoryLoading(false); }
  };

  const fmtLogTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ===== 文字分享 =====
  const handleShareText = async () => {
    setActionLoading('text');
    const agg = buildAggregated();
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let text = `📋 申购历史导出\n生成日期：${dateStr}  时段：${currentRangeLabel}\n共 ${agg.length} 种食材 / ${orders.length} 条记录\n${'━'.repeat(30)}\n\n`;
    // 按分类分组
    const byCategory: Record<string, typeof agg> = {};
    for (const row of agg) {
      if (!byCategory[row.category]) byCategory[row.category] = [];
      byCategory[row.category].push(row);
    }
    for (const [cat, items] of Object.entries(byCategory)) {
      text += `【${cat}】\n`;
      for (const r of items) {
        text += `  • ${r.name}：合计 ${r.totalQty} ${r.unit}（${r.count} 次申购，供应商：${r.supplier}）\n`;
      }
      text += '\n';
    }
    try {
      await Share.share({ message: text, title: '申购历史导出' });
    } catch { /* 用户取消 */ }
    setActionLoading(null);
    setShareSheetVisible(false);
  };

  // ===== 图片分享 =====
  const handleShareImage = async () => {
    setActionLoading('image');
    setShareSheetVisible(false);
    await new Promise((r) => setTimeout(r, 350));
    try {
      const uri = await captureRef(snapshotRef, { format: 'png', quality: 1 });
      if (process.env.EXPO_OS === 'web') {
        const a = document.createElement('a'); a.href = uri; a.download = '申购历史.png'; a.click();
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '分享申购历史图片' });
      }
    } catch { showMsg('❌ 截图失败，请重试'); }
    setActionLoading(null);
  };

  // ===== Excel 分享 =====
  const handleShareXlsx = async () => {
    setActionLoading('xlsx');
    setShareSheetVisible(false);
    try {
      const agg = buildAggregated();
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

      const detailRows: (string | number)[][] = [['食材名称', '分类', '供应商', '单位', '合计数量', '申购次数']];
      for (const r of agg) detailRows.push([r.name, r.category, r.supplier, r.unit, r.totalQty, r.count]);
      const ws = XLSX.utils.aoa_to_sheet(detailRows);
      ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 6 }, { wch: 10 }, { wch: 10 }];

      const infoRows = [
        ['报表名称', '申购历史汇总'],
        ['时段', currentRangeLabel],
        ['记录数', orders.length],
        ['食材种数', agg.length],
        ['生成时间', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`],
      ];
      const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
      wsInfo['!cols'] = [{ wch: 12 }, { wch: 24 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsInfo, '报表信息');
      XLSX.utils.book_append_sheet(wb, ws, '申购明细');
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      if (process.env.EXPO_OS === 'web') {
        const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `申购历史_${dateStr}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const filePath = `${FileSystem.cacheDirectory}申购历史_${dateStr}.xlsx`;
        await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: '分享申购历史 Excel' });
        } else { showMsg('❌ 设备不支持文件分享'); }
      }
    } catch { showMsg('❌ 导出失败，请重试'); }
    setActionLoading(null);
  };

  return (
    <PermissionGuard permissions={['查看申购历史']} title="申购历史">
      <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">申购历史</Text>
        <Text className="text-xs text-muted-foreground">{orders.length} 条记录</Text>
        {/* 导出按钮 */}
        <Pressable
          onPress={() => setShareSheetVisible(true)}
          className="active:opacity-80"
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
            backgroundColor: '#2E9D6A',
          }}
        >
          <Share2 size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>导出</Text>
        </Pressable>
      </View>

      {/* 时间筛选 */}
      <View className="px-4 pt-3 pb-1">
        <View className="flex-row gap-2">
          {(['全部', '午市', '晚市', '昨天'] as const).map((p) => {
            const isActive = activePreset === p;
            return (
              <Pressable
                key={p}
                onPress={() => handlePreset(p)}
                className={`flex-1 py-2 rounded-xl items-center ${isActive ? 'bg-primary' : 'bg-card border border-border'}`}
                style={{ boxShadow: isActive ? [] : [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0,0,0,0.04)' }] } as object}
              >
                <Text className={`text-sm font-semibold ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{p}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => handlePreset('日期范围')}
            className={`flex-1 py-2 rounded-xl items-center flex-row justify-center gap-1 ${activePreset === '日期范围' ? 'bg-primary' : 'bg-card border border-border'}`}
            style={{ boxShadow: activePreset !== '日期范围' ? [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0,0,0,0.04)' }] : [] } as object}
          >
            <Calendar size={13} color={activePreset === '日期范围' ? '#fff' : '#9ca3af'} />
            <Text className={`text-xs font-semibold ${activePreset === '日期范围' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
              {rangeLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 状态消息 */}
      {statusMsg ? (
        <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10 }}>
          <Text style={{ color: '#059669', fontSize: 13, textAlign: 'center' }}>{statusMsg}</Text>
        </View>
      ) : null}

      {/* 截图快照区域 */}
      <View ref={snapshotRef} style={{ flex: 1 }} collapsable={false}>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : orders.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <History size={48} color="#d1d5db" />
          <Text className="text-muted-foreground">暂无申购记录</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 }}
          renderItem={({ item: order }) => {
            const isExpanded = expandedId === order.id;
            const statusLabel = ORDER_STATUS_LABELS[order.status];
            const statusColor = ORDER_STATUS_COLORS[order.status];
            // 状态图标配置
            const StatusIcon =
              order.status === 'approved' ? CheckCircle :
              order.status === 'modified' ? Edit3 :
              order.status === 'rejected' ? XCircle :
              Clock;
            const iconColor =
              order.status === 'approved' ? '#059669' :
              order.status === 'modified' ? '#0d9488' :
              order.status === 'rejected' ? '#dc2626' :
              '#d97706';

            return (
              <View
                className="bg-card rounded-2xl overflow-hidden"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.07)' }], borderCurve: 'continuous' } as object}
              >
                <Pressable
                  onPress={() => setExpandedId(isExpanded ? null : order.id)}
                  className="p-4"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="text-sm font-semibold text-foreground">
                          {order.items?.length ?? 0} 种食材
                        </Text>
                        {/* 状态标签 + 图标 */}
                        <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${statusColor.bg}`}>
                          <StatusIcon size={11} color={iconColor} />
                          <Text className={`text-xs font-medium ${statusColor.text}`}>{statusLabel}</Text>
                        </View>
                      </View>
                      <Text className="text-xs text-muted-foreground">{formatTime(order.created_at)}</Text>
                    </View>
                    {isExpanded ? <ChevronUp size={18} color="#9ca3af" /> : <ChevronDown size={18} color="#9ca3af" />}
                  </View>
                </Pressable>

                {isExpanded && (
                  <View className="border-t border-border px-4 pb-4 pt-3 gap-2">
                    {(order.items ?? []).map((item: OrderItemWithIngredient) => (
                      <View key={item.id} className="flex-row items-center justify-between">
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-foreground">
                            {item.ingredient?.name ?? '未知食材'}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {item.ingredient?.category} · {item.ingredient?.supplier}
                          </Text>
                        </View>
                        <View className="items-end">
                          <View className="px-2.5 py-1 rounded-full bg-muted">
                            <Text className="text-sm font-semibold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                              {item.quantity} {item.unit}
                            </Text>
                          </View>
                          {item.original_quantity !== null && item.original_quantity !== item.quantity && (
                            <Text className="text-xs text-muted-foreground line-through mt-0.5">
                              原：{item.original_quantity} {item.unit}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}

                    {/* 待审核操作区：修改 + 撤回 + 操作历史 */}
                    {order.status === 'pending' && (
                      <View className="flex-row gap-2 mt-2 pt-2 border-t border-border">
                        <Pressable onPress={() => openEditOrder(order)}
                          className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 border border-primary/20">
                          <Edit3 size={14} color="#008060" />
                          <Text className="text-xs font-semibold text-primary">修改数量</Text>
                        </Pressable>
                        <Pressable onPress={() => setWithdrawConfirmId(order.id)}
                          className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 border border-red-200">
                          <RotateCcw size={14} color="#dc2626" />
                          <Text className="text-xs font-semibold text-red-600">撤回申购</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* 操作历史按钮（所有状态均可查看） */}
                    <Pressable onPress={() => openOrderHistory(order.id)}
                      className="flex-row items-center justify-center gap-1.5 py-2 rounded-xl bg-muted border border-border mt-1">
                      <Clock3 size={13} color="#6b7280" />
                      <Text className="text-xs font-medium text-muted-foreground">查看操作历史</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
      </View>{/* end snapshotRef */}

      {/* ===== 撤回二次确认弹窗 ===== */}
      <Modal visible={!!withdrawConfirmId} transparent animationType="fade" onRequestClose={() => setWithdrawConfirmId(null)}>
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-background rounded-3xl overflow-hidden w-full" style={{ maxWidth: 360 } as object}>
            <View className="px-6 pt-6 pb-4 gap-2">
              <Text className="text-lg font-bold text-foreground text-center">确认撤回</Text>
              <Text className="text-sm text-muted-foreground text-center">撤回后该申购单状态将变为「已撤回」，管理员将无法再审核。确定要撤回吗？</Text>
            </View>
            <View className="h-px bg-border" />
            <View className="flex-row">
              <Pressable onPress={() => setWithdrawConfirmId(null)} className="flex-1 py-4 items-center border-r border-border">
                <Text className="text-base font-semibold text-foreground">取消</Text>
              </Pressable>
              <Pressable onPress={() => withdrawConfirmId && handleWithdraw(withdrawConfirmId)}
                disabled={!!withdrawingId} className={`flex-1 py-4 items-center ${withdrawingId ? 'opacity-60' : ''}`}>
                {withdrawingId ? <ActivityIndicator size="small" color="#dc2626" />
                  : <Text className="text-base font-semibold text-red-600">确认撤回</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 修改数量弹窗 ===== */}
      <Modal visible={!!editOrder} transparent animationType="slide" onRequestClose={() => setEditOrder(null)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setEditOrder(null)}>
          <Pressable onPress={() => {}} className="bg-background rounded-t-3xl overflow-hidden">
            <View className="items-center pt-3 pb-1"><View className="w-10 h-1 rounded-full bg-muted" /></View>
            <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border">
              <Text className="text-base font-bold text-foreground">修改申购数量</Text>
              <Pressable onPress={() => setEditOrder(null)} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            <View style={{ maxHeight: 400 }}>
              <FlatList
                data={editItems}
                keyExtractor={i => i.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 10 }}
                renderItem={({ item, index }) => (
                  <View className="flex-row items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5">
                    <Text className="flex-1 text-sm font-medium text-foreground">{item.name}</Text>
                    <View className="flex-row items-center gap-2">
                      <Pressable onPress={() => setEditItems(prev => prev.map((x, i) => i === index ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x))}
                        className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                        <Text className="text-lg font-bold text-foreground">−</Text>
                      </Pressable>
                      <TextInput
                        value={String(editItems[index].quantity)}
                        onChangeText={v => setEditItems(prev => prev.map((x, i) => i === index ? { ...x, quantity: parseInt(v) || 0 } : x))}
                        keyboardType="numeric"
                        className="w-14 text-center text-base font-bold text-foreground border border-border rounded-lg py-1"
                      />
                      <Pressable onPress={() => setEditItems(prev => prev.map((x, i) => i === index ? { ...x, quantity: x.quantity + 1 } : x))}
                        className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                        <Text className="text-lg font-bold text-foreground">+</Text>
                      </Pressable>
                      <Text className="text-xs text-muted-foreground w-6">{item.unit}</Text>
                    </View>
                  </View>
                )}
              />
            </View>
            {editMsg ? <Text className="text-xs text-destructive text-center px-5 pb-1">{editMsg}</Text> : null}
            <View className="px-5 pb-8 pt-3 gap-2">
              <Pressable onPress={handleSaveEdit} disabled={editSaving}
                className={`bg-primary py-3.5 rounded-2xl items-center ${editSaving ? 'opacity-60' : ''}`}>
                {editSaving ? <ActivityIndicator size="small" color="white" />
                  : <View className="flex-row items-center gap-2"><Save size={16} color="white" /><Text className="text-base font-bold text-white">保存修改</Text></View>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== 操作历史弹窗 ===== */}
      <Modal visible={!!historyOrderId} transparent animationType="slide" onRequestClose={() => setHistoryOrderId(null)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setHistoryOrderId(null)}>
          <Pressable onPress={() => {}} className="bg-background rounded-t-3xl overflow-hidden">
            <View className="items-center pt-3 pb-1"><View className="w-10 h-1 rounded-full bg-muted" /></View>
            <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border">
              <View className="flex-row items-center gap-2">
                <Clock3 size={16} color="#008060" />
                <Text className="text-base font-bold text-foreground">操作历史</Text>
              </View>
              <Pressable onPress={() => setHistoryOrderId(null)} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            <View style={{ maxHeight: 360 }}>
              {historyLoading ? (
                <View className="h-32 items-center justify-center">
                  <ActivityIndicator size="small" color="#008060" />
                </View>
              ) : historyLogs.length === 0 ? (
                <View className="h-32 items-center justify-center gap-2">
                  <Text className="text-3xl">📋</Text>
                  <Text className="text-muted-foreground text-sm">暂无操作记录</Text>
                </View>
              ) : (
                <FlatList
                  data={historyLogs}
                  keyExtractor={l => l.id}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 2, paddingBottom: 24 }}
                  renderItem={({ item: log, index }) => (
                    <View className="flex-row gap-3">
                      {/* 时间轴线 */}
                      <View className="items-center" style={{ width: 20 }}>
                        <View className="w-2.5 h-2.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                        {index < historyLogs.length - 1 ? <View className="w-px flex-1 bg-border mt-1" /> : null}
                      </View>
                      <View className="flex-1 pb-4 gap-0.5">
                        <Text className="text-sm font-semibold text-foreground">{log.action}</Text>
                        {log.operator_name ? (
                          <Text className="text-xs text-muted-foreground">操作人：{log.operator_name}</Text>
                        ) : null}
                        <Text className="text-xs text-muted-foreground">{fmtLogTime(log.created_at)}</Text>
                      </View>
                    </View>
                  )}
                />
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={shareSheetVisible} transparent animationType="slide" onRequestClose={() => setShareSheetVisible(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setShareSheetVisible(false)} />
        <View className="bg-card rounded-t-3xl" style={{ borderCurve: 'continuous' } as object}>
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-muted" />
          </View>
          <Text className="text-base font-bold text-foreground px-5 pt-2 pb-3">导出申购历史</Text>

          {/* 以文字形式分享 */}
          <Pressable onPress={handleShareText} disabled={actionLoading !== null} className="active:opacity-70">
            <View className="flex-row items-center gap-4 px-5 py-4">
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center' }}>
                {actionLoading === 'text' ? <ActivityIndicator size="small" color="#2E9D6A" /> : <MessageSquareText size={22} color="#2E9D6A" />}
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">以文字形式分享</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">{actionLoading === 'text' ? '正在生成...' : '调起系统分享面板，可选微信、短信等'}</Text>
              </View>
            </View>
          </Pressable>
          <View className="h-px bg-border mx-5" />

          {/* 以图片形式分享 */}
          <Pressable onPress={handleShareImage} disabled={actionLoading !== null} className="active:opacity-70">
            <View className="flex-row items-center gap-4 px-5 py-4">
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center' }}>
                {actionLoading === 'image' ? <ActivityIndicator size="small" color="#2E9D6A" /> : <ImageIcon size={22} color="#2E9D6A" />}
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">以图片形式分享</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">{actionLoading === 'image' ? '正在生成...' : '截取列表截图，通过系统面板发送'}</Text>
              </View>
            </View>
          </Pressable>
          <View className="h-px bg-border mx-5" />

          {/* 以 Excel 文档分享 */}
          <Pressable onPress={handleShareXlsx} disabled={actionLoading !== null} className="active:opacity-70">
            <View className="flex-row items-center gap-4 px-5 py-4">
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center' }}>
                {actionLoading === 'xlsx' ? <ActivityIndicator size="small" color="#2E9D6A" /> : <FileSpreadsheet size={22} color="#2E9D6A" />}
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">以Excel文档分享</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">{actionLoading === 'xlsx' ? '正在生成...' : '生成 Excel 文件，按食材分类汇总'}</Text>
              </View>
            </View>
          </Pressable>

          <View className="px-5 pt-2 pb-8">
            <Pressable
              onPress={() => setShareSheetVisible(false)}
              disabled={actionLoading !== null}
              style={{ height: 48, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 日期范围选择弹窗 */}
      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setDatePickerVisible(false)} />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-8">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground">
              {pickingField === 'start' ? '选择开始日期' : '选择结束日期'}
            </Text>
            <Pressable onPress={() => setDatePickerVisible(false)} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
              <X size={16} color="#6b7280" />
            </Pressable>
          </View>
          {pickingField === 'end' && (
            <View className="bg-primary/10 rounded-xl px-4 py-2 mb-3">
              <Text className="text-xs text-primary font-medium">开始日期：{fmtMD(rangeStart)}  请选择结束日期</Text>
            </View>
          )}
          <DateTimePicker
            mode="single"
            date={pickingField === 'start' ? rangeStart : rangeEnd}
            onChange={({ date }) => { if (date) { const d = new Date(date as string); if (pickingField === 'start') setRangeStart(d); else setRangeEnd(d); } }}
            styles={{ selected: { backgroundColor: '#E52222' }, selected_label: { color: '#fff' } }}
          />
          <Pressable
            className="bg-primary rounded-xl py-4 items-center mt-4 active:opacity-80"
            onPress={() => handlePickerConfirm(pickingField === 'start' ? rangeStart : rangeEnd)}
          >
            <Text className="text-white font-semibold text-base">
              {pickingField === 'start' ? '下一步：选结束日期' : '确认查询'}
            </Text>
          </Pressable>
        </View>
      </Modal>
      </SafeAreaView>
    </PermissionGuard>
  );
}
