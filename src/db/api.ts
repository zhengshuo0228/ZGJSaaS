import { supabase } from '@/client/supabase';
import type {
  Profile,
  Ingredient,
  IngredientCategory,
  IngredientCategoryRecord,
  IngredientSubcategoryRecord,
  IngredientSupplierRecord,
  PositionRecord,
  PurchaseOrder,
  OrderItem,
  OrderStatus,
  UserRole,
  Notification,
  NotificationType,
  OperationLog,
  Dish,
  DishSop,
  DishWithSop,
} from '@/types/types';

type TenantContext = {
  tenant_id: string | null;
  store_id: string | null;
  department_id: string | null;
};

async function getMyTenantContext(): Promise<TenantContext> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { tenant_id: null, store_id: null, department_id: null };

  const { data } = await supabase
    .from('profiles')
    .select('tenant_id, store_id, department_id')
    .eq('id', user.id)
    .maybeSingle();

  return {
    tenant_id: (data?.tenant_id as string | null | undefined) ?? null,
    store_id: (data?.store_id as string | null | undefined) ?? null,
    department_id: (data?.department_id as string | null | undefined) ?? null,
  };
}

function withTenant<T extends Record<string, unknown>>(
  record: T,
  context: TenantContext,
  options: { includeStore?: boolean } = {}
): T {
  return {
    ...record,
    ...(context.tenant_id ? { tenant_id: context.tenant_id } : {}),
    ...(options.includeStore && context.store_id ? { store_id: context.store_id } : {}),
  };
}

// ===== 用户档案 =====

export async function getMyProfile(): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle();
  return data;
}

export async function getAllProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  return Array.isArray(data) ? data : [];
}

export async function updateProfileRole(id: string, role: string): Promise<void> {
  await supabase.from('profiles').update({ role }).eq('id', id);
}

export async function updateProfileDisplayName(id: string, display_name: string): Promise<void> {
  await supabase.from('profiles').update({ display_name }).eq('id', id);
}

export async function updateProfile(
  id: string,
  updates: { display_name?: string; role?: UserRole | string; position?: string | null }
): Promise<void> {
  await supabase.from('profiles').update(updates).eq('id', id);
}

// ===== 岗位管理 =====

export async function getPositions(): Promise<PositionRecord[]> {
  const { data } = await supabase
    .from('positions')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  return Array.isArray(data) ? (data as unknown as PositionRecord[]) : [];
}

export async function createPosition(name: string): Promise<void> {
  const context = await getMyTenantContext();
  await supabase.from('positions').insert(withTenant({ name: name.trim() }, context));
}

export async function deletePosition(id: string): Promise<void> {
  await supabase.from('positions').delete().eq('id', id);
}

/** 更新岗位权限 */
export async function updatePositionPermissions(id: string, permissions: string[]): Promise<{ error: string | null }> {
  // 校验：仅 account_id='000' 的超管可编辑岗位权限
  const { data: me } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle();
  if (me?.account_id !== '000') {
    return { error: '仅 000 超管可编辑岗位权限' };
  }
  const { error } = await supabase.from('positions').update({ permissions }).eq('id', id);
  return { error: error?.message ?? null };
}

/**
 * 根据当前登录用户的岗位(position)查询对应权限列表。
 * 权限来源：positions.permissions（岗位直接关联权限，不经过角色）。
 * super_admin / admin 角色直接返回全量权限（后端兜底）。
 */
export async function getUserPermsByPosition(userId: string): Promise<string[]> {
  const { data: prof } = await supabase
    .from('profiles')
    .select('role, position')
    .eq('id', userId)
    .maybeSingle();
  if (!prof) return [];
  const role = (prof.role as string) || 'user';
  if (role === 'super_admin' || role === 'admin') {
    // super_admin / admin 拥有全量权限，直接返回所有已知权限项
    return [
      '提交申购单','查看申购历史','审核申购单','查看采购汇总',
      '管理食材库','账号管理','系统配置','导出报表','数据统计',
      '绩效提交申请','绩效审核申请','绩效管理','绩效查看全部','绩效导出汇总','绩效删除记录','绩效加分扣分',
      '排休申请','排休管理',
      'sop_manage',
    ];
  }
  const posName = (prof.position as string | null) || '';
  if (!posName) return [];
  const { data: pos } = await supabase
    .from('positions')
    .select('permissions')
    .eq('name', posName)
    .maybeSingle();
  return Array.isArray(pos?.permissions) ? (pos.permissions as string[]) : [];
}

