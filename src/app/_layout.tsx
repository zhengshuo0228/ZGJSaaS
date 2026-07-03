import * as Sentry from '@sentry/react-native';
import { Stack, useRouter } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { SessionProvider, useSession } from '@/ctx';
import { ProfileProvider } from '@/context/ProfileContext';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { AppUpdateModal } from '@/components/AppUpdateModal';
import { savePushToken } from '@/db/api';
import "../global.css";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

// 前台收到通知时的展示策略：弹出 banner + 声音 + badge
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** 注册推送权限并保存 Expo push token */
async function registerForPushNotifications(): Promise<string | null> {
  // Web 和模拟器不支持真实推送，跳过
  if (process.env.EXPO_OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  // Android 需要创建通知频道
  if (process.env.EXPO_OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '默认通知',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2E9D6A',
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

function RootLayoutNav() {
  const { session, isLoading, isGuestMode } = useSession();
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!session) return;

    // 注册推送权限并保存 token
    registerForPushNotifications().then((token) => {
      if (token) savePushToken(token);
    });

    // 前台收到通知（仅记录，展示由 setNotificationHandler 处理）
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // 通知到达时无需额外处理，弹窗由 handler 负责
    });

    // 用户点击通知 → 跳转对应页面
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data) return;
      const { type, order_id } = data;
      if (type === 'submitted') {
        // 管理员：跳转待审核页
        router.push('/(app)/review');
      } else if (order_id && (type === 'approved' || type === 'rejected' || type === 'modified')) {
        // 申购人：跳转申购历史
        router.push('/(app)/history');
      } else {
        router.push('/(app)/notifications');
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [session]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 公开路由：无需登录即可访问 */}
      <Stack.Protected guard={!session && !isGuestMode}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* 受保护路由 */}
      <Stack.Protected guard={!!session || isGuestMode}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

const RootLayout: React.FC = () => {
  const updateState = useAppUpdate();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <ProfileProvider>
          <RootLayoutNav />
          <PortalHost />
          {/* 版本自动更新弹窗 */}
          <AppUpdateModal updateState={updateState} />
        </ProfileProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
};

export default Sentry.wrap(RootLayout);
