/**
 * 模块级共享存储，用于跨路由传递采购汇总数据
 * 无法通过 URL 参数传递大对象，使用此模块做跨页通信
 *
 * 采用「写入 + 页面消费标记」模式：
 * - set 时写入数据并清除消费标记
 * - get 时先返回数据，页面确认加载成功后再调用 clear
 * 避免 Web 端路由预加载导致数据被提前一次性消费。
 */
export interface SummaryGroup {
  supplier: string;
  items: { ingredient_name: string; total_quantity: number | string; unit: string; category?: string | null }[];
}

interface ShareSummaryPayload {
  groupedList: SummaryGroup[];
  presetLabel: string;
  totalItems: number;
  totalSuppliers: number;
}

let _payload: ShareSummaryPayload | null = null;
let _consumed = false;

export function setShareSummaryPayload(payload: ShareSummaryPayload) {
  _payload = payload;
  _consumed = false;
}

/** 读取数据，但不立即清除，供页面加载成功后自行调用 clear */
export function getShareSummaryPayload(): ShareSummaryPayload | null {
  if (_consumed) return null;
  return _payload;
}

/** 页面确认数据已使用，可清除 */
export function clearShareSummaryPayload() {
  _payload = null;
  _consumed = true;
}

/** 一次性读取（兼容旧逻辑，但优先使用 get + clear） */
export function consumeShareSummaryPayload(): ShareSummaryPayload | null {
  const p = _payload;
  _payload = null;
  _consumed = true;
  return p;
}