// ===== 管理员用户操作（通过 Edge Function）=====

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export async function adminCreateUser(params: {
  email: string;
  password: string;
  display_name?: string;
  role?: UserRole | string;
  position?: string;
}): Promise<{ success: boolean; error?: string }> {
  const token = await getAuthToken();
  const context = await getMyTenantContext();
  const { data, error } = await supabase.functions.invoke('admin-user-ops', {
    body: { action: 'create', ...params, tenant_context: context },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const msg = await error?.context?.text?.().catch(() => error.message);
    try {
      const parsed = JSON.parse(msg);
      return { success: false, error: parsed.error ?? msg };
    } catch {
      return { success: false, error: msg };
    }
  }
  return data?.success ? { success: true } : { success: false, error: data?.error };
}

export async function adminDeleteUser(user_id: string): Promise<{ success: boolean; error?: string }> {
  const token = await getAuthToken();
  const { data, error } = await supabase.functions.invoke('admin-user-ops', {
    body: { action: 'delete', user_id },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const msg = await error?.context?.text?.().catch(() => error.message);
    try {
      const parsed = JSON.parse(msg);
      return { success: false, error: parsed.error ?? msg };
    } catch {
      return { success: false, error: msg };
    }
  }
  return data?.success ? { success: true } : { success: false, error: data?.error };
}

export async function adminUpdatePassword(user_id: string, new_password: string): Promise<{ success: boolean; error?: string }> {
  const token = await getAuthToken();
  const { data, error } = await supabase.functions.invoke('admin-user-ops', {
    body: { action: 'update_password', user_id, new_password },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const msg = await error?.context?.text?.().catch(() => error.message);
    try {
      const parsed = JSON.parse(msg);
      return { success: false, error: parsed.error ?? msg };
    } catch {
      return { success: false, error: msg };
    }
  }
  return data?.success ? { success: true } : { success: false, error: data?.error };
}

// 修改自己的密码（通过 Supabase Auth）
export async function updateMyPassword(new_password: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.updateUser({ password: new_password });
  return error ? { success: false, error: error.message } : { success: true };
}

// ===== 食材库 =====

// ----- 分类管理 -----

export async function getCategories(): Promise<IngredientCategoryRecord[]> {
  const { data } = await supabase
    .from('ingredient_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  return Array.isArray(data) ? data : [];
}

export async function createCategory(name: string, sort_order = 99): Promise<void> {
  const context = await getMyTenantContext();
  await supabase.from('ingredient_categories').insert(withTenant({ name: name.trim(), sort_order }, context));
}

export async function updateCategory(id: string, updates: { name?: string; sort_order?: number }): Promise<void> {
  await supabase.from('ingredient_categories').update(updates).eq('id', id);
}

export async function deleteCategory(id: string): Promise<void> {
  await supabase.from('ingredient_categories').delete().eq('id', id);
}

// ----- 子分类管理 -----

export async function getSubcategories(categoryId?: string): Promise<IngredientSubcategoryRecord[]> {
  let query = supabase.from('ingredient_subcategories').select('*').order('name', { ascending: true });
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data } = await query;
  return Array.isArray(data) ? data : [];
}

export async function createSubcategory(categoryId: string, name: string): Promise<void> {
  const context = await getMyTenantContext();
  await supabase.from('ingredient_subcategories').insert(withTenant({ category_id: categoryId, name: name.trim() }, context));
}

export async function updateSubcategory(id: string, name: string): Promise<void> {
  await supabase.from('ingredient_subcategories').update({ name: name.trim() }).eq('id', id);
}

export async function deleteSubcategory(id: string): Promise<void> {
  await supabase.from('ingredient_subcategories').delete().eq('id', id);
}

// ----- 供应商管理 -----

export async function getSupplierRecords(): Promise<IngredientSupplierRecord[]> {
  const { data } = await supabase
    .from('ingredient_suppliers')
    .select('*')
    .order('name', { ascending: true });
  return Array.isArray(data) ? data : [];
}

export async function createSupplierRecord(name: string, contact?: string): Promise<void> {
  const context = await getMyTenantContext();
  await supabase.from('ingredient_suppliers').insert({
    name: name.trim(),
    contact: contact?.trim() || null,
    ...(context.tenant_id ? { tenant_id: context.tenant_id } : {}),
  });
}

export async function updateSupplierRecord(id: string, updates: { name?: string; contact?: string | null }): Promise<void> {
  await supabase.from('ingredient_suppliers').update(updates).eq('id', id);
}

export async function deleteSupplierRecord(id: string): Promise<void> {
  await supabase.from('ingredient_suppliers').delete().eq('id', id);
}

// ===== 自定义单位 =====
export async function getCustomUnits(): Promise<string[]> {
  const { data } = await supabase.from('ingredient_units').select('name').order('name', { ascending: true });
  return Array.isArray(data) ? data.map((r: any) => r.name as string) : [];
}

export async function ensureUnit(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const context = await getMyTenantContext();
  await supabase
    .from('ingredient_units')
    .upsert(withTenant({ name: trimmed }, context), { onConflict: 'tenant_id,name', ignoreDuplicates: true });
}

// 获取当前用户历史申购频次最高的食材ID（Top N）
export async function getMyFrequentIngredients(topN = 10): Promise<string[]> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  // Step 1：获取当前用户的所有申购单ID
  const { data: orders } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('submitter_id', user.id);
  const orderIds = (orders || []).map((o: any) => o.id);
  if (orderIds.length === 0) return [];

  // Step 2：统计这些申购单中各食材出现次数
  const { data: items } = await supabase
    .from('order_items')
    .select('ingredient_id')
    .in('order_id', orderIds);

  const counts: Record<string, number> = {};
  (items || []).forEach((item: any) => {
    counts[item.ingredient_id] = (counts[item.ingredient_id] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}

/** 返回当前用户常用分类列表（按使用次数降序），用于分类按钮动态排序 */
export async function getMyFrequentCategories(): Promise<string[]> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const { data: orders } = await supabase
    .from('purchase_orders').select('id').eq('submitter_id', user.id);
  const orderIds = ((orders ?? []) as { id: string }[]).map(o => o.id);
  if (orderIds.length === 0) return [];

  // 联查 order_items + ingredients.category
  const { data: items } = await supabase
    .from('order_items')
    .select('ingredients!inner(category)')
    .in('order_id', orderIds);

  const counts: Record<string, number> = {};
  ((items ?? []) as unknown as { ingredients: { category: string } | { category: string }[] }[]).forEach(item => {
    const ing = item.ingredients;
    const cat = Array.isArray(ing) ? ing[0]?.category : (ing as { category: string })?.category;
    if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cat]) => cat);
}

export async function getIngredients(category?: IngredientCategory, supplier?: string): Promise<Ingredient[]> {
  let query = supabase
    .from('ingredients')
    .select('*, subcategory:ingredient_subcategories!subcategory_id(name)')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (category) query = query.eq('category', category);
  if (supplier) query = query.eq('supplier', supplier);

  const { data } = await query;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r: any) => ({
    ...r,
    subcategory: r.subcategory?.name ?? null,
  })) as Ingredient[];
}

export async function getSuppliers(): Promise<string[]> {
  const records = await getSupplierRecords();
  if (records.length > 0) return records.map((r) => r.name);
  // 兜底：从食材表提取
  const { data } = await supabase
    .from('ingredients')
    .select('supplier')
    .eq('is_active', true);
  if (!Array.isArray(data)) return [];
  const set = new Set(data.map((r) => r.supplier as string).filter(Boolean));
  return Array.from(set).sort();
}

export async function createIngredient(ingredient: Omit<Ingredient, 'id' | 'created_at'>): Promise<string | null> {
  const context = await getMyTenantContext();
  const { error } = await supabase
    .from('ingredients')
    .insert(withTenant(ingredient as unknown as Record<string, unknown>, context, { includeStore: true }));
  if (error) { console.error('createIngredient error:', error.message); return error.message; }
  return null;
}

export async function updateIngredient(id: string, updates: Partial<Ingredient>): Promise<string | null> {
  const { error } = await supabase.from('ingredients').update(updates).eq('id', id);
  if (error) { console.error('updateIngredient error:', error.message); return error.message; }
  return null;
}

export async function batchUpdateIngredientCategory(ids: string[], category: string, subcategoryId: string | null = null): Promise<string | null> {
  const { error } = await supabase.from('ingredients').update({ category, subcategory_id: subcategoryId }).in('id', ids);
  if (error) { console.error('batchUpdateCategory error:', error.message); return error.message; }
  return null;
}

export async function batchUpdateIngredientSupplier(ids: string[], supplier: string): Promise<string | null> {
  const { error } = await supabase.from('ingredients').update({ supplier }).in('id', ids);
  if (error) { console.error('batchUpdateSupplier error:', error.message); return error.message; }
  return null;
}

export async function deleteIngredient(id: string): Promise<void> {
  await supabase.from('ingredients').update({ is_active: false }).eq('id', id);
}

// ===== 申购单 =====

export async function createPurchaseOrder(
  items: Array<{ ingredient_id: string; quantity: number; unit: string }>
): Promise<string | null> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const context = await getMyTenantContext();
  // 创建申购单
  const { data: order, error } = await supabase
    .from('purchase_orders')
    .insert(withTenant({ submitter_id: user.id }, context, { includeStore: true }))
    .select('id')
    .maybeSingle();

  if (error || !order) return null;

  // 创建明细
  await supabase.from('order_items').insert(
    items.map((item) => ({ ...item, order_id: order.id }))
  );

  return order.id;
}

