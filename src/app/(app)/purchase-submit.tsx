import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
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
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2, CheckCircle, X, ShoppingBag, Search } from 'lucide-react-native';
import { getIngredients, getCategories, getSubcategories, getMyFrequentIngredients, getMyFrequentCategories, incrementIngredientUsage, sendNotificationToAdmins } from '@/db/api';
import { createPurchaseOrder } from '@/db/api';
import type { Ingredient, IngredientCategory, IngredientCategoryRecord, IngredientSubcategoryRecord } from '@/types/types';
import { CATEGORY_COLORS } from '@/types/types';
import { useProfile } from '@/context/ProfileContext';
import { GUEST_DENY_MSG } from '@/lib/guestGuard';
import { saveDraft, loadDraft, clearDraft, formatDraftTime } from '@/lib/purchaseDraft';
import PermissionGuard from '@/components/PermissionGuard';

interface CartItem {
  ingredient: Ingredient;
  quantity: number;
}

export default function PurchaseSubmitScreen() {
  const router = useRouter();
  const { isGuest } = useProfile();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryRecords, setCategoryRecords] = useState<IngredientCategoryRecord[]>([]);
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  const [sortedCategories, setSortedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory | '全部'>('全部');
  // 子分类筛选
  const [subcategories, setSubcategories] = useState<IngredientSubcategoryRecord[]>([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  // 购物车预览弹窗
  const [cartSheetVisible, setCartSheetVisible] = useState(false);
  // 当前正在编辑数量的食材id → 临时字符串输入值
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyText, setEditingQtyText] = useState('');
  // 搜索关键词
  const [searchText, setSearchText] = useState('');
  // 访客提示
  const [guestMsg, setGuestMsg] = useState('');
  // 草稿恢复弹窗
  const [draftModalVisible, setDraftModalVisible] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<{ savedAt: number; cart: CartItem[] } | null>(null);
  // 标记是否已初始化购物车（避免首次加载时草稿被 useEffect 覆盖保存）
  const cartInitialized = useRef(false);

  const showGuestDeny = () => {
    setGuestMsg(GUEST_DENY_MSG);
    setTimeout(() => setGuestMsg(''), 3000);
  };

  // 购物车变化时自动保存草稿（初始化完成后才保存）
  useEffect(() => {
    if (!cartInitialized.current) return;
    saveDraft(cart);
  }, [cart]);

  useFocusEffect(
    useCallback(() => {
      cartInitialized.current = false;
      loadData();
      // 消费从食材库批量添加过来的食材
      import('@/lib/cartStore').then(async ({ consumePendingCart }) => {
        const pending = consumePendingCart();
        if (pending.length > 0) {
          // 有外部传入食材，直接使用，不检查草稿
          setCart(pending);
          cartInitialized.current = true;
          await saveDraft(pending);
        } else {
          // 检查本地草稿
          const draft = await loadDraft();
          if (draft && draft.cart.length > 0) {
            setPendingDraft({ savedAt: draft.savedAt, cart: draft.cart });
            setDraftModalVisible(true);
          }
          setCart([]);
          cartInitialized.current = true;
        }
      });
      setSubmitError('');
      setSubmitSuccess(false);
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    const [ings, cats, freqIds, freqCats] = await Promise.all([
      getIngredients(),
      getCategories(),
      getMyFrequentIngredients(10),
      getMyFrequentCategories(),
    ]);
    setIngredients(ings);
    setCategoryRecords(cats);
    const catNames = cats.map((c) => c.name);
    setCategories(catNames);
    // 按常用频率排序分类（不含"全部"）
    const sorted = [...catNames].sort((a, b) => {
      const ai = freqCats.indexOf(a);
      const bi = freqCats.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });
    setSortedCategories(sorted);
    setFrequentIds(freqIds);
    setLoading(false);
  };

  const loadSubcategories = async (categoryName: string) => {
    const cat = categoryRecords.find((c) => c.name === categoryName);
    if (!cat) { setSubcategories([]); return; }
    setSubcategoriesLoading(true);
    const subs = await getSubcategories(cat.id);
    setSubcategories(subs);
    setSubcategoriesLoading(false);
  };

  const filteredIngredients = ingredients.filter((i) => {
    const matchCat = selectedCategory === '全部' || i.category === selectedCategory;
    const matchSub = selectedSubcategory === null || i.subcategory_id === selectedSubcategory;
    const keyword = searchText.trim().toLowerCase();
    const matchSearch = keyword === '' || i.name.toLowerCase().includes(keyword);
    return matchCat && matchSub && matchSearch;
  }).sort((a, b) => {
    // 全部视图（含搜索时）：历史高频食材置顶，剩余按名称拼音升序
    if (selectedCategory === '全部') {
      const aFreq = frequentIds.indexOf(a.id);
      const bFreq = frequentIds.indexOf(b.id);
      // 两者都是高频 → 按频次索引升序（索引越小频次越高）
      if (aFreq !== -1 && bFreq !== -1) return aFreq - bFreq;
      // 仅 a 是高频 → a 置顶
      if (aFreq !== -1) return -1;
      // 仅 b 是高频 → b 置顶
      if (bFreq !== -1) return 1;
    }
    // 其余（分类视图或非高频）按名称拼音升序
    return a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' });
  });

  const getCartItem = (ingredientId: string) => cart.find((c) => c.ingredient.id === ingredientId);

  const setQuantity = (ingredient: Ingredient, qty: number) => {
    if (isGuest) { showGuestDeny(); return; }
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.ingredient.id !== ingredient.id));
    } else {
      setCart((prev) => {
        const existing = prev.find((c) => c.ingredient.id === ingredient.id);
        if (existing) {
          return prev.map((c) => c.ingredient.id === ingredient.id ? { ...c, quantity: qty } : c);
        }
        return [...prev, { ingredient, quantity: qty }];
      });
    }
  };

  // 开始编辑某个食材数量（点击数字区域）
  const startEditQty = (ingredient: Ingredient, currentQty: number) => {
    setEditingQtyId(ingredient.id);
    setEditingQtyText(currentQty > 0 ? String(currentQty) : '');
  };

  // 实时校验输入：允许数字+最多1位小数，最大999.9
  const onQtyChange = (text: string) => {
    // 只保留数字和小数点
    let cleaned = text.replace(/[^0-9.]/g, '');
    // 只允许一个小数点
    const parts = cleaned.split('.');
    if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
    // 最多1位小数
    if (parts[1] !== undefined && parts[1].length > 1) cleaned = parts[0] + '.' + parts[1].slice(0, 1);
    // 最大999.9
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 999.9) cleaned = '999.9';
    setEditingQtyText(cleaned);
  };

  // 提交数量输入（失焦或键盘完成时）
  const commitQtyEdit = (ingredient: Ingredient) => {
    const num = parseFloat(editingQtyText);
    if (!isNaN(num) && num > 0) {
      setQuantity(ingredient, Math.min(num, 999.9));
    } else if (editingQtyText === '' || num <= 0) {
      setQuantity(ingredient, 0);
    }
    setEditingQtyId(null);
    setEditingQtyText('');
    Keyboard.dismiss();
  };

  // 点击加减按钮时同步 TextInput（步进 0.5 for decimals, 1 for integers）
  const stepQty = (ingredient: Ingredient, currentQty: number, delta: number) => {
    const newQty = Math.max(0, Math.min(999.9, Math.round((currentQty + delta) * 10) / 10));
    setQuantity(ingredient, newQty);
    // 若正在编辑该食材，同步文本
    if (editingQtyId === ingredient.id) {
      setEditingQtyText(newQty > 0 ? String(newQty) : '');
    }
  };

  // 点提交先弹确认框
  const handleSubmitPress = () => {
    if (isGuest) { showGuestDeny(); return; }
    if (cart.length === 0) {
      setSubmitError('请至少选择一种食材');
      return;
    }
    setSubmitError('');
    setConfirmVisible(true);
  };

  // 确认后真正提交
  const handleConfirm = async () => {
    setConfirmVisible(false);
    setSubmitting(true);
    setSubmitError('');
    const orderId = await createPurchaseOrder(
      cart.map((c) => ({ ingredient_id: c.ingredient.id, quantity: c.quantity, unit: c.ingredient.unit }))
    );
    if (orderId) {
      await incrementIngredientUsage(cart.map((c) => c.ingredient.id));
      // 通知审核人（管理员/超管）有新申购单
      await sendNotificationToAdmins({
        type: 'submitted',
        title: '新申购单待审核 📋',
        body: `有新的申购单提交（${cart.length} 种食材），请及时审核`,
        order_id: orderId,
      });
      // 提交成功后清除草稿
      await clearDraft();
      setSubmitSuccess(true);
      setCart([]);
      setTimeout(() => {
        setSubmitSuccess(false);
        router.back();
      }, 1500);
    } else {
      setSubmitError('提交失败，请重试');
    }
    setSubmitting(false);
  };

  const categoryBadgeColor = CATEGORY_COLORS;

  return (
    <PermissionGuard permissions={['提交申购单']} title="申购提交" allowGuestMode>
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">申购提交</Text>
        <Pressable
          onPress={() => setCartSheetVisible(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cart.length > 0 ? '#e8f7f1' : '#f1f5f9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}
        >
          <ShoppingCart size={16} color={cart.length > 0 ? '#059669' : '#9ca3af'} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: cart.length > 0 ? '#059669' : '#9ca3af' }}>
            {cart.length > 0 ? `${cart.length} 种` : '购物车'}
          </Text>
        </Pressable>
      </View>

      {/* 访客提示 banner */}
      {isGuest && (
        <View className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex-row items-center gap-2">
          <Text className="text-amber-700 text-xs flex-1">👀 访客模式：仅可浏览，无法添加食材或提交申购单</Text>
        </View>
      )}
      {guestMsg ? (
        <View className="bg-red-50 border-b border-red-200 px-4 py-2.5">
          <Text className="text-red-600 text-xs text-center">{guestMsg}</Text>
        </View>
      ) : null}

      {/* 搜索框 */}
      <View className="px-3 pt-2 pb-1">
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: '#fff', borderRadius: 10,
            borderWidth: 1, borderColor: '#d1d5db',
            paddingHorizontal: 10, paddingVertical: 7,
          }}
        >
          <Search size={15} color="#9ca3af" />
          <TextInput
            placeholder="搜索食材…"
            placeholderTextColor="#9ca3af"
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            style={{ flex: 1, fontSize: 14, color: '#111827', paddingVertical: 0 }}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <X size={14} color="#9ca3af" />
            </Pressable>
          )}
        </View>
      </View>

      {/* 分类筛选 — 两排水平滚动，「全部」固定第一个，其余按常用频率排序 */}
      <View style={{ backgroundColor: '#f0f4f2', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
          <View style={{ flexDirection: 'column', gap: 7 }}>
            {(() => {
              const allItems = ['全部', ...sortedCategories];
              const mid = Math.ceil(allItems.length / 2);
              const rows = [allItems.slice(0, mid), allItems.slice(mid)];
              return rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: 7 }}>
                  {row.map((item) => {
                    const isSelected = selectedCategory === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => {
                          setSelectedCategory(item as any);
                          setSelectedSubcategory(null);
                          if (item !== '全部') {
                            loadSubcategories(item);
                          } else {
                            setSubcategories([]);
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

      {/* 子分类筛选条（只在选中某品类且有子分类时显示） */}
      {selectedCategory !== '全部' && (subcategoriesLoading || subcategories.length > 0) && (
        <View style={{ backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          {subcategoriesLoading ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <ActivityIndicator size="small" color="#059669" />
            </View>
          ) : (
            <FlatList
              horizontal
              data={[{ id: '__all__', name: '全部' }, ...subcategories.map((s) => ({ id: s.id, name: s.name }))]}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 7 }}
              renderItem={({ item }) => {
                const isSelected = item.id === '__all__'
                  ? selectedSubcategory === null
                  : selectedSubcategory === item.id;
                return (
                  <Pressable
                    onPress={() => setSelectedSubcategory(item.id === '__all__' ? null : item.id)}
                    style={{
                      paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999,
                      backgroundColor: isSelected ? '#059669' : 'transparent',
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#047857' : '#c8d9d3',
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

      {/* 食材列表 */}
      <View className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : (
          <FlatList
            data={filteredIngredients}
            keyExtractor={(item) => item.id}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 180, gap: 10 }}
            renderItem={({ item }) => {
              const cartItem = getCartItem(item.id);
              const qty = cartItem?.quantity ?? 0;
              const color = categoryBadgeColor[item.category] ?? { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' };

              return (
                <View
                  className="bg-card rounded-2xl p-4"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center gap-2 mb-0.5">
                        {/* 分类颜色小圆点 */}
                        <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: color.dot }} />
                        <Text className="text-base font-semibold text-foreground">{item.name}</Text>
                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: color.bg }}>
                          <Text className="text-xs font-medium" style={{ color: color.text }}>{item.category}</Text>
                        </View>
                        {item.subcategory && (
                          <View className="px-2 py-0.5 rounded-full bg-muted">
                            <Text className="text-xs font-medium text-muted-foreground">{item.subcategory}</Text>
                          </View>
                        )}
                        {frequentIds.includes(item.id) && (
                          <View className="px-1.5 py-0.5 rounded-full bg-orange-50">
                            <Text className="text-xs text-orange-600">🔥 常用</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-xs text-muted-foreground">{item.supplier} · {item.unit}</Text>
                    </View>

                    {/* 步进器：数字区域改为可编辑 TextInput */}
                    <View className="flex-row items-center gap-2">
                      {qty > 0 ? (
                        <>
                          <Pressable
                            onPress={() => stepQty(item, qty, -1)}
                            style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Minus size={16} color="#374151" />
                          </Pressable>
                          <TextInput
                            value={editingQtyId === item.id ? editingQtyText : String(qty)}
                            onFocus={() => startEditQty(item, qty)}
                            onChangeText={onQtyChange}
                            onBlur={() => commitQtyEdit(item)}
                            onSubmitEditing={() => commitQtyEdit(item)}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            selectTextOnFocus
                            style={{
                              width: 48, height: 36, borderRadius: 8,
                              backgroundColor: editingQtyId === item.id ? '#f0fdf4' : '#f1f5f9',
                              borderWidth: editingQtyId === item.id ? 1.5 : 0,
                              borderColor: '#059669',
                              textAlign: 'center',
                              fontSize: 15, fontWeight: '600', color: '#111827',
                            }}
                          />
                          <Pressable
                            onPress={() => stepQty(item, qty, 1)}
                            style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Plus size={16} color="#fff" />
                          </Pressable>
                        </>
                      ) : (
                        <Pressable
                          onPress={() => setQuantity(item, 1)}
                          style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Plus size={16} color="#fff" />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* 底部提交区（固定在底部，始终可见）*/}
      <View
        className="bg-card border-t border-border px-4 pt-3 pb-6"
        style={{ boxShadow: [{ offsetX: 0, offsetY: -2, blurRadius: 8, color: 'rgba(0,0,0,0.08)' }] } as object}
      >
        {/* 购物车明细 */}
        {cart.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View className="flex-row gap-2">
              {cart.map((c) => (
                <View key={c.ingredient.id} className="bg-muted rounded-xl px-3 py-2 flex-row items-center gap-2">
                  <Text className="text-sm font-medium text-foreground">{c.ingredient.name}</Text>
                  <Text className="text-sm text-primary font-semibold">{c.quantity}{c.ingredient.unit}</Text>
                  <Pressable onPress={() => setQuantity(c.ingredient, 0)}>
                    <Trash2 size={14} color="#ef4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* 错误/成功提示 */}
        {submitError ? (
          <Text className="text-destructive text-sm mb-2">{submitError}</Text>
        ) : null}
        {submitSuccess ? (
          <Text className="text-primary text-sm mb-2 text-center">✅ 申购单提交成功！</Text>
        ) : null}

        {/* 提交按钮：marginTop:12、height:52、borderRadius:8、fontSize:16 bold */}
        <Pressable
          style={{
            marginTop: 12,
            height: 52,
            borderRadius: 8,
            backgroundColor: isGuest ? '#9ca3af' : cart.length === 0 ? '#9ca3af' : '#059669',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="active:opacity-80"
          onPress={handleSubmitPress}
          disabled={submitting}
        >
          {submitting ? (
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator color="#fff" size="small" />
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>提交中...</Text>
            </View>
          ) : (
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>
              {isGuest ? '访客无法提交申购单' : cart.length === 0 ? '请先选择食材' : `提交申购单（${cart.length} 种）`}
            </Text>
          )}
        </Pressable>
      </View>

      {/* ===== 购物车预览底部弹窗 ===== */}
      <Modal visible={cartSheetVisible} transparent animationType="slide" onRequestClose={() => setCartSheetVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setCartSheetVisible(false)} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '65%' }}>
          {/* 拖动条 */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>
          {/* 标题栏 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            <ShoppingBag size={20} color="#059669" />
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', marginLeft: 8, flex: 1 }}>已选食材</Text>
            <Pressable
              onPress={() => setCartSheetVisible(false)}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color="#6b7280" />
            </Pressable>
          </View>

          {/* 列表 */}
          {cart.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 }}>
              <ShoppingCart size={40} color="#d1d5db" />
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>暂无已选食材</Text>
            </View>
          ) : (
            <FlatList
              data={cart}
              keyExtractor={(c) => c.ingredient.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 10 }}
              renderItem={({ item: c }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>{c.ingredient.name}</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{c.ingredient.supplier} · {c.ingredient.category}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ backgroundColor: '#e8f7f1', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#059669' }}>{c.quantity} {c.ingredient.unit}</Text>
                    </View>
                    <Pressable
                      onPress={() => setQuantity(c.ingredient, 0)}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff1f0', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={14} color="#ef4444" />
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}

          {/* 底部汇总 */}
          <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 28 }}>
            <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
              共 <Text style={{ fontWeight: '700', color: '#059669' }}>{cart.length}</Text> 种食材
            </Text>
          </View>
        </View>
      </Modal>

      {/* ===== 提交确认 Modal ===== */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-card rounded-2xl p-6 w-full" style={{ borderCurve: 'continuous' } as object}>
            {/* 标题 */}
            <View className="flex-row items-center gap-3 mb-4">
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                <CheckCircle size={22} color="#059669" />
              </View>
              <Text className="text-lg font-bold text-foreground flex-1">确认提交申购单</Text>
              <Pressable onPress={() => setConfirmVisible(false)}>
                <X size={20} color="#9ca3af" />
              </Pressable>
            </View>

            {/* 申购明细 */}
            <View className="bg-muted rounded-xl p-3 mb-5 gap-2 max-h-48">
              <ScrollView showsVerticalScrollIndicator={false}>
                {cart.map((c) => (
                  <View key={c.ingredient.id} className="flex-row items-center justify-between py-1">
                    <Text className="text-sm text-foreground font-medium">{c.ingredient.name}</Text>
                    <Text className="text-sm text-primary font-semibold">
                      {c.quantity} {c.ingredient.unit}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
            <Text className="text-xs text-muted-foreground mb-5 text-center">
              共 {cart.length} 种食材，提交后将进入待审核状态
            </Text>

            {/* 操作按钮 */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setConfirmVisible(false)}
                style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-sm font-semibold text-foreground">再想想</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>确认提交</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 草稿恢复弹窗 ===== */}
      <Modal visible={draftModalVisible} transparent animationType="fade" onRequestClose={() => setDraftModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', padding: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 }}>发现未完成的申购单 📋</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
              {pendingDraft ? `保存于 ${formatDraftTime(pendingDraft.savedAt)}，共 ${pendingDraft.cart.length} 种食材：` : ''}
            </Text>
            {/* 草稿食材预览（最多5条） */}
            {pendingDraft && (
              <View style={{ backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 16 }}>
                {pendingDraft.cart.slice(0, 5).map((c) => (
                  <View key={c.ingredient.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                    <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }} numberOfLines={1}>{c.ingredient.name}</Text>
                    <Text style={{ fontSize: 13, color: '#059669', fontWeight: '600' }}>{c.quantity} {c.ingredient.unit}</Text>
                  </View>
                ))}
                {pendingDraft.cart.length > 5 && (
                  <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>还有 {pendingDraft.cart.length - 5} 种食材…</Text>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={async () => {
                  setDraftModalVisible(false);
                  setPendingDraft(null);
                  await clearDraft();
                }}
                style={{ flex: 1, height: 44, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>重新开始</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (pendingDraft) {
                    setCart(pendingDraft.cart);
                  }
                  setDraftModalVisible(false);
                  setPendingDraft(null);
                }}
                style={{ flex: 1, height: 44, borderRadius: 8, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>继续上次</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </PermissionGuard>
  );
}
