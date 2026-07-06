/**
 * 排休管理页（仅有「排休管理」权限的角色可访问）
 * Tab: 待审批 | 排休管理 | 全员不休日
 */
import React, { useCallback, useState } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus, X, Check, CalendarDays } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getUserPermsByPosition } from '@/db/api';
import { REST_TYPES, REST_MAP, REASON_REQUIRED as REASON_REQ, toYMD, DatePickerModal } from './attendance';
import type { RestType } from './attendance';
import PermissionGuard from '@/components/PermissionGuard';

// ── 类型 ─────────────────────────────────────────────────
interface RestRecord {
  id: string;
  user_id: string;
  rest_date: string;
  rest_type: RestType;
  reason: string | null;
  user?: { id: string; display_name: string | null; position: string | null };
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
  reminder_sent: boolean;
  user?: { display_name: string | null; position: string | null };
}

const REASON_REQUIRED: RestType[] = REASON_REQ as RestType[];

const STATUS_STYLE: Record<string, { text: string; color: string; bg: string }> = {
  pending:  { text: '待审批', color: '#d97706', bg: '#fffbeb' },
  approved: { text: '已通过', color: '#16a34a', bg: '#f0fdf4' },
  rejected: { text: '已拒绝', color: '#dc2626', bg: '#fef2f2' },
};

function isoToLocal(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// ── 主组件 ────────────────────────────────────────────────
export default function RestManagePage() {
  const router = useRouter();
  type TabKey = 'approval' | 'schedule' | 'norest';
  const [tab, setTab] = useState<TabKey>('approval');
  const [canManage, setCanManage] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const perms = await getUserPermsByPosition(user.id);
      setCanManage(perms.includes('排休管理'));
    })();
  }, []));

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'approval', label: '待审批' },
    { key: 'schedule', label: '排休管理' },
    { key: 'norest',   label: '全员不休日' },
  ];

  return (
    <PermissionGuard permissions={['排休管理']} title="排休管理">
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ChevronLeft size={22} color="#374151" />
        </Pressable>
        <Text className="flex-1 text-center text-lg font-bold text-foreground">排休管理</Text>
        <View className="w-10" />
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

      {tab === 'approval' && <ApprovalTab canManage={canManage} />}
      {tab === 'schedule' && <ScheduleTab canManage={canManage} />}
      {tab === 'norest'   && <NoRestTab canManage={canManage} />}
      </SafeAreaView>
    </PermissionGuard>
  );
}