export async function getMyOrders(startDate?: string, endDate?: string): Promise<PurchaseOrder[]> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      items:order_items(
        *,
        ingredient:ingredients(id, name, category, unit, supplier)
      )
    `)
    .eq('submitter_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lt('created_at', endDate);

  const { data } = await query;
  return Array.isArray(data) ? (data as PurchaseOrder[]) : [];
}

export async function getPendingOrders(startDate?: string, endDate?: string): Promise<PurchaseOrder[]> {
  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      submitter:profiles!purchase_orders_submitter_id_fkey(id, display_name, email),
      items:order_items(
        *,
        ingredient:ingredients(id, name, category, unit, supplier)
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100);

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lt('created_at', endDate);

  const { data } = await query;
  return Array.isArray(data) ? (data as PurchaseOrder[]) : [];
}

export async function getAllOrders(): Promise<PurchaseOrder[]> {
  const { data } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      submitter:profiles!purchase_orders_submitter_id_fkey(id, display_name, email),
      items:order_items(
        *,
        ingredient:ingredients(id, name, category, unit, supplier)
      )
    `)
    .order('created_at', { ascending: false });

  return Array.isArray(data) ? (data as PurchaseOrder[]) : [];
}

export async function getApprovedOrders(startDate?: string, endDate?: string): Promise<PurchaseOrder[]> {
  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      submitter:profiles!purchase_orders_submitter_id_fkey(id, display_name, email),
      items:order_items(
        *,
        ingredient:ingredients(id, name, category, unit, supplier, subcategory_id, subcategory:ingredient_subcategories!subcategory_id(name))
      )
    `)
    .in('status', ['approved', 'modified'])
    .order('created_at', { ascending: false });

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lt('created_at', endDate);

  const { data } = await query;
  return Array.isArray(data) ? (data as PurchaseOrder[]) : [];
}

// 已审核订单（包含 approved/modified/rejected），用于"已审核"Tab
export async function getReviewedOrders(startDate?: string, endDate?: string): Promise<PurchaseOrder[]> {
  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      submitter:profiles!purchase_orders_submitter_id_fkey(id, display_name, email),
      reviewer:profiles!purchase_orders_reviewed_by_fkey(id, display_name, email),
      items:order_items(
        *,
        ingredient:ingredients(id, name, category, unit, supplier)
      )
    `)
    .in('status', ['approved', 'modified', 'rejected'])
    .order('reviewed_at', { ascending: false })
    .limit(200);

  if (startDate) query = query.gte('reviewed_at', startDate);
  if (endDate) query = query.lt('reviewed_at', endDate);

  const { data } = await query;
  return Array.isArray(data) ? (data as PurchaseOrder[]) : [];
}

