import { useCallback, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Tag,
  Truck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getSupplierRecords,
  createSupplierRecord,
  updateSupplierRecord,
  deleteSupplierRecord,
} from '@/db/api';
import type { IngredientCategoryRecord, IngredientSubcategoryRecord, IngredientSupplierRecord } from '@/types/types';

type TabType = 'category' | 'supplier';

// ===== 通用删除确认弹窗 =====
function DeleteModal({
  visible,
  name,
  onCancel,
  onConfirm,
  loading,
}: {
  visible: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View
          className="bg-card rounded-2xl p-6 w-full"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0,0,0,0.18)' }] } as object}
        >
          <View className="w-12 h-12 rounded-full bg-red-50 items-center justify-center mb-4 self-center">
            <Trash2 size={24} color="#ef4444" />
          </View>
          <Text className="text-base font-bold text-foreground text-center mb-2">确认删除</Text>
          <Text className="text-sm text-muted-foreground text-center mb-6">
            确定删除「{name}」吗？删除后不可恢复。
          </Text>
          <View className="flex-row gap-3">
            <Pressable
              style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              onPress={onCancel}
              disabled={loading}
            >
              <Text className="text-foreground font-medium">取消</Text>
            </Pressable>
            <Pressable
              className="active:opacity-80"
              style={{
                flex: 1, height: 48, borderRadius: 8, backgroundColor: '#E64340',
                alignItems: 'center', justifyContent: 'center',
              }}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '600' }}>确认删除</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ===== 品类管理面板（支持两级：品类 + 子分类）=====
