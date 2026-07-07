import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Shield } from 'lucide-react-native';

import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import { getUserPermsByPosition } from '@/db/api';

type PermissionGuardProps = {
  permissions: string[];
  title: string;
  mode?: 'all' | 'any';
  allowGuestMode?: boolean;
  children: ReactNode;
};

export default function PermissionGuard({
  permissions,
  title,
  mode = 'any',
  allowGuestMode = false,
  children,
}: PermissionGuardProps) {
  const router = useRouter();
  const { isGuestMode } = useSession();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const permissionKey = permissions.join('|');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (alive) {
          setAllowed(allowGuestMode && isGuestMode);
          setLoading(false);
        }
        return;
      }
      const perms = await getUserPermsByPosition(user.id);
      const ok = mode === 'all'
        ? permissions.every((permission) => perms.includes(permission))
        : permissions.some((permission) => perms.includes(permission));
      if (alive) {
        setAllowed(ok);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [allowGuestMode, isGuestMode, mode, permissionKey]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <StatusBar style="dark" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      </SafeAreaView>
    );
  }

  if (!allowed) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <StatusBar style="dark" />
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <Shield size={42} color="#9ca3af" />
          <Text className="text-lg font-bold text-foreground">暂无{title}权限</Text>
          <Text className="text-sm text-muted-foreground text-center">
            请联系品牌管理员，在岗位权限中开通相关功能。
          </Text>
          <Pressable onPress={() => router.replace('/(app)/home')} className="mt-2 bg-primary rounded-xl px-5 py-3">
            <Text className="text-white font-semibold">返回首页</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}