export async function reviewOrder(
  orderId: string,
  action: 'approved' | 'rejected',
  modifiedItems?: Array<{ id: string; quantity: number }>
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;

  const isModified = action === 'approved' && modifiedItems && modifiedItems.length > 0;
  const newStatus: OrderStatus = isModified ? 'modified' : action;

  // 更新申购单状态
  await supabase
    .from('purchase_orders')
    .update({
      status: newStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  // 如有修改，更新明细数量
  if (isModified && modifiedItems) {
    for (const item of modifiedItems) {
      // 先保存原始数量
      const { data: existing } = await supabase
        .from('order_items')
        .select('quantity, original_quantity')
        .eq('id', item.id)
        .maybeSingle();

      await supabase
        .from('order_items')
        .update({
          original_quantity: existing?.original_quantity ?? existing?.quantity,
          quantity: item.quantity,
        })
        .eq('id', item.id);
    }
  }
}

// ===== 采购汇总 =====

export interface PurchaseSummaryItem {
  ingredient_id: string;
  ingredient_name: string;
  category: string;
  subcategory_id: string | null;
  subcategory: string | null;
  unit: string;
  supplier: string;
  total_quantity: number;
  submitters: string[];
}

export async function getPurchaseSummary(supplier?: string, startDate?: string, endDate?: string): Promise<PurchaseSummaryItem[]> {
  const orders = await getApprovedOrders(startDate, endDate);
  // 加载数量覆盖记录
  const overrides = await getSummaryQuantityOverrides(startDate, endDate);

  // 聚合数据
  const map = new Map<string, PurchaseSummaryItem>();

  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (item.excluded_from_summary) continue;
      const ing = item.ingredient;
      if (!ing) continue;
      if (supplier && ing.supplier !== supplier) continue;

      const key = ing.id;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.total_quantity += item.quantity;
        const submitterName = order.submitter?.display_name || order.submitter?.email?.split('@')[0] || '未知';
        if (!existing.submitters.includes(submitterName)) {
          existing.submitters.push(submitterName);
        }
      } else {
        const submitterName = order.submitter?.display_name || order.submitter?.email?.split('@')[0] || '未知';
        const ingAny = ing as any;
        map.set(key, {
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          category: ing.category,
          subcategory_id: ingAny.subcategory_id ?? null,
          subcategory: ingAny.subcategory?.name ?? null,
          unit: ing.unit,
          supplier: ing.supplier,
          total_quantity: item.quantity,
          submitters: [submitterName],
        });
      }
    }
  }

  // 应用数量覆盖
  for (const [ingredientId, overrideQty] of overrides.entries()) {
    const item = map.get(ingredientId);
    if (item) item.total_quantity = overrideQty;
  }

  return Array.from(map.values()).sort((a, b) => a.supplier.localeCompare(b.supplier));
}

