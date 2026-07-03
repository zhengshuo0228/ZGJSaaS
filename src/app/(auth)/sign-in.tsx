import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Square, CheckSquare } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import LogoImage from '../../../assets/icon.png';

const REMEMBER_ME_KEY = 'remember_me_credentials';

export default function SignIn() {
  const router = useRouter();
  const { enterGuestMode } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // 启动时恢复已记住的账号密码
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_ME_KEY).then((val) => {
      if (val) {
        try {
          const saved = JSON.parse(val) as { username: string; password: string };
          setUsername(saved.username);
          setPassword(saved.password);
          setRememberMe(true);
        } catch {
          // 数据异常，清除
          AsyncStorage.removeItem(REMEMBER_ME_KEY);
        }
      }
    });
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: `${username.trim()}@miaoda.app`,
      password,
    });
    if (authError) {
      setError('登录失败，请检查账号密码，或联系管理员申请账号。');
    } else {
      // 记住我：登录成功后持久化账号密码
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ username: username.trim(), password }));
      } else {
        await AsyncStorage.removeItem(REMEMBER_ME_KEY);
      }
      router.replace('/');
    }
    setLoading(false);
  };

  const handleGuestEntry = () => {
    enterGuestMode();
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo + 标题 */}
        <View className="items-center mb-10">
          <View
            style={{
              width: 96, height: 96,
              borderRadius: 24,
              overflow: 'hidden',
              marginBottom: 18,
              backgroundColor: '#fff',
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(229,34,34,0.25)' }],
            } as object}
          >
            <Image
              source={LogoImage}
              style={{ width: 96, height: 96 }}
              contentFit="contain"
            />
          </View>
          <Text className="text-3xl font-bold text-foreground tracking-tight">開小灶PMS</Text>
          <Text className="text-sm text-muted-foreground mt-1.5 text-center">内部申购、采购、管理平台</Text>
        </View>

        {/* 表单卡片 */}
        <View
          className="bg-card rounded-3xl p-6 gap-5"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 20, color: 'rgba(0,0,0,0.08)' }], borderCurve: 'continuous' } as object}
        >
          {/* 账号输入 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">账号</Text>
            <TextInput
              className="border border-border rounded-2xl px-4 py-3.5 text-base text-foreground bg-muted/40"
              placeholder="请输入账号"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={(v) => { setUsername(v); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* 密码输入 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">密码</Text>
            <View className="flex-row items-center border border-border rounded-2xl px-4 bg-muted/40">
              <TextInput
                className="flex-1 py-3.5 text-base text-foreground"
                placeholder="请输入密码"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPassword((p) => !p)} className="pl-3 py-1">
                {showPassword
                  ? <EyeOff size={20} color="#9ca3af" />
                  : <Eye size={20} color="#9ca3af" />
                }
              </Pressable>
            </View>
          </View>

          {/* 错误提示 */}
          {error ? (
            <View className="bg-destructive/10 rounded-xl px-4 py-2.5">
              <Text className="text-destructive text-sm text-center">{error}</Text>
            </View>
          ) : null}

          {/* 记住我 */}
          <Pressable
            onPress={() => setRememberMe((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}
          >
            {rememberMe
              ? <CheckSquare size={18} color="#059669" />
              : <Square size={18} color="#9ca3af" />
            }
            <Text style={{ fontSize: 13, color: '#9ca3af' }}>记住我</Text>
          </Pressable>

          {/* 登录按钮：height:52、#E64340、无字间距居中 */}
          <Pressable
            className="rounded-2xl mt-1 active:opacity-80"
            style={{
              backgroundColor: '#E64340',
              boxShadow: '0 4px 14px rgba(230,67,64,0.35)',
              borderCurve: 'continuous',
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
            } as object}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, textAlign: 'center' }}>登录</Text>
            }
          </Pressable>

          {/* 访客浏览入口 */}
          <Pressable
            onPress={handleGuestEntry}
            className="items-center py-2"
          >
            <Text className="text-sm text-muted-foreground">访客浏览 →</Text>
          </Pressable>
        </View>

        <Text className="text-center text-xs text-muted-foreground mt-6 leading-5">
          企业内部软件，联系管理员开通账号
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
