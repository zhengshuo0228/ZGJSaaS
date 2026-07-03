/**
 * 分类管理页
 * 仅管理员/厨师长（sop_manage权限）可访问
 * 支持新增、编辑、删除菜品分类
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Plus, Pencil, Trash2, Tag, AlertCircle, CheckCircle } from 'lucide-react-native';
import {
  getDishCategories,
  createDishCategory,
  updateDishCategory,
  deleteDishCategory,
  checkCategoryUsage,
} from '@/db/sopApi';
import type { DishCategory } from '@/types/types';

export default function SopCategoriesScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 新增/编辑弹窗
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<DishCategory | null>(null); // null = 新增
  const [inputName, setInputName] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');

  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<DishCategory | null>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const data = await getDishCategories();
    setCategories(data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setEditTarget(null);
    setInputName('');
    setModalErr('');
    setModalVisible(true);
  };

  const openEdit = (cat: DishCategory) => {
    setEditTarget(cat);
    setInputName(cat.name);
    setModalErr('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    const trimmed = inputName.trim();
    if (!trimmed) { setModalErr('请输入分类名称'); return; }
    setSaving(true);
    setModalErr('');
    const err = editTarget
      ? await updateDishCategory(editTarget.id, trimmed)
      : await createDishCategory(trimmed);
    setSaving(false);
    if (err) { setModalErr(err); return; }
    setModalVisible(false);
    showToast(editTarget ? '分类已更新' : '分类已新增');
    load();
  };

  const openDeleteCheck = async (cat: DishCategory) => {
    setDeleteTarget(cat);
    setDeleteChecking(true);
    setDeleteConfirmMsg('');
    setDeleteBlocked(false);
    const count = await checkCategoryUsage(cat.name);
    setDeleteChecking(false);
    if (count > 0) {
      setDeleteConfirmMsg(
        `该分类下有 ${count} 个菜品，请先将菜品改为其他分类或删除菜品后再删除该分类`
      );
      setDeleteBlocked(true);
    } else {
      setDeleteConfirmMsg(`确定删除分类「${cat.name}」？删除后不可恢复。`);
      setDeleteBlocked(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteBlocked) return;
    setDeleting(true);
    const err = await deleteDishCategory(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (err) { showToast('删除失败：' + err); return; }
    showToast('分类已删除');
    load();
  };

  const renderItem = ({ item }: { item: DishCategory }) => (
    <View
      className="flex-row items-center bg-card rounded-2xl px-4 py-3.5 mb-3"
      style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] } as object}
    >
      <View className="w-8 h-8 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: '#FFF3E0' }}>
        <Tag size={15} color="#FFB88C" />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground">{item.name}</Text>
        <Text className="text-xs text-muted-foreground mt-0.5">
          创建于 {item.created_at.slice(0, 10)}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          className="w-8 h-8 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() => openEdit(item)}
        >
          <Pencil size={14} color="#6B7280" />
        </Pressable>
        <Pressable
          className="w-8 h-8 rounded-xl bg-red-50 items-center justify-center active:opacity-60"
          onPress={() => openDeleteCheck(item)}
        >
          <Trash2 size={14} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View className="flex-1 flex-row items-center gap-2">
          <Tag size={20} color="#FFB88C" />
          <Text className="text-xl font-bold text-foreground">分类管理</Text>
        </View>
        <Pressable
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl active:opacity-70"
          style={{ backgroundColor: '#FFB88C' }}
          onPress={openCreate}
        >
          <Plus size={16} color="#1A1A2E" />
          <Text style={{ color: '#1A1A2E', fontSize: 14, fontWeight: '700' }}>新增</Text>
        </Pressable>
      </View>

      {/* Toast */}
      {toastMsg ? (
        <View className="mx-4 mb-2 flex-row items-center gap-2 p-3 bg-green-50 rounded-xl">
          <CheckCircle size={15} color="#16A34A" />
          <Text className="text-sm text-green-700 font-medium">{toastMsg}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFB88C" />
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerClassName="px-4 pb-8 pt-1"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#FFB88C" />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 gap-3">
              <Tag size={48} color="#D1D5DB" />
              <Text className="text-base text-muted-foreground">暂无分类</Text>
              <Pressable
                className="mt-2 px-5 py-2.5 rounded-xl active:opacity-70"
                style={{ backgroundColor: '#FFB88C' }}
                onPress={openCreate}
              >
                <Text style={{ color: '#1A1A2E', fontWeight: '700' }}>立即新增分类</Text>
              </Pressable>
            </View>
          }
        />
      )}

      {/* 新增/编辑弹窗 */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => !saving && setModalVisible(false)}
        >
          <Pressable
            className="w-80 bg-card rounded-3xl p-6 gap-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0,0,0,0.15)' }] } as object}
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-foreground">
              {editTarget ? '编辑分类' : '新增分类'}
            </Text>
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">分类名称 *</Text>
              <TextInput
                className="border border-border rounded-2xl px-4 py-3 text-base text-foreground bg-muted/40"
                placeholder="请输入分类名称"
                placeholderTextColor="#9CA3AF"
                value={inputName}
                onChangeText={(v) => { setInputName(v); setModalErr(''); }}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
              {modalErr ? (
                <View className="flex-row items-center gap-1.5 mt-2">
                  <AlertCircle size={13} color="#EF4444" />
                  <Text className="text-xs text-red-500">{modalErr}</Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 py-3 rounded-2xl bg-muted items-center active:opacity-70"
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text className="text-sm font-semibold text-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 py-3 rounded-2xl items-center active:opacity-80"
                style={{ backgroundColor: saving ? '#FDD5B0' : '#FFB88C' }}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#1A1A2E" />
                  : <Text style={{ color: '#1A1A2E', fontWeight: '700', fontSize: 14 }}>保存</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal visible={!!deleteTarget} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => !deleting && !deleteChecking && setDeleteTarget(null)}
        >
          <Pressable
            className="w-80 bg-card rounded-3xl p-6 gap-4"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0,0,0,0.15)' }] } as object}
            onPress={() => {}}
          >
            {deleteChecking ? (
              <View className="items-center py-4 gap-3">
                <ActivityIndicator size="large" color="#FFB88C" />
                <Text className="text-sm text-muted-foreground">检查中…</Text>
              </View>
            ) : (
              <>
                <View className="flex-row items-start gap-3">
                  <View className="w-10 h-10 rounded-2xl bg-red-50 items-center justify-center mt-0.5">
                    <AlertCircle size={20} color="#EF4444" />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text className="text-base font-bold text-foreground">
                      {deleteBlocked ? '无法删除' : '删除分类'}
                    </Text>
                    <Text className="text-sm text-muted-foreground leading-5">
                      {deleteConfirmMsg}
                    </Text>
                  </View>
                </View>
                <View className="flex-row gap-3">
                  <Pressable
                    className="flex-1 py-3 rounded-2xl bg-muted items-center active:opacity-70"
                    onPress={() => setDeleteTarget(null)}
                    disabled={deleting}
                  >
                    <Text className="text-sm font-semibold text-foreground">
                      {deleteBlocked ? '知道了' : '取消'}
                    </Text>
                  </Pressable>
                  {!deleteBlocked && (
                    <Pressable
                      className="flex-1 py-3 rounded-2xl items-center active:opacity-80"
                      style={{ backgroundColor: deleting ? '#FECACA' : '#FEE2E2' }}
                      onPress={handleDelete}
                      disabled={deleting}
                    >
                      {deleting
                        ? <ActivityIndicator size="small" color="#EF4444" />
                        : <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>确认删除</Text>
                      }
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
