/**
 * 考勤排休主页
 * Tab: 排班日历（长按配置）| 我的申请 | 出勤统计
 */
import React, { useCallback, useRef, useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ChevronLeft, ChevronRight, Plus, Settings, X, Check,
  TriangleAlert, CalendarDays,
} from 'lucide-react-native';
import DateTimePicker, { useDefaultStyles } from 'react-native-ui-datepicker';
import { supabase } from '@/client/supabase';
import { getUserPermsByPosition } from '@/db/api';
import PermissionGuard from '@/components/PermissionGuard';

// ── 9 种休假/考勤类型 ─────────────────────────────────────
export type RestType =
  | 'full' | 'am' | 'pm'
  | 'late' | 'early' | 'absent'
  | 'sick' | 'personal' | 'overtime';

export const REST_TYPES: {
  value: RestType; label: string; dot: string; text: string; bg: string; group: string;
}[] = [
  { value: 'full',     label: '全天休',   dot: '#ef4444', text: '#ef4444', bg: '#fee2e2', group: '休假' },
  { value: 'am',       label: '上午半休', dot: '#f97316', text: '#f97316', bg: '#fff7ed', group: '休假' },
  { value: 'pm',       label: '下午半休', dot: '#3b82f6', text: '#3b82f6', bg: '#eff6ff', group: '休假' },
  { value: 'late',     label: '迟到',     dot: '#f59e0b', text: '#d97706', bg: '#fffbeb', group: '异常' },
  { value: 'early',    label: '早退',     dot: '#a855f7', text: '#9333ea', bg: '#faf5ff', group: '异常' },
  { value: 'absent',   label: '旷工',     dot: '#dc2626', text: '#dc2626', bg: '#fef2f2', group: '异常' },
  { value: 'sick',     label: '病假',     dot: '#06b6d4', text: '#0891b2', bg: '#ecfeff', group: '异常' },
  { value: 'personal', label: '事假',     dot: '#8b5cf6', text: '#7c3aed', bg: '#f5f3ff', group: '异常' },
  { value: 'overtime', label: '加班',     dot: '#059669', text: '#059669', bg: '#f0fdf4', group: '加班' },
];
export const REST_MAP = Object.fromEntries(REST_TYPES.map(r => [r.value, r])) as Record<RestType, typeof REST_TYPES[0]>;

// 备注必填类型
export const REASON_REQUIRED: RestType[] = ['sick', 'personal', 'absent'];

// ── 类型 ─────────────────────────────────────────────────
interface RestRecord {
  id: string;
  user_id: string;
  rest_date: string;
  rest_type: RestType;
  reason: string | null;
  user?: { display_name: string | null; position: string | null };
}
interface RestRequest {
  id: string;
  user_id: string;
  rest_date: string;
  rest_type: RestType;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
}

// ── 工具 ─────────────────────────────────────────────────
export function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const STATUS_STYLE: Record<string, { text: string; color: string; bg: string }> = {
  pending:  { text: '待审核', color: '#d97706', bg: '#fffbeb' },
  approved: { text: '已通过', color: '#16a34a', bg: '#f0fdf4' },
  rejected: { text: '已拒绝', color: '#dc2626', bg: '#fef2f2' },
};

// ── DatePicker Modal ──────────────────────────────────────
export function DatePickerModal({
  value, onConfirm, onClose,
}: { value: string; onConfirm: (v: string) => void; onClose: () => void }) {
  const defaultStyles = useDefaultStyles();
  const [picked, setPicked] = useState<Date>(() => {
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date() : d;
  });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} className="bg-card rounded-t-3xl pt-4 pb-8 px-4">
          <View className="flex-row items-center justify-between pb-3 border-b border-border">
            <Pressable onPress={onClose} className="px-4 py-2">
              <Text className="text-sm text-muted-foreground">取消</Text>
            </Pressable>
            <Text className="text-base font-bold text-foreground">选择日期</Text>
            <Pressable onPress={() => { onConfirm(toYMD(picked)); onClose(); }} className="px-4 py-2">
              <Text className="text-sm font-bold" style={{ color: '#ea580c' }}>确认</Text>
            </Pressable>
          </View>
          <DateTimePicker
            mode="single"
            date={picked}
            onChange={({ date }) => { if (date) setPicked(new Date(date as Date)); }}
            styles={defaultStyles}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── 主组件 ────────────────────────────────────────────────
export default function AttendancePage() {
  const router = useRouter();
  type TabKey = 'calendar' | 'requests' | 'stats';
  const [tab, setTab] = useState<TabKey>('calendar');
  const [canManage, setCanManage] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);
      const perms = await getUserPermsByPosition(user.id);
      setCanManage(perms.includes('排休管理'));
    })();
  }, []);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'calendar', label: '排休表' },
    { key: 'requests', label: '我的申请' },
    { key: 'stats',    label: '出勤统计' },
  ];

  return (
    <PermissionGuard permissions={['排休申请', '排休管理']} title="考勤排休">
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ChevronLeft size={22} color="#374151" />
        </Pressable>
        <Text className="flex-1 text-center text-lg font-bold text-foreground">考勤排休</Text>
        {canManage ? (
          <Pressable onPress={() => router.push('/(app)/rest-manage')} className="w-10 h-10 items-center justify-center">
            <Settings size={20} color="#ea580c" />
          </Pressable>
        ) : <View className="w-10" />}
      </View>

      <View className="flex-row mx-4 mb-2 bg-muted rounded-xl p-1">
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)}
            className="flex-1 py-2 rounded-lg items-center"
            style={{ backgroundColor: tab === t.key ? '#fff' : 'transparent' }}>
            <Text className="text-sm font-semibold"
              style={{ color: tab === t.key ? '#ea580c' : '#6b7280' }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'calendar' && <CalendarTab canManage={canManage} />}
      {tab === 'requests' && <MyRequestsTab myUserId={myUserId} canManage={canManage} />}
      {tab === 'stats'    && <StatsTab myUserId={myUserId} />}
      </SafeAreaView>
    </PermissionGuard>
  );
}

