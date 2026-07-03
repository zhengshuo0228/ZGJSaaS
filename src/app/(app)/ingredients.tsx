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
import { ArrowLeft, Search, Package, Plus, Pencil, Trash2, X, Check, Filter, Settings2, Download, Upload } from 'lucide-react-native';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  getIngredients, getSuppliers, getCategories, getSubcategories,
  createIngredient, updateIngredient, deleteIngredient,
  createSupplierRecord, getCustomUnits, ensureUnit,
} from '@/db/api';
import type { Ingredient, IngredientCategory, IngredientCategoryRecord, IngredientSubcategoryRecord } from '@/types/types';
import { CATEGORY_COLORS } from '@/types/types';
import { useProfile } from '@/context/ProfileContext';

// ===== 预设单位 =====
const PRESET_UNITS = ['斤', '个', '包', '箱', '桶', '瓶', '袋', '条', '块', '份', '克', '升'];

// ===== 初始表单 =====
const makeEmptyForm = (defaultCategory: string) => ({
  name: '',
  category: defaultCategory as IngredientCategory,
  subcategory_id: null as string | null,
  unit: '斤',
  supplier: '',
  price: '',
  description: '',
});

export default function IngredientsScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryRecords, setCategoryRecords] = useState<IngredientCategoryRecord[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  // 自定义单位（从数据库加载，合并预设后展示）
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  // 筛选栏子分类
  const [filterSubcategories, setFilterSubcategories] = useState<IngredientSubcategoryRecord[]>([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory | '全部'>('全部');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('全部');

  // 新增/编辑弹窗
  const [formVisible, setFormVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [form, setForm] = useState(makeEmptyForm('蔬菜'));
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  // 子分类
  const [subcategories, setSubcategories] = useState<IngredientSubcategoryRecord[]>([]);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  // 新增供应商输入
  const [newSupplierInput, setNewSupplierInput] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);

  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 批量操作模式
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteConfirmVisible, setBatchDeleteConfirmVisible] = useState(false);
  // 批量改分类/供应商
  const [batchEditCategoryVisible, setBatchEditCategoryVisible] = useState(false);
  const [batchEditSupplierVisible, setBatchEditSupplierVisible] = useState(false);
  const [batchEditLoading, setBatchEditLoading] = useState(false);
  // 批量改分类：二级选择状态
  const [batchSelCategory, setBatchSelCategory] = useState<string | null>(null);
  const [batchSelSubcategoryId, setBatchSelSubcategoryId] = useState<string | null>(null);
  const [batchModalSubcategories, setBatchModalSubcategories] = useState<IngredientSubcategoryRecord[]>([]);
  const [batchModalSubLoading, setBatchModalSubLoading] = useState(false);
  // 状态提示
  const [statusMsg, setStatusMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    const [ings, sups, cats, cunits] = await Promise.all([
      getIngredients(),
      getSuppliers(),
      getCategories(),
      getCustomUnits(),
    ]);
    setIngredients(ings);
    setSuppliers(sups);
    setCategoryRecords(cats);
    setCategories(cats.map((c) => c.name));
    setCustomUnits(cunits.filter((u) => !PRESET_UNITS.includes(u)));
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

  const filtered = ingredients.filter((item) => {
    const matchCategory = selectedCategory === '全部' || item.category === selectedCategory;
    const matchSupplier = selectedSupplier === '全部' || item.supplier === selectedSupplier;
    const matchSub = selectedSubcategory === null || item.subcategory_id === selectedSubcategory;
    const matchSearch = !searchText || item.name.includes(searchText) || item.supplier.includes(searchText) || item.category.includes(searchText);
    return matchCategory && matchSupplier && matchSub && matchSearch;
  });

  const handleFilterCategoryChange = async (cat: string) => {
    setSelectedCategory(cat as IngredientCategory | '全部');
    setSelectedSubcategory(null);
    if (cat === '全部') { setFilterSubcategories([]); return; }
    const record = categoryRecords.find((c) => c.name === cat);
    if (!record) { setFilterSubcategories([]); return; }
    const subs = await getSubcategories(record.id);
    setFilterSubcategories(subs);
  };

  // ===== 打开新增弹窗 =====
  const openAdd = () => {
    setEditingItem(null);
    const defaultCat = categories[0] ?? '蔬菜';
    setForm(makeEmptyForm(defaultCat));
    setFormError('');
    setNewSupplierInput('');
    setSubcategories([]);
    setFormVisible(true);
    loadSubcategories(defaultCat);
  };

  // ===== 打开编辑弹窗 =====
  const openEdit = (item: Ingredient) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      category: item.category,
      subcategory_id: item.subcategory_id ?? null,
      unit: item.unit,
      supplier: item.supplier,
      price: item.price !== null ? String(item.price) : '',
      description: item.description ?? '',
    });
    setFormError('');
    setNewSupplierInput('');
    setFormVisible(true);
    loadSubcategories(item.category);
  };

  // ===== 新增供应商（表单内快捷创建）=====
  const handleAddSupplier = async () => {
    const name = newSupplierInput.trim();
    if (!name) return;
    setAddingSupplier(true);
    await createSupplierRecord(name);
    const refreshed = await getSuppliers();
    setSuppliers(refreshed);
    setForm((f) => ({ ...f, supplier: name }));
    setNewSupplierInput('');
    setAddingSupplier(false);
  };

  // ===== 保存（新增或编辑）=====
  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('请填写食材名称'); return; }
    if (!form.unit.trim()) { setFormError('请填写单位'); return; }
    if (!form.supplier.trim()) { setFormError('请填写供应商'); return; }
    const priceVal = form.price.trim() === '' ? null : parseFloat(form.price);
    if (form.price.trim() !== '' && (Number.isNaN(priceVal) || (priceVal as number) < 0)) {
      setFormError('价格格式不正确');
      return;
    }
    setFormSaving(true);
    setFormError('');
    // 自定义单位自动保存到单位表
    if (!PRESET_UNITS.includes(form.unit.trim())) {
      await ensureUnit(form.unit.trim());
    }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      subcategory_id: form.subcategory_id ?? null,
      unit: form.unit.trim(),
      supplier: form.supplier.trim(),
      price: priceVal,
      description: form.description.trim() || null,
      is_active: true,
      usage_count: 0,
    };
    let errorMsg: string | null = null;
    if (editingItem) {
      errorMsg = await updateIngredient(editingItem.id, payload);
    } else {
      errorMsg = await createIngredient(payload);
    }
    setFormSaving(false);
    if (errorMsg) {
      setFormError(`保存失败：${errorMsg}`);
      return;
    }
    setFormVisible(false);
    await loadData();
  };

  // ===== 确认删除 =====
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteIngredient(deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    await loadData();
  };

  // ===== 导出模板 =====
  const [exporting, setExporting] = useState(false);

  const handleExportTemplate = async () => {
    setExporting(true);
    try {
      const header = ['食材名称', '分类', '子分类（选填）', '单位', '价格（选填）', '供应商', '备注'];
      const sample = [
        ['西红柿', '蔬菜', '菜场蔬菜', '斤', '3.5', '绿源蔬菜', '每日新鲜到货'],
        ['猪五花肉', '禽肉', '', '斤', '18', '生鲜当铺', ''],
        ['草鱼', '河鲜', '', '斤', '', '河鲜水产', '活鱼，提前1天预订'],
        ['冻虾仁', '冻品', '', '包', '25', '小叶冻品', '500g/包'],
        ['生抽', '干货调料', '', '瓶', '8', '调料批发', ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet([header, ...sample]);
      ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '食材导入模板');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = `${FileSystem.documentDirectory}食材导入模板.xlsx`;
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: '导出食材导入模板' });
    } catch {
      // 导出失败静默忽略
    } finally {
      setExporting(false);
    }
  };

  // ===== 导入表格 =====
  const [importing, setImporting] = useState(false);
  const [importResultVisible, setImportResultVisible] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; skipped: string[] }>({ success: 0, skipped: [] });

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) { setImporting(false); return; }

      const fileUri = result.assets[0].uri;
      const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];

      // 预加载所有子分类，构建 "categoryName|subcategoryName" → id 映射
      const allSubs = await getSubcategories();
      const subMap = new Map<string, string>();
      for (const sub of allSubs) {
        const catRecord = categoryRecords.find((c) => c.id === sub.category_id);
        if (catRecord) subMap.set(`${catRecord.name}|${sub.name}`, sub.id);
      }

      let successCount = 0;
      const skippedRows: string[] = [];

      // 跳过第一行（表头）
      // 列顺序：食材名称(0) 分类(1) 子分类(2) 单位(3) 价格(4) 供应商(5) 备注(6)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row[0] ?? '').trim();
        const category = String(row[1] ?? '').trim() || '其它';
        const subcategoryName = String(row[2] ?? '').trim();
        const unit = String(row[3] ?? '').trim() || '斤';
        const priceRaw = String(row[4] ?? '').trim();
        const supplier = String(row[5] ?? '').trim() || '未指定';
        const description = String(row[6] ?? '').trim() || null;

        if (!name) {
          if (row.some((c) => String(c).trim())) {
            skippedRows.push(`第 ${i + 1} 行：食材名称不能为空`);
          }
          continue;
        }

        const price = priceRaw === '' ? null : parseFloat(priceRaw);
        if (priceRaw !== '' && (Number.isNaN(price) || (price as number) < 0)) {
          skippedRows.push(`第 ${i + 1} 行（${name}）：价格格式不正确`);
          continue;
        }

        // 查找子分类 ID
        const subcategoryId = subcategoryName ? (subMap.get(`${category}|${subcategoryName}`) ?? null) : null;

        try {
          await createIngredient({
            name,
            category: category as IngredientCategory,
            subcategory_id: subcategoryId,
            unit,
            supplier,
            price: price ?? null,
            description: description ?? null,
            is_active: true,
            usage_count: 0,
          });
          successCount++;
        } catch {
          skippedRows.push(`第 ${i + 1} 行（${name}）：写入失败`);
        }
      }

      setImportResult({ success: successCount, skipped: skippedRows });
      setImportResultVisible(true);
      await loadData();
    } catch {
      setImportResult({ success: 0, skipped: ['文件读取失败，请确认文件格式正确'] });
      setImportResultVisible(true);
    } finally {
      setImporting(false);
    }
  };

  // ===== 批量操作 =====
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    for (const id of selectedIds) {
      await deleteIngredient(id);
    }
    setBatchDeleting(false);
    setBatchDeleteConfirmVisible(false);
    exitBatchMode();
    await loadData();
  };

  const handleBatchEditCategory = async (category: string, subcategoryId: string | null = null) => {
    if (selectedIds.size === 0) return;
    setBatchEditLoading(true);
    const { batchUpdateIngredientCategory } = await import('@/db/api');
    const error = await batchUpdateIngredientCategory(Array.from(selectedIds), category, subcategoryId);
    setBatchEditLoading(false);
    setBatchEditCategoryVisible(false);
    setBatchSelCategory(null);
    setBatchSelSubcategoryId(null);
    setBatchModalSubcategories([]);
    if (!error) {
      setStatusMsg(`已将 ${selectedIds.size} 种食材改为"${category}"`);
      setTimeout(() => setStatusMsg(''), 3000);
      exitBatchMode();
      await loadData();
    } else {
      setStatusMsg(`修改失败：${error}`);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleBatchEditSupplier = async (supplier: string) => {
    if (selectedIds.size === 0) return;
    setBatchEditLoading(true);
    const { batchUpdateIngredientSupplier } = await import('@/db/api');
    const error = await batchUpdateIngredientSupplier(Array.from(selectedIds), supplier);
    setBatchEditLoading(false);
    setBatchEditSupplierVisible(false);
    if (!error) {
      setStatusMsg(`已将 ${selectedIds.size} 种食材改为"${supplier}"`);
      setTimeout(() => setStatusMsg(''), 3000);
      exitBatchMode();
      await loadData();
    } else {
      setStatusMsg(`修改失败：${error}`);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleBatchModalCategorySelect = async (cat: string) => {
    setBatchSelCategory(cat);
    setBatchSelSubcategoryId(null);
    const record = categoryRecords.find((c) => c.name === cat);
    if (!record) { setBatchModalSubcategories([]); return; }
    setBatchModalSubLoading(true);
    const subs = await getSubcategories(record.id);
    setBatchModalSubcategories(subs);
    setBatchModalSubLoading(false);
  };

  // 全部单位 = 预设 + 自定义（去重）
  const allUnits = [...PRESET_UNITS, ...customUnits.filter((u) => !PRESET_UNITS.includes(u))];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View
        className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3"
        style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}
      >
        <Pressable
          onPress={batchMode ? exitBatchMode : () => router.back()}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center"
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', flex: 1 }} numberOfLines={1}>食材库</Text>
        <Text className="text-xs text-muted-foreground mr-1">{filtered.length} 种</Text>
        {/* 批量模式：漏斗图标触发，取消时恢复 */}
        <Pressable
          onPress={batchMode ? exitBatchMode : () => setBatchMode(true)}
          className="active:opacity-70"
          style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: batchMode ? '#e8f7f1' : '#f1f5f9' }}
        >
          <Filter size={20} color={batchMode ? '#2E9D6A' : '#6b7280'} />
        </Pressable>
        {isAdmin && !batchMode && (
          <>
            {/* 齿轮图标 → 管理分类与供应商 */}
            <Pressable
              onPress={() => router.push('/(app)/manage-dict')}
              className="active:opacity-70"
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}
            >
              <Settings2 size={20} color="#374151" />
            </Pressable>
            {/* 导出模板按钮 */}
            <Pressable
              onPress={handleExportTemplate}
              disabled={exporting}
              className="active:opacity-70"
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}
            >
              {exporting ? <ActivityIndicator size="small" color="#059669" /> : <Download size={20} color="#374151" />}
            </Pressable>
            {/* 导入按钮 */}
            <Pressable
              onPress={handleImport}
              disabled={importing}
              className="active:opacity-70"
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}
            >
              {importing ? <ActivityIndicator size="small" color="#059669" /> : <Upload size={20} color="#374151" />}
            </Pressable>
            {/* 新增食材：绿色胶囊按钮 */}
            <Pressable
              onPress={openAdd}
              className="active:opacity-80"
              style={{ height: 36, borderRadius: 18, backgroundColor: '#2E9D6A', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>+ 新增</Text>
            </Pressable>
          </>
        )}
        {/* 批量模式：顶部全选 */}
        {batchMode && (
          <Pressable
            onPress={toggleSelectAll}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' }}
          >
            <View style={{
              width: 18, height: 18, borderRadius: 9, borderWidth: 2,
              borderColor: selectedIds.size === filtered.length ? '#2E9D6A' : '#9ca3af',
              backgroundColor: selectedIds.size === filtered.length ? '#2E9D6A' : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {selectedIds.size === filtered.length && <Check size={11} color="#fff" />}
            </View>
            <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>
              {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : '全选'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* 搜索框 */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center bg-card rounded-xl border border-border px-3 gap-2">
          <Search size={16} color="#9ca3af" />
          <TextInput
            className="flex-1 py-3 text-foreground text-sm"
            placeholder="搜索食材名称或供应商..."
            placeholderTextColor="#9ca3af"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* 分类+供应商筛选面板（可收起） */}
      {/* ===== 筛选标签栏（始终可见，分类 + 供应商两行横向滚动）===== */}
      {!batchMode && (
        <View style={{ paddingTop: 8, paddingBottom: 4 }}>
          {/* 分类行 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 8 }}
          >
            {['全部', ...categories].map((cat) => {
              const isAll = cat === '全部';
              const active = isAll ? selectedCategory === '全部' : selectedCategory === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => handleFilterCategoryChange(cat)}
                  className="active:opacity-75"
                  style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: active ? '#2E9D6A' : '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? '#fff' : '#374151' }}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* 子分类行（选中某品类且有子分类时显示） */}
          {selectedCategory !== '全部' && filterSubcategories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4, gap: 8 }}
            >
              {[{ id: '__all__', name: '不限' }, ...filterSubcategories.map((s) => ({ id: s.id, name: s.name }))].map((sub) => {
                const active = sub.id === '__all__' ? selectedSubcategory === null : selectedSubcategory === sub.id;
                return (
                  <Pressable
                    key={sub.id}
                    onPress={() => setSelectedSubcategory(sub.id === '__all__' ? null : sub.id)}
                    className="active:opacity-75"
                    style={{ height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: active ? '#f0fdf4' : '#f9fafb', borderWidth: 1.5, borderColor: active ? '#2E9D6A' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: active ? '600' : '400', color: active ? '#2E9D6A' : '#6b7280' }}>
                      {sub.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {/* 供应商行（有数据才显示） */}
          {suppliers.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4, gap: 8 }}
            >
              {['全部', ...suppliers].map((sup) => {
                const active = sup === '全部' ? selectedSupplier === '全部' : selectedSupplier === sup;
                return (
                  <Pressable
                    key={sup}
                    onPress={() => setSelectedSupplier(sup)}
                    className="active:opacity-75"
                    style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: active ? '#f0fdf4' : '#f9fafb', borderWidth: 1, borderColor: active ? '#2E9D6A' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '400', color: active ? '#2E9D6A' : '#6b7280' }}>
                      {sup}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* 食材列表 */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <Package size={48} color="#d1d5db" />
          <Text className="text-muted-foreground">暂无食材数据</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: batchMode ? 100 : 32, gap: 10 }}
          renderItem={({ item }) => {
            const badge = CATEGORY_COLORS[item.category] ?? { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' };
            const isSelected = selectedIds.has(item.id);
            return (
              <Pressable
                onPress={() => batchMode ? toggleSelect(item.id) : undefined}
                className="active:opacity-80"
                style={{
                  backgroundColor: isSelected ? '#f0fdf4' : '#fff',
                  borderRadius: 16, padding: 16,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  borderWidth: isSelected ? 1.5 : 0,
                  borderColor: isSelected ? '#2E9D6A' : 'transparent',
                  boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }],
                } as object}
              >
                {/* 批量模式勾选圆圈 */}
                {batchMode && (
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                    borderColor: isSelected ? '#2E9D6A' : '#d1d5db',
                    backgroundColor: isSelected ? '#2E9D6A' : '#fff',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <Check size={13} color="#fff" />}
                  </View>
                )}

                {/* 图标（非批量模式显示） */}
                {!batchMode && (
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: badge.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={20} color={badge.text} />
                  </View>
                )}

                {/* 信息 */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* 分类颜色小圆点 */}
                    <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: badge.dot }} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>{item.name}</Text>
                    <View style={{ backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: badge.text }}>{item.category}</Text>
                    </View>
                    {item.subcategory && (
                      <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#6b7280' }}>{item.subcategory}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {item.supplier} · {item.unit}
                    {item.price !== null ? ` · ¥${item.price}` : ''}
                  </Text>
                </View>

                {/* 管理员操作按钮（非批量模式） */}
                {isAdmin && !batchMode && (
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => openEdit(item)}
                      className="active:opacity-80"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#059669', backgroundColor: 'transparent' }}
                    >
                      <Pencil size={13} color="#059669" />
                      <Text style={{ color: '#059669', fontSize: 12, fontWeight: '600' }}>修改</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setDeleteTarget(item)}
                      className="active:opacity-70"
                      style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff1f0', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={15} color="#ef4444" />
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/* ===== 新增/编辑弹窗 ===== */}
      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setFormVisible(false)} />
          {/* 弹窗卡片：最大高度85%，内容可滚动，按钮固定底部 */}
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}>
            {/* 标题行 — 固定顶部 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
                {editingItem ? '编辑食材' : '新增食材'}
              </Text>
              <Pressable onPress={() => setFormVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>

            {/* 可滚动内容区 */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {/* 食材名称 */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-muted-foreground mb-1.5">
                  食材名称 <Text className="text-destructive">*</Text>
                </Text>
                <TextInput
                  className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm"
                  placeholder="请输入食材名称"
                  placeholderTextColor="#9ca3af"
                  value={form.name}
                  onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setFormError(''); }}
                />
              </View>

              {/* 分类选择 */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-muted-foreground mb-1.5">分类</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {categories.map((cat) => {
                      const isSelected = form.category === cat;
                      return (
                        <Pressable
                          key={cat}
                          onPress={() => {
                            setForm((f) => ({ ...f, category: cat, subcategory_id: null }));
                            loadSubcategories(cat);
                          }}
                          className={`px-3 py-2 rounded-xl ${isSelected ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <Text className={`text-sm font-medium ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                            {cat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* 子分类选择 */}
              {(subcategoriesLoading || subcategories.length > 0) && (
                <View className="mb-4">
                  <Text className="text-xs font-semibold text-muted-foreground mb-1.5">
                    子分类 <Text className="text-xs text-muted-foreground font-normal">（选填）</Text>
                  </Text>
                  {subcategoriesLoading ? (
                    <ActivityIndicator size="small" color="#059669" />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => setForm((f) => ({ ...f, subcategory_id: null }))}
                          className={`px-3 py-2 rounded-xl ${form.subcategory_id === null ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <Text className={`text-sm font-medium ${form.subcategory_id === null ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                            不限
                          </Text>
                        </Pressable>
                        {subcategories.map((sub) => {
                          const isSelected = form.subcategory_id === sub.id;
                          return (
                            <Pressable
                              key={sub.id}
                              onPress={() => setForm((f) => ({ ...f, subcategory_id: isSelected ? null : sub.id }))}
                              className={`px-3 py-2 rounded-xl ${isSelected ? 'bg-primary' : 'bg-muted'}`}
                            >
                              <Text className={`text-sm font-medium ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                {sub.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}
                </View>
              )}

              {/* 单位选择 */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-muted-foreground mb-1.5">
                  单位 <Text className="text-destructive">*</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {allUnits.map((u) => {
                      const isSelected = form.unit === u;
                      return (
                        <Pressable
                          key={u}
                          onPress={() => { setForm((f) => ({ ...f, unit: u })); setFormError(''); }}
                          className={`px-3 py-2 rounded-xl ${isSelected ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <Text className={`text-sm font-medium ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                            {u}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
                <View className="flex-row items-center bg-muted rounded-xl px-3 mt-2 gap-2">
                  <TextInput
                    className="flex-1 py-2.5 text-foreground text-sm"
                    placeholder="其他单位，如：扎、盒…"
                    placeholderTextColor="#9ca3af"
                    value={allUnits.includes(form.unit) ? '' : form.unit}
                    onChangeText={(v) => { if (v) setForm((f) => ({ ...f, unit: v })); setFormError(''); }}
                    returnKeyType="done"
                  />
                </View>
              </View>

              {/* 价格 */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-muted-foreground mb-1.5">价格（选填）</Text>
                <TextInput
                  className="bg-muted rounded-xl px-4 py-3 text-foreground text-sm"
                  placeholder="单价"
                  placeholderTextColor="#9ca3af"
                  value={form.price}
                  onChangeText={(v) => { setForm((f) => ({ ...f, price: v })); setFormError(''); }}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* 供应商 */}
              <View className="mb-4">
                <Text className="text-xs font-semibold text-muted-foreground mb-1.5">
                  供应商 <Text className="text-destructive">*</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {suppliers.map((sup) => {
                      const isSelected = form.supplier === sup;
                      return (
                        <Pressable
                          key={sup}
                          onPress={() => { setForm((f) => ({ ...f, supplier: sup })); setFormError(''); }}
                          className={`px-3 py-2 rounded-xl ${isSelected ? 'bg-primary' : 'bg-muted'}`}
                        >
                          <Text className={`text-sm font-medium ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                            {sup}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {suppliers.length === 0 && (
                      <Text className="text-sm text-muted-foreground py-2">暂无供应商</Text>
                    )}
                  </View>
                </ScrollView>
                <View className="flex-row items-center bg-muted rounded-xl px-3 mt-2 gap-2">
                  <TextInput
                    className="flex-1 py-2.5 text-foreground text-sm"
                    placeholder="输入新供应商名称后点 +"
                    placeholderTextColor="#9ca3af"
                    value={newSupplierInput}
                    onChangeText={setNewSupplierInput}
                    returnKeyType="done"
                    onSubmitEditing={handleAddSupplier}
                  />
                  <Pressable
                    onPress={handleAddSupplier}
                    disabled={addingSupplier || !newSupplierInput.trim()}
                    className="w-7 h-7 rounded-lg bg-primary items-center justify-center active:opacity-50"
                  >
                    {addingSupplier ? <ActivityIndicator size="small" color="#fff" /> : <Plus size={14} color="#fff" />}
                  </Pressable>
                </View>
              </View>

              {/* 备注 */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-foreground mb-2">备注 <Text className="text-xs text-muted-foreground">（选填）</Text></Text>
                <TextInput
                  className="border border-border rounded-xl px-3 py-2.5 text-foreground text-sm"
                  style={{ minHeight: 60, textAlignVertical: 'top' }}
                  placeholder="如：每周一三五到货，优先使用..."
                  placeholderTextColor="#9ca3af"
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>

            {/* 错误提示 + 保存按钮 — 固定底部 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
              {formError ? <Text className="text-destructive text-sm mb-2">{formError}</Text> : null}
              <Pressable
                className="active:opacity-80"
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', alignItems: 'center', justifyContent: 'center' }}
                onPress={handleSave}
                disabled={formSaving}
              >
                {formSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View className="flex-row items-center gap-2">
                    <Check size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                      {editingItem ? '保存修改' : '确认新增'}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 状态提示 */}
      {statusMsg ? (
        <View style={{ position: 'absolute', bottom: batchMode ? 72 : 20, left: 16, right: 16, zIndex: 50 }}>
          <View style={{ backgroundColor: '#111827', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>{statusMsg}</Text>
          </View>
        </View>
      ) : null}

      {/* ===== 批量操作底部操作栏 ===== */}
      {batchMode && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6',
          flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28,
          boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 12, color: 'rgba(0,0,0,0.08)' }],
        } as object}>
          <Pressable
            onPress={() => selectedIds.size > 0 && setBatchEditCategoryVisible(true)}
            style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: selectedIds.size > 0 ? '#2E9D6A' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: selectedIds.size > 0 ? '#2E9D6A' : '#9ca3af', fontWeight: '600', fontSize: 14 }}>
              批量改分类{selectedIds.size > 0 ? `（${selectedIds.size}）` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => selectedIds.size > 0 && setBatchEditSupplierVisible(true)}
            style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: selectedIds.size > 0 ? '#2E9D6A' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: selectedIds.size > 0 ? '#2E9D6A' : '#9ca3af', fontWeight: '600', fontSize: 14 }}>
              批量改供应商{selectedIds.size > 0 ? `（${selectedIds.size}）` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => selectedIds.size > 0 && setBatchDeleteConfirmVisible(true)}
            style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: selectedIds.size > 0 ? '#E64340' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: selectedIds.size > 0 ? '#E64340' : '#9ca3af', fontWeight: '600', fontSize: 14 }}>
              批量删除{selectedIds.size > 0 ? `（${selectedIds.size}）` : ''}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ===== 批量删除确认弹窗 ===== */}
      <Modal visible={batchDeleteConfirmVisible} transparent animationType="fade" onRequestClose={() => setBatchDeleteConfirmVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff1f0', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 }}>
              <Trash2 size={24} color="#ef4444" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 }}>确认批量删除</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 }}>
              确定删除选中的 <Text style={{ fontWeight: '700', color: '#E64340' }}>{selectedIds.size}</Text> 种食材？删除后无法恢复。
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setBatchDeleteConfirmVisible(false)}
                style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '600' }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={handleBatchDelete}
                disabled={batchDeleting}
                className="active:opacity-80"
                style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: '#E64340', alignItems: 'center', justifyContent: 'center' }}
              >
                {batchDeleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>确认删除</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 批量改分类弹窗 ===== */}
      <Modal visible={batchEditCategoryVisible} transparent animationType="fade" onRequestClose={() => { setBatchEditCategoryVisible(false); setBatchSelCategory(null); setBatchSelSubcategoryId(null); setBatchModalSubcategories([]); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxHeight: '80%' }}>
            {/* 标题 — 固定 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' }}>批量改分类</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 4 }}>选中 {selectedIds.size} 种食材 · 请选择目标分类</Text>
            </View>

            {/* 可滚动内容 */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
              {/* 一级品类 */}
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>品类</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {categories.map((cat) => {
                  const isSelected = batchSelCategory === cat;
                  return (
                    <Pressable key={cat} onPress={() => handleBatchModalCategorySelect(cat)} disabled={batchEditLoading}>
                      <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: isSelected ? '#059669' : '#f1f5f9', borderWidth: 1.5, borderColor: isSelected ? '#047857' : '#e5e7eb' }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: isSelected ? '#fff' : '#374151' }}>{cat}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* 二级子分类 */}
              {batchSelCategory !== null && (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>子分类 <Text style={{ fontWeight: '400' }}>（可选）</Text></Text>
                  {batchModalSubLoading ? (
                    <ActivityIndicator size="small" color="#059669" style={{ marginBottom: 12 }} />
                  ) : batchModalSubcategories.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {[{ id: '__none__', name: '不限' }, ...batchModalSubcategories].map((sub) => {
                        const isSelected = sub.id === '__none__' ? batchSelSubcategoryId === null : batchSelSubcategoryId === sub.id;
                        return (
                          <Pressable key={sub.id} onPress={() => setBatchSelSubcategoryId(sub.id === '__none__' ? null : sub.id)} disabled={batchEditLoading}>
                            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isSelected ? '#f0fdf4' : '#f9fafb', borderWidth: 1.5, borderColor: isSelected ? '#059669' : '#e5e7eb' }}>
                              <Text style={{ fontSize: 12, color: isSelected ? '#059669' : '#6b7280', fontWeight: isSelected ? '600' : '400' }}>{sub.name}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>该品类暂无子分类</Text>
                  )}
                </>
              )}
            </ScrollView>

            {/* 操作按钮 — 固定底部 */}
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
              <Pressable onPress={() => { setBatchEditCategoryVisible(false); setBatchSelCategory(null); setBatchSelSubcategoryId(null); setBatchModalSubcategories([]); }} style={{ flex: 1, height: 44, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => batchSelCategory && handleBatchEditCategory(batchSelCategory, batchSelSubcategoryId)}
                disabled={batchEditLoading || !batchSelCategory}
                style={{ flex: 1, height: 44, borderRadius: 8, backgroundColor: batchSelCategory ? '#059669' : '#d1d5db', alignItems: 'center', justifyContent: 'center' }}
              >
                {batchEditLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>确定</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 批量改供应商弹窗 ===== */}
      <Modal visible={batchEditSupplierVisible} transparent animationType="fade" onRequestClose={() => setBatchEditSupplierVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxHeight: '80%' }}>
            {/* 标题 — 固定 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' }}>批量改供应商</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 4 }}>将选中的 {selectedIds.size} 种食材改为以下供应商：</Text>
            </View>

            {/* 可滚动内容 */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {suppliers.map((sup) => (
                  <Pressable key={sup} onPress={() => handleBatchEditSupplier(sup)} disabled={batchEditLoading}>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f1f5f9' }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>{sup}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* 取消按钮 — 固定底部 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
              <Pressable onPress={() => setBatchEditSupplierVisible(false)} style={{ height: 44, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>取消</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 删除确认弹窗 ===== */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
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
              确定要删除「{deleteTarget?.name}」吗？删除后无法恢复。
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                <Text className="text-foreground font-medium">取消</Text>
              </Pressable>
              <Pressable
                className="active:opacity-80"
                style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: '#E64340', alignItems: 'center', justifyContent: 'center' }}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>确认删除</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 导入结果弹窗 ===== */}
      <Modal
        visible={importResultVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImportResultVisible(false)}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxHeight: '70%' }}
          >
            {/* 图标 */}
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: importResult.success > 0 ? '#dcfce7' : '#fef9c3', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 }}>
              <Check size={26} color={importResult.success > 0 ? '#059669' : '#ca8a04'} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 4 }}>导入完成</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 16 }}>
              成功导入 <Text style={{ color: '#059669', fontWeight: '700' }}>{importResult.success}</Text> 条食材
              {importResult.skipped.length > 0 && `，跳过 ${importResult.skipped.length} 行`}
            </Text>
            {importResult.skipped.length > 0 && (
              <ScrollView style={{ maxHeight: 160, backgroundColor: '#fef9c3', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                {importResult.skipped.map((msg, i) => (
                  <Text key={i} style={{ fontSize: 12, color: '#92400e', marginBottom: 4 }}>• {msg}</Text>
                ))}
              </ScrollView>
            )}
            <Pressable
              onPress={() => setImportResultVisible(false)}
              className="active:opacity-80"
              style={{ height: 46, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>确定</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
