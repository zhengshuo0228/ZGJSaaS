// build-fix-1

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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, LogOut, Key, Briefcase } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/context/ProfileContext';
import { updateProfileDisplayName, updateMyPassword } from '@/db/api';
import { supabase } from '@/client/supabase';

const REMEMBER_ME_KEY = 'remember_me_credentials';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, refresh } = useProfile();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 修改密码
  const [changingPw, setChangingPw] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const displayName = profile?.display_name || profile?.email?.split('@')[0] || '用户';
  const positionLabel = profile?.position || null;

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const handleEdit = () => {
    setNewName(profile?.display_name || '');
    setEditing(true);
  };

  const handleSave = async () => {
    if (!profile || !newName.trim()) return;
    setSaving(true);
    await updateProfileDisplayName(profile.id, newName.trim());
    await refresh();
    setEditing(false);
    showMsg('昵称已更新');
    setSaving(false);
  };

  const handleSavePw = async () => {
    setPwError('');
    if (!newPw.trim()) { setPwError('新密码不能为空'); return; }
    if (newPw.length < 6) { setPwError('新密码至少 6 位'); return; }
    if (newPw !== confirmPw) { setPwError('两次输入的密码不一致'); return; }
    setPwSaving(true);
    const result = await updateMyPassword(newPw.trim());
    if (!result.success) { setPwError(result.error ?? '修改失败'); setPwSaving(false); return; }
    setChangingPw(false);
    setOldPw(''); setNewPw(''); setConfirmPw('');
    showMsg('密码已修改');
    setPwSaving(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(REMEMBER_ME_KEY);
    await supabase.auth.signOut();
    router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">个人信息</Text>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
          {/* 头像区 */}
          <View className="items-center py-8">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-3">
              <User size={40} color="#059669" />
            </View>
            <Text className="text-xl font-bold text-foreground">{displayName}</Text>

            {/* 岗位铭牌 */}
            {positionLabel ? (
              <View className="mt-2 flex-row items-center gap-1.5 bg-amber-50 border border-amber-200 px-4 py-1.5 rounded-full">
                <Briefcase size={12} color="#92400e" />
                <Text className="text-xs font-semibold text-amber-800">{positionLabel}</Text>
              </View>
            ) : null}
          </View>

          {/* 信息卡片 */}
          <View className="px-4 gap-3 mb-6">
            <View className="bg-card rounded-2xl p-4" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
              <Text className="text-xs text-muted-foreground mb-1">账号</Text>
              <Text className="text-sm font-medium text-foreground">{profile?.email?.replace(/@(zaoguanjia|miaoda)\.app$/, '') || '-'}</Text>
            </View>

            <View className="bg-card rounded-2xl p-4" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs text-muted-foreground">昵称</Text>
                {!editing && (
                  <Pressable onPress={handleEdit}>
                    <Text className="text-xs text-primary">修改</Text>
                  </Pressable>
                )}
              </View>
              {editing ? (
                <View className="flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 border border-primary rounded-lg px-3 py-2 text-sm text-foreground"
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                  <Pressable onPress={handleSave} disabled={saving} className="bg-primary rounded-lg px-4 py-2">
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white text-sm font-medium">保存</Text>}
                  </Pressable>
                  <Pressable onPress={() => setEditing(false)} className="px-2 py-2">
                    <Text className="text-muted-foreground text-sm">取消</Text>
                  </Pressable>
                </View>
              ) : (
                <Text className="text-sm font-medium text-foreground">{displayName}</Text>
              )}
            </View>

            <View className="bg-card rounded-2xl p-4" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
              {/* 岗位卡片 - 始终显示 */}
              <Text className="text-xs text-muted-foreground mb-1">岗位</Text>
              {positionLabel ? (
                <View className="flex-row items-center gap-2">
                  <Briefcase size={14} color="#92400e" />
                  <Text className="text-sm font-medium text-foreground">{positionLabel}</Text>
                </View>
              ) : (
                <Text className="text-sm text-muted-foreground">未设置（可由管理员配置）</Text>
              )}
            </View>

            {/* 修改密码卡片 */}
            {!changingPw ? (
              <Pressable
                onPress={() => { setPwError(''); setChangingPw(true); }}
                className="bg-card rounded-2xl p-4 flex-row items-center gap-3"
                style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}
              >
                <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
                  <Key size={18} color="#059669" />
                </View>
                <Text className="flex-1 text-sm font-medium text-foreground">修改密码</Text>
                <Text className="text-xs text-primary">点击修改</Text>
              </Pressable>
            ) : (
              <View className="bg-card rounded-2xl p-4 gap-3" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
                <View className="flex-row items-center gap-2 mb-1">
                  <Key size={16} color="#059669" />
                  <Text className="text-sm font-semibold text-foreground">修改密码</Text>
                </View>
                <TextInput
                  className="border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                  placeholder="输入新密码（至少 6 位）"
                  value={newPw}
                  onChangeText={setNewPw}
                  secureTextEntry
                />
                <TextInput
                  className="border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                  placeholder="再次输入新密码"
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleSavePw}
                />
                {pwError ? <Text className="text-destructive text-sm">{pwError}</Text> : null}
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => { setChangingPw(false); setNewPw(''); setConfirmPw(''); setPwError(''); }}
                    className="flex-1 py-3 rounded-xl bg-muted items-center"
                  >
                    <Text className="text-sm font-medium text-foreground">取消</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSavePw}
                    disabled={pwSaving}
                    className="flex-1 py-3 rounded-xl bg-primary items-center"
                  >
                    {pwSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-sm font-semibold text-white">确认修改</Text>}
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {message ? (
            <Text className="text-primary text-sm text-center mb-4">{message}</Text>
          ) : null}

          {/* 感谢语 */}
          <View className="px-4 mb-2 mt-2 items-center">
            <Text className="text-sm text-muted-foreground">感谢您使用灶管家 🎉</Text>
          </View>

          {/* 退出登录 */}
          <View className="px-4 mb-8">
            <Pressable
              onPress={handleLogout}
              className="flex-row items-center justify-center gap-2 border border-destructive/30 rounded-xl py-4 bg-destructive/5"
            >
              <LogOut size={18} color="#ef4444" />
              <Text className="text-destructive font-medium">退出登录</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

