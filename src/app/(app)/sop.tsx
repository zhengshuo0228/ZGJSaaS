/**
 * 菜品标准SOP主页
 * 标准SOP表Tab（搜索+分类多选筛选） | 菜品库Tab（管理员/厨师长可管理+导入）
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft, Plus, Pencil, Trash2, ChefHat, BookOpen,
  Search, X, Upload, Tag, UtensilsCrossed,
} from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getUserPermsByPosition } from '@/db/api';
import { getDishes, deleteDish, getDishCategories } from '@/db/sopApi';
import type { Dish, DishCategory } from '@/types/types';

type TabKey = 'sop' | 'dishes';

const CAT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  热菜:  { bg: '#FFF3E0', text: '#E65100', dot: '#FF8F00' },
  凉菜:  { bg: '#E8F5E9', text: '#2E7D32', dot: '#43A047' },
  汤品:  { bg: '#E3F2FD', text: '#1565C0', dot: '#1E88E5' },
  主食:  { bg: '#FFF8E1', text: '#F57F17', dot: '#FDD835' },
  点心:  { bg: '#FCE4EC', text: '#880E4F', dot: '#E91E63' },
  饮品:  { bg: '#F3E5F5', text: '#4A148C', dot: '#9C27B0' },
  其它:  { bg: '#F5F5F5', text: '#424242', dot: '#9E9E9E' },
};

const getCatColors = (cat: string) => CAT_COLORS[cat] ?? CAT_COLORS['其它'];

export default function SopScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('sop');
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [dbCategories, setDbCategories] = useState<DishCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const searchRef = useRef<TextInput>(null);

  const toggleCategory = (cat: string) =>
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErrMsg('');
    try {
      const [data, cats, user] = await Promise.all([
        getDishes(),
        getDishCategories(),
        supabase.auth.getUser(),
      ]);
      setDishes(data);
      setDbCategories(cats);
      if (user.data.user) {
        const perms = await getUserPermsByPosition(user.data.user.id);
        setCanManage(perms.includes('sop_manage'));
      }
    } catch {
      setErrMsg('加载失败，请下拉刷新重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeDishes = useMemo(() => dishes.filter((d) => d.status === 'active'), [dishes]);

  const filteredSopDishes = useMemo(() => {
    return activeDishes.filter((d) => {
      const matchName = searchText.trim()
        ? d.name.toLowerCase().includes(searchText.trim().toLowerCase())
        : true;
      const matchCat = selectedCategories.length > 0
        ? selectedCategories.includes(d.category)
        : true;
      return matchName && matchCat;
    });
  }, [activeDishes, searchText, selectedCategories]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const err = await deleteDish(id);
    setDeletingId(null);
    setDeleteConfirmId(null);
    if (err) setErrMsg('删除失败，请重试');
    else setDishes((prev) => prev.filter((d) => d.id !== id));
  };

  // ===== SOP表卡片 =====
  const renderSopItem = ({ item }: { item: Dish }) => {
    const colors = getCatColors(item.category);
    return (
      <Pressable
        className="active:opacity-75"
        onPress={() => router.push(`/(app)/sop-detail?id=${item.id}` as never)}
      >
        <View
          className="flex-row bg-card rounded-2xl mb-3 overflow-hidden"
          style={{
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.06)' }],
            borderCurve: 'continuous',
          } as object}
        >
          {/* 左侧分类色条 */}
          <View style={{ width: 4, backgroundColor: colors.dot }} />

          {/* 菜品图片 */}
          <View className="w-[88px] h-[88px] bg-muted items-center justify-center">
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={{ width: 88, height: 88 }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <ChefHat size={30} color="#C4C9D4" />
            )}
          </View>

          {/* 信息区 */}
          <View className="flex-1 px-3 py-3 justify-between">
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>
              {item.name}
            </Text>
            <View className="flex-row items-center gap-2 mt-1">
              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg }}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{item.category}</Text>
              </View>
              {item.status === 'inactive' && (
                <View className="px-2 py-0.5 rounded-full bg-muted">
                  <Text className="text-xs text-muted-foreground">已停用</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-muted-foreground mt-1.5">查看制作指南 →</Text>
          </View>

          {/* 右侧箭头指示 */}
          <View className="justify-center pr-3">
            <Text style={{ fontSize: 18, color: '#D1D5DB' }}>›</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  // ===== 菜品库卡片 =====
  const renderDishItem = ({ item }: { item: Dish }) => {
    const colors = getCatColors(item.category);
    const isDeleting = deletingId === item.id;
    const isConfirming = deleteConfirmId === item.id;

    return (
      <View
        className="bg-card rounded-2xl mb-3 overflow-hidden"
        style={{
          boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(0,0,0,0.06)' }],
          borderCurve: 'continuous',
        } as object}
      >
        <View className="flex-row items-center gap-3 p-4">
          {/* 缩略图 */}
          <View
            className="w-[56px] h-[56px] rounded-2xl overflow-hidden items-center justify-center"
            style={{ backgroundColor: colors.bg }}
          >
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={{ width: 56, height: 56 }} contentFit="cover" />
            ) : (
              <ChefHat size={22} color={colors.dot} />
            )}
          </View>

          {/* 信息 */}
          <View className="flex-1 gap-1">
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>{item.name}</Text>
            <View className="flex-row gap-2">
              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg }}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{item.category}</Text>
              </View>
              {item.status === 'inactive' && (
                <View className="px-2 py-0.5 rounded-full bg-muted">
                  <Text className="text-xs text-muted-foreground">已停用</Text>
                </View>
              )}
            </View>
          </View>

          {/* 操作按钮 */}
          {canManage && (
            <View className="flex-row gap-2">
              <Pressable
                className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
                onPress={() => router.push(`/(app)/sop-edit?id=${item.id}` as never)}
              >
                <Pencil size={15} color="#6B7280" />
              </Pressable>
              <Pressable
                className="w-9 h-9 rounded-xl items-center justify-center active:opacity-60"
                style={{ backgroundColor: '#FEE2E2' }}
                onPress={() => setDeleteConfirmId(item.id)}
              >
                <Trash2 size={15} color="#EF4444" />
              </Pressable>
            </View>
          )}
        </View>

        {/* 删除确认条 */}
        {isConfirming && (
          <View className="mx-4 mb-4 p-3 bg-red-50 rounded-xl">
            <Text className="text-sm text-red-700 font-medium mb-3">
              确认删除「{item.name}」？关联SOP也将一并删除。
            </Text>
            <View className="flex-row gap-2">
              <Pressable
                className="flex-1 py-2 rounded-xl bg-muted items-center active:opacity-70"
                onPress={() => setDeleteConfirmId(null)}
              >
                <Text className="text-sm font-semibold text-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 py-2 rounded-xl bg-red-500 items-center active:opacity-70"
                disabled={isDeleting}
                onPress={() => handleDelete(item.id)}
              >
                {isDeleting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text className="text-sm font-semibold text-white">确认删除</Text>
                }
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  const isFiltering = searchText.trim().length > 0 || selectedCategories.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* ===== 顶部导航 ===== */}
      <View className="flex-row items-center px-4 pt-2 pb-3 gap-3">
        <Pressable
          className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View className="flex-1 flex-row items-center gap-2">
          <BookOpen size={20} color="#FFB88C" />
          <Text className="text-xl font-bold text-foreground">菜品标准SOP</Text>
        </View>
      </View>

      {/* ===== Tab 切换 ===== */}
      <View className="flex-row mx-4 mb-0 bg-muted rounded-2xl p-1">
        {(['sop', 'dishes'] as TabKey[]).map((key) => {
          const label = key === 'sop' ? '标准SOP表' : '菜品库';
          const badge = key === 'sop' ? activeDishes.length : dishes.length;
          return (
            <Pressable
              key={key}
              className="flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 active:opacity-70"
              style={{ backgroundColor: activeTab === key ? '#fff' : 'transparent' }}
              onPress={() => setActiveTab(key)}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: activeTab === key ? '#1A1A2E' : '#9CA3AF' }}
              >
                {label}
              </Text>
              {badge > 0 && (
                <View
                  className="px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: activeTab === key ? '#FFB88C' : '#E5E7EB' }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: activeTab === key ? '#1A1A2E' : '#9CA3AF' }}>
                    {badge}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ===== 标准SOP表：搜索栏 + 分类筛选 ===== */}
      {activeTab === 'sop' && (
        <View className="pt-3 pb-1 gap-2">
          {/* 搜索框 */}
          <View className="flex-row items-center bg-muted rounded-2xl mx-4 px-3 gap-2">
            <Search size={16} color="#9CA3AF" />
            <TextInput
              ref={searchRef}
              className="flex-1 py-3 text-sm text-foreground"
              placeholder="搜索菜品名称…"
              placeholderTextColor="#9CA3AF"
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText('')} className="active:opacity-60 p-1">
                <X size={14} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* 分类筛选器（横向滚动） */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-4 gap-2"
          >
            {/* 全部按钮 */}
            <Pressable
              className="px-3.5 py-1.5 rounded-full active:opacity-70"
              style={{
                backgroundColor: selectedCategories.length === 0 ? '#FFB88C' : '#F3F4F6',
              }}
              onPress={() => setSelectedCategories([])}
            >
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: selectedCategories.length === 0 ? '#1A1A2E' : '#9CA3AF',
              }}>
                全部
              </Text>
            </Pressable>
            {dbCategories.map((cat) => {
              const sel = selectedCategories.includes(cat.name);
              const cc = getCatColors(cat.name);
              return (
                <Pressable
                  key={cat.id}
                  className="flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-full active:opacity-70"
                  style={{ backgroundColor: sel ? cc.bg : '#F3F4F6', borderWidth: sel ? 1.5 : 0, borderColor: cc.dot }}
                  onPress={() => toggleCategory(cat.name)}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sel ? cc.dot : '#C4C9D4' }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? cc.text : '#6B7280' }}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 搜索结果计数 */}
          {isFiltering && (
            <Text className="text-xs text-muted-foreground px-5">
              找到 <Text className="font-bold text-foreground">{filteredSopDishes.length}</Text> 道菜品
            </Text>
          )}
        </View>
      )}

      {/* ===== 菜品库：工具栏 ===== */}
      {activeTab === 'dishes' && canManage && (
        <View className="flex-row items-center px-4 pt-3 pb-1 gap-2">
          <Pressable
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-muted active:opacity-70"
            onPress={() => router.push('/(app)/sop-categories' as never)}
          >
            <Tag size={14} color="#6B7280" />
            <Text className="text-sm font-semibold text-foreground">分类管理</Text>
          </Pressable>
          <Pressable
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-muted active:opacity-70"
            onPress={() => router.push('/(app)/sop-import' as never)}
          >
            <Upload size={14} color="#6B7280" />
            <Text className="text-sm font-semibold text-foreground">批量导入</Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable
            className="flex-row items-center gap-1.5 px-4 py-2 rounded-xl active:opacity-70"
            style={{ backgroundColor: '#FFB88C' }}
            onPress={() => router.push('/(app)/sop-edit' as never)}
          >
            <Plus size={16} color="#1A1A2E" />
            <Text style={{ color: '#1A1A2E', fontSize: 14, fontWeight: '700' }}>新增菜品</Text>
          </Pressable>
        </View>
      )}

      {/* ===== 错误提示 ===== */}
      {errMsg ? (
        <View className="mx-4 mt-2 p-3 bg-red-50 rounded-xl">
          <Text className="text-sm text-red-600">{errMsg}</Text>
        </View>
      ) : null}

      {/* ===== 列表内容 ===== */}
      {loading ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color="#FFB88C" />
          <Text className="text-sm text-muted-foreground">加载中…</Text>
        </View>
      ) : (
        <FlatList
          data={activeTab === 'sop' ? filteredSopDishes : dishes}
          keyExtractor={(item) => item.id}
          renderItem={activeTab === 'sop' ? renderSopItem : renderDishItem}
          contentContainerClassName="px-4 pt-3 pb-10"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#FFB88C"
            />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 gap-4">
              {activeTab === 'sop' && isFiltering
                ? <Search size={48} color="#D1D5DB" />
                : activeTab === 'dishes'
                  ? <UtensilsCrossed size={48} color="#D1D5DB" />
                  : <ChefHat size={48} color="#D1D5DB" />
              }
              <Text className="text-base font-semibold text-muted-foreground">
                {activeTab === 'sop'
                  ? (isFiltering ? '未找到相关菜品' : '暂无SOP文档')
                  : '暂无菜品'}
              </Text>
              {activeTab === 'sop' && isFiltering && (
                <Pressable
                  className="px-4 py-2 rounded-xl bg-muted active:opacity-70"
                  onPress={() => { setSearchText(''); setSelectedCategories([]); }}
                >
                  <Text className="text-sm font-semibold text-foreground">清除筛选</Text>
                </Pressable>
              )}
              {canManage && activeTab === 'dishes' && (
                <Pressable
                  className="mt-1 px-5 py-2.5 rounded-xl active:opacity-70"
                  style={{ backgroundColor: '#FFB88C' }}
                  onPress={() => router.push('/(app)/sop-edit' as never)}
                >
                  <Text style={{ color: '#1A1A2E', fontWeight: '700' }}>立即新增菜品</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