// 排除某个食材从采购汇总（将对应 order_items 标记为 excluded_from_summary）
export async function excludeIngredientFromSummary(
  ingredientId: string,
  startDate?: string,
  endDate?: string
): Promise<void> {
  const orders = await getApprovedOrders(startDate, endDate);
  const itemIds: string[] = [];
  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (item.ingredient?.id === ingredientId && !item.excluded_from_summary) {
        itemIds.push(item.id);
      }
    }
  }
  if (itemIds.length > 0) {
    await supabase.from('order_items').update({ excluded_from_summary: true }).in('id', itemIds);
  }
}

// 排除某个供应商下所有食材从采购汇总
export async function excludeSupplierFromSummary(
  supplier: string,
  startDate?: string,
  endDate?: string
): Promise<void> {
  const orders = await getApprovedOrders(startDate, endDate);
  const itemIds: string[] = [];
  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (item.ingredient?.supplier === supplier && !item.excluded_from_summary) {
        itemIds.push(item.id);
      }
    }
  }
  if (itemIds.length > 0) {
    await supabase.from('order_items').update({ excluded_from_summary: true }).in('id', itemIds);
  }
}

// ===== 品类申购明细（供采购汇总详情页使用） =====

export interface CategoryOrderItem {
  order_id: string;
  item_id: string;
  ingredient_name: string;
  category: string;
  unit: string;
  quantity: number;
  submitter_name: string;
  ordered_at: string;
}

export async function getCategoryOrderItems(
  supplier: string,
  startDate?: string,
  endDate?: string,
): Promise<CategoryOrderItem[]> {
  const orders = await getApprovedOrders(startDate, endDate);
  const result: CategoryOrderItem[] = [];

  for (const order of orders) {
    const submitterName =
      order.submitter?.display_name ||
      order.submitter?.email?.split('@')[0] ||
      '未知';

    for (const item of order.items ?? []) {
      if (item.excluded_from_summary) continue;
      const ing = item.ingredient;
      if (!ing || ing.supplier !== supplier) continue;
      result.push({
        order_id: order.id,
        item_id: item.id,
        ingredient_name: ing.name,
        category: ing.category,
        unit: ing.unit,
        quantity: item.quantity,
        submitter_name: submitterName,
        ordered_at: order.created_at,
      });
    }
  }

  // 最新申购在前
  result.sort((a, b) => b.ordered_at.localeCompare(a.ordered_at));
  return result;
}

// ===== 通知 =====

/** 保存设备 Expo Push Token 到当前用户 profile */
export async function savePushToken(token: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;
  await supabase.from('profiles').update({ expo_push_token: token }).eq('id', user.id);
}

