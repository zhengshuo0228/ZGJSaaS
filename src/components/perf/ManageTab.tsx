/**
 * ManageTab — 绩效管理Tab
 * 子Tab：预设管理 / 记录调整 / 加分扣分
 * v3: 人员多选（含全选）+ 新增记录日期选择器 + 图片上传 + 记录行内删除按钮
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { ChevronDown, ChevronUp, Edit3, ImageIcon, Minus, Plus, Trash2, X, User, Users, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { fetch as expoFetch } from 'expo/fetch';
import DateTimePicker from 'react-native-ui-datepicker';
import { supabase } from '@/client/supabase';
import { PerfRecord, PerfTemplate, formatDateTime, getDisplayName } from './types';
import RemarkSelector from './RemarkSelector';

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  position: string | null;
}

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

type SubTab = 'presets' | 'adjust' | 'scoring';

interface Props {
  addItemTpls: PerfTemplate[];
  deductItemTpls: PerfTemplate[];
  remarkTpls: PerfTemplate[];
  onRefreshTemplates: () => Promise<void>;
  dateFrom?: string;
  dateTo?: string;
}

// ─── 事项模板条目编辑 ─────────────────────────────────────────
function ItemTplRow({
  tpl, idx, total,
  onDelete, onMoveUp, onMoveDown, onEdit,
}: {
  tpl: PerfTemplate; idx: number; total: number;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onEdit: (updated: PerfTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState(tpl.content);
  const [description, setDescription] = useState(tpl.description || '');
  const [linkedTag, setLinkedTag] = useState(tpl.linked_tag || '');
  const [threshold, setThreshold] = useState(String(tpl.tag_threshold ?? ''));

  const save = () => {
    onEdit({
      ...tpl,
      content: content.trim() || tpl.content,
      description: description.trim() || null,
      linked_tag: linkedTag.trim() || null,
      tag_threshold: threshold ? Number(threshold) : null,
    });
    setExpanded(false);
  };

  return (
    <View className="bg-card border border-border rounded-2xl overflow-hidden" style={{ borderCurve: 'continuous' }}>
      <Pressable onPress={() => setExpanded(e => !e)}
        className="flex-row items-center px-4 py-3 gap-2">
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-foreground">{tpl.content}</Text>
          {tpl.description ? <Text className="text-xs text-muted-foreground" numberOfLines={1}>{tpl.description}</Text> : null}
          {tpl.linked_tag ? (
            <Text className="text-xs text-primary">🏅 {tpl.linked_tag} · {tpl.tag_threshold}次解锁</Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable onPress={onMoveUp} disabled={idx === 0}
            className={`w-7 h-7 rounded-lg bg-muted items-center justify-center ${idx === 0 ? 'opacity-30' : ''}`}>
            <ChevronUp size={14} color="#374151" />
          </Pressable>
          <Pressable onPress={onMoveDown} disabled={idx === total - 1}
            className={`w-7 h-7 rounded-lg bg-muted items-center justify-center ${idx === total - 1 ? 'opacity-30' : ''}`}>
            <ChevronDown size={14} color="#374151" />
          </Pressable>
          <Pressable onPress={onDelete} className="w-7 h-7 rounded-lg bg-red-50 items-center justify-center">
            <Trash2 size={14} color="#D9381E" />
          </Pressable>
          {expanded ? <ChevronUp size={16} color="#6b7280" /> : <ChevronDown size={16} color="#6b7280" />}
        </View>
      </Pressable>

      {expanded ? (
        <View className="px-4 pb-4 gap-3 border-t border-border pt-3">
          <View className="gap-1.5">
            <Text className="text-xs font-medium text-foreground">事项名称</Text>
            <TextInput value={content} onChangeText={setContent} placeholder="事项名称..."
              placeholderTextColor="#9ca3af"
              className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background" />
          </View>
          <View className="gap-1.5">
            <Text className="text-xs font-medium text-foreground">描述说明</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="对事项的解释说明..."
              placeholderTextColor="#9ca3af" multiline numberOfLines={2}
              className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background"
              style={{ textAlignVertical: 'top' }} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Text className="text-xs font-medium text-foreground">关联标签</Text>
              <TextInput value={linkedTag} onChangeText={setLinkedTag} placeholder="如：准时王"
                placeholderTextColor="#9ca3af"
                className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background" />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-xs font-medium text-foreground">解锁次数</Text>
              <TextInput value={threshold} onChangeText={setThreshold} keyboardType="numeric" placeholder="如：5"
                placeholderTextColor="#9ca3af"
                className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background" />
            </View>
          </View>
          <Pressable onPress={save} className="bg-primary py-2.5 rounded-xl items-center">
            <Text className="text-sm font-semibold text-white">保存修改</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ─── 备注模板条目 ─────────────────────────────────────────
function RemarkTplRow({
  tpl, idx, total, onDelete, onMoveUp, onMoveDown, onChange,
}: {
  tpl: PerfTemplate; idx: number; total: number;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onChange: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(tpl.content);

  return (
    <View className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-2"
      style={{ borderCurve: 'continuous' }}>
      {editing ? (
        <TextInput value={val} onChangeText={setVal} autoFocus
          className="flex-1 text-sm text-foreground border-b border-primary py-0.5"
          onBlur={() => { setEditing(false); onChange(val.trim() || tpl.content); }} />
      ) : (
        <Pressable className="flex-1" onPress={() => setEditing(true)}>
          <Text className="text-sm text-foreground">{tpl.content}</Text>
        </Pressable>
      )}
      <View className="flex-row items-center gap-1">
        <Pressable onPress={onMoveUp} disabled={idx === 0}
          className={`w-7 h-7 rounded-lg bg-muted items-center justify-center ${idx === 0 ? 'opacity-30' : ''}`}>
          <ChevronUp size={14} color="#374151" />
        </Pressable>
        <Pressable onPress={onMoveDown} disabled={idx === total - 1}
          className={`w-7 h-7 rounded-lg bg-muted items-center justify-center ${idx === total - 1 ? 'opacity-30' : ''}`}>
          <ChevronDown size={14} color="#374151" />
        </Pressable>
        <Pressable onPress={onDelete} className="w-7 h-7 rounded-lg bg-red-50 items-center justify-center">
          <Trash2 size={14} color="#D9381E" />
        </Pressable>
      </View>
    </View>
  );
}

// ─── 多人选择器 Modal ─────────────────────────────────────
function MultiUserPickerModal({
  visible, profiles, profilesLoading,
  selectedIds, onConfirm, onClose,
}: {
  visible: boolean;
  profiles: Profile[];
  profilesLoading: boolean;
  selectedIds: Set<string>;
  onConfirm: (ids: Set<string>) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedIds));

  // 每次打开同步外部状态
  const handleOpen = () => setLocalSelected(new Set(selectedIds));

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase();
    return !q || (p.display_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
  });

  const allSelected = filtered.length > 0 && filtered.every(p => localSelected.has(p.id));

  const toggle = (id: string) => {
    setLocalSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setLocalSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setLocalSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide"
      onRequestClose={onClose} onShow={handleOpen}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable onPress={() => {}} style={{ maxHeight: '75%' }} className="bg-background rounded-t-3xl overflow-hidden">
          {/* 头部 */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-border">
            <View className="flex-row items-center gap-2">
              <Users size={18} color="#008060" />
              <Text className="text-base font-bold text-foreground">选择员工</Text>
              {localSelected.size > 0 ? (
                <View className="bg-primary px-2 py-0.5 rounded-full">
                  <Text className="text-white text-xs font-bold">{localSelected.size}</Text>
                </View>
              ) : null}
            </View>
            <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
              <X size={16} color="#6b7280" />
            </Pressable>
          </View>

          {/* 搜索 + 全选 */}
          <View className="px-4 pt-3 pb-2 gap-2">
            <TextInput value={search} onChangeText={setSearch}
              placeholder="搜索员工姓名..." placeholderTextColor="#9ca3af"
              className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-muted" />
            <Pressable onPress={toggleAll}
              className={`flex-row items-center gap-2 px-3 py-2 rounded-xl border ${allSelected ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}>
              <View className={`w-5 h-5 rounded border-2 items-center justify-center ${allSelected ? 'bg-primary border-primary' : 'border-border'}`}>
                {allSelected ? <Check size={12} color="white" /> : null}
              </View>
              <Text className={`text-sm font-semibold ${allSelected ? 'text-primary' : 'text-foreground'}`}>
                {allSelected ? '取消全选' : `全选当前列表（${filtered.length}人）`}
              </Text>
            </Pressable>
          </View>

          {/* 员工列表 */}
          {profilesLoading ? (
            <View className="h-32 items-center justify-center">
              <ActivityIndicator size="small" color="#008060" />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={p => p.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 2, paddingBottom: 100 }}
              renderItem={({ item: p }) => {
                const checked = localSelected.has(p.id);
                return (
                  <Pressable onPress={() => toggle(p.id)}
                    className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl ${checked ? 'bg-primary/8' : ''}`}>
                    <View className={`w-5 h-5 rounded border-2 items-center justify-center flex-shrink-0 ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                      {checked ? <Check size={12} color="white" /> : null}
                    </View>
                    <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center flex-shrink-0">
                      <Text className="text-sm font-bold text-primary">{(p.display_name || p.email || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-foreground">{p.display_name || p.email || '未命名'}</Text>
                      {p.position ? <Text className="text-xs text-muted-foreground">{p.position}</Text> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          {/* 确认按钮 */}
          <View className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-3 bg-background border-t border-border">
            <Pressable onPress={() => onConfirm(localSelected)} disabled={localSelected.size === 0}
              className={`py-3.5 rounded-2xl items-center ${localSelected.size > 0 ? 'bg-primary' : 'bg-muted'}`}>
              <Text className={`font-bold text-base ${localSelected.size > 0 ? 'text-white' : 'text-muted-foreground'}`}>
                {localSelected.size > 0 ? `确认选择 ${localSelected.size} 人` : '请选择员工'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── 图片上传工具函数 ─────────────────────────────────────────
async function uploadPerfImage(uri: string): Promise<string | null> {
  try {
    const compressed = await manipulateAsync(uri, [{ resize: { width: 1080 } }], { compress: 0.7, format: SaveFormat.JPEG });
    const response = await expoFetch(compressed.uri);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const path = `manage/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const { data, error } = await supabase.storage.from('performance-images').upload(path, buffer, { contentType: 'image/jpeg' });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('performance-images').getPublicUrl(data.path);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}