// ── Tab 1：待审批 ─────────────────────────────────────────
function ApprovalTab({ canManage }: { canManage: boolean }) {
  const [list, setList]     = useState<RestRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<RestRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('rest_requests')
        .select('*,profiles!rest_requests_user_id_fkey(display_name,position)')
        .eq('status', 'pending').order('created_at');
      setList((data as unknown as RestRequest[]) ?? []);
    } catch { /* 静默 */ } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = async (req: RestRequest) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('rest_requests').update({
        status: 'approved', reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: null,
      }).eq('id', req.id);
      // 同步到 rest_schedule
      await supabase.from('rest_schedule').upsert({
        user_id: req.user_id, rest_date: req.rest_date, rest_type: req.rest_type, reason: req.reason,
      }, { onConflict: 'user_id,rest_date,rest_type', ignoreDuplicates: true });
      // 通知申请人
      supabase.functions.invoke('rest-api', {
        body: { action: 'notify_applicant', request_id: req.id, status: 'approved', user_id: req.user_id },
      }).catch(() => {});
      setReviewing(null); setShowRejectInput(false); load();
    } catch { /* 静默 */ } finally { setSaving(false); }
  };

  const reject = async (req: RestRequest) => {
    if (!rejectNote.trim()) { setRejectError('请填写驳回理由'); return; }
    if (rejectNote.trim().length < 5) { setRejectError('驳回理由不少于5个字'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('rest_requests').update({
        status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: rejectNote.trim(),
      }).eq('id', req.id);
      supabase.functions.invoke('rest-api', {
        body: { action: 'notify_applicant', request_id: req.id, status: 'rejected', user_id: req.user_id, review_note: rejectNote.trim() },
      }).catch(() => {});
      setReviewing(null); setShowRejectInput(false); setRejectNote(''); load();
    } catch { /* 静默 */ } finally { setSaving(false); }
  };

  const openReview = (req: RestRequest) => {
    setReviewing(req); setShowRejectInput(false); setRejectNote(''); setRejectError('');
  };

  return (
    <View className="flex-1">
      {loading ? <ActivityIndicator size="large" color="#ea580c" className="mt-12" /> : (
        list.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-3">
            <Text className="text-3xl">✅</Text>
            <Text className="text-sm font-semibold text-foreground">暂无待审批申请</Text>
            <Text className="text-xs text-muted-foreground">所有申请已处理完毕</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item: req }) => {
              const c  = REST_MAP[req.rest_type] ?? REST_MAP['full'];
              const st = STATUS_STYLE['pending'];
              const hrs = Math.floor((Date.now() - new Date(req.created_at).getTime()) / 3600000);
              const isUrgent = hrs >= 20; // 快到24小时了
              return (
                <View className="bg-card rounded-2xl p-4" style={{ borderWidth: 1, borderColor: isUrgent ? '#fde68a' : '#e5e7eb' }}>
                  {isUrgent && (
                    <View className="flex-row items-center gap-1 mb-2 px-2 py-1 rounded-lg" style={{ backgroundColor: '#fffbeb' }}>
                      <Text className="text-xs font-semibold" style={{ color: '#d97706' }}>⏰ 已等待{hrs}小时，请及时处理</Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-3 mb-3">
                    <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: c.bg }}>
                      <Text className="text-sm font-bold" style={{ color: c.text }}>
                        {(req.user?.display_name || '?').slice(0,1)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-foreground">{req.user?.display_name || '未知员工'}</Text>
                      <Text className="text-xs text-muted-foreground">{req.user?.position || ''}</Text>
                    </View>
                    <View className="items-end gap-1">
                      <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg }}>
                        <Text className="text-xs font-bold" style={{ color: c.text }}>{c.label}</Text>
                      </View>
                      <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: st.bg }}>
                        <Text className="text-xs font-bold" style={{ color: st.color }}>{st.text}</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row gap-2 mb-2">
                    <Text className="text-xs text-muted-foreground">📅 {req.rest_date}</Text>
                    <Text className="text-xs text-muted-foreground">🕐 {isoToLocal(req.created_at)}</Text>
                  </View>
                  {req.reason && <Text className="text-xs text-muted-foreground mb-2">备注：{req.reason}</Text>}

                  {canManage && reviewing?.id === req.id ? (
                    <View className="mt-2 gap-3">
                      {showRejectInput ? (
                        <>
                          <TextInput
                            value={rejectNote} onChangeText={v => { setRejectNote(v); setRejectError(''); }}
                            placeholder="请填写驳回理由（不少于5字）"
                            multiline className="bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground"
                            style={{ minHeight: 64, textAlignVertical: 'top' }}
                          />
                          <Text className="text-xs" style={{ color: rejectNote.trim().length < 5 ? '#d97706' : '#16a34a' }}>
                            已输入 {rejectNote.trim().length} 字（至少5字）
                          </Text>
                          {rejectError ? <Text className="text-xs" style={{ color: '#dc2626' }}>{rejectError}</Text> : null}
                          <View className="flex-row gap-2">
                            <Pressable onPress={() => { setShowRejectInput(false); setRejectNote(''); setRejectError(''); }}
                              className="flex-1 py-2.5 rounded-xl items-center bg-muted">
                              <Text className="text-sm font-semibold text-muted-foreground">取消</Text>
                            </Pressable>
                            <Pressable onPress={() => reject(req)} disabled={saving}
                              className="flex-1 py-2.5 rounded-xl items-center" style={{ backgroundColor: '#dc2626' }}>
                              {saving ? <ActivityIndicator size="small" color="#fff" /> :
                                <Text className="text-sm font-bold text-white">确认驳回</Text>}
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <View className="flex-row gap-2">
                          <Pressable onPress={() => setReviewing(null)} className="flex-1 py-2.5 rounded-xl items-center bg-muted">
                            <Text className="text-sm font-semibold text-muted-foreground">取消</Text>
                          </Pressable>
                          <Pressable onPress={() => { setShowRejectInput(true); }} disabled={saving}
                            className="flex-1 py-2.5 rounded-xl items-center" style={{ backgroundColor: '#fef2f2' }}>
                            <Text className="text-sm font-bold" style={{ color: '#dc2626' }}>驳回</Text>
                          </Pressable>
                          <Pressable onPress={() => approve(req)} disabled={saving}
                            className="flex-1 py-2.5 rounded-xl items-center" style={{ backgroundColor: '#059669' }}>
                            {saving ? <ActivityIndicator size="small" color="#fff" /> :
                              <Text className="text-sm font-bold text-white">通过</Text>}
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ) : canManage ? (
                    <Pressable onPress={() => openReview(req)}
                      className="mt-1 py-2.5 rounded-xl items-center" style={{ backgroundColor: '#fff7ed' }}>
                      <Text className="text-sm font-bold" style={{ color: '#ea580c' }}>审批</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
          />
        )
      )}
    </View>
  );
}

