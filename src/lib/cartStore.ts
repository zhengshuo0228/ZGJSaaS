/**
 * 跨页共享购物车 store
 * 食材库批量操作 → 写入；申购提交页 → 读取并合并
 */
import type { Ingredient } from '@/types/types';

interface PendingCartItem {
  ingredient: Ingredient;
  quantity: number;
}

let pendingItems: PendingCartItem[] = [];

/** 食材库批量添加时调用 */
export function addIngredientsToCart(ingredients: Ingredient[]) {
  pendingItems = ingredients.map((ing) => ({ ingredient: ing, quantity: 1 }));
}

/** 申购提交页启动时消费（取出后清空） */
export function consumePendingCart(): PendingCartItem[] {
  const items = [...pendingItems];
  pendingItems = [];
  return items;
}