/** 调用 send-push Edge Function 向指定用户发送推送 */
async function triggerPush(userIds: string[], title: string, body: string, data?: Record<string, string>) {
  try {
    await supabase.functions.invoke('send-push', {
      body: { user_ids: userIds, title, body, data },
    });
  } catch {
    // push 失败不影响主流程
  }
}

export async function sendNotification(params: {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  order_id?: string;
  perf_id?: string;
}): Promise<void> {
  const context = await getMyTenantContext();
  await supabase.from('notifications').insert({
    ...(context.tenant_id ? { tenant_id: context.tenant_id } : {}),
    user_id: params.user_id,
    type: params.type,
    title: params.title,
    body: params.body,
    order_id: params.order_id ?? null,
    perf_id: params.perf_id ?? null,
  });
  const pushData: Record<string, string> = { type: params.type };
  if (params.order_id) pushData.order_id = params.order_id;
  if (params.perf_id) pushData.perf_id = params.perf_id;
  await triggerPush([params.user_id], params.title, params.body, pushData);
}

// 向所有管理员和超管发送通知（用于申购单提交时通知审核人）
export async function sendNotificationToAdmins(params: {
  type: NotificationType;
  title: string;
  body: string;
  order_id?: string;
}): Promise<void> {
  const context = await getMyTenantContext();
  const { data: admins } = await supabase
    .from('profiles')
    .select('id, tenant_id')
    .in('role', ['admin', 'super_admin']);
  if (!admins || admins.length === 0) return;
  const targetAdmins = admins.filter((admin) => !context.tenant_id || admin.tenant_id === context.tenant_id);
  if (targetAdmins.length === 0) return;
  await supabase.from('notifications').insert(
    targetAdmins.map((a: { id: string; tenant_id?: string | null }) => ({
      tenant_id: a.tenant_id ?? context.tenant_id ?? null,
      user_id: a.id,
      type: params.type,
      title: params.title,
      body: params.body,
      order_id: params.order_id ?? null,
    }))
  );
  // 同步推送给所有管理员
  await triggerPush(
    targetAdmins.map((a: { id: string }) => a.id),
    params.title,
    params.body,
    params.order_id ? { order_id: params.order_id, type: params.type } : { type: params.type },
  );
}

// 向所有有"绩效审核申请"权限的用户发送通知（用于员工提交绩效申请时通知审核人）
export async function sendNotificationToReviewers(params: {
  type: NotificationType;
  title: string;
  body: string;
  perf_id?: string;
}): Promise<void> {
  // 查出所有含"绩效审核申请"权限的岗位名称
  const { data: positions } = await supabase
    .from('positions')
    .select('name, permissions');
  const reviewerPositions = (positions ?? [])
    .filter((p: { permissions: string[] }) => Array.isArray(p.permissions) && p.permissions.includes('绩效审核申请'))
    .map((p: { name: string }) => p.name);

  // admin / super_admin 角色也默认有审核权限
  let reviewerQuery = supabase.from('profiles').select('id, tenant_id').in('role', ['admin', 'super_admin']);
  let reviewers: { id: string; tenant_id?: string | null }[] = [];
  const { data: adminReviewers } = await reviewerQuery;
  reviewers = [...(adminReviewers ?? [])];

  if (reviewerPositions.length > 0) {
    const { data: posReviewers } = await supabase
      .from('profiles')
      .select('id, tenant_id')
      .in('position', reviewerPositions);
    reviewers = [...reviewers, ...(posReviewers ?? [])];
  }

  const context = await getMyTenantContext();
  const reviewerMap = new Map(
    reviewers
      .filter((reviewer) => !context.tenant_id || reviewer.tenant_id === context.tenant_id)
      .map((reviewer) => [reviewer.id, reviewer])
  );
  const uniqueIds = [...reviewerMap.keys()];
  if (uniqueIds.length === 0) return;

  await supabase.from('notifications').insert(
    uniqueIds.map((id: string) => ({
      tenant_id: reviewerMap.get(id)?.tenant_id ?? context.tenant_id ?? null,
      user_id: id,
      type: params.type,
      title: params.title,
      body: params.body,
      order_id: null,
      perf_id: params.perf_id ?? null,
    }))
  );
  const pushData: Record<string, string> = { type: params.type };
  if (params.perf_id) pushData.perf_id = params.perf_id;
  await triggerPush(
    uniqueIds,
    params.title,
    params.body,
    pushData,
  );
}