// ── Tab 2：排休管理 ────────────────────────────────────────
function ScheduleTab({ canManage }: { canManage: boolean }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [records, setRecords] = useState<RestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RestRecord | null>(null);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);

  // 统计（6项）
  const REST_LEAVE = new Set<RestType>(['full', 'am', 'pm']);
  const ABNORMAL   = new Set<RestType>(['late', 'early', 'absent', 'sick', 'personal']);
  const statFull     = records.filter(r => r.rest_type === 'full').length;
  const statHalf     = records.filter(r => r.rest_type === 'am' || r.rest_type === 'pm').length;
  const statLeave    = statFull + statHalf;
  const statAbnormal = records.filter(r => ABNORMAL.has(r.rest_type)).length;
  const statOvertime = records.filter(r => r.rest_type === 'overtime').length;
  const daysWithRecs = [...new Set(records.map(r => r.rest_date))];
  const statAttend   = daysWithRecs.length > 0 ? daysWithRecs.filter(d => {
    const dRecs = records.filter(r => r.rest_date === d);
    return !dRecs.some(r => ABNORMAL.has(r.rest_type));
  }).length : 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const s = `${year}-${pad(month)}-01`;
      const e = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
      const { data } = await supabase.from('rest_schedule')
        .select('id,user_id,rest_date,rest_type,reason,profiles!rest_schedule_user_id_fkey(id,display_name,position)')
        .gte('rest_date', s).lte('rest_date', e).order('rest_date');
      setRecords((data as unknown as RestRecord[]) ?? []);
    } catch { /* 静默 */ } finally { setLoading(false); }
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const prevMonth = () => { if (month === 1) { setYear(y => y-1); setMonth(12); } else setMonth(m=>m-1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y+1); setMonth(1); } else setMonth(m=>m+1); };

  const delRecord = async (id: string) => {
    await supabase.from('rest_schedule').delete().eq('id', id);
    setDelConfirm(null); load();
  };

  const statsItems = [
    { label: '出勤天数', value: statAttend,   color: '#16a34a' },
    { label: '休假次数', value: statLeave,    color: '#ea580c' },
    { label: '全休天数', value: statFull,     color: '#ef4444' },
    { label: '半休次数', value: statHalf,     color: '#f97316' },
    { label: '异常次数', value: statAbnormal, color: '#dc2626' },
    { label: '加班次数', value: statOvertime, color: '#059669' },
  ];

  return (
    <View className="flex-1">
      {/* 月份切换 */}
      <View className="flex-row items-center justify-center gap-5 py-3">
        <Pressable onPress={prevMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronLeft size={18} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-foreground">{year}年 {month}月</Text>
        <Pressable onPress={nextMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronRight size={18} color="#374151" />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator size="large" color="#ea580c" className="mt-8" /> : (
        <FlatList
          data={records}
          keyExtractor={r => r.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            <View className="gap-4">
              {/* 出勤统计 */}
              <View className="bg-card rounded-2xl p-4 gap-3" style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
                <Text className="text-sm font-bold text-foreground">出勤统计（本月）</Text>
                <View className="flex-row flex-wrap gap-2">
                  {statsItems.map(item => (
                    <View key={item.label} className="rounded-xl items-center py-3"
                      style={{ width: '30.5%', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' }}>
                      <Text className="text-xl font-bold" style={{ color: item.color }}>{item.value}</Text>
                      <Text className="text-xs text-muted-foreground mt-0.5">{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* 添加按钮 */}
              {canManage && (
                <Pressable onPress={() => { setEditing(null); setShowAdd(true); }}
                  className="py-3 rounded-xl flex-row items-center justify-center gap-2"
                  style={{ backgroundColor: '#ea580c' }}>
                  <Plus size={15} color="#fff" />
                  <Text className="text-sm font-bold text-white">添加排休记录</Text>
                </Pressable>
              )}

              {records.length === 0 && (
                <View className="items-center py-8 gap-2">
                  <Text className="text-3xl">📅</Text>
                  <Text className="text-sm text-muted-foreground">本月暂无排休记录</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item: rec }) => {
            const c = REST_MAP[rec.rest_type] ?? REST_MAP['full'];
            return (
              <View className="bg-card rounded-2xl p-4 mt-3" style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: c.bg }}>
                    <Text className="text-sm font-bold" style={{ color: c.text }}>
                      {(rec.user?.display_name || '?').slice(0, 1)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-foreground">{rec.user?.display_name || '未知'}</Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      {rec.user?.position && <Text className="text-xs text-muted-foreground">{rec.user.position}</Text>}
                      <Text className="text-xs text-muted-foreground">· {rec.rest_date}</Text>
                    </View>
                  </View>
                  <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg }}>
                    <Text className="text-xs font-bold" style={{ color: c.text }}>{c.label}</Text>
                  </View>
                </View>
                {rec.reason && (
                  <Text className="text-xs text-muted-foreground mt-2 ml-14">备注：{rec.reason}</Text>
                )}
                {canManage && (
                  <View className="flex-row gap-2 mt-3 ml-14">
                    <Pressable onPress={() => { setEditing(rec); setShowAdd(true); }}
                      className="px-4 py-1.5 rounded-lg bg-muted">
                      <Text className="text-xs text-muted-foreground font-medium">编辑</Text>
                    </Pressable>
                    {delConfirm === rec.id ? (
                    <View className="flex-row gap-1.5">
                      <Pressable onPress={() => setDelConfirm(null)} className="px-3 py-1.5 rounded-lg bg-muted">
                        <Text className="text-xs text-muted-foreground">取消</Text>
                      </Pressable>
                      <Pressable onPress={() => delRecord(rec.id)}
                        className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#fef2f2' }}>
                        <Text className="text-xs font-bold" style={{ color: '#dc2626' }}>确认删除</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => setDelConfirm(rec.id)}
                      className="px-4 py-1.5 rounded-lg" style={{ backgroundColor: '#fef2f2' }}>
                      <Text className="text-xs font-bold" style={{ color: '#dc2626' }}>删除</Text>
                    </Pressable>
                  )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {showAdd && (
        <AddEditModal
          editing={editing}
          defaultDate={`${year}-${String(month).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`}
          onClose={() => { setShowAdd(false); setEditing(null); load(); }}
        />
      )}
    </View>
  );
}

// ── 添加/编辑排休 Modal ───────────────────────────────────
function AddEditModal({ editing, defaultDate, onClose }: {
  editing: RestRecord | null;
  defaultDate: string;
  onClose: () => void;
}) {
  const [restDate, setRestDate] = useState(editing?.rest_date ?? defaultDate);
  const [restType, setRestType] = useState<RestType>(editing?.rest_type ?? 'full');
  const [reason, setReason]     = useState(editing?.reason ?? '');
  const [selUsers, setSelUsers] = useState<string[]>(editing ? [editing.user_id] : []);
  const [profiles, setProfiles] = useState<{id:string;display_name:string|null;position:string|null}[]>([]);
  const [search, setSearch]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  React.useEffect(() => {
    supabase.from('profiles').select('id,display_name,position').order('display_name').then(({ data }) => {
      setProfiles(data ?? []);
    });
  }, []);

  const filtered = profiles.filter(p =>
    !search || (p.display_name || '').includes(search) || (p.position || '').includes(search)
  );

  const requireReason = REASON_REQUIRED.includes(restType);

  const save = async () => {
    if (selUsers.length === 0) { setError('请选择员工'); return; }
    if (requireReason && !reason.trim()) { setError(`选择${REST_MAP[restType]?.label}时备注为必填`); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        const { data: conflict } = await supabase.rpc('check_rest_conflict', {
          p_user_id: editing.user_id, p_rest_date: restDate, p_rest_type: restType, p_exclude_id: editing.id,
        });
        if (conflict) { setError(conflict as string); setSaving(false); return; }
        await supabase.from('rest_schedule').update({
          rest_date: restDate, rest_type: restType, reason: reason.trim() || null,
        }).eq('id', editing.id);
      } else {
        for (const uid of selUsers) {
          const { data: conflict } = await supabase.rpc('check_rest_conflict', {
            p_user_id: uid, p_rest_date: restDate, p_rest_type: restType,
          });
          if (conflict) { setError(conflict as string); setSaving(false); return; }
        }
        await supabase.from('rest_schedule').insert(
          selUsers.map(uid => ({ user_id: uid, rest_date: restDate, rest_type: restType, reason: reason.trim() || null }))
        );
      }
      onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '提交失败'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} className="bg-card rounded-t-3xl"
          style={{ maxHeight: '92%' }}>
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
            <Text className="text-base font-bold text-foreground">{editing ? '编辑排休记录' : '添加排休记录'}</Text>
            <Pressable onPress={onClose} className="w-8 h-8 items-center justify-center rounded-full bg-muted">
              <X size={16} color="#374151" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
            {/* 日期 */}
            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-foreground">日期</Text>
              <Pressable onPress={() => setShowDatePicker(true)}
                className="bg-muted rounded-xl px-4 py-3 flex-row items-center justify-between">
                <Text className="text-sm text-foreground">{restDate}</Text>
                <CalendarDays size={16} color="#9ca3af" />
              </Pressable>
            </View>

            {/* 人员（编辑时固定） */}
            {editing ? (
              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-foreground">员工</Text>
                <View className="bg-muted rounded-xl px-4 py-3">
                  <Text className="text-sm text-foreground">
                    {profiles.find(p => p.id === editing.user_id)?.display_name ?? '未知员工'}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="gap-1.5">
                <Text className="text-sm font-semibold text-foreground">员工（可多选）</Text>
                <TextInput
                  value={search} onChangeText={setSearch}
                  placeholder="搜索姓名或岗位..."
                  className="bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground"
                />
                <View className="bg-muted rounded-xl overflow-hidden" style={{ maxHeight: 180 }}>
                  <ScrollView nestedScrollEnabled>
                    {filtered.map(p => {
                      const sel = selUsers.includes(p.id);
                      return (
                        <Pressable key={p.id}
                          onPress={() => setSelUsers(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          className="flex-row items-center px-3 py-2.5"
                          style={{ backgroundColor: sel ? '#fff7ed' : 'transparent' }}>
                          <View className="w-5 h-5 rounded mr-2.5 items-center justify-center"
                            style={{ borderWidth: 1.5, borderColor: sel ? '#ea580c' : '#d1d5db', backgroundColor: sel ? '#ea580c' : 'transparent' }}>
                            {sel && <Check size={12} color="#fff" />}
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

            {/* 类型 */}
            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-foreground">休假类型</Text>
              <View className="flex-row flex-wrap gap-2">
                {REST_TYPES.map(rt => {
                  const sel = restType === rt.value;
                  return (
                    <Pressable key={rt.value} onPress={() => setRestType(rt.value)}
                      className="px-3 py-2.5 rounded-lg"
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
                备注{requireReason ? <Text style={{ color: '#ef4444' }}> *必填</Text> : '（选填）'}
              </Text>
              <TextInput
                value={reason} onChangeText={setReason}
                placeholder={requireReason ? `选择${REST_MAP[restType]?.label}时备注为必填` : '备注原因（选填）'}
                multiline className="bg-muted rounded-xl px-4 py-3 text-sm text-foreground"
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>

            {error ? <Text className="text-xs" style={{ color: '#dc2626' }}>{error}</Text> : null}

            <Pressable onPress={save} disabled={saving}
              className="py-3.5 rounded-xl items-center" style={{ backgroundColor: '#ea580c' }}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> :
                <Text className="text-sm font-bold text-white">{editing ? '保存修改' : '确认添加'}</Text>}
            </Pressable>
          </ScrollView>
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

// ── Tab 3：全员不休日 ─────────────────────────────────────
function NoRestTab({ canManage }: { canManage: boolean }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [noRestDays, setNoRestDays] = useState<{ id: string; date: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [newDate, setNewDate] = useState(toYMD(today));
  const [adding, setAdding] = useState(false);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);

  const pad = (n: number) => String(n).padStart(2, '0');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = `${year}-${pad(month)}-01`;
      const e = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
      const { data } = await supabase.from('no_rest_days').select('id,date').gte('date', s).lte('date', e).order('date');
      setNoRestDays(data ?? []);
    } catch { /* 静默 */ } finally { setLoading(false); }
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const prevMonth = () => { if (month === 1) { setYear(y=>y-1); setMonth(12); } else setMonth(m=>m-1); };
  const nextMonth = () => { if (month === 12) { setYear(y=>y+1); setMonth(1); } else setMonth(m=>m+1); };

  const addNoRest = async () => {
    if (noRestDays.some(d => d.date === newDate)) { return; }
    setAdding(true);
    try {
      await supabase.from('no_rest_days').insert({ date: newDate });
      load();
    } catch { /* 静默 */ } finally { setAdding(false); }
  };

  const delNoRest = async (id: string) => {
    await supabase.from('no_rest_days').delete().eq('id', id);
    setDelConfirm(null); load();
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
      {/* 月份切换 */}
      <View className="flex-row items-center justify-center gap-5">
        <Pressable onPress={prevMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronLeft size={18} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-foreground">{year}年 {month}月</Text>
        <Pressable onPress={nextMonth} className="w-9 h-9 items-center justify-center rounded-full bg-muted">
          <ChevronRight size={18} color="#374151" />
        </Pressable>
      </View>

      {/* 添加 */}
      {canManage && (
        <View className="bg-card rounded-2xl p-4 gap-3" style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
          <Text className="text-sm font-bold text-foreground">标记全员不休日</Text>
          <Pressable onPress={() => setShowPicker(true)}
            className="bg-muted rounded-xl px-4 py-3 flex-row items-center justify-between">
            <Text className="text-sm text-foreground">{newDate}</Text>
            <CalendarDays size={16} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={addNoRest} disabled={adding || noRestDays.some(d => d.date === newDate)}
            className="py-3 rounded-xl flex-row items-center justify-center gap-2"
            style={{ backgroundColor: noRestDays.some(d => d.date === newDate) ? '#e5e7eb' : '#ea580c' }}>
            {adding ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Plus size={14} color={noRestDays.some(d => d.date === newDate) ? '#9ca3af' : '#fff'} />
                <Text className="text-sm font-bold" style={{ color: noRestDays.some(d => d.date === newDate) ? '#9ca3af' : '#fff' }}>
                  {noRestDays.some(d => d.date === newDate) ? '该日期已标记' : '添加全员不休日'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* 列表 */}
      <View className="bg-card rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: '#e5e7eb' }}>
        <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
          <Text className="text-sm font-bold text-foreground">本月全员不休日</Text>
          <Text className="text-xs text-muted-foreground">{noRestDays.length} 天</Text>
        </View>
        {loading ? <ActivityIndicator size="large" color="#ea580c" className="py-8" /> : (
          noRestDays.length === 0 ? (
            <View className="px-4 py-8 items-center">
              <Text className="text-sm text-muted-foreground">本月暂无全员不休日</Text>
            </View>
          ) : (
            <View className="px-4 py-2 gap-1">
              {noRestDays.map(d => (
                <View key={d.id} className="flex-row items-center py-2.5"
                  style={{ borderBottomWidth: 0.5, borderBottomColor: '#f3f4f6' }}>
                  <View className="w-2 h-2 rounded-full mr-3" style={{ backgroundColor: '#ef4444' }} />
                  <Text className="flex-1 text-sm font-semibold text-foreground">{d.date}</Text>
                  {canManage && (delConfirm === d.id ? (
                    <View className="flex-row gap-1.5">
                      <Pressable onPress={() => setDelConfirm(null)} className="px-2 py-1 rounded-lg bg-muted">
                        <Text className="text-xs text-muted-foreground">取消</Text>
                      </Pressable>
                      <Pressable onPress={() => delNoRest(d.id)}
                        className="px-2 py-1 rounded-lg" style={{ backgroundColor: '#fef2f2' }}>
                        <Text className="text-xs font-bold" style={{ color: '#dc2626' }}>确认</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => setDelConfirm(d.id)}
                      className="w-7 h-7 items-center justify-center rounded-lg" style={{ backgroundColor: '#fef2f2' }}>
                      <X size={13} color="#dc2626" />
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          )
        )}
      </View>

      {showPicker && (
        <DatePickerModal
          value={newDate}
          onConfirm={setNewDate}
          onClose={() => setShowPicker(false)}
        />
      )}
    </ScrollView>
  );
}