function CategoryPanel() {
  const [items, setItems] = useState<IngredientCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // 展开的品类 id 集合
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 各品类对应的子分类数据 categoryId -> list
  const [subMap, setSubMap] = useState<Record<string, IngredientSubcategoryRecord[]>>({});

  // ---- 品类新增/编辑 ----
  const [formVisible, setFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<IngredientCategoryRecord | null>(null);
  const [formRows, setFormRows] = useState<string[]>(['']);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IngredientCategoryRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---- 子分类新增/编辑 ----
  const [subFormVisible, setSubFormVisible] = useState(false);
  const [subFormCategoryId, setSubFormCategoryId] = useState<string>('');
  const [subFormCategoryName, setSubFormCategoryName] = useState<string>('');
  const [subEditTarget, setSubEditTarget] = useState<IngredientSubcategoryRecord | null>(null);
  const [subFormRows, setSubFormRows] = useState<string[]>(['']);
  const [subFormError, setSubFormError] = useState('');
  const [subSaving, setSubSaving] = useState(false);
  const [subDeleteTarget, setSubDeleteTarget] = useState<IngredientSubcategoryRecord | null>(null);
  const [subDeleting, setSubDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setLoading(true);
    const cats = await getCategories();
    setItems(cats);
    setLoading(false);
  };

  const loadSubs = async (categoryId: string) => {
    const subs = await getSubcategories(categoryId);
    setSubMap((prev) => ({ ...prev, [categoryId]: subs }));
  };

  const toggleExpand = (categoryId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
        loadSubs(categoryId);
      }
      return next;
    });
  };

  // ---- 品类操作 ----
  const openAdd = () => {
    setEditTarget(null);
    setFormRows(['']);
    setFormError('');
    setFormVisible(true);
  };

  const openEdit = (item: IngredientCategoryRecord) => {
    setEditTarget(item);
    setFormRows([item.name]);
    setFormError('');
    setFormVisible(true);
  };

  const handleSave = async () => {
    if (editTarget) {
      const name = formRows[0]?.trim();
      if (!name) { setFormError('请填写品类名称'); return; }
      setSaving(true);
      setFormError('');
      await updateCategory(editTarget.id, { name });
      setFormVisible(false);
      setSaving(false);
      await load();
      return;
    }
    const names = formRows.map((r) => r.trim()).filter(Boolean);
    if (names.length === 0) { setFormError('请至少填写一个品类名称'); return; }
    setSaving(true);
    setFormError('');
    for (const name of names) {
      await createCategory(name);
    }
    setFormVisible(false);
    setSaving(false);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteCategory(deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    await load();
  };

  // ---- 子分类操作 ----
  const openSubAdd = (cat: IngredientCategoryRecord) => {
    setSubFormCategoryId(cat.id);
    setSubFormCategoryName(cat.name);
    setSubEditTarget(null);
    setSubFormRows(['']);
    setSubFormError('');
    setSubFormVisible(true);
  };

  const openSubEdit = (sub: IngredientSubcategoryRecord, catName: string) => {
    setSubFormCategoryId(sub.category_id);
    setSubFormCategoryName(catName);
    setSubEditTarget(sub);
    setSubFormRows([sub.name]);
    setSubFormError('');
    setSubFormVisible(true);
  };

  const handleSubSave = async () => {
    if (subEditTarget) {
      const name = subFormRows[0]?.trim();
      if (!name) { setSubFormError('请填写子分类名称'); return; }
      setSubSaving(true);
      setSubFormError('');
      await updateSubcategory(subEditTarget.id, name);
      setSubFormVisible(false);
      setSubSaving(false);
      await loadSubs(subFormCategoryId);
      return;
    }
    const names = subFormRows.map((r) => r.trim()).filter(Boolean);
    if (names.length === 0) { setSubFormError('请至少填写一个子分类名称'); return; }
    setSubSaving(true);
    setSubFormError('');
    for (const name of names) {
      await createSubcategory(subFormCategoryId, name);
    }
    setSubFormVisible(false);
    setSubSaving(false);
    await loadSubs(subFormCategoryId);
  };

  const handleSubDelete = async () => {
    if (!subDeleteTarget) return;
    setSubDeleting(true);
    await deleteSubcategory(subDeleteTarget.id);
    setSubDeleteTarget(null);
    setSubDeleting(false);
    await loadSubs(subDeleteTarget.category_id);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, gap: 8 }}
        ListEmptyComponent={
          <View className="items-center justify-center py-16 gap-3">
            <Tag size={40} color="#d1d5db" />
            <Text className="text-muted-foreground">暂无品类，点击右下角新增</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isExpanded = expanded.has(item.id);
          const subs = subMap[item.id] ?? [];
          return (
            <View
              className="bg-card rounded-2xl overflow-hidden"
              style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
            >
              {/* 品类行 */}
              <View className="px-4 py-3.5 flex-row items-center gap-3">
                <Pressable
                  onPress={() => toggleExpand(item.id)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
                    <Tag size={16} color="#059669" />
                  </View>
                  <Text className="flex-1 text-base font-semibold text-foreground">{item.name}</Text>
                  {isExpanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                </Pressable>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => openEdit(item)}
                    className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center active:opacity-70"
                  >
                    <Pencil size={14} color="#059669" />
                  </Pressable>
                  <Pressable
                    onPress={() => setDeleteTarget(item)}
                    className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:opacity-70"
                  >
                    <Trash2 size={14} color="#ef4444" />
                  </Pressable>
                </View>
              </View>

              {/* 展开区：子分类列表 */}
              {isExpanded && (
                <View style={{ backgroundColor: '#f9fafb', borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  {subs.map((sub) => (
                    <View
                      key={sub.id}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 8 }}
                    >
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#9ca3af' }} />
                      <Text style={{ flex: 1, fontSize: 13, color: '#374151' }}>{sub.name}</Text>
                      <Pressable
                        onPress={() => openSubEdit(sub, item.name)}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Pencil size={12} color="#059669" />
                      </Pressable>
                      <Pressable
                        onPress={() => setSubDeleteTarget(sub)}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={12} color="#ef4444" />
                      </Pressable>
                    </View>
                  ))}
                  {/* 新增子分类按钮 */}
                  <Pressable
                    onPress={() => openSubAdd(item)}
                    className="active:opacity-70"
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 20, paddingVertical: 10,
                    }}
                  >
                    <Plus size={14} color="#2E9D6A" />
                    <Text style={{ fontSize: 13, color: '#2E9D6A', fontWeight: '600' }}>新增子分类</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* 品类新增/编辑弹窗 */}
      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setFormVisible(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
            {/* 标题 — 固定 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
                {editTarget ? '编辑品类' : '新增品类'}
              </Text>
              <Pressable onPress={() => setFormVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', paddingHorizontal: 20, marginBottom: 8 }}>
              品类名称 <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            {/* 可滚动内容 */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {formRows.map((row, index) => (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    className="flex-1 bg-muted rounded-xl px-4 py-3 text-foreground text-sm"
                    placeholder="请输入品类名称，如：蔬菜"
                    placeholderTextColor="#9ca3af"
                    value={row}
                    onChangeText={(v) => {
                      const next = [...formRows];
                      next[index] = v;
                      setFormRows(next);
                      setFormError('');
                    }}
                    autoFocus={index === 0 && !editTarget}
                    returnKeyType="done"
                  />
                  {index === 0 && !editTarget && (
                    <Pressable onPress={() => setFormRows([...formRows, ''])} style={{ width: 40, height: 44, borderRadius: 10, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={20} color="#2E9D6A" />
                    </Pressable>
                  )}
                  {index > 0 && !editTarget && (
                    <Pressable onPress={() => setFormRows(formRows.filter((_, i) => i !== index))} style={{ width: 40, height: 44, borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={18} color="#ef4444" />
                    </Pressable>
                  )}
                  {editTarget && <View style={{ width: 40 }} />}
                </View>
              ))}
            </ScrollView>
            {/* 错误 + 按钮 — 固定底部 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
              {formError ? <Text className="text-destructive text-sm mb-3 mt-1">{formError}</Text> : null}
              <Pressable
                className="active:opacity-80"
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', alignItems: 'center', justifyContent: 'center' }}
                onPress={handleSave}
                disabled={saving}
                cssInterop={false}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Check size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>{editTarget ? '保存修改' : '确认新增'}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 子分类新增/编辑弹窗 */}
      <Modal visible={subFormVisible} transparent animationType="slide" onRequestClose={() => setSubFormVisible(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setSubFormVisible(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
            {/* 标题 — 固定 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
                {subEditTarget ? '编辑子分类' : '新增子分类'}
              </Text>
              <Pressable onPress={() => setSubFormVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: '#6b7280', paddingHorizontal: 20, marginBottom: 12 }}>品类：{subFormCategoryName}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', paddingHorizontal: 20, marginBottom: 8 }}>
              子分类名称 <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            {/* 可滚动内容 */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {subFormRows.map((row, index) => (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    className="flex-1 bg-muted rounded-xl px-4 py-3 text-foreground text-sm"
                    placeholder="请输入子分类名称，如：叶菜"
                    placeholderTextColor="#9ca3af"
                    value={row}
                    onChangeText={(v) => {
                      const next = [...subFormRows];
                      next[index] = v;
                      setSubFormRows(next);
                      setSubFormError('');
                    }}
                    autoFocus={index === 0 && !subEditTarget}
                    returnKeyType="done"
                  />
                  {index === 0 && !subEditTarget && (
                    <Pressable onPress={() => setSubFormRows([...subFormRows, ''])} style={{ width: 40, height: 44, borderRadius: 10, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={20} color="#2E9D6A" />
                    </Pressable>
                  )}
                  {index > 0 && !subEditTarget && (
                    <Pressable onPress={() => setSubFormRows(subFormRows.filter((_, i) => i !== index))} style={{ width: 40, height: 44, borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={18} color="#ef4444" />
                    </Pressable>
                  )}
                  {subEditTarget && <View style={{ width: 40 }} />}
                </View>
              ))}
            </ScrollView>
            {/* 错误 + 按钮 — 固定底部 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
              {subFormError ? <Text className="text-destructive text-sm mb-3 mt-1">{subFormError}</Text> : null}
              <Pressable
                className="active:opacity-80"
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', alignItems: 'center', justifyContent: 'center' }}
                onPress={handleSubSave}
                disabled={subSaving}
                cssInterop={false}
              >
                {subSaving ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Check size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>{subEditTarget ? '保存修改' : '确认新增'}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 品类删除确认 */}
      <DeleteModal
        visible={!!deleteTarget}
        name={deleteTarget?.name ?? ''}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* 子分类删除确认 */}
      <DeleteModal
        visible={!!subDeleteTarget}
        name={subDeleteTarget?.name ?? ''}
        onCancel={() => setSubDeleteTarget(null)}
        onConfirm={handleSubDelete}
        loading={subDeleting}
      />

      {/* 悬浮新增品类按钮 */}
      <View style={{ position: 'absolute', bottom: 20, right: 20 }}>
        <Pressable
          onPress={openAdd}
          className="active:opacity-90"
          style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: '#2E9D6A',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: [
              { offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(5,150,105,0.45)' },
              { offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.15)' },
            ],
          } as object}
        >
          <Plus size={30} color="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

// ===== 供应商管理面板 =====
function SupplierPanel() {
  const [items, setItems] = useState<IngredientSupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<IngredientSupplierRecord | null>(null);
  const [formRows, setFormRows] = useState<{name: string; contact: string}[]>([{name: '', contact: ''}]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IngredientSupplierRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setLoading(true);
    setItems(await getSupplierRecords());
    setLoading(false);
  };

  const openAdd = () => {
    setEditTarget(null);
    setFormRows([{name: '', contact: ''}]);
    setFormError('');
    setFormVisible(true);
  };

  const openEdit = (item: IngredientSupplierRecord) => {
    setEditTarget(item);
    setFormRows([{name: item.name, contact: item.contact ?? ''}]);
    setFormError('');
    setFormVisible(true);
  };

  const handleSave = async () => {
    if (editTarget) {
      const { name, contact } = formRows[0];
      if (!name.trim()) { setFormError('请填写供应商名称'); return; }
      setSaving(true);
      setFormError('');
      await updateSupplierRecord(editTarget.id, {
        name: name.trim(),
        contact: contact.trim() || null,
      });
      setFormVisible(false);
      setSaving(false);
      await load();
      return;
    }
    const validRows = formRows.filter((r) => r.name.trim());
    if (validRows.length === 0) { setFormError('请至少填写一个供应商名称'); return; }
    setSaving(true);
    setFormError('');
    for (const row of validRows) {
      await createSupplierRecord(row.name.trim(), row.contact.trim());
    }
    setFormVisible(false);
    setSaving(false);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteSupplierRecord(deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    await load();
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, gap: 8 }}
        ListEmptyComponent={
          <View className="items-center justify-center py-16 gap-3">
            <Truck size={40} color="#d1d5db" />
            <Text className="text-muted-foreground">暂无供应商，点击右下角新增</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
          >
            <View className="w-8 h-8 rounded-xl bg-accent/20 items-center justify-center">
              <Truck size={16} color="#d97706" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-medium text-foreground">{item.name}</Text>
              {item.contact ? (
                <Text className="text-xs text-muted-foreground mt-0.5">{item.contact}</Text>
              ) : null}
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => openEdit(item)}
                className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center active:opacity-70"
              >
                <Pencil size={14} color="#059669" />
              </Pressable>
              <Pressable
                onPress={() => setDeleteTarget(item)}
                className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:opacity-70"
              >
                <Trash2 size={14} color="#ef4444" />
              </Pressable>
            </View>
          </View>
        )}
      />

      {/* 新增/编辑弹窗 */}
      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setFormVisible(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
            {/* 标题 — 固定 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
                {editTarget ? '编辑供应商' : '新增供应商'}
              </Text>
              <Pressable onPress={() => setFormVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>
            {/* 可滚动内容 */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {formRows.map((row, index) => (
                <View key={index} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>
                        供应商名称 <Text style={{ color: '#ef4444' }}>*</Text>
                      </Text>
                      <TextInput
                        className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm"
                        placeholder="请输入供应商名称"
                        placeholderTextColor="#9ca3af"
                        value={row.name}
                        onChangeText={(v) => {
                          const next = [...formRows];
                          next[index] = { ...next[index], name: v };
                          setFormRows(next);
                          setFormError('');
                        }}
                        autoFocus={index === 0 && !editTarget}
                        returnKeyType="next"
                      />
                    </View>
                    {index === 0 && !editTarget && (
                      <Pressable onPress={() => setFormRows([...formRows, { name: '', contact: '' }])} style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
                        <Plus size={20} color="#2E9D6A" />
                      </Pressable>
                    )}
                    {index > 0 && !editTarget && (
                      <Pressable onPress={() => setFormRows(formRows.filter((_, i) => i !== index))} style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
                        <Trash2 size={18} color="#ef4444" />
                      </Pressable>
                    )}
                    {editTarget && <View style={{ width: 40 }} />}
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', marginTop: 8, marginBottom: 4 }}>联系方式（选填）</Text>
                  <TextInput
                    className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm"
                    placeholder="电话、微信或备注"
                    placeholderTextColor="#9ca3af"
                    value={row.contact}
                    onChangeText={(v) => {
                      const next = [...formRows];
                      next[index] = { ...next[index], contact: v };
                      setFormRows(next);
                    }}
                    returnKeyType="done"
                  />
                </View>
              ))}
            </ScrollView>
            {/* 错误 + 按钮 — 固定底部 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
              {formError ? <Text className="text-destructive text-sm mb-3 mt-1">{formError}</Text> : null}
              <Pressable
                className="active:opacity-80"
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', alignItems: 'center', justifyContent: 'center' }}
                onPress={handleSave}
                disabled={saving}
                cssInterop={false}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Check size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>{editTarget ? '保存修改' : '确认新增'}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 删除确认 */}
      <DeleteModal
        visible={!!deleteTarget}
        name={deleteTarget?.name ?? ''}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* 悬浮新增按钮 */}
      <View style={{ position: 'absolute', bottom: 20, right: 20 }}>
        <Pressable
          onPress={openAdd}
          className="active:opacity-90"
          style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: '#2E9D6A',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: [
              { offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(5,150,105,0.45)' },
              { offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.15)' },
            ],
          } as object}
        >
          <Plus size={30} color="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

// ===== 主页面 =====
export default function ManageDictScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('category');

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View
        className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3"
        style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}
      >
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">品类 & 分类管理</Text>
      </View>

      {/* Tab 切换 */}
      <View className="flex-row mx-4 mt-3 mb-1 bg-muted rounded-xl p-1">
        <Pressable
          className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg ${tab === 'category' ? 'bg-card' : ''}`}
          onPress={() => setTab('category')}
          style={{ boxShadow: tab === 'category' ? [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.08)' }] : [] } as object}
        >
          <Tag size={15} color={tab === 'category' ? '#059669' : '#9ca3af'} />
          <Text className={`text-sm font-semibold ${tab === 'category' ? 'text-primary' : 'text-muted-foreground'}`}>
            食材品类
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg ${tab === 'supplier' ? 'bg-card' : ''}`}
          onPress={() => setTab('supplier')}
          style={{ boxShadow: tab === 'supplier' ? [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.08)' }] : [] } as object}
        >
          <Truck size={15} color={tab === 'supplier' ? '#059669' : '#9ca3af'} />
          <Text className={`text-sm font-semibold ${tab === 'supplier' ? 'text-primary' : 'text-muted-foreground'}`}>
            供应商
          </Text>
        </Pressable>
      </View>

      {/* 面板内容 */}
      {tab === 'category' ? <CategoryPanel /> : <SupplierPanel />}
    </SafeAreaView>
  );
}