export async function getMyNotifications(): Promise<Notification[]> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  return Array.isArray(data) ? (data as Notification[]) : [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);
  return count ?? 0;
}

// ===== 食材使用频次 =====

export async function incrementIngredientUsage(ingredientIds: string[]): Promise<void> {
  for (const id of ingredientIds) {
    await supabase.rpc('increment_ingredient_usage', { ingredient_id: id });
  }
}

// ===== 数据统计 =====

export interface WeeklyStats {
  week_label: string;
  order_count: number;
  item_count: number;
}

export interface MonthlyStats {
  month_label: string;
  order_count: number;
  item_count: number;
}

export interface CategoryStats {
  category: string;
  total_quantity: number;
}

export async function getWeeklyStats(weekCount = 8): Promise<WeeklyStats[]> {
  const results: WeeklyStats[] = [];
  const now = new Date();
  for (let i = weekCount - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    const daysToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + i * 7;
    weekStart.setDate(weekStart.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // 排除 excluded_from_summary=true 的条目
    const { data: orders } = await supabase
      .from('purchase_orders')
      .select('id, items:order_items(id, excluded_from_summary)')
      .in('status', ['approved', 'modified'])
      .gte('reviewed_at', weekStart.toISOString())
      .lte('reviewed_at', weekEnd.toISOString());

    const orderCount = orders?.length ?? 0;
    const itemCount = orders?.reduce((sum, o) => {
      const items = (o.items as { id: string; excluded_from_summary: boolean }[]) ?? [];
      return sum + items.filter((it) => !it.excluded_from_summary).length;
    }, 0) ?? 0;
    const monthStr = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    results.push({ week_label: monthStr, order_count: orderCount, item_count: itemCount });
  }
  return results;
}

export async function getMonthlyStats(monthCount = 6): Promise<MonthlyStats[]> {
  const results: MonthlyStats[] = [];
  const now = new Date();
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    // 排除 excluded_from_summary=true 的条目
    const { data: orders } = await supabase
      .from('purchase_orders')
      .select('id, items:order_items(id, excluded_from_summary)')
      .in('status', ['approved', 'modified'])
      .gte('reviewed_at', start.toISOString())
      .lte('reviewed_at', end.toISOString());

    const orderCount = orders?.length ?? 0;
    const itemCount = orders?.reduce((sum, o) => {
      const items = (o.items as { id: string; excluded_from_summary: boolean }[]) ?? [];
      return sum + items.filter((it) => !it.excluded_from_summary).length;
    }, 0) ?? 0;
    results.push({
      month_label: `${d.getMonth() + 1}月`,
      order_count: orderCount,
      item_count: itemCount,
    });
  }
  return results;
}

export async function getCategoryStats(startDate?: string, endDate?: string): Promise<CategoryStats[]> {
  const orders = await getApprovedOrders(startDate, endDate);
  const map = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items ?? []) {
      // 排除已从汇总删除的条目
      if (item.excluded_from_summary) continue;
      const cat = item.ingredient?.category ?? '其它';
      map.set(cat, (map.get(cat) ?? 0) + item.quantity);
    }
  }
  return Array.from(map.entries())
    .map(([category, total_quantity]) => ({ category, total_quantity }))
    .sort((a, b) => b.total_quantity - a.total_quantity);
}

// ===== 按时间段统计汇总数据（供数据统计页使用） =====
export interface PeriodStats {
  order_count: number;
  item_count: number;
  trend: Array<{ label: string; order_count: number; item_count: number }>;
  categories: CategoryStats[];
}

export async function getStatsForRange(startDate?: string, endDate?: string): Promise<PeriodStats> {
  // 已批准申购单（在审批时间范围内）
  let orderQuery = supabase
    .from('purchase_orders')
    .select('id, reviewed_at, items:order_items(id, excluded_from_summary)')
    .in('status', ['approved', 'modified'])
    .order('reviewed_at', { ascending: true });

  if (startDate) orderQuery = orderQuery.gte('reviewed_at', startDate);
  if (endDate) orderQuery = orderQuery.lt('reviewed_at', endDate);

  const { data: orders } = await orderQuery;
  const safeOrders = Array.isArray(orders) ? orders : [];

  const order_count = safeOrders.length;
  const item_count = safeOrders.reduce((sum, o) => {
    const items = (o.items as { id: string; excluded_from_summary: boolean }[]) ?? [];
    return sum + items.filter((it) => !it.excluded_from_summary).length;
  }, 0);

  // 趋势：按天分组
  const dayMap = new Map<string, { order_count: number; item_count: number }>();
  for (const o of safeOrders) {
    const day = (o.reviewed_at as string).slice(0, 10);
    const items = (o.items as { id: string; excluded_from_summary: boolean }[]) ?? [];
    const validItems = items.filter((it) => !it.excluded_from_summary).length;
    const prev = dayMap.get(day) ?? { order_count: 0, item_count: 0 };
    dayMap.set(day, { order_count: prev.order_count + 1, item_count: prev.item_count + validItems });
  }
  const trend = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => {
      const d = new Date(date);
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, ...stats };
    });

  const categories = await getCategoryStats(startDate, endDate);

  return { order_count, item_count, trend, categories };
}

