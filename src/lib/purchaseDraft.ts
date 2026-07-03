/**
 * 申购提交页草稿持久化（基于 AsyncStorage）
 * 每次购物车变化时自动保存；进入页面时检查草稿并提示恢复
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ingredient } from '@/types/types';

const DRAFT_KEY = 'purchase_draft_v1';

export interface DraftCartItem {
  ingredient: Ingredient;
  quantity: number;
}

export interface PurchaseDraft {
  savedAt: number;       // timestamp ms
  cart: DraftCartItem[];
}

/** 保存草稿（购物车有内容时保存，空时清除） */
export async function saveDraft(cart: DraftCartItem[]): Promise<void> {
  try {
    if (cart.length === 0) {
      await AsyncStorage.removeItem(DRAFT_KEY);
      return;
    }
    const draft: PurchaseDraft = { savedAt: Date.now(), cart };
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 静默失败，不影响主流程
  }
}

/** 读取草稿（不存在或过期 >24h 则返回 null） */
export async function loadDraft(): Promise<PurchaseDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as PurchaseDraft;
    // 超过 24 小时自动丢弃
    if (Date.now() - draft.savedAt > 86400000) {
      await AsyncStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** 检查是否存在有效草稿（用于红点显示，不加载内容） */
export async function hasDraft(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw) as PurchaseDraft;
    if (Date.now() - draft.savedAt > 86400000) {
      await AsyncStorage.removeItem(DRAFT_KEY);
      return false;
    }
    return draft.cart.length > 0;
  } catch {
    return false;
  }
}

/** 提交成功后清除草稿 */
export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    // 静默失败
  }
}

/** 格式化草稿保存时间（用于提示文案） */
export function formatDraftTime(savedAt: number): string {
  const d = new Date(savedAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  return `${Math.floor(diffH / 24)} 天前`;
}
