import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, BarChart2, Calendar, X, Share2, MessageSquareText, Image as ImageIcon, FileSpreadsheet, ChevronRight, Trash2, Edit3, CheckSquare, Square, Layers } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getPurchaseSummary, getSuppliers, getCategories, getSubcategories, excludeSupplierFromSummary, excludeIngredientFromSummary, setSummaryQuantityOverride } from '@/db/api';
import type { PurchaseSummaryItem } from '@/db/api';
import { CATEGORY_COLORS } from '@/types/types';
import type { IngredientCategoryRecord, IngredientSubcategoryRecord } from '@/types/types';
import {
  getTimeSettings, buildDateRange, buildDayRange, buildWeekRange,
  type TimePeriodSettings, DEFAULT_TIME_SETTINGS,
} from '@/lib/timeSettings';
import { useProfile } from '@/context/ProfileContext';
import { GUEST_DENY_MSG } from '@/lib/guestGuard';
import { setShareSummaryPayload } from '@/lib/shareSummaryStore';

// ===== 时间段工具 =====
type TimePreset = '今天' | '午市' | '晚市' | '昨天' | '日期';
const PRESETS: TimePreset[] = ['今天', '午市', '晚市', '昨天', '日期'];

function computeDateRange(
  preset: TimePreset,
  settings: TimePeriodSettings,
  customDate: Date,
  rangeMode: 'day' | 'week',
): { start: string; end: string } | null {
  if (preset === '今天') return buildDayRange(new Date());
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

// ===== 左滑/长按食材行组件 =====
function SwipeableIngredientRow({
  item,
  color,
  isLast,
  onAction,
  multiSelectMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: PurchaseSummaryItem;
  color: { bg: string; text: string; dot: string };
  isLast: boolean;
  onAction: () => void;
  multiSelectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeTriggered = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => !multiSelectMode && Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderGrant: () => { swipeTriggered.current = false; },
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(Math.max(g.dx, -80));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40 && !swipeTriggered.current) {
          swipeTriggered.current = true;
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
          setTimeout(onAction, 80);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={{ transform: [{ translateX }] }}
      {...(multiSelectMode ? {} : panResponder.panHandlers)}
    >
      <Pressable
        onPress={multiSelectMode ? onToggleSelect : onAction}
        onLongPress={multiSelectMode ? undefined : onAction}
        delayLongPress={400}
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 12, paddingVertical: 8,
          backgroundColor: selected ? '#ecfdf5' : '#ffffff',
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: '#f1f5f9',
        }}
      >
        {/* 多选复选框 */}
        {multiSelectMode && (
          <View style={{ marginRight: 10 }}>
            {selected
              ? <CheckSquare size={18} color="#059669" />
              : <Square size={18} color="#d1d5db" />
            }
          </View>
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: color.dot, flexShrink: 0 }} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', flexShrink: 1 }} numberOfLines={1}>
            {item.ingredient_name}
          </Text>
          <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, backgroundColor: color.bg, flexShrink: 0 }}>
            <Text style={{ fontSize: 10, color: color.text }}>{item.category}</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#f1f5f9', marginLeft: 6, flexShrink: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] }}>
            {item.total_quantity}
            <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '400' }}> {item.unit}</Text>
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function PurchaseSummaryScreen() {
  const router = useRouter();
  const { isGuest } = useProfile();
  const [summary, setSummary] = useState<PurchaseSummaryItem[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  // 多选：空 Set 表示全选（等同于「全部」）
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  // 品类筛选
  const [categoryRecords, setCategoryRecords] = useState<IngredientCategoryRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // 子分类筛选（品类选中后加载）
  const [filterSubcategories, setFilterSubcategories] = useState<IngredientSubcategoryRecord[]>([]);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // 分享底部弹窗
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  // 操作状态
  const [actionLoading, setActionLoading] = useState<'text' | 'image' | 'xlsx' | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  // 删除相关状态
  const [deleteMenuVisible, setDeleteMenuVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'supplier' | 'ingredient'; supplier: string; ingredientId?: string; ingredientName?: string; itemCount: number } | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // 操作菜单（左滑/长按弹出，含"修改数量"和"删除"）
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ item: PurchaseSummaryItem } | null>(null);
  // 修改数量弹窗
  const [editQtyVisible, setEditQtyVisible] = useState(false);
  const [editQtyItem, setEditQtyItem] = useState<PurchaseSummaryItem | null>(null);
  const [editQtyText, setEditQtyText] = useState('');
  const [editQtyLoading, setEditQtyLoading] = useState(false);
  // 多选模式
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchQtyVisible, setBatchQtyVisible] = useState(false);
  const [batchQtyText, setBatchQtyText] = useState('');
  const [batchQtyLoading, setBatchQtyLoading] = useState(false);
  const [batchQtyError, setBatchQtyError] = useState('');
  // 访客提示
  const [guestMsg, setGuestMsg] = useState('');
  const showGuestDeny = () => {
    setGuestMsg(GUEST_DENY_MSG);
    setTimeout(() => setGuestMsg(''), 3000);
  };
  // 供应商筛选标签（常驻显示）


  // 时间筛选
  const [activePreset, setActivePreset] = useState<TimePreset>('今天');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [rangeMode, setRangeMode] = useState<'day' | 'week' | 'range'>('day');
  const [rangeStart, setRangeStart] = useState<Date>(new Date());
  const [rangeEnd, setRangeEnd] = useState<Date>(new Date());
  const [pickingField, setPickingField] = useState<'start' | 'end'>('start');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timeSettings, setTimeSettings] = useState<TimePeriodSettings>(DEFAULT_TIME_SETTINGS);
  // 当前实际生效的时间区间（传给品类详情页）
  const [appliedRange, setAppliedRange] = useState<{ start?: string; end?: string }>({});

  useEffect(() => { getTimeSettings().then(setTimeSettings); }, []);

  /**
   * 根据当前系统时间和时段设置，自动判断应选中哪个 preset
   * - 当前时间在午市范围内 → '午市'
   * - 当前时间在晚市范围内 → '晚市'
   * - 否则 → '全部'
   */
  const detectSmartPreset = (ts: TimePeriodSettings): TimePreset => {
    const now = new Date();
    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const lunchStart = toMinutes(ts.lunchStart);
    const lunchEnd = toMinutes(ts.lunchEnd);
    const dinnerStart = toMinutes(ts.dinnerStart);
    // 晚市结束支持 '24:00'，等效 1440
    const rawDinnerEnd = ts.dinnerEnd === '24:00' ? '23:59' : ts.dinnerEnd;
    const dinnerEnd = toMinutes(rawDinnerEnd) + (ts.dinnerEnd === '24:00' ? 1 : 0);

    if (lunchStart < lunchEnd && nowMins >= lunchStart && nowMins < lunchEnd) return '午市';
    if (dinnerStart < dinnerEnd && nowMins >= dinnerStart && nowMins < dinnerEnd) return '晚市';
    // 跨午夜晚市：dinnerStart > dinnerEnd（如 22:00-02:00）
    if (dinnerStart >= dinnerEnd && (nowMins >= dinnerStart || nowMins < dinnerEnd)) return '晚市';
    return '今天';
  };

  useFocusEffect(
    useCallback(() => {
      getTimeSettings().then((ts) => {
        setTimeSettings(ts);
        const smart = detectSmartPreset(ts);
        setActivePreset(smart);
        loadData(smart, ts, new Date(), 'day');
      });
    }, [])
  );

  const loadData = async (
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
      range = computeDateRange(preset, settings, date, mode as 'day' | 'week');
    }
    const [sups, data, cats] = await Promise.all([
      getSuppliers(),
      getPurchaseSummary(undefined, range?.start, range?.end),
      getCategories(),
    ]);
    setSuppliers(sups);
    setSummary(data);
    setCategoryRecords(cats);
    setAppliedRange({ start: range?.start, end: range?.end });
    setLoading(false);
  };

  const handlePreset = (preset: TimePreset) => {
    setActivePreset(preset);
    if (preset === '日期') {
      setPickingField('start');
      setDatePickerVisible(true);
      return;
    }
    loadData(preset, timeSettings, customDate, rangeMode);
  };

  // ===== 操作菜单（左滑/长按触发）=====
  const openActionMenu = (item: PurchaseSummaryItem) => {
    setActionTarget({ item });
    setActionMenuVisible(true);
  };

  // ===== 修改数量 =====
  const openEditQty = (item: PurchaseSummaryItem) => {
    setActionMenuVisible(false);
    setEditQtyItem(item);
    setEditQtyText(String(item.total_quantity));
    setEditQtyVisible(true);
  };

  const handleEditQtyConfirm = async () => {
    if (!editQtyItem) return;
    const num = parseFloat(editQtyText);
    if (isNaN(num) || num <= 0) return;
    setEditQtyLoading(true);
    try {
      await setSummaryQuantityOverride(
        editQtyItem.ingredient_id,
        num,
        appliedRange.start,
        appliedRange.end,
      );
      setStatusMsg('数量已修改');
      setTimeout(() => setStatusMsg(''), 2000);
      loadData(activePreset, timeSettings, customDate, rangeMode as 'day' | 'week', rangeStart, rangeEnd);
    } catch {
      setStatusMsg('修改失败');
      setTimeout(() => setStatusMsg(''), 2000);
    }
    setEditQtyLoading(false);
    setEditQtyVisible(false);
    setEditQtyItem(null);
  };

  const stepEditQty = (delta: number) => {
    const cur = parseFloat(editQtyText) || 0;
    const next = Math.max(0.5, Math.round((cur + delta) * 10) / 10);
    setEditQtyText(String(next));
  };

  // ===== 删除采购汇总记录 =====
  const openDeleteMenu = (type: 'supplier' | 'ingredient', supplier: string, ingredientId?: string, ingredientName?: string, itemCount = 1) => {
    setDeleteTarget({ type, supplier, ingredientId, ingredientName, itemCount });
    setDeleteMenuVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const range = appliedRange;
    try {
      if (deleteTarget.type === 'supplier') {
        await excludeSupplierFromSummary(deleteTarget.supplier, range.start, range.end);
      } else if (deleteTarget.ingredientId) {
        await excludeIngredientFromSummary(deleteTarget.ingredientId, range.start, range.end);
      }
      setStatusMsg('已删除');
      setTimeout(() => setStatusMsg(''), 2000);
      loadData(activePreset, timeSettings, customDate, rangeMode, rangeStart, rangeEnd);
    } catch (e) {
      setStatusMsg('删除失败');
      setTimeout(() => setStatusMsg(''), 2000);
    }
    setDeleteLoading(false);
    setDeleteConfirmVisible(false);
    setDeleteMenuVisible(false);
    setDeleteTarget(null);
  };

  const handlePickerConfirm = () => {
    if (rangeMode === 'range') {
      if (pickingField === 'start') {
        setPickingField('end');
        return;
      }
      setDatePickerVisible(false);
      setActivePreset('日期');
      loadData('日期', timeSettings, customDate, 'range', rangeStart, rangeEnd);
    } else {
      setDatePickerVisible(false);
      loadData('日期', timeSettings, customDate, rangeMode);
    }
  };

  const handleCategoryChange = async (cat: string | null) => {
    setSelectedCategory(cat);
    setSelectedSubcategoryId(null);
    if (!cat) { setFilterSubcategories([]); return; }
    const record = categoryRecords.find((c) => c.name === cat);
    if (!record) { setFilterSubcategories([]); return; }
    setSubLoading(true);
    const subs = await getSubcategories(record.id);
    setFilterSubcategories(subs);
    setSubLoading(false);
  };

  const filtered = summary.filter((s) => {
    if (selectedSuppliers.size > 0 && !selectedSuppliers.has(s.supplier)) return false;
    if (selectedCategory !== null && s.category !== selectedCategory) return false;
    if (selectedSubcategoryId !== null && s.subcategory_id !== selectedSubcategoryId) return false;
    return true;
  // 默认按申购数量降序
  }).sort((a, b) => b.total_quantity - a.total_quantity);

  // 按当前筛选结果中各分类的食材数量排序
  const sortedCategoryRecords = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of summary) {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
    return [...categoryRecords].sort((a, b) => {
      const ca = counts.get(a.name) || 0;
      const cb = counts.get(b.name) || 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name);
    });
  }, [categoryRecords, summary]);

  // 按当前筛选结果中各供应商的食材数量排序
  const sortedSuppliers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of summary) {
      counts.set(item.supplier, (counts.get(item.supplier) || 0) + 1);
    }
    return [...suppliers].sort((a, b) => {
      const ca = counts.get(a) || 0;
      const cb = counts.get(b) || 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b);
    });
  }, [suppliers, summary]);

  // 按供应商分组
  const grouped = filtered.reduce<Record<string, PurchaseSummaryItem[]>>((acc, item) => {
    if (!acc[item.supplier]) acc[item.supplier] = [];
    acc[item.supplier].push(item);
    return acc;
  }, {});

  const groupedList = Object.entries(grouped).map(([supplier, items]) => ({ supplier, items }));
  // 所有展平后的食材条目（批量操作用）
  const flatItems = groupedList.flatMap((g) => g.items);

  const categoryColors = CATEGORY_COLORS;

  const totalItems = filtered.length;
  const totalSuppliers = Object.keys(grouped).length;

  // 时间段标签展示
  const formatDateLabel = () => {
    if (rangeMode === 'range') {
      const fmtMD = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
      return `${fmtMD(rangeStart)}-${fmtMD(rangeEnd)}`;
    }
    if (rangeMode === 'week') {
      const day = customDate.getDay();
      const monday = new Date(customDate.getTime() - ((day === 0 ? 6 : day - 1) * 86400000));
      const sunday = new Date(monday.getTime() + 6 * 86400000);
      return `${monday.getMonth() + 1}/${monday.getDate()}~${sunday.getMonth() + 1}/${sunday.getDate()}`;
    }
    return `${customDate.getMonth() + 1}/${customDate.getDate()}`;
  };

  const presetLabel = activePreset === '日期' ? formatDateLabel() : activePreset;

  // ===== 生成分享文本（简洁纯文本格式，适合微信） =====
  const buildShareText = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeRange = activePreset === '今天' ? '今天' : presetLabel;
    const divider = '━━━━━━━━━━━━━━';
    let text = `${divider}\n采购汇总报表\n日期：${dateStr}  时段：${timeRange}\n共 ${totalItems} 种食材 / ${totalSuppliers} 个供应商\n${divider}\n`;
    for (const group of groupedList) {
      text += `\n【${group.supplier}】\n`;
      for (const item of group.items) {
        text += `• ${item.ingredient_name}：${item.total_quantity} ${item.unit}\n`;
      }
    }
    text += divider;
    return text;
  };

  // ===== 以文字形式分享：优先 React Native 原生 Share 面板，不支持时降级复制剪贴板 =====
  const handleShareText = async () => {
    if (isGuest) { showGuestDeny(); return; }
    setActionLoading('text');
    const text = buildShareText();
    setShareSheetVisible(false);
    try {
      if (process.env.EXPO_OS === 'web') {
        // Web 端：直接写剪贴板
        await Clipboard.setStringAsync(text);
        showMsg('✅ 已复制到剪贴板');
      } else {
        // Native：优先调起系统原生分享面板（包含微信、QQ、短信等图标）
        const result = await Share.share({ message: text, title: '采购汇总报表' });
        if (result.action === Share.dismissedAction) {
          // 用户手动关闭分享面板，不做额外处理
        }
      }
    } catch {
      // 原生分享不可用时降级复制到剪贴板
      try {
        await Clipboard.setStringAsync(text);
        showMsg('✅ 已复制，可手动粘贴分享');
      } catch {
        showMsg('❌ 操作失败，请重试');
      }
    }
    setActionLoading(null);
  };

  // ===== 以图片形式分享：跳转独立预览页，渲染完整长图，提供保存+分享 =====
  const handleShareImage = () => {
    if (isGuest) { showGuestDeny(); return; }
    setShareSheetVisible(false);
    // 将完整数据存入模块级 store，预览页消费后清除
    setShareSummaryPayload({
      groupedList: groupedList.map(g => ({
        supplier: g.supplier,
        items: g.items.map(i => ({
          ingredient_name: i.ingredient_name,
          total_quantity: i.total_quantity,
          unit: i.unit,
          category: i.category,
        })),
      })),
      presetLabel,
      totalItems,
      totalSuppliers,
    });
    router.push('/(app)/share-image-preview');
  };

  // ===== 以 Excel 文档分享（系统分享面板 application/xlsx，Expo 内部封装 FileProvider） =====
  const handleShareXlsx = async () => {
    if (isGuest) { showGuestDeny(); return; }
    setActionLoading('xlsx');
    setShareSheetVisible(false);
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const timeRange = activePreset === '今天' ? '今天' : presetLabel;

      const summaryRows: (string | number)[][] = [['供应商', '食材名称', '分类', '子分类', '数量', '单位']];
      for (const group of groupedList) {
        for (const item of group.items) {
          summaryRows.push([group.supplier, item.ingredient_name, item.category ?? '', item.subcategory ?? '', item.total_quantity, item.unit]);
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(summaryRows);
      ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 6 }];

      const infoRows = [
        ['报表名称', '采购汇总报表'],
        ['生成时间', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`],
        ['查询时段', timeRange],
        ['食材种数', totalItems],
        ['供应商数', totalSuppliers],
      ];
      const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
      wsInfo['!cols'] = [{ wch: 12 }, { wch: 24 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsInfo, '报表信息');
      XLSX.utils.book_append_sheet(wb, ws, '采购明细');
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      if (process.env.EXPO_OS === 'web') {
        const blob = new Blob(
          [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `采购汇总_${dateStr}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const filePath = `${FileSystem.cacheDirectory}采购汇总_${dateStr}.xlsx`;
        await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: '分享采购汇总 Excel',
          });
        } else {
          showMsg('❌ 设备不支持文件分享');
        }
      }
    } catch {
      showMsg('❌ 导出失败，请重试');
    }
    setActionLoading(null);
  };

  const showMsg = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // 多选：切换单条
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 批量修改数量
  const handleBatchQty = async () => {
    const qty = parseFloat(batchQtyText);
    if (isNaN(qty) || qty <= 0) { setBatchQtyError('请输入大于0的有效数量'); return; }
    setBatchQtyLoading(true); setBatchQtyError('');
    const selectedItems = flatItems.filter((i) => selectedIds.has(i.ingredient_id));
    for (const item of selectedItems) {
      await setSummaryQuantityOverride(
        item.ingredient_id,
        qty,
        appliedRange.start ?? undefined,
        appliedRange.end ?? undefined,
      );
    }
    setBatchQtyLoading(false);
    setBatchQtyVisible(false);
    setBatchQtyText(''); setBatchQtyError('');
    setMultiSelectMode(false); setSelectedIds(new Set());
    showMsg(`✅ 已批量修改 ${selectedItems.length} 条食材数量`);
    // 重新加载数据
    loadData(activePreset, timeSettings, customDate, rangeMode, rangeStart, rangeEnd);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 — 标题内嵌品类/供应商统计数据 */}
      <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        {/* 标题 + 统计徽章 */}
        <View className="flex-1 flex-row items-center gap-1.5 flex-shrink">
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>采购汇总</Text>
          {totalItems > 0 && !multiSelectMode && (
            <Text className="text-xs text-muted-foreground font-medium" numberOfLines={1}>
              {totalItems}品类 · {totalSuppliers}供应商
            </Text>
          )}
          {multiSelectMode && (
            <Text className="text-xs text-primary font-medium">已选 {selectedIds.size} 条</Text>
          )}
        </View>
        {/* 多选 / 取消 按钮 */}
        {!multiSelectMode ? (
          <Pressable
            onPress={() => { setMultiSelectMode(true); setSelectedIds(new Set()); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' }}
          >
            <Layers size={14} color="#374151" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>多选</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { setMultiSelectMode(false); setSelectedIds(new Set()); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fee2e2' }}
          >
            <X size={14} color="#dc2626" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#dc2626' }}>取消</Text>
          </Pressable>
        )}
        {/* 分享按钮：多选模式隐藏 */}
        {!multiSelectMode && (
          <Pressable
            onPress={() => isGuest ? showGuestDeny() : setShareSheetVisible(true)}
            disabled={loading || groupedList.length === 0}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: isGuest ? '#9ca3af' : '#059669',
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
              opacity: (loading || groupedList.length === 0) ? 0.4 : 1,
            }}
          >
            <Share2 size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{isGuest ? '仅浏览' : '分享'}</Text>
          </Pressable>
        )}
      </View>

      {/* 访客提示 banner */}
      {isGuest && (
        <View className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <Text className="text-amber-700 text-xs text-center">👀 访客模式：仅可浏览，无法导出或分享数据</Text>
        </View>
      )}
      {guestMsg ? (
        <View className="bg-red-50 border-b border-red-200 px-4 py-2.5">
          <Text className="text-red-600 text-xs text-center">{guestMsg}</Text>
        </View>
      ) : null}

      {/* 操作状态提示 */}
      {statusMsg ? (
        <View className="mx-4 mt-2 px-3 py-2 bg-primary/10 rounded-xl">
          <Text className="text-primary text-sm text-center font-medium">{statusMsg}</Text>
        </View>
      ) : null}

      {/* 第一行：时间筛选标签（常驻） */}
      <View className="px-3 pt-2 pb-0 flex-row items-center gap-1.5">
        {PRESETS.map((p) => {
          const isActive = activePreset === p;
          const label = p === '日期' && isActive ? presetLabel : p;
          return (
            <Pressable
              key={p}
              onPress={() => handlePreset(p)}
              className={`flex-1 py-1.5 rounded-lg items-center flex-row justify-center gap-0.5 ${isActive ? 'bg-primary' : 'bg-card border border-border'}`}
              style={{ boxShadow: isActive ? [] : [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0,0,0,0.04)' }] } as object}
            >
              {p === '日期' && <Calendar size={11} color={isActive ? '#fff' : '#9ca3af'} />}
              <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? '#fff' : '#6b7280' }} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 品类筛选行 — 两排水平滚动，按当前结果数量排序 */}
      {sortedCategoryRecords.length > 0 && (
        <View style={{ backgroundColor: '#f0f4f2', marginTop: 4, paddingVertical: 8, paddingBottom: 2 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
            <View style={{ flexDirection: 'column', gap: 7 }}>
              {(() => {
                const allItems = [{ id: '__all__', name: '全部' }, ...sortedCategoryRecords.map((c) => ({ id: c.id, name: c.name }))];
                const mid = Math.ceil(allItems.length / 2);
                const rows = [allItems.slice(0, mid), allItems.slice(mid)];
                return rows.map((row, ri) => (
                  <View key={ri} style={{ flexDirection: 'row', gap: 7 }}>
                    {row.map((item) => {
                      const isSelected = item.id === '__all__' ? selectedCategory === null : selectedCategory === item.name;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => handleCategoryChange(item.id === '__all__' ? null : item.name)}
                          style={{
                            paddingHorizontal: 13, paddingVertical: 5, borderRadius: 999,
                            backgroundColor: isSelected ? '#2E9D6A' : '#e4ede9',
                            borderWidth: 1, borderColor: isSelected ? '#1e7a52' : '#c8d9d3',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? '#fff' : '#1f4d3a' }}>
                            {item.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ));
              })()}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 子分类筛选行（选中品类且有子分类时显示） */}
      {selectedCategory !== null && (subLoading || filterSubcategories.length > 0) && (
        <View style={{ backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          {subLoading ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <ActivityIndicator size="small" color="#059669" />
            </View>
          ) : (
            <FlatList
              horizontal
              data={[{ id: '__all__', name: '不限' }, ...filterSubcategories.map((s) => ({ id: s.id, name: s.name }))]}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 7 }}
              renderItem={({ item }) => {
                const isSelected = item.id === '__all__' ? selectedSubcategoryId === null : selectedSubcategoryId === item.id;
                return (
                  <Pressable
                    onPress={() => setSelectedSubcategoryId(item.id === '__all__' ? null : item.id)}
                    style={{
                      paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999,
                      backgroundColor: isSelected ? '#059669' : 'transparent',
                      borderWidth: 1.5, borderColor: isSelected ? '#047857' : '#c8d9d3',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? '#fff' : '#6b7280' }}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      )}

      {/* 供应商筛选标签 — 两排水平滚动，按当前结果数量排序 */}
      <View style={{ backgroundColor: '#f0f4f2', marginTop: 6, paddingVertical: 8, paddingBottom: 2 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
          <View style={{ flexDirection: 'column', gap: 7 }}>
            {(() => {
              const allItems = ['全部', ...sortedSuppliers];
              const mid = Math.ceil(allItems.length / 2);
              const rows = [allItems.slice(0, mid), allItems.slice(mid)];
              return rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: 7 }}>
                  {row.map((item) => {
                    const isAll = item === '全部';
                    const isSelected = isAll
                      ? selectedSuppliers.size === 0
                      : selectedSuppliers.has(item);
                    return (
                      <Pressable
                        key={item}
                        onPress={() => {
                          if (isAll) {
                            setSelectedSuppliers(new Set());
                          } else {
                            setSelectedSuppliers((prev) => {
                              const next = new Set(prev);
                              if (next.has(item)) {
                                next.delete(item);
                              } else {
                                next.add(item);
                              }
                              return next;
                            });
                          }
                        }}
                        style={{
                          paddingHorizontal: 13, paddingVertical: 5, borderRadius: 999,
                          backgroundColor: isSelected ? '#059669' : '#e4ede9',
                          borderWidth: 1,
                          borderColor: isSelected ? '#047857' : '#c8d9d3',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? '#fff' : '#1f4d3a' }}>
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ));
            })()}
          </View>
        </ScrollView>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : groupedList.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <BarChart2 size={48} color="#d1d5db" />
          <Text className="text-muted-foreground">暂无采购汇总数据</Text>
        </View>
      ) : (
        /* collapsable={false} 确保 Android 上 ViewShot 能抓到 */
        <View collapsable={false} className="flex-1">
          <FlatList
            data={groupedList}
            keyExtractor={(item) => item.supplier}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 24, gap: 8 }}
            renderItem={({ item: group }) => (
              <View
                className="bg-card rounded-xl overflow-hidden"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.07)' }], borderCurve: 'continuous' } as object}
              >
                {/* 品类标题行 — 压缩 padding */}
                <Pressable
                  onPress={() => {
                    const params: Record<string, string> = { supplier: group.supplier };
                    if (appliedRange.start) params.start = appliedRange.start;
                    if (appliedRange.end) params.end = appliedRange.end;
                    router.push({ pathname: '/(app)/category-detail', params });
                  }}
                  onLongPress={() => openDeleteMenu('supplier', group.supplier, undefined, undefined, group.items.length)}
                  delayLongPress={400}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 12, paddingVertical: 8,
                    backgroundColor: '#f9fafb',
                    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                  }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#059669' }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', flex: 1 }}>{group.supplier}</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginRight: 2 }}>{group.items.length} 种</Text>
                  <ChevronRight size={14} color="#9ca3af" />
                </Pressable>
                {/* 食材行 — 压缩 padding，字体微调，支持左滑/长按操作 */}
                <View>
                  {group.items.map((item, index) => {
                    const color = categoryColors[item.category] ?? { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' };
                    return (
                      <SwipeableIngredientRow
                        key={item.ingredient_id}
                        item={item}
                        color={color}
                        isLast={index === group.items.length - 1}
                        onAction={() => openActionMenu(item)}
                        multiSelectMode={multiSelectMode}
                        selected={selectedIds.has(item.ingredient_id)}
                        onToggleSelect={() => toggleSelect(item.ingredient_id)}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* ===== 多选底部操作栏 ===== */}
      {multiSelectMode && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
          paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
          flexDirection: 'row', alignItems: 'center', gap: 12,
          boxShadow: [{ offsetX: 0, offsetY: -2, blurRadius: 8, color: 'rgba(0,0,0,0.08)' }],
        } as object}>
          <Text style={{ flex: 1, fontSize: 14, color: '#6b7280' }}>
            已选 <Text style={{ color: '#059669', fontWeight: '700' }}>{selectedIds.size}</Text> 条
          </Text>
          <Pressable
            onPress={() => {
              // 全选 / 取消全选
              if (selectedIds.size === flatItems.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(flatItems.map((i) => i.ingredient_id)));
              }
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
              {selectedIds.size === flatItems.length ? '取消全选' : '全选'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (selectedIds.size === 0) { showMsg('请先勾选食材'); return; }
              setBatchQtyText(''); setBatchQtyError(''); setBatchQtyVisible(true);
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
            }}
          >
            <Edit3 size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>批量改数量</Text>
          </Pressable>
        </View>
      )}

      {/* ===== 批量修改数量弹窗 ===== */}
      <Modal visible={batchQtyVisible} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 }}>批量改数量</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              将统一修改已选 <Text style={{ color: '#059669', fontWeight: '700' }}>{selectedIds.size}</Text> 条食材的数量
            </Text>
            <TextInput
              value={batchQtyText}
              onChangeText={setBatchQtyText}
              placeholder="输入新数量（支持小数，步长0.5）"
              keyboardType="numeric"
              style={{
                borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 15, color: '#111827', marginBottom: 4,
              }}
              placeholderTextColor="#9ca3af"
            />
            {batchQtyError ? (
              <Text style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{batchQtyError}</Text>
            ) : <View style={{ height: 12 }} />}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <Pressable
                onPress={() => { setBatchQtyVisible(false); setBatchQtyText(''); setBatchQtyError(''); }}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 12, backgroundColor: '#f3f4f6', alignItems: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleBatchQty}
                disabled={batchQtyLoading}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 12, backgroundColor: '#059669', alignItems: 'center', opacity: batchQtyLoading ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>
                  {batchQtyLoading ? '保存中...' : '确认修改'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 分享底部弹窗 ===== */}
      <Modal visible={shareSheetVisible} transparent animationType="slide" onRequestClose={() => setShareSheetVisible(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setShareSheetVisible(false)} />
        <View className="bg-card rounded-t-3xl" style={{ borderCurve: 'continuous' } as object}>
          {/* 拖动条 */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-muted" />
          </View>
          <Text className="text-base font-bold text-foreground px-5 pt-2 pb-3">分享采购汇总</Text>

          {/* 以文字形式分享 */}
          <Pressable
            onPress={handleShareText}
            disabled={actionLoading !== null}
            className="active:opacity-70"
          >
            <View className="flex-row items-center gap-4 px-5 py-4">
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center' }}>
                {actionLoading === 'text'
                  ? <ActivityIndicator size="small" color="#2E9D6A" />
                  : <MessageSquareText size={22} color="#2E9D6A" />
                }
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">以文字形式分享</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {actionLoading === 'text' ? '正在生成...' : '调起系统分享面板，可选微信、短信等'}
                </Text>
              </View>
            </View>
          </Pressable>
          <View className="h-px bg-border mx-5" />

          {/* 以图片形式分享 */}
          <Pressable
            onPress={handleShareImage}
            disabled={actionLoading !== null}
            className="active:opacity-70"
          >
            <View className="flex-row items-center gap-4 px-5 py-4">
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center' }}>
                {actionLoading === 'image'
                  ? <ActivityIndicator size="small" color="#2E9D6A" />
                  : <ImageIcon size={22} color="#2E9D6A" />
                }
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">以图片形式分享</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {actionLoading === 'image' ? '正在生成...' : '生成完整长图，可保存或发送'}
                </Text>
              </View>
            </View>
          </Pressable>
          <View className="h-px bg-border mx-5" />

          {/* 以 Excel 文档分享 */}
          <Pressable
            onPress={handleShareXlsx}
            disabled={actionLoading !== null}
            className="active:opacity-70"
          >
            <View className="flex-row items-center gap-4 px-5 py-4">
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center' }}>
                {actionLoading === 'xlsx'
                  ? <ActivityIndicator size="small" color="#2E9D6A" />
                  : <FileSpreadsheet size={22} color="#2E9D6A" />
                }
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">以Excel文档分享</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {actionLoading === 'xlsx' ? '正在生成...' : '生成 Excel 文件，可发送或用 WPS 打开'}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* 取消 */}
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

      {/* ===== 食材行操作菜单（左滑/长按触发）===== */}
      <Modal visible={actionMenuVisible} transparent animationType="slide" onRequestClose={() => setActionMenuVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setActionMenuVisible(false)} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
            {actionTarget?.item.ingredient_name}
          </Text>

          {/* 修改数量 */}
          <Pressable
            onPress={() => actionTarget && openEditQty(actionTarget.item)}
            className="active:opacity-70"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center' }}>
                <Edit3 size={20} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>修改数量</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  当前：{actionTarget?.item.total_quantity} {actionTarget?.item.unit}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* 删除 */}
          <Pressable
            onPress={() => {
              if (!actionTarget) return;
              setActionMenuVisible(false);
              setDeleteTarget({ type: 'ingredient', supplier: actionTarget.item.supplier, ingredientId: actionTarget.item.ingredient_id, ingredientName: actionTarget.item.ingredient_name, itemCount: 1 });
              setDeleteConfirmVisible(true);
            }}
            className="active:opacity-70"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={20} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#ef4444' }}>删除</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>从采购汇总中移除该条记录</Text>
              </View>
            </View>
          </Pressable>

          {/* 取消 */}
          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
            <Pressable
              onPress={() => setActionMenuVisible(false)}
              style={{ height: 48, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ===== 修改数量弹窗 ===== */}
      <Modal visible={editQtyVisible} transparent animationType="fade" onRequestClose={() => setEditQtyVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 }}>修改采购数量</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              {editQtyItem?.ingredient_name}
            </Text>

            {/* 步进器 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              <Pressable
                onPress={() => stepEditQty(-0.5)}
                style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 22, color: '#374151', lineHeight: 26 }}>−</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                <TextInput
                  value={editQtyText}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9.]/g, '');
                    setEditQtyText(cleaned);
                  }}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={{
                    width: 80, height: 44, borderRadius: 10,
                    backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#059669',
                    textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#111827',
                  }}
                />
                <Text style={{ fontSize: 13, color: '#6b7280', marginLeft: 8 }}>{editQtyItem?.unit}</Text>
              </View>
              <Pressable
                onPress={() => stepEditQty(0.5)}
                style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 22, color: '#fff', lineHeight: 26 }}>+</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => { setEditQtyVisible(false); setEditQtyItem(null); }}
                style={{ flex: 1, height: 46, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleEditQtyConfirm}
                disabled={editQtyLoading}
                style={{ flex: 1, height: 46, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', opacity: editQtyLoading ? 0.6 : 1 }}
              >
                {editQtyLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>确认修改</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 删除操作菜单弹窗 ===== */}
      <Modal visible={deleteMenuVisible} transparent animationType="slide" onRequestClose={() => setDeleteMenuVisible(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setDeleteMenuVisible(false)} />
        <View className="bg-card rounded-t-3xl" style={{ borderCurve: 'continuous' } as object}>
          <View className="items-center pt-3 pb-1"><View className="w-10 h-1 rounded-full bg-muted" /></View>
          <Text className="text-base font-bold text-foreground px-5 pt-2 pb-3">
            {deleteTarget?.type === 'supplier' ? `删除供应商“${deleteTarget.supplier}”` : `删除“${deleteTarget?.ingredientName}”`}
          </Text>
          <Pressable
            onPress={() => {
              setDeleteMenuVisible(false);
              setDeleteConfirmVisible(true);
            }}
            className="active:opacity-70"
          >
            <View className="flex-row items-center gap-4 px-5 py-4">
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={22} color="#ef4444" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-destructive">删除</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {deleteTarget?.type === 'supplier' && (deleteTarget?.itemCount ?? 0) > 1
                    ? `该供应商包含 ${deleteTarget?.itemCount} 种食材，将一并从汇总中移除`
                    : '从采购汇总中移除该条记录'}
                </Text>
              </View>
            </View>
          </Pressable>
          <View className="px-5 pt-2 pb-8">
            <Pressable
              onPress={() => setDeleteMenuVisible(false)}
              style={{ height: 48, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ===== 删除确认弹窗 ===== */}
      <Modal visible={deleteConfirmVisible} transparent animationType="fade" onRequestClose={() => setDeleteConfirmVisible(false)}>
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-card rounded-2xl w-full max-w-sm p-5" style={{ borderCurve: 'continuous' } as object}>
            <Text className="text-lg font-bold text-foreground text-center mb-2">确定删除这条采购记录？</Text>
            <Text className="text-sm text-muted-foreground text-center mb-5">
              {deleteTarget?.type === 'supplier' && (deleteTarget?.itemCount ?? 0) > 1
                ? `该记录包含 ${deleteTarget?.itemCount} 种食材，是否全部删除？删除后不可恢复。`
                : '删除后不可恢复，该条记录将从采购汇总中移除。'}
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setDeleteConfirmVisible(false)}
                style={{ flex: 1, height: 44, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteConfirm}
                disabled={deleteLoading}
                style={{ flex: 1, height: 44, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', opacity: deleteLoading ? 0.6 : 1 }}
              >
                {deleteLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>确认删除</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 日期选择器弹窗 ===== */}
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

            {/* 查询周期切换 */}
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
                onPress={handlePickerConfirm}
                className="active:opacity-80"
                style={{
                  height: 48, borderRadius: 8, backgroundColor: '#2E9D6A',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                  {rangeMode === 'range' && pickingField === 'start' ? '下一步：选结束日期' : '确认查询'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
