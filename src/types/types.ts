// 用户角色
export type UserRole = string;

// 菜品分类（dish_categories 表）
export interface DishCategory {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

// 申购单状态
export type OrderStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'withdrawn';

// 食材分类（动态，从数据库读取）
export type IngredientCategory = string;

// 静态默认值（首次加载前备用）
export const DEFAULT_INGREDIENT_CATEGORIES: IngredientCategory[] = ['蔬菜', '禽肉', '河鲜', '冻品', '干货调料', '酒水饮料', '其它'];
// 向后兼容别名
export const INGREDIENT_CATEGORIES: IngredientCategory[] = DEFAULT_INGREDIENT_CATEGORIES;

// 分类颜色配置
export const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  '蔬菜':     { bg: '#ecfdf5', text: '#065f46', dot: '#2E9D6A' },
  '禽肉':     { bg: '#fff7ed', text: '#9a3412', dot: '#FF8C00' },
  '河鲜':     { bg: '#eff6ff', text: '#1e40af', dot: '#4A90D9' },
  '冻品':     { bg: '#f0f9ff', text: '#0369a1', dot: '#00BCD4' },
  '干货调料': { bg: '#fefce8', text: '#713f12', dot: '#8B6914' },
  '酒水饮料': { bg: '#f5f3ff', text: '#4c1d95', dot: '#9C27B0' },
  '其它':     { bg: '#f3f4f6', text: '#374151', dot: '#757575' },
};

// 食材分类记录
export interface IngredientCategoryRecord {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

// 食材子分类记录
export interface IngredientSubcategoryRecord {
  id: string;
  category_id: string;
  name: string;
  created_at: string;
}

// 供应商记录
export interface IngredientSupplierRecord {
  id: string;
  name: string;
  contact: string | null;
  created_at: string;
}

// 用户档案
export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  role: UserRole;
  position: string | null;
  account_id: string | null;
  tenant_id?: string | null;
  store_id?: string | null;
  department_id?: string | null;
  created_at: string;
}

// 岗位记录
export interface PositionRecord {
  id: string;
  tenant_id?: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  permissions: string[]; // 该岗位拥有的权限列表（直接关联，不经过角色）
}

// 食材
export interface Ingredient {
  id: string;
  tenant_id?: string | null;
  store_id?: string | null;
  name: string;
  category: IngredientCategory;
  subcategory_id: string | null;
  subcategory?: string | null;
  unit: string;
  supplier: string;
  price: number | null;
  description: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
}

// 申购单
export interface PurchaseOrder {
  id: string;
  tenant_id?: string | null;
  store_id?: string | null;
  submitter_id: string;
  status: OrderStatus;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // 关联数据
  submitter?: Pick<Profile, 'id' | 'display_name' | 'email'>;
  reviewer?: Pick<Profile, 'id' | 'display_name' | 'email'>;
  items?: OrderItemWithIngredient[];
}

// 申购单明细
export interface OrderItem {
  id: string;
  order_id: string;
  ingredient_id: string;
  quantity: number;
  original_quantity: number | null;
  unit: string;
  excluded_from_summary: boolean;
  created_at: string;
}

// 带食材信息的申购单明细
export interface OrderItemWithIngredient extends OrderItem {
  ingredient?: Pick<Ingredient, 'id' | 'name' | 'category' | 'unit' | 'supplier' | 'subcategory_id'>;
}

// 状态标签配置
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  modified: '已修改',
  withdrawn: '已撤回',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  approved: { bg: 'bg-green-50', text: 'text-green-700' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700' },
  modified: { bg: 'bg-teal-50', text: 'text-teal-700' },
  withdrawn: { bg: 'bg-gray-50', text: 'text-gray-500' },
};

// 角色标签配置（内置角色固定标签，自定义角色直接显示角色名）
export const ROLE_LABELS: Record<string, string> = {
  user: '普通员工',
  admin: '管理员',
  super_admin: '超级管理员',
  chef: '厨师长',
  guest: '访客',
};

// 角色权限说明
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  user: ['提交申购单', '查看申购历史'],
  admin: ['提交申购单', '查看申购历史', '审核申购单', '查看采购汇总', '管理食材库'],
  super_admin: ['提交申购单', '查看申购历史', '审核申购单', '查看采购汇总', '管理食材库', '账号管理', '系统配置'],
  guest: ['仅浏览主页、申购/审核/汇总页面（只读）'],
};

// 通知类型
// 申购单通知: approved/rejected/modified/submitted
// 绩效通知: perf_submitted(新申请→审核人) / perf_approved(通过→申请人) / perf_rejected(驳回→申请人)
export type NotificationType =
  | 'approved' | 'rejected' | 'modified' | 'submitted' | 'system'
  | 'perf_submitted' | 'perf_approved' | 'perf_rejected';

// 通知记录
export interface Notification {
  id: string;
  tenant_id?: string | null;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  order_id: string | null;
  perf_id: string | null;
  is_read: boolean;
  created_at: string;
}

// 操作日志记录
export interface OperationLog {
  id: string;
  tenant_id?: string | null;
  operator_id: string | null;
  operator_name: string | null;
  action: string;
  target_type: string;
  target_name: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// ===== 菜品 & SOP =====
export interface Dish {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  status: 'active' | 'inactive';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DishSop {
  id: string;
  dish_id: string;
  ingredients: string | null;
  steps: string | null;
  plating: string | null;
  notes: string | null;
  version: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DishWithSop extends Dish {
  sop: DishSop | null;
}

export interface DishSopHistory {
  id: string;
  dish_id: string;
  version: string;
  ingredients: string | null;
  steps: string | null;
  plating: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_by_name?: string | null;
  created_at: string;
}