// ── Tab 1：排班日历 ───────────────────────────────────────
function CalendarTab({ canManage }: { canManage: boolean }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [records, setRecords]       = useState<RestRecord[]>([]);
  const [noRestDays, setNoRestDays] = useState<string[]>([]);
  const [notice, setNotice] = useState('如有调休，服从安排');
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [configDate, setConfigDate]   = useState<string | null>(null); // 长按触发配置
  const [showApply, setShowApply]     = useState(false);
  const scrollingRef = useRef(false);
  const { width } = useWindowDimensions();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const s = `${year}-${pad(month)}-01`;
      const e = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
      const [recRes, profRes, nrdRes, cfgRes] = await Promise.all([
        supabase.from('rest_schedule')
          .select('id,user_id,rest_date,rest_type,reason')
          .gte('rest_date', s).lte('rest_date', e).order('rest_date'),
        supabase.from('profiles').select('id,display_name,position'),
        supabase.from('no_rest_days').select('date').gte('date', s).lte('date', e),
        supabase.from('app_config').select('value').eq('key', 'rest_notice').maybeSingle(),
      ]);
      // 构建 user_id -> profile 映射，解决外键引用 auth.users 导致的关联查询失效
      const profMap = new Map<string, { display_name: string | null; position: string | null }>();
      if (profRes.data) {
        for (const p of profRes.data as { id: string; display_name: string | null; position: string | null }[]) {
          profMap.set(p.id, { display_name: p.display_name, position: p.position });
        }
      }
      if (recRes.data) {
        setRecords(recRes.data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          user_id: r.user_id as string,
          rest_date: r.rest_date as string,
          rest_type: r.rest_type as RestType,
          reason: r.reason as string | null,
          user: profMap.get(r.user_id as string),
        })));
      }
      if (nrdRes.data) setNoRestDays(nrdRes.data.map((d: { date: string }) => d.date));
      if (cfgRes.data?.value) setNotice(cfgRes.data.value as string);
    } catch { /* 静默 */ } finally { setLoading(false); }
  }, [year, month]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); setSelectedDate(null); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); setSelectedDate(null); };

  const byDate = records.reduce<Record<string, RestRecord[]>>((acc, r) => {
    (acc[r.rest_date] = acc[r.rest_date] || []).push(r); return acc;
  }, {});

  const todayStr = toYMD(today);
  const cellW = Math.max(48, Math.floor((width - 32) / 7));

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const selectedRecs = selectedDate ? (byDate[selectedDate] ?? []) : [];

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 40 }}
      onScrollBeginDrag={() => { scrollingRef.current = true; }}
      onScrollEndDrag={() => { scrollingRef.current = false; }}
      onMomentumScrollEnd={() => { scrollingRef.current = false; }}
    >
      {/* 提示条 */}
      <View className="mx-4 mt-1 mb-3 flex-row items-center gap-2 px-4 py-3 rounded-xl"
        style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }}>
        <TriangleAlert size={14} color="#d97706" />
        <Text className="flex-1 text-xs" style={{ color: '#92400e' }}>{notice}</Text>
      </View>

      {/* 申请按钮 */}
      <Pressable onPress={() => setShowApply(true)}
        className="mx-4 mb-3 py-3 rounded-xl flex-row items-center justify-center gap-2"
        style={{ backgroundColor: '#ea580c' }}>
        <Plus size={16} color="#fff" />
        <Text className="text-sm font-bold text-white">申请请假 / 调休</Text>
      </Pressable>

      {/* 图例 */}
      <View className="flex-row flex-wrap gap-2 px-5 mb-3">
        {REST_TYPES.map(rt => (
          <View key={rt.value} className="flex-row items-center gap-1">
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: rt.dot }} />
            <Text className="text-xs text-muted-foreground">{rt.label}</Text>
          </View>
        ))}
        <View className="flex-row items-center gap-1">
          <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#ef4444', opacity: 0.3 }} />
          <Text className="text-xs text-muted-foreground">全员不休日</Text>
        </View>
      </View>

      {/* 月份切换 */}
      <View className="flex-row items-center justify-center gap-6 mb-3">
        <Pressable onPress={prevMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronLeft size={18} color="#374151" />
        </Pressable>
        <View className="items-center">
          <Text className="text-lg font-bold text-foreground">{year}年 {month}月</Text>
          {(year !== today.getFullYear() || month !== today.getMonth() + 1) && (
            <Pressable onPress={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setSelectedDate(null); }}>
              <Text className="text-xs font-medium" style={{ color: '#ea580c' }}>回到今天</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={nextMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronRight size={18} color="#374151" />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator size="large" color="#ea580c" className="mt-8" /> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: width - 32, paddingHorizontal: 0 }}>
            {/* 星期头 */}
            <View className="flex-row mb-1">
              {WEEK_LABELS.map((w, i) => (
                <View key={w} style={{ width: cellW }} className="items-center py-1">
                  <Text className="text-xs font-semibold" style={{ color: i === 0 || i === 6 ? '#ef4444' : '#6b7280' }}>{w}</Text>
                </View>
              ))}
            </View>
            {/* 日期格 */}
            {rows.map((row, ri) => (
              <View key={ri} className="flex-row" style={{ alignItems: 'flex-start' }}>
                {row.map((day, ci) => {
                  if (!day) return <View key={ci} style={{ width: cellW, minHeight: 92 }} />;
                  const ds = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const dayRecs = byDate[ds] ?? [];
                  const noRest  = noRestDays.includes(ds);
                  const isToday = ds === todayStr;
                  const isSel   = ds === selectedDate;
                  const isWknd  = ci === 0 || ci === 6;
                  return (
                    <Pressable
                      key={ci}
                      onPress={() => setSelectedDate(prev => prev === ds ? null : ds)}
                      onLongPress={() => {
                        if (!scrollingRef.current && canManage) setConfigDate(ds);
                      }}
                      delayLongPress={500}
                      style={{
                        width: cellW, minHeight: 92,
                        backgroundColor: noRest ? '#fee2e2' : isSel ? '#fff7ed' : 'transparent',
                        borderWidth: isSel ? 1.5 : 0, borderColor: isSel ? '#ea580c' : 'transparent',
                        borderRadius: 8,
                        paddingBottom: 4,
                      }}>
                      <View className="items-center pt-1.5">
                        <View className="w-6 h-6 items-center justify-center"
                          style={{ borderRadius: 12, backgroundColor: isToday ? '#ea580c' : 'transparent' }}>
                          <Text className="text-sm font-bold"
                            style={{ color: isToday ? '#fff' : isWknd ? '#ef4444' : '#111827' }}>{day}</Text>
                        </View>
                      </View>
                      {noRest && (
                        <Text className="text-center font-bold" style={{ color: '#dc2626', fontSize: 9, marginTop: 1, marginBottom: 1 }}>
                          全员不休
                        </Text>
                      )}
                      <View className="px-0.5" style={{ gap: 2, marginTop: noRest ? 0 : 2 }}>
                        {dayRecs.slice(0, 3).map(r => {
                          const rt = REST_MAP[r.rest_type];
                          return (
                            <View key={r.id} className="flex-row items-center" style={{ gap: 2 }}>
                              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: rt?.dot ?? '#374151', flexShrink: 0 }} />
                              <Text numberOfLines={1} style={{ fontSize: 9, color: '#374151', lineHeight: 11, flex: 1 }}>
                                {r.user?.display_name || '?'}
                              </Text>
                            </View>
                          );
                        })}
                        {dayRecs.length > 3 && (
                          <Text className="text-center" style={{ fontSize: 8.5, color: '#9ca3af', lineHeight: 11 }}>+{dayRecs.length - 3}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* 长按提示（有管理权限） */}
      {canManage && (
        <View className="mx-4 mt-3 flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-muted">
          <CalendarDays size={13} color="#9ca3af" />
          <Text className="text-xs text-muted-foreground">长按日期格可快速添加排休记录</Text>
        </View>
      )}

      {/* 选中日期详情 */}
      {selectedDate && (
        <View className="mx-4 mt-4 rounded-2xl bg-card overflow-hidden"
          style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
          <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
            <Text className="text-sm font-bold text-foreground">{selectedDate.replace(/-/g,'/')} 排休详情</Text>
            <Text className="text-xs text-muted-foreground">{selectedRecs.length} 人</Text>
          </View>
          {noRestDays.includes(selectedDate) && (
            <View className="px-4 py-2 flex-row items-center gap-2" style={{ backgroundColor: '#fee2e2' }}>
              <View className="w-2 h-2 rounded-full bg-red-500" />
              <Text className="text-xs font-semibold text-red-700">全员不休日</Text>
            </View>
          )}
          {selectedRecs.length === 0 ? (
            <View className="px-4 py-5 items-center">
              <Text className="text-sm text-muted-foreground">当天无排休记录</Text>
            </View>
          ) : (
            <View className="px-4 py-3 gap-2">
              {selectedRecs.map(r => {
                const c = REST_MAP[r.rest_type] ?? REST_MAP['full'];
                return (
                  <View key={r.id} className="flex-row items-center gap-3 py-2"
                    style={{ borderBottomWidth: 0.5, borderBottomColor: '#f3f4f6' }}>
                    <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: c.bg }}>
                      <Text className="text-sm font-bold" style={{ color: c.text }}>
                        {(r.user?.display_name || '?').slice(0, 1)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-foreground">{r.user?.display_name || '未知'}</Text>
                      {r.user?.position && <Text className="text-xs text-muted-foreground">{r.user.position}</Text>}
                      {r.reason && <Text className="text-xs text-muted-foreground mt-0.5">备注：{r.reason}</Text>}
                    </View>
                    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg }}>
                      <Text className="text-xs font-bold" style={{ color: c.text }}>{c.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* 长按配置弹窗（管理员） */}
      {configDate && (
        <RestConfigModal
          date={configDate}
          existingRecords={byDate[configDate] ?? []}
          onClose={(savedDate?: string) => {
            // savedDate 只在实际保存/删除时传入，取消关闭时不改变选中日期
            if (savedDate) setSelectedDate(savedDate);
            setConfigDate(null);
            loadData();
          }}
        />
      )}

      {/* 申请弹窗 */}
      {showApply && <ApplyModal onClose={() => { setShowApply(false); loadData(); }} />}
    </ScrollView>
  );
}

// ── 长按配置弹窗（新增/编辑/删除） ───────────────────────
function RestConfigModal({ date, existingRecords, onClose }: {
  date: string;
  existingRecords: RestRecord[];
  onClose: (savedDate?: string) => void;
}) {
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editing, setEditing] = useState<RestRecord | null>(null);
  const [showConfirmDel, setShowConfirmDel] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<{ id: string; display_name: string | null; position: string | null }[]>([]);
  const [selUsers, setSelUsers] = useState<string[]>([]);
  const [restType, setRestType] = useState<RestType>('full');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickedDate, setPickedDate] = useState(date);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id,display_name,position').order('display_name').then(({ data }) => {
      setProfiles(data ?? []);
    });
  }, []);

  const filteredProfiles = profiles.filter(p =>
    !searchText || (p.display_name || '').includes(searchText) || (p.position || '').includes(searchText)
  );

  const startEdit = (rec: RestRecord) => {
    setEditing(rec);
    setSelUsers([rec.user_id]);
    setRestType(rec.rest_type);
    setReason(rec.reason || '');
    setPickedDate(rec.rest_date);
    setMode('edit');
  };

  const startAdd = () => {
    setEditing(null);
    setSelUsers([]);
    setRestType('full');
    setReason('');
    setPickedDate(date);
    setMode('add');
  };

  const reasonRequired = REASON_REQUIRED.includes(restType);

  const save = async () => {
    if (selUsers.length === 0) { setError('请选择员工'); return; }
    if (reasonRequired && !reason.trim()) { setError(`选择${REST_MAP[restType]?.label}时备注为必填`); return; }
    setSaving(true); setError('');
    try {
      if (mode === 'edit' && editing) {
        // 冲突校验（排除自身）
        const { data: conflict } = await supabase.rpc('check_rest_conflict', {
          p_user_id: editing.user_id, p_rest_date: pickedDate, p_rest_type: restType, p_exclude_id: editing.id,
        });
        if (conflict) { setError(conflict as string); setSaving(false); return; }
        await supabase.from('rest_schedule').update({
          rest_date: pickedDate, rest_type: restType, reason: reason.trim() || null,
        }).eq('id', editing.id);
      } else {
        // 批量新增（多选）
        for (const uid of selUsers) {
          const { data: conflict } = await supabase.rpc('check_rest_conflict', {
            p_user_id: uid, p_rest_date: pickedDate, p_rest_type: restType,
          });
          if (conflict) { setError(conflict as string); setSaving(false); return; }
        }
        await supabase.from('rest_schedule').insert(
          selUsers.map(uid => ({ user_id: uid, rest_date: pickedDate, rest_type: restType, reason: reason.trim() || null }))
        );
      }
      onClose(pickedDate); // 传入实际保存的日期，确保 detail 面板刷新
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '提交失败'); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    await supabase.from('rest_schedule').delete().eq('id', id);
    onClose(date); // 传入原日期，删除后仍刷新该日的 detail 面板
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onClose()}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => onClose()}>
        <Pressable onPress={e => e.stopPropagation()}
          className="bg-card rounded-t-3xl pt-4 pb-8" style={{ maxHeight: '88%' }}>
          {/* 头部 */}
          <View className="flex-row items-center justify-between px-5 pb-3 border-b border-border">
            {mode !== 'list' ? (
              <Pressable onPress={() => { setMode('list'); setError(''); }}>
                <Text className="text-sm text-muted-foreground">返回</Text>
              </Pressable>
            ) : <View className="w-12" />}
            <Text className="text-base font-bold text-foreground">
              {mode === 'list' ? `${date.replace(/-/,'/')} 排休` : mode === 'add' ? '新增排休' : '编辑排休'}
            </Text>
            <Pressable onPress={() => onClose()} className="w-8 h-8 items-center justify-center rounded-full bg-muted">
              <X size={16} color="#374151" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {/* 列表模式 */}
            {mode === 'list' && (
              <>
                <Pressable onPress={startAdd}
                  className="py-3 rounded-xl flex-row items-center justify-center gap-2"
                  style={{ backgroundColor: '#ea580c' }}>
                  <Plus size={15} color="#fff" />
                  <Text className="text-sm font-bold text-white">新增排休记录</Text>
                </Pressable>
                {existingRecords.length === 0 ? (
                  <View className="items-center py-8">
                    <Text className="text-sm text-muted-foreground">当天暂无记录</Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {existingRecords.map(rec => {
                      const c = REST_MAP[rec.rest_type] ?? REST_MAP['full'];
                      return (
                        <View key={rec.id} className="bg-muted rounded-xl p-3 flex-row items-center gap-3">
                          <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: c.bg }}>
                            <Text className="text-xs font-bold" style={{ color: c.text }}>
                              {(rec.user?.display_name || '?').slice(0, 1)}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground">{rec.user?.display_name || '未知'}</Text>
                            <View className="flex-row items-center gap-1.5 mt-0.5">
                              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: c.bg }}>
                                <Text className="text-xs font-bold" style={{ color: c.text }}>{c.label}</Text>
                              </View>
                              {rec.reason && <Text className="text-xs text-muted-foreground">{rec.reason}</Text>}
                            </View>
                          </View>
                          <Pressable onPress={() => startEdit(rec)} className="w-8 h-8 items-center justify-center rounded-lg bg-card">
                            <Text className="text-xs text-muted-foreground">编辑</Text>
                          </Pressable>
                          {showConfirmDel === rec.id ? (
                            <View className="flex-row gap-1">
                              <Pressable onPress={() => setShowConfirmDel(null)}
                                className="px-2 py-1.5 rounded-lg bg-muted">
                                <Text className="text-xs text-muted-foreground">取消</Text>
                              </Pressable>
                              <Pressable onPress={() => del(rec.id)}
                                className="px-2 py-1.5 rounded-lg" style={{ backgroundColor: '#fef2f2' }}>
                                <Text className="text-xs font-bold" style={{ color: '#dc2626' }}>确认删除</Text>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable onPress={() => setShowConfirmDel(rec.id)}
                              className="w-8 h-8 items-center justify-center rounded-lg" style={{ backgroundColor: '#fef2f2' }}>
                              <X size={14} color="#dc2626" />
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {/* 新增 / 编辑表单 */}
            {(mode === 'add' || mode === 'edit') && (
              <>
                {/* 日期 */}
                <View className="gap-1.5">
                  <Text className="text-sm font-semibold text-foreground">日期</Text>
                  <Pressable onPress={() => setShowDatePicker(true)}
                    className="bg-muted rounded-xl px-4 py-3 flex-row items-center justify-between">
                    <Text className="text-sm text-foreground">{pickedDate}</Text>
                    <CalendarDays size={16} color="#9ca3af" />
                  </Pressable>
                </View>

                {/* 员工（新增时可多选） */}
                {mode === 'add' && (
                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-foreground">员工（可多选）</Text>
                    <TextInput
                      value={searchText} onChangeText={setSearchText}
                      placeholder="搜索姓名或岗位..."
                      className="bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground mb-2"
                    />
                    <View className="bg-muted rounded-xl overflow-hidden" style={{ maxHeight: 160 }}>
                      <ScrollView nestedScrollEnabled>
                        {filteredProfiles.map(p => {
                          const selected = selUsers.includes(p.id);
                          return (
                            <Pressable key={p.id} onPress={() => setSelUsers(prev =>
                              prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                            )} className="flex-row items-center px-3 py-2.5"
                              style={{ backgroundColor: selected ? '#fff7ed' : 'transparent' }}>
                              <View className="w-5 h-5 rounded mr-2 items-center justify-center"
                                style={{ borderWidth: 1.5, borderColor: selected ? '#ea580c' : '#d1d5db', backgroundColor: selected ? '#ea580c' : 'transparent' }}>
                                {selected && <Check size={12} color="#fff" />}
                              </View>
                              <Text className="flex-1 text-sm text-foreground">{p.display_name || '未知'}</Text>
                              {p.position && <Text className="text-xs text-muted-foreground">{p.position}</Text>}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                    {selUsers.length > 0 && (
                      <Text className="text-xs font-medium" style={{ color: '#ea580c' }}>已选 {selUsers.length} 人</Text>
                    )}
                  </View>
                )}

                {/* 类型网格 */}
                <View className="gap-1.5">
                  <Text className="text-sm font-semibold text-foreground">休假类型</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {REST_TYPES.map(rt => {
                      const sel = restType === rt.value;
                      return (
                        <Pressable key={rt.value} onPress={() => setRestType(rt.value)}
                          className="px-3 py-2 rounded-lg"
                          style={{
                            backgroundColor: sel ? rt.dot : '#f3f4f6',
                            borderWidth: sel ? 0 : 1,
                            borderColor: '#e5e7eb',
                            minWidth: '30%',
                          }}>
                          <Text className="text-xs font-bold text-center"
                            style={{ color: sel ? '#fff' : '#374151' }}>{rt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* 备注 */}
                <View className="gap-1.5">
                  <Text className="text-sm font-semibold text-foreground">
                    备注{reasonRequired ? <Text style={{ color: '#ef4444' }}> *必填</Text> : '（选填）'}
                  </Text>
                  <TextInput
                    value={reason} onChangeText={setReason}
                    placeholder={reasonRequired ? '请填写备注原因...' : '备注原因（选填）'}
                    multiline
                    className="bg-muted rounded-xl px-4 py-3 text-sm text-foreground"
                    style={{ minHeight: 72, textAlignVertical: 'top' }}
                  />
                </View>

                {error ? <Text className="text-xs" style={{ color: '#dc2626' }}>{error}</Text> : null}

                <Pressable onPress={save} disabled={saving}
                  className="py-3.5 rounded-xl items-center" style={{ backgroundColor: '#ea580c' }}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> :
                    <Text className="text-sm font-bold text-white">{mode === 'add' ? '确认添加' : '保存修改'}</Text>}
                </Pressable>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      {showDatePicker && (
        <DatePickerModal
          value={pickedDate}
          onConfirm={setPickedDate}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </Modal>
  );
}

// ── 申请弹窗 ─────────────────────────────────────────────
function ApplyModal({ onClose }: { onClose: () => void }) {
  const today = toYMD(new Date());
  const [restDate, setRestDate] = useState(today);
  const [restType, setRestType] = useState<RestType>('full');
  const [reason, setReason]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const reasonRequired = REASON_REQUIRED.includes(restType);

  const submit = async () => {
    if (reasonRequired && !reason.trim()) { setError(`选择${REST_MAP[restType]?.label}时备注为必填`); return; }
    setSaving(true); setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('请先登录'); return; }
      // 冲突校验
      const { data: conflict } = await supabase.rpc('check_rest_conflict', {
        p_user_id: user.id, p_rest_date: restDate, p_rest_type: restType,
      });
      if (conflict) { setError(conflict as string); setSaving(false); return; }

      const { error: err } = await supabase.from('rest_requests').insert({
        user_id: user.id, rest_date: restDate, rest_type: restType,
        reason: reason.trim() || null, status: 'pending',
      });
      if (err) { setError(err.message); return; }

      // 通知管理员（异步）
      supabase.functions.invoke('rest-api', {
        body: { action: 'notify_managers', rest_date: restDate, rest_type: restType, user_id: user.id },
      }).catch(() => {});

      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '提交失败'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} className="bg-card rounded-t-3xl px-6 pt-5 pb-8 gap-4">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-base font-bold text-foreground">申请请假 / 调休</Text>
            <Pressable onPress={onClose} className="w-8 h-8 items-center justify-center rounded-full bg-muted">
              <X size={16} color="#374151" />
            </Pressable>
          </View>

          {success ? (
            <View className="items-center py-6 gap-3">
              <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: '#f0fdf4' }}>
                <Check size={28} color="#16a34a" />
              </View>
              <Text className="text-base font-bold" style={{ color: '#16a34a' }}>申请已提交！</Text>
              <Text className="text-sm text-muted-foreground">等待管理员审批</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 16 }} showsVerticalScrollIndicator={false}>
              {/* 日期选择器 */}
              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-foreground">休假日期</Text>
                <Pressable onPress={() => setShowDatePicker(true)}
                  className="bg-muted rounded-xl px-4 py-3 flex-row items-center justify-between">
                  <Text className="text-sm text-foreground">{restDate}</Text>
                  <CalendarDays size={16} color="#9ca3af" />
                </Pressable>
              </View>

              {/* 类型网格 */}
              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-foreground">休假类型</Text>
                <View className="flex-row flex-wrap gap-2">
                  {REST_TYPES.map(rt => {
                    const sel = restType === rt.value;
                    return (
                      <Pressable key={rt.value} onPress={() => setRestType(rt.value)}
                        className="px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: sel ? rt.dot : '#f3f4f6',
                          borderWidth: sel ? 0 : 1, borderColor: '#e5e7eb',
                          minWidth: '30%',
                        }}>
                        <Text className="text-xs font-bold text-center"
                          style={{ color: sel ? '#fff' : '#374151' }}>{rt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 备注 */}
              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-foreground">
                  备注{reasonRequired ? <Text style={{ color: '#ef4444' }}> *必填</Text> : '（选填）'}
                </Text>
                <TextInput
                  value={reason} onChangeText={setReason}
                  placeholder={reasonRequired ? `选择${REST_MAP[restType]?.label}时备注必填` : '请简要说明原因...'}
                  multiline
                  className="bg-muted rounded-xl px-4 py-3 text-sm text-foreground"
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
              </View>

              {error ? <Text className="text-xs" style={{ color: '#dc2626' }}>{error}</Text> : null}

              <Pressable onPress={submit} disabled={saving}
                className="py-3.5 rounded-xl items-center" style={{ backgroundColor: '#ea580c' }}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> :
                  <Text className="text-sm font-bold text-white">提交申请</Text>}
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>

      {showDatePicker && (
        <DatePickerModal
          value={restDate}
          onConfirm={setRestDate}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </Modal>
  );
}

// ── Tab 2：我的申请 ────────────────────────────────────────
function MyRequestsTab({ myUserId, canManage }: { myUserId: string | null; canManage: boolean }) {
  const [myList, setMyList]       = useState<RestRequest[]>([]);
  const [pendingAll, setPendingAll] = useState<(RestRequest & { display_name?: string; position?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [showApply, setShowApply] = useState(false);
  // 审批弹窗状态
  const [reviewTarget, setReviewTarget] = useState<(RestRequest & { display_name?: string }) | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    if (!myUserId) return;
    setLoading(true);
    try {
      const myRes = await supabase.from('rest_requests')
        .select('*').eq('user_id', myUserId).order('created_at', { ascending: false }).limit(50);
      setMyList((myRes.data as RestRequest[]) ?? []);

      if (canManage) {
        const [pendingRes, profRes] = await Promise.all([
          supabase.from('rest_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
          supabase.from('profiles').select('id,display_name,position'),
        ]);
        const profMap = new Map<string, { display_name: string; position: string }>();
        ((profRes.data ?? []) as { id: string; display_name: string | null; position: string | null }[])
          .forEach(p => profMap.set(p.id, { display_name: p.display_name ?? '', position: p.position ?? '' }));
        setPendingAll(((pendingRes.data ?? []) as RestRequest[]).map(req => ({ ...req, ...profMap.get(req.user_id) })));
      }
    } catch { /* 静默 */ } finally { setLoading(false); }
  }, [myUserId, canManage]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancel = async (id: string) => {
    await supabase.from('rest_requests').delete().eq('id', id);
    load();
  };

  const approve = async (req: RestRequest) => {
    setApproving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // 写入 rest_schedule
      await supabase.from('rest_schedule').insert({
        user_id: req.user_id, rest_date: req.rest_date, rest_type: req.rest_type, reason: req.reason,
      });
      // 更新 rest_requests 状态
      await supabase.from('rest_requests').update({
        status: 'approved', reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: '审批通过',
      }).eq('id', req.id);
      setReviewTarget(null);
      load();
    } catch { /* 静默 */ } finally { setApproving(false); }
  };

  const reject = async (req: RestRequest) => {
    if (!rejectNote.trim() || rejectNote.trim().length < 5) return;
    setApproving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('rest_requests').update({
        status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: rejectNote.trim(),
      }).eq('id', req.id);
      setRejectNote('');
      setReviewTarget(null);
      load();
    } catch { /* 静默 */ } finally { setApproving(false); }
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <Pressable onPress={() => setShowApply(true)}
        className="mx-4 mt-3 mb-4 py-3 rounded-xl flex-row items-center justify-center gap-2"
        style={{ backgroundColor: '#ea580c' }}>
        <Plus size={16} color="#fff" />
        <Text className="text-sm font-bold text-white">新建申请</Text>
      </Pressable>

      {/* 管理员：待审批列表 */}
      {canManage && pendingAll.length > 0 && (
        <View className="mx-4 mb-5">
          <Text className="text-sm font-bold text-foreground mb-2">待审批申请 ({pendingAll.length})</Text>
          <View className="gap-2">
            {pendingAll.map(req => {
              const c = REST_MAP[req.rest_type] ?? REST_MAP['full'];
              return (
                <Pressable key={req.id} onPress={() => { setRejectNote(''); setReviewTarget(req); }}
                  className="bg-card rounded-2xl p-4"
                  style={{ borderWidth: 1.5, borderColor: '#fbbf24' }}>
                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-row items-center gap-2">
                      <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: c.bg }}>
                        <Text className="text-xs font-bold" style={{ color: c.text }}>
                          {(req.display_name || '?').slice(0, 1)}
                        </Text>
                      </View>
                      <View>
                        <Text className="text-sm font-semibold text-foreground">{req.display_name || '未知'}</Text>
                        {req.position ? <Text className="text-xs text-muted-foreground">{req.position}</Text> : null}
                      </View>
                    </View>
                    <View className="px-2 py-1 rounded-full" style={{ backgroundColor: '#fffbeb' }}>
                      <Text className="text-xs font-bold" style={{ color: '#d97706' }}>待审批</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="text-xs text-muted-foreground">{req.rest_date}</Text>
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: c.bg }}>
                      <Text className="text-xs font-semibold" style={{ color: c.text }}>{c.label}</Text>
                    </View>
                    {req.reason ? <Text className="text-xs text-muted-foreground">备注：{req.reason}</Text> : null}
                  </View>
                  <Text className="text-xs text-right mt-2" style={{ color: '#ea580c' }}>点击审批 →</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* 我的申请列表 */}
      <Text className="text-sm font-bold text-foreground mx-4 mb-2">我的申请记录</Text>
      {loading ? <ActivityIndicator size="large" color="#ea580c" className="mt-12" /> : (
        myList.length === 0 ? (
          <View className="items-center py-12 gap-2">
            <Text className="text-3xl">📋</Text>
            <Text className="text-sm text-muted-foreground">暂无申请记录</Text>
          </View>
        ) : (
          <View className="mx-4 gap-3">
            {myList.map(req => {
              const st = STATUS_STYLE[req.status] ?? STATUS_STYLE.pending;
              const c  = REST_MAP[req.rest_type] ?? REST_MAP['full'];
              return (
                <View key={req.id} className="bg-card rounded-2xl p-4"
                  style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-sm font-bold text-foreground">{req.rest_date}</Text>
                    <View className="flex-row gap-1.5">
                      <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg }}>
                        <Text className="text-xs font-bold" style={{ color: c.text }}>{c.label}</Text>
                      </View>
                      <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: st.bg }}>
                        <Text className="text-xs font-bold" style={{ color: st.color }}>{st.text}</Text>
                      </View>
                    </View>
                  </View>
                  {req.reason && <Text className="text-xs text-muted-foreground mb-1">备注：{req.reason}</Text>}
                  {req.review_note && (
                    <Text className="text-xs" style={{ color: req.status === 'rejected' ? '#dc2626' : '#16a34a' }}>
                      审批意见：{req.review_note}
                    </Text>
                  )}
                  {req.status === 'pending' && (
                    <Pressable onPress={() => cancel(req.id)}
                      className="mt-2 py-1.5 rounded-lg items-center" style={{ backgroundColor: '#fef2f2' }}>
                      <Text className="text-xs font-semibold" style={{ color: '#dc2626' }}>撤回申请</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )
      )}

      {showApply && <ApplyModal onClose={() => { setShowApply(false); load(); }} />}

      {/* 审批弹窗 */}
      {reviewTarget && (
        <Modal transparent animationType="fade" onRequestClose={() => setReviewTarget(null)}>
          <Pressable className="flex-1 justify-center items-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            onPress={() => setReviewTarget(null)}>
            <Pressable onPress={e => e.stopPropagation()}
              className="bg-card rounded-3xl mx-5 p-6 w-full" style={{ maxWidth: 360 }}>
              <Text className="text-base font-bold text-foreground mb-1">审批排休申请</Text>
              <Text className="text-xs text-muted-foreground mb-4">
                {reviewTarget.display_name} · {reviewTarget.rest_date} · {REST_MAP[reviewTarget.rest_type]?.label}
              </Text>
              {reviewTarget.reason ? (
                <Text className="text-xs text-muted-foreground mb-4">备注：{reviewTarget.reason}</Text>
              ) : null}
              <TextInput
                placeholder="驳回时请填写原因（不少于5字）"
                placeholderTextColor="#9ca3af"
                value={rejectNote}
                onChangeText={setRejectNote}
                multiline
                className="bg-muted rounded-xl p-3 mb-4 text-sm text-foreground"
                style={{ minHeight: 60 }}
              />
              <View className="flex-row gap-3">
                <Pressable onPress={() => reject(reviewTarget)} disabled={approving || rejectNote.trim().length < 5}
                  className="flex-1 py-3 rounded-xl items-center"
                  style={{ backgroundColor: rejectNote.trim().length >= 5 ? '#fee2e2' : '#f3f4f6' }}>
                  <Text className="text-sm font-bold"
                    style={{ color: rejectNote.trim().length >= 5 ? '#dc2626' : '#9ca3af' }}>驳回</Text>
                </Pressable>
                <Pressable onPress={() => approve(reviewTarget)} disabled={approving}
                  className="flex-1 py-3 rounded-xl items-center"
                  style={{ backgroundColor: '#dcfce7' }}>
                  {approving
                    ? <ActivityIndicator size="small" color="#16a34a" />
                    : <Text className="text-sm font-bold" style={{ color: '#16a34a' }}>通过</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ScrollView>
  );
}

// ── Tab 3：出勤统计 ────────────────────────────────────────
function StatsTab({ myUserId }: { myUserId: string | null }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [myRecs, setMyRecs]   = useState<RestRecord[]>([]);
  const [allRecs, setAllRecs] = useState<RestRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!myUserId) return;
    setLoading(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const s = `${year}-${pad(month)}-01`;
      const e = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
      const [myRes, allRes, profRes] = await Promise.all([
        supabase.from('rest_schedule').select('*').eq('user_id', myUserId).gte('rest_date', s).lte('rest_date', e),
        supabase.from('rest_schedule').select('id,user_id,rest_date,rest_type').gte('rest_date', s).lte('rest_date', e),
        supabase.from('profiles').select('id,display_name,position'),
      ]);
      setMyRecs((myRes.data as unknown as RestRecord[]) ?? []);
      // 前端关联用户信息
      const profMap = new Map<string, { display_name: string | null; position: string | null }>();
      if (profRes.data) {
        for (const p of profRes.data as { id: string; display_name: string | null; position: string | null }[]) {
          profMap.set(p.id, { display_name: p.display_name, position: p.position });
        }
      }
      const allRows = (allRes.data as unknown as RestRecord[]) ?? [];
      setAllRecs(allRows.map((r) => ({ ...r, user: profMap.get(r.user_id) })));
    } catch { /* 静默 */ } finally { setLoading(false); }
  }, [year, month, myUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  // ── 统计计算 ──
  // 休假类：full, am, pm
  const REST_SET = new Set<RestType>(['full', 'am', 'pm']);
  // 异常类：late, early, absent, sick, personal
  const ABNORMAL_SET = new Set<RestType>(['late', 'early', 'absent', 'sick', 'personal']);

  const myFull     = myRecs.filter(r => r.rest_type === 'full').length;
  const myHalf     = myRecs.filter(r => r.rest_type === 'am' || r.rest_type === 'pm').length;
  const myRest     = myFull + myHalf; // 休假次数
  const myAbnormal = myRecs.filter(r => ABNORMAL_SET.has(r.rest_type)).length;
  const myOvertime = myRecs.filter(r => r.rest_type === 'overtime').length;

  // 出勤天数 = 有排班记录 且 该天所有记录中不含异常类型
  const daysWithRecs = [...new Set(myRecs.map(r => r.rest_date))];
  const myAttend = daysWithRecs.filter(d => {
    const dayRecs = myRecs.filter(r => r.rest_date === d);
    return !dayRecs.some(r => ABNORMAL_SET.has(r.rest_type));
  }).length;

  // 全员排行（按休假+异常次数降序）
  type PersonStat = { name: string; rest: number; abnormal: number; overtime: number };
  const personMap: Record<string, PersonStat> = {};
  allRecs.forEach(r => {
    const name = (r.user as { display_name: string | null } | undefined)?.display_name || '未知';
    if (!personMap[r.user_id]) personMap[r.user_id] = { name, rest: 0, abnormal: 0, overtime: 0 };
    if (REST_SET.has(r.rest_type)) personMap[r.user_id].rest++;
    else if (ABNORMAL_SET.has(r.rest_type)) personMap[r.user_id].abnormal++;
    else if (r.rest_type === 'overtime') personMap[r.user_id].overtime++;
  });
  const persons = Object.values(personMap).sort((a, b) =>
    (b.rest + b.abnormal) - (a.rest + a.abnormal)
  );

  const myStats = [
    { label: '出勤天数', value: myAttend,   unit: '天', color: '#16a34a' },
    { label: '休假次数', value: myRest,     unit: '次', color: '#ea580c' },
    { label: '全休天数', value: myFull,     unit: '天', color: '#ef4444' },
    { label: '半休次数', value: myHalf,     unit: '次', color: '#f97316' },
    { label: '异常次数', value: myAbnormal, unit: '次', color: '#dc2626' },
    { label: '加班次数', value: myOvertime, unit: '次', color: '#059669' },
  ];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <View className="flex-row items-center justify-center gap-6 my-3">
        <Pressable onPress={prevMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronLeft size={18} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-foreground">{year}年 {month}月</Text>
        <Pressable onPress={nextMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronRight size={18} color="#374151" />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator size="large" color="#ea580c" className="mt-8" /> : (
        <View className="mx-4 gap-4">
          {/* 我的出勤（6项） */}
          <View className="bg-card rounded-2xl p-4 gap-3" style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
            <Text className="text-sm font-bold text-foreground">我的出勤统计</Text>
            <View className="flex-row flex-wrap gap-2">
              {myStats.map(item => (
                <View key={item.label} className="rounded-xl items-center py-3"
                  style={{ width: '30.5%', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <Text className="text-xl font-bold" style={{ color: item.color }}>
                    {item.value}
                  </Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">{item.label}</Text>
                </View>
              ))}
            </View>
            <Text className="text-xs text-muted-foreground">
              * 出勤：有排班记录且当天无异常记录的天数
            </Text>
          </View>

          {/* 全员排行 */}
          <View className="bg-card rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
              <Text className="text-sm font-bold text-foreground">全员排行（按休假+异常次数）</Text>
            </View>
            {persons.length === 0 ? (
              <View className="px-4 py-6 items-center">
                <Text className="text-sm text-muted-foreground">本月暂无排休记录</Text>
              </View>
            ) : (
              <View className="px-4 py-2">
                {persons.slice(0, 10).map((p, idx) => (
                  <View key={p.name + idx} className="flex-row items-center py-2.5"
                    style={{ borderBottomWidth: idx < persons.length - 1 ? 0.5 : 0, borderBottomColor: '#f3f4f6' }}>
                    <View className="w-7 h-7 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: idx < 3 ? '#fff7ed' : '#f3f4f6' }}>
                      <Text className="text-xs font-bold" style={{ color: idx < 3 ? '#ea580c' : '#9ca3af' }}>{idx + 1}</Text>
                    </View>
                    <Text className="flex-1 text-sm font-semibold text-foreground">{p.name}</Text>
                    <View className="flex-row gap-2">
                      <Text className="text-xs text-muted-foreground">休假{p.rest}</Text>
                      {p.abnormal > 0 && <Text className="text-xs" style={{ color: '#dc2626' }}>异常{p.abnormal}</Text>}
                      {p.overtime > 0 && <Text className="text-xs" style={{ color: '#059669' }}>加班{p.overtime}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