export default function ManageTab({ addItemTpls, deductItemTpls, remarkTpls, onRefreshTemplates, dateFrom, dateTo }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('presets');

  // ── 预设管理状态 ──
  const [itemTypeTab, setItemTypeTab] = useState<'add_item' | 'deduct_item'>('add_item');
  const [addItems, setAddItems] = useState<PerfTemplate[]>([...addItemTpls]);
  const [deductItems, setDeductItems] = useState<PerfTemplate[]>([...deductItemTpls]);
  const [remarks, setRemarks] = useState<PerfTemplate[]>([...remarkTpls]);
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingDeduct, setSavingDeduct] = useState(false);
  const [savingRemark, setSavingRemark] = useState(false);

  // ── 记录调整状态 ──
  const [adjustRecords, setAdjustRecords] = useState<PerfRecord[]>([]);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustRefreshing, setAdjustRefreshing] = useState(false);
  const [adjustCursor, setAdjustCursor] = useState<string | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { description: string; score: number; remark: string; record_date: string }>>({});
  const [savingRecord, setSavingRecord] = useState<string | null>(null);
  // 长按操作菜单
  const [ctxMenuRecord, setCtxMenuRecord] = useState<PerfRecord | null>(null);
  const [ctxMenuVisible, setCtxMenuVisible] = useState(false);
  // 删除二次确认
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<PerfRecord | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<string | null>(null);

  // 新增记录弹窗
  const [createVisible, setCreateVisible] = useState(false);
  const [createUsers, setCreateUsers] = useState<Profile[]>([]);
  const [createDesc, setCreateDesc] = useState('');
  const [createScore, setCreateScore] = useState(1);
  const [createNote, setCreateNote] = useState('');
  const [createDate, setCreateDate] = useState<Date>(new Date());
  const [showCreateDatePicker, setShowCreateDatePicker] = useState(false);
  const [createImageUri, setCreateImageUri] = useState<string | null>(null);
  const [createImageUploading, setCreateImageUploading] = useState(false);
  const [showCreateImagePicker, setShowCreateImagePicker] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateUserPicker, setShowCreateUserPicker] = useState(false);

  // ── 加分扣分状态 ──
  const [scoringType, setScoringType] = useState<'add' | 'deduct'>('add');
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [scoringDesc, setScoringDesc] = useState('');
  const [scoringScore, setScoringScore] = useState(1);
  const [scoringNote, setScoringNote] = useState('');
  const [scoringSubmitting, setScoringSubmitting] = useState(false);
  const [scoringMsg, setScoringMsg] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const remarkPresets = remarks.map(r => r.content);
  const scoringTemplates = scoringType === 'add' ? addItemTpls : deductItemTpls;

  // 加载员工列表
  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('id, display_name, email, position').order('display_name');
      if (!error) setProfiles(data ?? []);
    } catch { /* 静默 */ }
    finally { setProfilesLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    setAddItems([...addItemTpls]);
    setDeductItems([...deductItemTpls]);
    setRemarks([...remarkTpls]);
    loadAdjustRecords(true);
    loadProfiles();
  }, [addItemTpls, deductItemTpls, remarkTpls, loadProfiles, dateFrom, dateTo]));

  const loadAdjustRecords = useCallback(async (reset = false) => {
    if (adjustLoading && !reset) return;
    if (reset) setAdjustRefreshing(true); else setAdjustLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'list', all: true, cursor: reset ? undefined : adjustCursor };
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      const res = await callApi(body);
      const list: PerfRecord[] = Array.isArray(res?.records) ? res.records : [];
      setAdjustRecords(prev => reset ? list : [...prev, ...list]);
      setAdjustCursor(res?.nextCursor ?? null);
    } catch { /* 静默 */ }
    finally { setAdjustLoading(false); setAdjustRefreshing(false); }
  }, [adjustLoading, adjustCursor, dateFrom, dateTo]);

  // ── 预设管理 ──
  const addNewItem = (type: 'add_item' | 'deduct_item' | 'remark') => {
    const newTpl: PerfTemplate = {
      id: `new_${Date.now()}`, type, content: '新事项', description: null,
      sort_order: 0, linked_tag: null, tag_threshold: null,
    };
    if (type === 'add_item') setAddItems(prev => [...prev, newTpl]);
    else if (type === 'deduct_item') setDeductItems(prev => [...prev, newTpl]);
    else setRemarks(prev => [...prev, newTpl]);
  };

  const moveItem = <T,>(arr: T[], idx: number, dir: 'up' | 'down'): T[] => {
    const next = [...arr];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return next;
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  };

  const saveItems = async (type: 'add_item' | 'deduct_item') => {
    const items = type === 'add_item' ? addItems : deductItems;
    const setSaving = type === 'add_item' ? setSavingAdd : setSavingDeduct;
    setSaving(true);
    try {
      await callApi({ action: 'save_templates', type, items: items.map((t, i) => ({ ...t, sort_order: i })) });
      await onRefreshTemplates();
    } catch { /* 静默 */ }
    finally { setSaving(false); }
  };

  const saveRemarks = async () => {
    setSavingRemark(true);
    try {
      await callApi({ action: 'save_templates', type: 'remark', items: remarks.map((t, i) => ({ ...t, sort_order: i })) });
      await onRefreshTemplates();
    } catch { /* 静默 */ }
    finally { setSavingRemark(false); }
  };

  // ── 记录调整 ──
  const startEdit = (r: PerfRecord) => {
    setExpandedRecord(r.id);
    setEditState(prev => ({
      ...prev,
      [r.id]: {
        description: r.description,
        score: Number(r.score),
        remark: r.remark || '',
        record_date: r.date ? r.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      },
    }));
  };

  const saveAdjust = async (r: PerfRecord) => {
    const e = editState[r.id];
    if (!e) return;
    setSavingRecord(r.id);
    try {
      await callApi({ action: 'update_record', id: r.id, description: e.description, score: e.score, remark: e.remark, date: e.record_date });
      setExpandedRecord(null);
      await loadAdjustRecords(true);
    } catch { /* 静默 */ }
    finally { setSavingRecord(null); }
  };

  // ── 删除 ──
  const openCtxMenu = (r: PerfRecord) => { setCtxMenuRecord(r); setCtxMenuVisible(true); };
  const openDeleteConfirm = (r: PerfRecord) => { setDeleteConfirmRecord(r); setDeleteConfirmVisible(true); };

  const handleCtxEdit = () => {
    if (!ctxMenuRecord) return;
    setCtxMenuVisible(false);
    startEdit(ctxMenuRecord);
  };

  const handleCtxDelete = () => {
    if (!ctxMenuRecord) return;
    setCtxMenuVisible(false);
    setDeleteConfirmRecord(ctxMenuRecord);
    setDeleteConfirmVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmRecord) return;
    setDeletingRecord(deleteConfirmRecord.id);
    try {
      await callApi({ action: 'delete', id: deleteConfirmRecord.id });
      setDeleteConfirmVisible(false);
      setDeleteConfirmRecord(null);
      await loadAdjustRecords(true);
    } catch { /* 静默 */ }
    finally { setDeletingRecord(null); }
  };

  // ── 新增记录 ──
  const resetCreateForm = () => {
    setCreateUsers([]);
    setCreateDesc('');
    setCreateScore(1);
    setCreateNote('');
    setCreateDate(new Date());
    setCreateImageUri(null);
    setCreateMsg('');
  };

  const pickCreateImage = async (fromCamera: boolean) => {
    setShowCreateImagePicker(false);
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!result.canceled) setCreateImageUri(result.assets[0].uri);
  };

  const handleCreate = async () => {
    if (createUsers.length === 0) { setCreateMsg('请选择员工'); return; }
    if (!createDesc.trim()) { setCreateMsg('请选择或填写事项'); return; }
    setCreateMsg('');
    setCreating(true);
    try {
      // 上传图片（如有）
      let imageUrl: string | null = null;
      if (createImageUri) {
        setCreateImageUploading(true);
        imageUrl = await uploadPerfImage(createImageUri);
        setCreateImageUploading(false);
        if (!imageUrl) { setCreateMsg('图片上传失败，请重试'); setCreating(false); return; }
      }
      const dateStr = createDate.toISOString().slice(0, 10);
      // 批量为每个员工创建记录
      await Promise.all(createUsers.map(u =>
        callApi({
          action: 'add',
          user_id: u.id,
          description: createDesc.trim(),
          score: createScore,
          note: createNote.trim() || null,
          date: dateStr,
          image_url: imageUrl,
        })
      ));
      setCreateVisible(false);
      resetCreateForm();
      await loadAdjustRecords(true);
    } catch (err: unknown) {
      setCreateMsg(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
      setCreateImageUploading(false);
    }
  };

  // ── 加分扣分提交 ──
  const handleScoringSubmit = async () => {
    if (selectedUsers.length === 0) { setScoringMsg('请选择员工'); return; }
    if (!scoringDesc.trim()) { setScoringMsg('请选择或填写事项'); return; }
    setScoringMsg('');
    setScoringSubmitting(true);
    try {
      await Promise.all(selectedUsers.map(u =>
        callApi({
          action: 'add',
          user_id: u.id,
          description: scoringDesc.trim(),
          score: scoringScore,
          note: scoringNote.trim() || null,
        })
      ));
      setSelectedUsers([]);
      setScoringDesc('');
      setScoringScore(1);
      setScoringNote('');
      setScoringMsg(selectedUsers.length > 1 ? `已为 ${selectedUsers.length} 人提交成功` : '提交成功');
    } catch (e: unknown) {
      setScoringMsg(e instanceof Error ? e.message : '提交失败');
    } finally {
      setScoringSubmitting(false);
    }
  };

  const currentItems = itemTypeTab === 'add_item' ? addItems : deductItems;
  const setCurrentItems = itemTypeTab === 'add_item' ? setAddItems : setDeductItems;
  const currentSaving = itemTypeTab === 'add_item' ? savingAdd : savingDeduct;

  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <View className="flex-1 bg-background">
      {/* 子Tab */}
      <View className="flex-row border-b border-border px-4 pt-2">
        {[
          { key: 'presets' as SubTab, label: '预设管理' },
          { key: 'adjust' as SubTab, label: '记录调整' },
          { key: 'scoring' as SubTab, label: '加分扣分' },
        ].map(t => (
          <Pressable key={t.key} onPress={() => setSubTab(t.key)}
            className={`mr-6 pb-2.5 ${subTab === t.key ? 'border-b-2 border-primary' : ''}`}>
            <Text className={`text-sm font-semibold ${subTab === t.key ? 'text-primary' : 'text-muted-foreground'}`}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── 预设管理 ── */}
      {subTab === 'presets' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}>

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">事项模板</Text>
            <View className="flex-row gap-2">
              {(['add_item', 'deduct_item'] as const).map(t => (
                <Pressable key={t} onPress={() => setItemTypeTab(t)}
                  className={`flex-1 py-2 rounded-xl items-center border ${itemTypeTab === t ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                  <Text className={`text-sm font-semibold ${itemTypeTab === t ? 'text-white' : 'text-foreground'}`}>
                    {t === 'add_item' ? '加分事项' : '扣分事项'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="gap-2">
              {currentItems.map((tpl, idx) => (
                <ItemTplRow key={tpl.id} tpl={tpl} idx={idx} total={currentItems.length}
                  onDelete={() => setCurrentItems(prev => prev.filter((_, i) => i !== idx))}
                  onMoveUp={() => setCurrentItems(prev => moveItem(prev, idx, 'up'))}
                  onMoveDown={() => setCurrentItems(prev => moveItem(prev, idx, 'down'))}
                  onEdit={updated => setCurrentItems(prev => prev.map((t, i) => i === idx ? updated : t))}
                />
              ))}
            </View>
            <View className="flex-row gap-2">
              <Pressable onPress={() => addNewItem(itemTypeTab)}
                className="flex-1 py-2.5 rounded-xl bg-muted items-center border border-dashed border-border">
                <Text className="text-sm text-muted-foreground">+ 新增事项</Text>
              </Pressable>
              <Pressable onPress={() => saveItems(itemTypeTab)} disabled={currentSaving}
                className={`flex-1 py-2.5 rounded-xl bg-primary items-center ${currentSaving ? 'opacity-60' : ''}`}>
                {currentSaving ? <ActivityIndicator size="small" color="white" />
                  : <Text className="text-sm font-semibold text-white">保存事项模板</Text>}
              </Pressable>
            </View>
          </View>

          <View className="h-px bg-border" />

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">备注模板</Text>
            <View className="gap-2">
              {remarks.map((tpl, idx) => (
                <RemarkTplRow key={tpl.id} tpl={tpl} idx={idx} total={remarks.length}
                  onDelete={() => setRemarks(prev => prev.filter((_, i) => i !== idx))}
                  onMoveUp={() => setRemarks(prev => moveItem(prev, idx, 'up'))}
                  onMoveDown={() => setRemarks(prev => moveItem(prev, idx, 'down'))}
                  onChange={content => setRemarks(prev => prev.map((t, i) => i === idx ? { ...t, content } : t))}
                />
              ))}
            </View>
            <View className="flex-row gap-2">
              <Pressable onPress={() => addNewItem('remark')}
                className="flex-1 py-2.5 rounded-xl bg-muted items-center border border-dashed border-border">
                <Text className="text-sm text-muted-foreground">+ 新增备注</Text>
              </Pressable>
              <Pressable onPress={saveRemarks} disabled={savingRemark}
                className={`flex-1 py-2.5 rounded-xl bg-primary items-center ${savingRemark ? 'opacity-60' : ''}`}>
                {savingRemark ? <ActivityIndicator size="small" color="white" />
                  : <Text className="text-sm font-semibold text-white">保存备注模板</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : null}

      {/* ── 记录调整 ── */}
      {subTab === 'adjust' ? (
        <>
        <FlatList
          data={adjustRecords} keyExtractor={i => i.id}
          refreshing={adjustRefreshing} onRefresh={() => loadAdjustRecords(true)}
          onEndReached={() => adjustCursor && !adjustLoading && loadAdjustRecords(false)}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, paddingBottom: 88 }}
          contentInsetAdjustmentBehavior="automatic"
          ListFooterComponent={adjustLoading && !adjustRefreshing ? <ActivityIndicator size="small" color="#008060" className="my-4" /> : null}
          ListEmptyComponent={!adjustLoading && !adjustRefreshing ? (
            <View className="items-center mt-16 gap-2">
              <Text className="text-4xl">📋</Text>
              <Text className="text-muted-foreground text-sm">暂无绩效记录</Text>
            </View>
          ) : null}
          renderItem={({ item }) => {
            const isExpanded = expandedRecord === item.id;
            const e = editState[item.id];
            const name = getDisplayName(item);
            const score = Number(item.score);
            const allTplContents = [...addItemTpls, ...deductItemTpls].map(t => t.content);

            return (
              <View className="bg-card border border-border rounded-2xl overflow-hidden" style={{ borderCurve: 'continuous' }}>
                <Pressable
                  onPress={() => isExpanded ? setExpandedRecord(null) : startEdit(item)}
                  onLongPress={() => openCtxMenu(item)}
                  delayLongPress={350}
                  className="flex-row items-center px-4 py-3 gap-3">
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-semibold text-foreground">{name}</Text>
                      {item.user?.position ? <Text className="text-xs text-muted-foreground">{item.user.position}</Text> : null}
                    </View>
                    <Text className="text-xs text-foreground/80" numberOfLines={1}>{item.item_name || item.description}</Text>
                    <Text className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</Text>
                  </View>
                  <View className="items-end gap-1 flex-row items-center gap-2">
                    <Text style={{ color: score >= 0 ? '#008060' : '#D9381E' }} className="text-base font-bold">
                      {score >= 0 ? `+${score}` : `${score}`}分
                    </Text>
                    {/* 快速删除按钮 */}
                    <Pressable
                      onPress={() => openDeleteConfirm(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      className="w-8 h-8 rounded-full bg-red-50 items-center justify-center">
                      <Trash2 size={15} color="#D9381E" />
                    </Pressable>
                    {isExpanded ? <ChevronUp size={16} color="#6b7280" /> : <ChevronDown size={16} color="#6b7280" />}
                  </View>
                </Pressable>

                {isExpanded && e ? (
                  <View className="px-4 pb-4 gap-3 border-t border-border pt-3">
                    {/* 记录日期 */}
                    <View className="gap-1.5">
                      <Text className="text-xs font-medium text-foreground">记录日期</Text>
                      <TextInput
                        value={e.record_date}
                        onChangeText={v => setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], record_date: v } }))}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9ca3af"
                        className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background"
                      />
                    </View>

                    {/* 事项选择 */}
                    <View className="gap-1.5">
                      <Text className="text-xs font-medium text-foreground">申请事项</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {allTplContents.map(c => (
                          <Pressable key={c} onPress={() => setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], description: c } }))}
                            className={`px-3 py-1.5 rounded-xl border ${e.description === c ? 'bg-primary border-primary' : 'bg-muted border-border'}`}>
                            <Text className={`text-xs ${e.description === c ? 'text-white font-semibold' : 'text-foreground'}`}>{c}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <TextInput value={e.description} onChangeText={v => setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], description: v } }))}
                        placeholder="或手动输入..." placeholderTextColor="#9ca3af"
                        className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background" />
                    </View>

                    {/* 分值调整 */}
                    <View className="gap-1.5">
                      <Text className="text-xs font-medium text-foreground">分值</Text>
                      <View className="flex-row items-center gap-4">
                        <Pressable onPress={() => setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], score: prev[item.id].score - 1 } }))}
                          className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                          <Minus size={18} color="#374151" />
                        </Pressable>
                        <Text className="text-xl font-bold min-w-[48px] text-center"
                          style={{ color: e.score >= 0 ? '#008060' : '#D9381E' }}>
                          {e.score >= 0 ? `+${e.score}` : `${e.score}`}
                        </Text>
                        <Pressable onPress={() => setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], score: prev[item.id].score + 1 } }))}
                          className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                          <Plus size={18} color="#374151" />
                        </Pressable>
                      </View>
                    </View>

                    {/* 备注 */}
                    <RemarkSelector
                      value={e.remark} onChange={v => setEditState(prev => ({ ...prev, [item.id]: { ...prev[item.id], remark: v } }))}
                      presets={remarkPresets} label="备注" placeholder="填写备注..." />

                    <View className="flex-row gap-2">
                      <Pressable onPress={() => setExpandedRecord(null)}
                        className="flex-1 py-2.5 rounded-xl bg-muted items-center">
                        <Text className="text-sm font-semibold text-foreground">取消</Text>
                      </Pressable>
                      <Pressable onPress={() => saveAdjust(item)} disabled={savingRecord === item.id}
                        className={`flex-1 py-2.5 rounded-xl bg-primary items-center ${savingRecord === item.id ? 'opacity-60' : ''}`}>
                        {savingRecord === item.id ? <ActivityIndicator size="small" color="white" />
                          : <Text className="text-sm font-semibold text-white">保存修改</Text>}
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          }}
        />

        {/* ── 新增记录按钮 ── */}
        <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-background border-t border-border">
          <Pressable onPress={() => { resetCreateForm(); setCreateVisible(true); }}
            className="bg-primary py-3.5 rounded-2xl items-center"
            style={{ borderCurve: 'continuous' }}>
            <Text className="text-white font-bold text-base">+ 新增绩效记录</Text>
          </Pressable>
        </View>

        {/* ── 长按操作菜单 ── */}
        <Modal visible={ctxMenuVisible} transparent animationType="fade" onRequestClose={() => setCtxMenuVisible(false)}>
          <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setCtxMenuVisible(false)}>
            <Pressable onPress={() => {}} className="bg-background rounded-t-3xl overflow-hidden">
              <View className="items-center pt-3 pb-1">
                <View className="w-10 h-1 rounded-full bg-muted" />
              </View>
              {ctxMenuRecord ? (
                <View className="px-5 py-3 border-b border-border">
                  <Text className="text-base font-bold text-foreground" numberOfLines={1}>{getDisplayName(ctxMenuRecord)}</Text>
                  <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                    {ctxMenuRecord.item_name || ctxMenuRecord.description} · {formatDateTime(ctxMenuRecord.created_at)}
                  </Text>
                </View>
              ) : null}
              <Pressable onPress={handleCtxEdit} className="active:opacity-70">
                <View className="flex-row items-center gap-4 px-5 py-4 border-b border-border">
                  <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                    <Edit3 size={18} color="#059669" />
                  </View>
                  <View>
                    <Text className="text-base font-semibold text-foreground">修改</Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">编辑事项、分值、备注、日期</Text>
                  </View>
                </View>
              </Pressable>
              <Pressable onPress={handleCtxDelete} className="active:opacity-70">
                <View className="flex-row items-center gap-4 px-5 py-4">
                  <View className="w-10 h-10 rounded-full bg-red-50 items-center justify-center">
                    <Trash2 size={18} color="#D9381E" />
                  </View>
                  <View>
                    <Text className="text-base font-semibold text-red-600">删除</Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">删除此条绩效记录，不可恢复</Text>
                  </View>
                </View>
              </Pressable>
              <View className="px-5 pt-2 pb-8">
                <Pressable onPress={() => setCtxMenuVisible(false)}
                  style={{ height: 46, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>取消</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── 删除二次确认弹窗 ── */}
        <Modal visible={deleteConfirmVisible} transparent animationType="fade" onRequestClose={() => setDeleteConfirmVisible(false)}>
          <View className="flex-1 bg-black/40 items-center justify-center px-6">
            <View className="bg-background rounded-3xl overflow-hidden w-full" style={{ borderCurve: 'continuous', maxWidth: 360 } as object}>
              <View className="px-6 pt-6 pb-4 gap-2">
                <Text className="text-lg font-bold text-foreground text-center">确认删除</Text>
                <Text className="text-sm text-muted-foreground text-center">
                  确定要删除{deleteConfirmRecord ? ` "${getDisplayName(deleteConfirmRecord)}" ` : ''}的这条绩效记录吗？删除后无法恢复。
                </Text>
              </View>
              <View className="h-px bg-border" />
              <View className="flex-row">
                <Pressable onPress={() => { setDeleteConfirmVisible(false); setDeleteConfirmRecord(null); }}
                  className="flex-1 py-4 items-center border-r border-border">
                  <Text className="text-base font-semibold text-foreground">取消</Text>
                </Pressable>
                <Pressable onPress={handleDeleteConfirm}
                  disabled={deletingRecord !== null}
                  className={`flex-1 py-4 items-center ${deletingRecord ? 'opacity-60' : ''}`}>
                  {deletingRecord ? <ActivityIndicator size="small" color="#D9381E" />
                    : <Text className="text-base font-semibold text-red-600">确认删除</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── 新增记录弹窗 ── */}
        <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
          <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setCreateVisible(false)}>
            <Pressable onPress={() => {}} className="bg-background rounded-t-3xl overflow-hidden">
              <View className="items-center pt-3 pb-1">
                <View className="w-10 h-1 rounded-full bg-muted" />
              </View>
              <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border">
                <Text className="text-base font-bold text-foreground">新增绩效记录</Text>
                <Pressable onPress={() => setCreateVisible(false)}
                  className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                  <X size={16} color="#6b7280" />
                </Pressable>
              </View>
              <KeyboardAvoidingView behavior="padding">
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 16, paddingBottom: 40 }}
                  keyboardShouldPersistTaps="handled">

                  {/* 员工多选 */}
                  <View className="gap-1.5">
                    <Text className="text-xs font-medium text-foreground">
                      选择员工 <Text className="text-destructive">*</Text>
                      {createUsers.length > 0 ? <Text className="text-primary"> （已选 {createUsers.length} 人）</Text> : null}
                    </Text>
                    {createUsers.length > 0 ? (
                      <View className="bg-card border border-border rounded-xl px-3 py-2.5 gap-2">
                        <View className="flex-row flex-wrap gap-1.5">
                          {createUsers.map(u => (
                            <View key={u.id} className="flex-row items-center gap-1 bg-primary/10 px-2 py-1 rounded-full">
                              <Text className="text-xs font-medium text-primary">{u.display_name || u.email || '未命名'}</Text>
                              <Pressable onPress={() => setCreateUsers(prev => prev.filter(x => x.id !== u.id))}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                                <X size={10} color="#008060" />
                              </Pressable>
                            </View>
                          ))}
                        </View>
                        <Pressable onPress={() => setShowCreateUserPicker(true)}
                          className="flex-row items-center gap-1">
                          <User size={13} color="#008060" />
                          <Text className="text-xs text-primary font-medium">修改选择</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => setShowCreateUserPicker(true)}
                        className="flex-row items-center border border-border rounded-xl px-3 py-2.5 bg-background gap-2">
                        <Users size={16} color="#6b7280" />
                        <Text className="flex-1 text-sm text-muted-foreground">点击选择员工（支持多选/全选）...</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* 记录日期（DateTimePicker） */}
                  <View className="gap-1.5">
                    <Text className="text-xs font-medium text-foreground">记录日期</Text>
                    <Pressable onPress={() => setShowCreateDatePicker(true)}
                      className="flex-row items-center border border-border rounded-xl px-3 py-2.5 bg-background gap-2">
                      <Text className="text-sm text-foreground flex-1">{fmtDate(createDate)}</Text>
                      <ChevronDown size={16} color="#6b7280" />
                    </Pressable>
                  </View>

                  {/* 事项 */}
                  <View className="gap-1.5">
                    <Text className="text-xs font-medium text-foreground">绩效事项 <Text className="text-destructive">*</Text></Text>
                    <View className="flex-row flex-wrap gap-2">
                      {[...addItemTpls, ...deductItemTpls].map(t => (
                        <Pressable key={t.id} onPress={() => { setCreateDesc(t.content); setCreateScore(t.type === 'deduct_item' ? -Math.abs(createScore) : Math.abs(createScore)); }}
                          className={`px-3 py-1.5 rounded-xl border ${createDesc === t.content ? 'bg-primary border-primary' : 'bg-muted border-border'}`}>
                          <Text className={`text-xs ${createDesc === t.content ? 'text-white font-semibold' : 'text-foreground'}`}>{t.content}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput value={createDesc} onChangeText={setCreateDesc}
                      placeholder="或手动输入事项..." placeholderTextColor="#9ca3af"
                      className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background" />
                  </View>

                  {/* 分值 */}
                  <View className="gap-1.5">
                    <Text className="text-xs font-medium text-foreground">分值</Text>
                    <View className="flex-row items-center gap-4">
                      <Pressable onPress={() => setCreateScore(s => s - 1)}
                        className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                        <Minus size={18} color="#374151" />
                      </Pressable>
                      <Text className="text-xl font-bold min-w-[48px] text-center"
                        style={{ color: createScore >= 0 ? '#008060' : '#D9381E' }}>
                        {createScore >= 0 ? `+${createScore}` : `${createScore}`}
                      </Text>
                      <Pressable onPress={() => setCreateScore(s => s + 1)}
                        className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                        <Plus size={18} color="#374151" />
                      </Pressable>
                    </View>
                  </View>

                  {/* 备注 */}
                  <View className="gap-1.5">
                    <Text className="text-xs font-medium text-foreground">备注（选填）</Text>
                    <TextInput value={createNote} onChangeText={setCreateNote}
                      placeholder="填写备注..." placeholderTextColor="#9ca3af"
                      multiline numberOfLines={2}
                      className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-background"
                      style={{ textAlignVertical: 'top' }} />
                  </View>

                  {/* 图片上传 */}
                  <View className="gap-1.5">
                    <Text className="text-xs font-medium text-foreground">凭证图片（选填）</Text>
                    {createImageUri ? (
                      <View className="relative">
                        <Image source={{ uri: createImageUri }} style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" />
                        <Pressable onPress={() => setCreateImageUri(null)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 items-center justify-center">
                          <X size={14} color="white" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => setShowCreateImagePicker(true)}
                        className="border-2 border-dashed border-border rounded-xl h-20 items-center justify-center gap-1 bg-muted">
                        {createImageUploading ? <ActivityIndicator size="small" color="#008060" /> : (
                          <>
                            <ImageIcon size={22} color="#9ca3af" />
                            <Text className="text-xs text-muted-foreground">点击选择图片</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>

                  {createMsg ? <Text className="text-xs text-destructive">{createMsg}</Text> : null}

                  <Pressable onPress={handleCreate} disabled={creating}
                    className={`bg-primary py-3.5 rounded-2xl items-center ${creating ? 'opacity-60' : ''}`}>
                    {creating ? <ActivityIndicator size="small" color="white" />
                      : <Text className="text-base font-bold text-white">
                          {createUsers.length > 1 ? `确认新增（${createUsers.length} 人）` : '确认新增'}
                        </Text>}
                  </Pressable>
                </ScrollView>
              </KeyboardAvoidingView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── 员工多选弹窗（新增记录） ── */}
        <MultiUserPickerModal
          visible={showCreateUserPicker}
          profiles={profiles}
          profilesLoading={profilesLoading}
          selectedIds={new Set(createUsers.map(u => u.id))}
          onConfirm={ids => {
            setCreateUsers(profiles.filter(p => ids.has(p.id)));
            setShowCreateUserPicker(false);
          }}
          onClose={() => setShowCreateUserPicker(false)}
        />

        {/* ── 日期选择器弹窗（新增记录） ── */}
        <Modal visible={showCreateDatePicker} transparent animationType="slide" onRequestClose={() => setShowCreateDatePicker(false)}>
          <Pressable className="flex-1 bg-black/40" onPress={() => setShowCreateDatePicker(false)} />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-8">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground">选择记录日期</Text>
              <Pressable onPress={() => setShowCreateDatePicker(false)} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            <DateTimePicker
              mode="single"
              date={createDate}
              onChange={({ date }) => { if (date) setCreateDate(new Date(date as string)); }}
              styles={{ selected: { backgroundColor: '#008060' }, selected_label: { color: '#fff' } }}
            />
            <Pressable onPress={() => setShowCreateDatePicker(false)}
              className="bg-primary rounded-xl py-4 items-center mt-4">
              <Text className="text-white font-semibold text-base">确认 {fmtDate(createDate)}</Text>
            </Pressable>
          </View>
        </Modal>

        {/* ── 图片来源选择弹窗（新增记录） ── */}
        <Modal visible={showCreateImagePicker} transparent animationType="fade" onRequestClose={() => setShowCreateImagePicker(false)}>
          <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setShowCreateImagePicker(false)}>
            <View className="bg-background rounded-t-3xl px-5 pt-5 pb-8 gap-3">
              <Text className="text-base font-bold text-foreground text-center mb-1">选择图片来源</Text>
              <Pressable onPress={() => pickCreateImage(true)} className="py-4 rounded-xl bg-card border border-border items-center">
                <Text className="text-sm font-semibold text-foreground">拍照</Text>
              </Pressable>
              <Pressable onPress={() => pickCreateImage(false)} className="py-4 rounded-xl bg-card border border-border items-center">
                <Text className="text-sm font-semibold text-foreground">从相册选择</Text>
              </Pressable>
              <Pressable onPress={() => setShowCreateImagePicker(false)} className="py-4 rounded-xl bg-muted items-center">
                <Text className="text-sm font-semibold text-muted-foreground">取消</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
        </>
      ) : null}

      {/* ── 加分扣分 ── */}
      {subTab === 'scoring' ? (
        <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* 选择员工（多选） */}
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">
                选择员工 <Text className="text-destructive">*</Text>
                {selectedUsers.length > 0 ? <Text className="text-primary"> （已选 {selectedUsers.length} 人）</Text> : null}
              </Text>
              {selectedUsers.length > 0 ? (
                <View className="bg-card border border-border rounded-xl px-3 py-2.5 gap-2">
                  <View className="flex-row flex-wrap gap-1.5">
                    {selectedUsers.map(u => (
                      <View key={u.id} className="flex-row items-center gap-1 bg-primary/10 px-2 py-1 rounded-full">
                        <Text className="text-xs font-medium text-primary">{u.display_name || u.email || '未命名'}</Text>
                        <Pressable onPress={() => setSelectedUsers(prev => prev.filter(x => x.id !== u.id))}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                          <X size={10} color="#008060" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={() => setShowUserPicker(true)} className="flex-row items-center gap-1">
                    <User size={13} color="#008060" />
                    <Text className="text-xs text-primary font-medium">修改选择</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowUserPicker(true)}
                  className="flex-row items-center gap-2 border-2 border-dashed border-border rounded-xl px-3 py-3 bg-card">
                  <Users size={20} color="#9ca3af" />
                  <Text className="text-sm text-muted-foreground">点击选择员工（支持多选/全选）</Text>
                </Pressable>
              )}
            </View>

            {/* 加分/扣分切换 */}
            <View className="flex-row gap-2">
              {(['add', 'deduct'] as const).map(t => (
                <Pressable key={t} onPress={() => {
                  setScoringType(t);
                  setScoringDesc('');
                  setScoringScore(t === 'add' ? 1 : -1);
                }}
                  className={`flex-1 py-2.5 rounded-xl items-center border ${scoringType === t ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                  <Text className={`text-sm font-semibold ${scoringType === t ? 'text-white' : 'text-foreground'}`}>
                    {t === 'add' ? '加分' : '扣分'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 选择事项 */}
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">选择事项 <Text className="text-destructive">*</Text></Text>
              <View className="flex-row flex-wrap gap-2">
                {scoringTemplates.map(t => (
                  <Pressable key={t.id} onPress={() => setScoringDesc(t.content)}
                    className={`px-3 py-2 rounded-xl border ${scoringDesc === t.content ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                    <Text className={`text-sm ${scoringDesc === t.content ? 'text-white font-semibold' : 'text-foreground'}`}>{t.content}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput value={scoringDesc} onChangeText={setScoringDesc}
                placeholder="或手动输入事项..." placeholderTextColor="#9ca3af"
                className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card" />
            </View>

            {/* 分值 */}
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">分值</Text>
              <View className="flex-row items-center gap-4">
                <Pressable onPress={() => setScoringScore(prev => prev - 1)}
                  className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                  <Minus size={18} color="#374151" />
                </Pressable>
                <Text className="text-xl font-bold min-w-[48px] text-center"
                  style={{ color: scoringScore >= 0 ? '#008060' : '#D9381E' }}>
                  {scoringScore >= 0 ? `+${scoringScore}` : `${scoringScore}`}
                </Text>
                <Pressable onPress={() => setScoringScore(prev => prev + 1)}
                  className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                  <Plus size={18} color="#374151" />
                </Pressable>
              </View>
            </View>

            {/* 备注 */}
            <RemarkSelector
              value={scoringNote} onChange={setScoringNote}
              presets={remarkPresets} label="备注" placeholder="填写备注（可选）..." />

            {scoringMsg ? (
              <Text className={`text-sm text-center ${scoringMsg.includes('成功') ? 'text-green-600' : 'text-destructive'}`}>
                {scoringMsg}
              </Text>
            ) : null}

            <Pressable onPress={handleScoringSubmit} disabled={scoringSubmitting}
              className={`py-3 rounded-xl bg-primary items-center ${scoringSubmitting ? 'opacity-60' : ''}`}>
              {scoringSubmitting ? <ActivityIndicator size="small" color="white" />
                : <Text className="text-sm font-semibold text-white">
                    {selectedUsers.length > 1 ? `提交（${selectedUsers.length} 人）` : '提交'}
                  </Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      {/* ── 员工多选弹窗（加分扣分） ── */}
      <MultiUserPickerModal
        visible={showUserPicker}
        profiles={profiles}
        profilesLoading={profilesLoading}
        selectedIds={new Set(selectedUsers.map(u => u.id))}
        onConfirm={ids => {
          setSelectedUsers(profiles.filter(p => ids.has(p.id)));
          setShowUserPicker(false);
        }}
        onClose={() => setShowUserPicker(false)}
      />
    </View>
  );
}