// ===== 采购汇总数量修改覆盖 =====
export async function setSummaryQuantityOverride(
  ingredientId: string,
  overrideQuantity: number,
  startDate?: string,
  endDate?: string,
): Promise<void> {
  const startVal = startDate ?? null;
  const endVal = endDate ?? null;

  // 先尝试删除旧记录再插入（避免 unique 冲突）
  await supabase
    .from('summary_quantity_overrides')
    .delete()
    .eq('ingredient_id', ingredientId)
    .is('start_date', startVal)
    .is('end_date', endVal);

  await supabase.from('summary_quantity_overrides').insert({
    ingredient_id: ingredientId,
    start_date: startVal,
    end_date: endVal,
    override_quantity: overrideQuantity,
  });
}

export async function getSummaryQuantityOverrides(
  startDate?: string,
  endDate?: string,
): Promise<Map<string, number>> {
  const startVal = startDate ?? null;
  const endVal = endDate ?? null;

  let query = supabase.from('summary_quantity_overrides').select('ingredient_id, override_quantity');
  if (startVal) query = query.eq('start_date', startVal);
  else query = query.is('start_date', null);
  if (endVal) query = query.eq('end_date', endVal);
  else query = query.is('end_date', null);

  const { data } = await query;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.ingredient_id as string, row.override_quantity as number);
  }
  return map;
}

// ===== 操作日志 =====

export async function addOperationLog(params: {
  action: string;
  target_type: string;
  target_name?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();
  const operatorName = profile?.display_name || profile?.email?.split('@')[0] || '未知';
  const context = await getMyTenantContext();
  await supabase.from('operation_logs').insert({
    ...(context.tenant_id ? { tenant_id: context.tenant_id } : {}),
    operator_id: user.id,
    operator_name: operatorName,
    action: params.action,
    target_type: params.target_type,
    target_name: params.target_name ?? null,
    detail: params.detail ?? null,
  });
}

export async function getOperationLogs(options?: {
  limit?: number;
  startDate?: string;
  endDate?: string;
}): Promise<OperationLog[]> {
  let query = supabase
    .from('operation_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 100);
  if (options?.startDate) query = query.gte('created_at', options.startDate);
  if (options?.endDate) query = query.lte('created_at', options.endDate);
  const { data } = await query;
  return Array.isArray(data) ? data : [];
}

// ===== 申购单撤回 =====
export async function withdrawOrder(orderId: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;
  await supabase
    .from('purchase_orders')
    .update({ status: 'withdrawn', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('submitter_id', user.id)
    .eq('status', 'pending');
  await addOperationLog({
    action: '提交人撤回申购单',
    target_type: 'purchase',
    target_name: orderId,
    detail: { order_id: orderId },
  });
}

// ===== 申购单修改（提交人在 pending 状态修改食材数量）=====
export async function updatePendingOrderItems(
  orderId: string,
  items: Array<{ id: string; quantity: number }>
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;
  for (const item of items) {
    await supabase
      .from('order_items')
      .update({ quantity: item.quantity })
      .eq('id', item.id)
      .eq('order_id', orderId);
  }
  // 更新申购单 updated_at
  await supabase
    .from('purchase_orders')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('submitter_id', user.id)
    .eq('status', 'pending');
  await addOperationLog({
    action: '提交人修改申购单',
    target_type: 'purchase',
    target_name: orderId,
    detail: { order_id: orderId, items },
  });
}

// ===== 查询某申购单的操作历史日志 =====
export async function getOrderOperationLogs(orderId: string): Promise<OperationLog[]> {
  const { data } = await supabase
    .from('operation_logs')
    .select('*')
    .eq('target_type', 'purchase')
    .eq('target_name', orderId)
    .order('created_at', { ascending: true });
  return Array.isArray(data) ? data : [];
}
