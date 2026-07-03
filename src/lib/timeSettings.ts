import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'time_period_settings';

export interface TimePeriodSettings {
  lunchStart: string; // 'HH:MM'
  lunchEnd: string;
  dinnerStart: string;
  dinnerEnd: string;
}

export const DEFAULT_TIME_SETTINGS: TimePeriodSettings = {
  lunchStart: '07:00',
  lunchEnd: '17:00',
  dinnerStart: '17:00',
  dinnerEnd: '24:00',
};

export async function getTimeSettings(): Promise<TimePeriodSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_TIME_SETTINGS;
    return { ...DEFAULT_TIME_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TIME_SETTINGS;
  }
}

export async function saveTimeSettings(settings: TimePeriodSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

// 解析 'HH:MM' 为 [hours, minutes]
function parseTime(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

/**
 * 根据设置计算某天的午市/晚市时间区间，
 * baseDate 默认为今天，yesterday=true 则为昨天
 */
export function buildDateRange(
  preset: '午市' | '晚市' | '昨天午市' | '昨天晚市',
  settings: TimePeriodSettings,
  referenceDate?: Date
): { start: string; end: string } {
  const base = referenceDate ?? new Date();
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const [lsH, lsM] = parseTime(settings.lunchStart);
  const [leH, leM] = parseTime(settings.lunchEnd);
  const [dsH, dsM] = parseTime(settings.dinnerStart);
  const [deH, deM] = parseTime(settings.dinnerEnd === '24:00' ? '23:59' : settings.dinnerEnd);

  const makeTs = (day: Date, h: number, m: number) => {
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d;
  };

  if (preset === '午市') {
    return {
      start: makeTs(today, lsH, lsM).toISOString(),
      end: makeTs(today, leH, leM).toISOString(),
    };
  }
  if (preset === '晚市') {
    const endTime = settings.dinnerEnd === '24:00'
      ? new Date(today.getTime() + 86400000)
      : makeTs(today, deH, deM);
    return {
      start: makeTs(today, dsH, dsM).toISOString(),
      end: endTime.toISOString(),
    };
  }
  if (preset === '昨天午市') {
    return {
      start: makeTs(yesterday, lsH, lsM).toISOString(),
      end: makeTs(yesterday, leH, leM).toISOString(),
    };
  }
  // 昨天晚市
  const endTime = settings.dinnerEnd === '24:00'
    ? new Date(today)
    : makeTs(yesterday, deH, deM);
  return {
    start: makeTs(yesterday, dsH, dsM).toISOString(),
    end: endTime.toISOString(),
  };
}

/** 从自定义日期构建单日区间 */
export function buildDayRange(date: Date): { start: string; end: string } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    start: d.toISOString(),
    end: new Date(d.getTime() + 86400000).toISOString(),
  };
}

/** 从自定义日期构建周区间（周一~周日）*/
export function buildWeekRange(date: Date): { start: string; end: string } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d.getTime() - ((day === 0 ? 6 : day - 1) * 86400000));
  const sunday = new Date(monday.getTime() + 7 * 86400000);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}
