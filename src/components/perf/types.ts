// 绩效看板共享类型定义

export interface PerfRecord {
  id: string;
  user_id: string;
  date: string;
  description: string;
  item_name?: string;
  note?: string | null;
  score: number;
  status: 'pending' | 'approved' | 'rejected';
  image_url?: string | null;
  remark?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  user?: { display_name?: string; email?: string; position?: string } | null;
  operator?: { display_name?: string } | null;
}

export interface PerfTemplate {
  id: string;
  type: 'add_item' | 'deduct_item' | 'remark';
  content: string;
  description?: string | null;
  sort_order: number;
  linked_tag?: string | null;
  tag_threshold?: number | null;
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  position: string;
  total: number;
  add_count: number;
  deduct_count: number;
  earned_tags: { name: string; earned_at: string }[];
}

export interface OpLog {
  id: string;
  operator_id?: string | null;
  operator_name?: string | null;
  action: string;
  target_type: string;
  target_name?: string | null;
  detail?: Record<string, unknown> | null;
  created_at: string;
}

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: '待审核', color: '#d97706', bg: '#fffbeb' },
  approved: { label: '已通过', color: '#008060', bg: '#ecfdf5' },
  rejected: { label: '已驳回', color: '#D9381E', bg: '#fef2f2' },
};

export function formatDate(s: string) {
  if (!s) return '';
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── 时间维度筛选 ────────────────────────────────────────────
export type PeriodType = 'month' | 'quarter' | 'year';

export interface TimePeriod {
  type: PeriodType;
  /** month: 'YYYY-MM' | quarter: 'YYYY-Q1..Q4' | year: 'YYYY' */
  value: string;
  dateFrom: string;
  dateTo: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

export function buildPeriod(type: PeriodType, value: string): TimePeriod {
  if (type === 'month') {
    const [y, m] = value.split('-').map(Number);
    return {
      type, value,
      dateFrom: `${y}-${pad(m)}-01`,
      dateTo: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
      label: `${y}年${m}月`,
    };
  }
  if (type === 'quarter') {
    const [y, q] = [Number(value.split('-')[0]), Number(value.split('-Q')[1])];
    const startM = (q - 1) * 3 + 1;
    const endM = q * 3;
    return {
      type, value,
      dateFrom: `${y}-${pad(startM)}-01`,
      dateTo: `${y}-${pad(endM)}-${pad(lastDay(y, endM))}`,
      label: `${y}年 Q${q}`,
    };
  }
  // year
  const y = Number(value);
  return {
    type, value,
    dateFrom: `${y}-01-01`,
    dateTo: `${y}-12-31`,
    label: `${y}年`,
  };
}

export function getCurrentPeriod(type: PeriodType): TimePeriod {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (type === 'month') return buildPeriod('month', `${y}-${pad(m)}`);
  if (type === 'quarter') return buildPeriod('quarter', `${y}-Q${Math.ceil(m / 3)}`);
  return buildPeriod('year', String(y));
}

export function stepPeriod(period: TimePeriod, delta: number): TimePeriod {
  if (period.type === 'month') {
    const [y, m] = period.value.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return buildPeriod('month', `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  if (period.type === 'quarter') {
    const [y, q] = [Number(period.value.split('-')[0]), Number(period.value.split('-Q')[1])];
    let nq = q + delta, ny = y;
    while (nq > 4) { nq -= 4; ny++; }
    while (nq < 1) { nq += 4; ny--; }
    return buildPeriod('quarter', `${ny}-Q${nq}`);
  }
  return buildPeriod('year', String(Number(period.value) + delta));
}

export function getDisplayName(record: PerfRecord) {
  return record.user?.display_name || record.user?.email?.split('@')[0] || record.user_id.slice(0, 8);
}

// 权限常量（对应 positions.permissions 中存储的字符串）
// ⚠️ 注意：APPLY（提交申请）与 REVIEW_TAB（待审核Tab）是两个独立权限，不可混用
export const PERM = {
  VIEW:        '绩效查看全部',   // 全员记录Tab + 积分排行榜
  APPLY:       '绩效提交申请',   // 「申请加分/扣分」按钮入口（普通员工权限）
  REVIEW:      '绩效管理',       // 可审批他人（含在管理权限内）
  MANAGE:      '绩效管理',       // 绩效管理Tab：预设管理+记录调整+加分扣分
  REVIEW_TAB:  '绩效审核申请',   // 「待审核」Tab 可见性（审核权限，管理员/超管）
  ALL_RECORDS: '绩效查看全部',   // 全员记录Tab
  EXPORT:      '绩效导出汇总',   // 导出汇总
  SUBMIT:      '绩效提交申请',   // 提交申请（与 APPLY 一致，便于语义化引用）
} as const;
