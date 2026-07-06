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
import { CheckSquare, Eye, EyeOff, Square } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import LogoImage from '../../../assets/icon.png';

const REMEMBER_ME_KEY = 'remember_me_credentials';

function getLoginCandidates(account: string) {
  const trimmed = account.trim();
  if (trimmed.includes('@')) return [trimmed];
  return [`${trimmed}@zaoguanjia.app`, `${trimmed}@miaoda.app`];
}

export default function SignIn() {
  const router = useRouter();
  const { enterGuestMode } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_ME_KEY).then((val) => {
      if (!val) return;
      try {
        const saved = JSON.parse(val) as { username: string; password: string };
        setUsername(saved.username);
        setPassword(saved.password);
        setRememberMe(true);
      } catch {
        AsyncStorage.removeItem(REMEMBER_ME_KEY);
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
    let lastError = '';
    for (const email of getLoginCandidates(username)) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (!authError) {
        if (rememberMe) {
          await AsyncStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ username: username.trim(), password }));
        } else {
          await AsyncStorage.removeItem(REMEMBER_ME_KEY);
        }
        setLoading(false);
        router.replace('/');
        return;
      }
      lastError = authError.message;
    }

    setError(lastError || '登录失败，请检查账号密码，或联系管理员开通账号。');
    setLoading(false);
  };

  const handleGuestEntry = () => {
    enterGuestMode();
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-[#F8FBF8]">
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center mb-9">
          <View
            style={{
              width: 104,
              height: 104,
              borderRadius: 30,
              overflow: 'hidden',
              marginBottom: 18,
              backgroundColor: '#fff',
              boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(249,115,22,0.20)' }],
            } as object}
          >
            <Image source={LogoImage} style={{ width: 104, height: 104 }} contentFit="contain" />
          </View>
          <Text className="text-3xl font-bold tracking-tight" style={{ color: '#17211B' }}>
            灶管家
          </Text>
          <Text className="text-sm mt-2 text-center" style={{ color: '#66756D' }}>
            连锁餐饮门店 · 申购绩效排休管理
          </Text>
        </View>

        <View
          className="bg-white rounded-3xl p-6 gap-5"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(15,47,36,0.08)' }], borderCurve: 'continuous' } as object}
        >
          <View>
            <Text className="text-sm font-semibold mb-2" style={{ color: '#17211B' }}>账号</Text>
            <TextInput
              className="rounded-2xl px-4 py-3.5 text-base"
              style={{ color: '#17211B', backgroundColor: '#F3FAF6', borderWidth: 1, borderColor: '#DDEBE4' }}
              placeholder="请输入账号或邮箱"
              placeholderTextColor="#94A39B"
              value={username}
              onChangeText={(v) => { setUsername(v); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View>
            <Text className="text-sm font-semibold mb-2" style={{ color: '#17211B' }}>密码</Text>
            <View
              className="flex-row items-center rounded-2xl px-4"
              style={{ backgroundColor: '#F3FAF6', borderWidth: 1, borderColor: '#DDEBE4' }}
            >
              <TextInput
                className="flex-1 py-3.5 text-base"
                style={{ color: '#17211B' }}
                placeholder="请输入密码"
                placeholderTextColor="#94A39B"
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPassword((p) => !p)} className="pl-3 py-1">
                {showPassword
                  ? <EyeOff size={20} color="#94A39B" />
                  : <Eye size={20} color="#94A39B" />}
              </Pressable>
            </View>
          </View>

          {error ? (
            <View className="rounded-xl px-4 py-2.5" style={{ backgroundColor: '#FEF2F2' }}>
              <Text className="text-sm text-center" style={{ color: '#DC2626' }}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => setRememberMe((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}
          >
            {rememberMe
              ? <CheckSquare size={18} color="#14B8A6" />
              : <Square size={18} color="#94A39B" />}
            <Text style={{ fontSize: 13, color: '#66756D' }}>记住我</Text>
          </Pressable>

          <Pressable
            className="rounded-2xl mt-1 active:opacity-80"
            style={{
              backgroundColor: '#F97316',
              boxShadow: '0 6px 18px rgba(249,115,22,0.28)',
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
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, textAlign: 'center' }}>登录</Text>}
          </Pressable>

          <Pressable
            onPress={() => router.push('/tenant-register')}
            className="items-center py-1"
          >
            <Text className="text-sm font-semibold" style={{ color: '#0F766E' }}>
              创建品牌 / 开通灶管家
            </Text>
          </Pressable>

          <Pressable onPress={handleGuestEntry} className="items-center py-1">
            <Text className="text-sm" style={{ color: '#66756D' }}>访客浏览 →</Text>
          </Pressable>
        </View>

        <Text className="text-center text-xs mt-6 leading-5" style={{ color: '#94A39B' }}>
          多品牌 SaaS 数据隔离 · 平台超管 000 统一管理
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
