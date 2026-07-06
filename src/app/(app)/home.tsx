import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LogoImage from '../../../assets/icon.png';

import {
  ShoppingCart,
  CheckCircle,
  BarChart2,
  Package,
  History,
  Users,
  User,
  Bell,
  Award,
  CalendarDays,
  BookOpen,
  Camera,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/context/ProfileContext';
import { useSession } from '@/ctx';
import { supabase } from '@/client/supabase';
import { getStores, getUnreadNotificationCount, getUserPermsByPosition } from '@/db/api';
import { hasDraft } from '@/lib/purchaseDraft';

const REMEMBER_ME_KEY = 'remember_me_credentials';
const HOME_CARD_ORDER_KEY = 'home_card_order_v1';
const BG_COLOR = '#F4FBFB';
// MD3 色板：冷色系
const C_TEAL_DEEP  = '#05A882'; // 深青绿 — 主操作
const C_TEAL_MID   = '#22D9AE'; // 翠青
const C_TEAL_LIGHT = '#67D6CA'; // 浅青
const C_PURPLE     = '#AC88FF'; // 薰衣草紫
const C_PURPLE_L   = '#E6A1FF'; // 浅紫
const C_PINK       = '#DDADD1'; // 粉紫
const C_SURF_TEAL   = '#EBF9F7'; // 浅青白底（食材库等低调入口）
const C_SURF_PURPLE = '#F2EDF9'; // 浅紫白底
const C_ORANGE      = '#FFB88C'; // 温暖橙（菜品SOP）
const C_CORAL       = '#FFA07A'; // 珊瑚橙（水印相机）

// 菜单项与权限标签的对应映射
const MENU_PERM_MAP: Record<string, string> = {
  '/(app)/purchase-submit':    '提交申购单',
  '/(app)/review':             '审核申购单',
  '/(app)/purchase-summary':   '查看采购汇总',
  '/(app)/ingredients':        '管理食材库',
  '/(app)/history':            '查看申购历史',
  '/(app)/account-management': '账号管理',
  '/(app)/statistics':         '数据统计',
  '/(app)/performance':        '绩效看板',
  '/(app)/attendance':         '排休申请', // 排休申请或排休管理任一权限即可显示入口
  // 菜品标准SOP — 无需特殊权限（全员可见），不放入 MENU_PERM_MAP
};

interface CardEntry {
  label: string;
  href: string;
  iconName: string;
  bgColor: string;
  textColor: string;
  iconColor: string;
  roles: string[];
  fullWidth?: boolean;
}

const CARD_ENTRIES: CardEntry[] = [
  {
    label: '申购提交',
    href: '/(app)/purchase-submit',
    iconName: 'shopping-cart',
    bgColor: C_TEAL_DEEP,
    textColor: '#FFFFFF',
    iconColor: 'rgba(255,255,255,0.9)',
    roles: ['user', 'admin', 'super_admin', 'guest'],
    fullWidth: true,
  },
  {
    label: '申购历史',
    href: '/(app)/history',
    iconName: 'history',
    bgColor: C_TEAL_LIGHT,
    textColor: '#0D3B34',
    iconColor: '#0D3B34',
    roles: ['user', 'admin', 'super_admin'],
  },
  {
    label: '数据统计',
    href: '/(app)/statistics',
    iconName: 'bar-chart-2',
    bgColor: C_TEAL_MID,
    textColor: '#0D3B34',
    iconColor: '#0D3B34',
    roles: ['admin', 'super_admin'],
  },
  {
    label: '考勤排休',
    href: '/(app)/attendance',
    iconName: 'calendar-days',
    bgColor: C_PURPLE,
    textColor: '#1A1A2E',
    iconColor: '#1A1A2E',
    roles: ['user', 'admin', 'super_admin', 'chef', 'guest'],
  },
  {
    label: '绩效看板',
    href: '/(app)/performance',
    iconName: 'award',
    bgColor: C_PURPLE_L,
    textColor: '#1A1A2E',
    iconColor: '#1A1A2E',
    roles: ['user', 'admin', 'super_admin', 'chef'],
  },
  {
    label: '审核申购',
    href: '/(app)/review',
    iconName: 'check-circle',
    bgColor: C_PINK,
    textColor: '#2A1A28',
    iconColor: '#2A1A28',
    roles: ['admin', 'super_admin', 'guest'],
  },
  {
    label: '采购汇总',
    href: '/(app)/purchase-summary',
    iconName: 'bar-chart2',
    bgColor: C_TEAL_MID,
    textColor: '#0D3B34',
    iconColor: '#0D3B34',
    roles: ['admin', 'super_admin', 'guest'],
  },
  {
    label: '食材库',
    href: '/(app)/ingredients',
    iconName: 'package',
    bgColor: C_SURF_TEAL,
    textColor: '#0D3B34',
    iconColor: '#05A882',
    roles: ['admin', 'super_admin'],
  },
  {
    label: '账号管理',
    href: '/(app)/account-management',
    iconName: 'users',
    bgColor: C_SURF_PURPLE,
    textColor: '#1A1A2E',
    iconColor: '#7C5CBF',
    roles: ['admin', 'super_admin'],
  },
  {
    label: '菜品标准SOP',
    href: '/(app)/sop',
    iconName: 'book-open',
    bgColor: C_ORANGE,
    textColor: '#1A1A2E',
    iconColor: '#1A1A2E',
    roles: ['user', 'admin', 'super_admin', 'chef', 'guest'],
  },
  {
    label: '我的团队',
    href: '/(app)/watermark-camera',
    iconName: 'camera',
    bgColor: C_CORAL,
    textColor: '#1A1A2E',
    iconColor: '#1A1A2E',
    roles: ['user', 'admin', 'super_admin', 'chef', 'guest'],
  },
];

function renderIcon(name: string, size: number, color: string) {
  const props = { size, color, strokeWidth: 1.8 };
  switch (name) {
    case 'shopping-cart':  return <ShoppingCart  {...props} />;
    case 'history':        return <History        {...props} />;
    case 'bar-chart-2':    return <BarChart2       {...props} />;
    case 'calendar-days':  return <CalendarDays   {...props} />;
    case 'award':          return <Award          {...props} />;
    case 'check-circle':   return <CheckCircle    {...props} />;
    case 'bar-chart2':     return <BarChart2       {...props} />;
    case 'package':        return <Package        {...props} />;
    case 'users':          return <Users          {...props} />;
    case 'book-open':      return <BookOpen       {...props} />;
    case 'camera':         return <Camera         {...props} />;
    default:               return <ShoppingCart  {...props} />;
  }
}

// 单个卡片（带 MD3 Animated 缩放反馈）
function AnimatedCard({
  entry,
  isFull,
  badgeCount,
  showDraftDot,
  isEditing,
  isSelected,
  onPress,
  onLongPress,
}: {
  entry: CardEntry;
  isFull: boolean;
  badgeCount: number;
  showDraftDot: boolean;
  isEditing: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isEditing) {
      wiggle.stopAnimation();
      wiggle.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: -1, duration: 120, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: 0, duration: 90, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isEditing, wiggle]);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: isEditing ? 1.04 : 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();

  const isLight = [C_SURF_TEAL, C_SURF_PURPLE].includes(entry.bgColor);
  const rotate = wiggle.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-1.2deg', '1.2deg'],
  });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={{
          transform: [{ scale }, { rotate }],
          backgroundColor: entry.bgColor,
          borderRadius: 24,
          height: isFull ? 108 : 116,
          padding: isFull ? 22 : 18,
          justifyContent: 'space-between',
          overflow: 'hidden',
          borderWidth: isSelected ? 2 : 0,
          borderColor: isSelected ? '#FFFFFF' : 'transparent',
          // MD3 elevation 2
          boxShadow: isLight
            ? [{ offsetX: 0, offsetY: 1, blurRadius: 6, color: 'rgba(0,0,0,0.07)' }]
            : [
                { offsetX: 0, offsetY: 2, blurRadius: 6,  color: 'rgba(0,0,0,0.10)' },
                { offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(0,0,0,0.06)' },
              ],
        } as object}
      >
        {isEditing && (
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Text style={{ color: isSelected ? C_TEAL_DEEP : '#fff', fontSize: 12, fontWeight: '900' }}>?</Text>
          </View>
        )}
        {/* 装饰圆 — MD3 surface tonal overlay */}
        <View
          style={{
            position: 'absolute',
            width: isFull ? 120 : 90,
            height: isFull ? 120 : 90,
            borderRadius: isFull ? 60 : 45,
            backgroundColor: 'rgba(255,255,255,0.12)',
            top: -28,
            right: -24,
          }}
        />

        {/* 图标 + 角标 */}
        <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
          {renderIcon(entry.iconName, isFull ? 30 : 26, entry.iconColor)}
          {/* 草稿红点 */}
          {showDraftDot && (
            <View style={{
              position: 'absolute', top: -2, right: -5,
              width: 9, height: 9, borderRadius: 5,
              backgroundColor: '#FF4D4F',
              borderWidth: 1.5, borderColor: entry.bgColor,
            }} />
          )}
          {/* 数字角标 */}
          {badgeCount > 0 && (
            <View style={{
              position: 'absolute', top: -6, right: -12,
              minWidth: 18, height: 18, borderRadius: 9,
              backgroundColor: '#FF4D4F',
              alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: 3,
            }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </Text>
            </View>
          )}
        </View>

        {/* 标签 */}
        <Text style={{
          fontSize: isFull ? 20 : 15,
          fontWeight: '700',
          color: entry.textColor,
          letterSpacing: isFull ? 0.5 : 0,
        }}>
          {entry.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile, isLoading } = useProfile();
  const { isGuestMode, exitGuestMode } = useSession();
  const role = profile?.role ?? 'user';
  const [unreadCount, setUnreadCount] = useState(0);
  const [allowedPerms, setAllowedPerms] = useState<string[] | null>(null);
  const [hasDraftBadge, setHasDraftBadge] = useState(false);
  const [pendingPerfCount, setPendingPerfCount] = useState(0);
  const [currentStoreName, setCurrentStoreName] = useState('灶管家');
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const [isEditingCards, setIsEditingCards] = useState(false);
  const [selectedCardHref, setSelectedCardHref] = useState<string | null>(null);

  // 按岗位权限过滤菜单
  const visibleEntries = CARD_ENTRIES.filter((e) => {
    const perm = MENU_PERM_MAP[e.href];
    if (allowedPerms !== null && allowedPerms.length > 0 && perm) {
      if (e.href === '/(app)/performance') {
        const perfPerms = ['绩效加分扣分','绩效审核申请','绩效查看全部','绩效导出汇总','绩效删除记录','绩效提交申请'];
        return perfPerms.some((p) => allowedPerms.includes(p));
      }
      if (e.href === '/(app)/attendance') {
        return allowedPerms.includes('排休申请') || allowedPerms.includes('排休管理');
      }
      return allowedPerms.includes(perm);
    }
    return e.roles.includes(role);
  });

  const orderedVisibleEntries = useMemo(() => {
    const defaultOrder = CARD_ENTRIES.map((entry) => entry.href);
    const mergedOrder = [...cardOrder, ...defaultOrder.filter((href) => !cardOrder.includes(href))];
    return [...visibleEntries].sort((a, b) => mergedOrder.indexOf(a.href) - mergedOrder.indexOf(b.href));
  }, [cardOrder, visibleEntries]);

  const displayName = profile?.display_name || profile?.email?.split('@')[0] || '用户';


  useEffect(() => {
    AsyncStorage.getItem(HOME_CARD_ORDER_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCardOrder(parsed.filter((item) => typeof item === 'string'));
      } catch {}
    });
  }, []);

  const saveCardOrder = async (nextOrder: string[]) => {
    setCardOrder(nextOrder);
    await AsyncStorage.setItem(HOME_CARD_ORDER_KEY, JSON.stringify(nextOrder));
  };

  const enterCardEditMode = (href: string) => {
    setIsEditingCards(true);
    setSelectedCardHref(href);
  };

  const finishCardEditMode = () => {
    setIsEditingCards(false);
    setSelectedCardHref(null);
  };

  const handleCardPress = (entry: CardEntry) => {
    if (!isEditingCards) {
      router.push(entry.href as Parameters<typeof router.push>[0]);
      return;
    }
    if (!selectedCardHref) {
      setSelectedCardHref(entry.href);
      return;
    }
    if (selectedCardHref === entry.href) {
      setSelectedCardHref(null);
      return;
    }
    const currentOrder = orderedVisibleEntries.map((item) => item.href);
    const fromIndex = currentOrder.indexOf(selectedCardHref);
    const toIndex = currentOrder.indexOf(entry.href);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextVisibleOrder = [...currentOrder];
    [nextVisibleOrder[fromIndex], nextVisibleOrder[toIndex]] = [nextVisibleOrder[toIndex], nextVisibleOrder[fromIndex]];
    const hiddenOrder = CARD_ENTRIES.map((item) => item.href).filter((href) => !nextVisibleOrder.includes(href));
    saveCardOrder([...nextVisibleOrder, ...hiddenOrder]);
    setSelectedCardHref(entry.href);
  };

  const welcomeText = useMemo(() => {
    const hour = new Date().getHours();
    let greeting = '你好';
    if (hour >= 6 && hour < 11) greeting = '早上好';
    else if (hour >= 11 && hour < 14) greeting = '中午好';
    else if (hour >= 14 && hour < 18) greeting = '下午好';
    else if (hour >= 18 && hour < 22) greeting = '晚上好';
    const pool = [
      '今天也请认真做好食材申购工作！',
      '新的一天，采购安排妥当了吗？',
      '厨房备货，从申购开始',
      '优质食材，从这里下单',
      '今日采购任务已就绪，请查收',
      '每天进步一点点，采购更省心',
      '用心选好每一份食材',
      '灶管家，让连锁门店管理更高效',
      '确认今日食材需求了吗？',
      '备料充足，出餐才快',
    ];
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    return `${greeting}，${displayName} ${pool[seed % pool.length]}`;
  }, [displayName]);

  useFocusEffect(
    useCallback(() => {
      getUnreadNotificationCount().then(setUnreadCount);
      hasDraft().then(setHasDraftBadge);
      if (profile?.store_id) {
        getStores(profile.tenant_id).then((stores) => {
          const store = stores.find((item) => item.id === profile.store_id);
          setCurrentStoreName(store?.name || '灶管家');
        });
      } else {
        setCurrentStoreName('灶管家');
      }
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        getUserPermsByPosition(user.id).then((perms) => setAllowedPerms(perms));
      });
      if (['super_admin', 'admin', 'chef'].includes(role)) {
        supabase.functions
          .invoke('performance-api', { body: { action: 'pending' } })
          .then(({ data }) => setPendingPerfCount(data?.count ?? 0));
      }
    }, [role, profile?.store_id, profile?.tenant_id])
  );

    const handleLogout = async () => {
    if (isGuestMode) {
      exitGuestMode();
    } else {
      await AsyncStorage.removeItem(REMEMBER_ME_KEY);
      await supabase.auth.signOut();
    }
    router.replace('/');
  };

  // 声明 handleLogout 引用（保留以防 lint 报未使用）
  void handleLogout;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG_COLOR }}>
        <ActivityIndicator size="large" color={C_TEAL_DEEP} />
      </View>
    );
  }

  // 构建行布局：fullWidth 独占一行，其余双列
  const rows: CardEntry[][] = [];
  let cur: CardEntry[] = [];
  for (const e of orderedVisibleEntries) {
    if (e.fullWidth) {
      if (cur.length > 0) { rows.push(cur); cur = []; }
      rows.push([e]);
    } else {
      cur.push(e);
      if (cur.length === 2) { rows.push(cur); cur = []; }
    }
  }
  if (cur.length > 0) rows.push(cur);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG_COLOR }}>
      <StatusBar style="dark" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header ─── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.08)' }] } as object}>
              <Image source={LogoImage} style={{ width: 44, height: 44 }} contentFit="contain" />
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0D2B27', letterSpacing: 0.2, maxWidth: 150 }} numberOfLines={1}>{currentStoreName}</Text>
              <Text style={{ fontSize: 11, color: '#6B9B94', marginTop: 1 }}>
                {displayName}{profile?.position ? ` · ${profile.position}` : ''}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* 通知铃 */}
            <Pressable
              onPress={() => router.push('/(app)/notifications')}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(5,168,130,0.10)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Bell size={18} color={C_TEAL_DEEP} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: 1, right: 1,
                  width: 14, height: 14, borderRadius: 7,
                  backgroundColor: '#FF4D4F',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>
            {/* 个人中心 */}
            <Pressable
              onPress={() => router.push('/(app)/profile')}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(172,136,255,0.12)', alignItems: 'center', justifyContent: 'center' }}
            >
              <User size={18} color="#7C5CBF" strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>

        {/* ─── 欢迎语 ─── */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <Text style={{ fontSize: 13, color: '#6B9B94', lineHeight: 20 }}>
            {welcomeText}
          </Text>
        </View>

        {/* ─── 卡片网格 ─── */}
        {isEditingCards && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ fontSize: 12, color: '#6B9B94', flex: 1 }}>已进入排序模式：点选两个卡片交换位置</Text>
            <Pressable onPress={finishCardEditMode} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C_TEAL_DEEP }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>完成</Text>
            </Pressable>
          </View>
        )}
        <View style={{ paddingHorizontal: 16, paddingBottom: 36, gap: 12 }}>
          {rows.map((row, rowIdx) => (
            <View key={`row-${rowIdx}`} style={{ flexDirection: 'row', gap: 12 }}>
              {row.map((entry) => (
                <AnimatedCard
                  key={entry.href}
                  entry={entry}
                  isFull={entry.fullWidth ?? false}
                  badgeCount={
                    entry.href === '/(app)/review'       ? unreadCount :
                    entry.href === '/(app)/performance'  ? pendingPerfCount : 0
                  }
                  showDraftDot={entry.href === '/(app)/purchase-submit' && hasDraftBadge}
                  isEditing={isEditingCards}
                  isSelected={selectedCardHref === entry.href}
                  onLongPress={() => enterCardEditMode(entry.href)}
                  onPress={() => handleCardPress(entry)}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
