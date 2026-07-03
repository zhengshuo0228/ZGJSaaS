import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import {
  ArrowLeft, Users, Shield, UserCheck, Plus, Trash2,
  Edit3, Key, Settings, X, Check, Clock,
  PenLine, FileText, Upload,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
  getAllProfiles, updateProfile, getPositions, createPosition, deletePosition,
  updatePositionPermissions,
  adminCreateUser, adminDeleteUser, adminUpdatePassword,
  addOperationLog, getOperationLogs,
} from '@/db/api';
import type { Profile, UserRole, PositionRecord, OperationLog } from '@/types/types';
import {
  getTimeSettings, saveTimeSettings, DEFAULT_TIME_SETTINGS,
  type TimePeriodSettings,
} from '@/lib/timeSettings';
import { useProfile } from '@/context/ProfileContext';


// 所有可选权限项（分组展示）
const PERM_GROUPS: { label: string; perms: string[] }[] = [
  {
    label: '申购管理',
    perms: ['提交申购单', '查看申购历史', '审核申购单', '查看采购汇总'],
  },
  {
    label: '食材与系统',
    perms: ['管理食材库', '账号管理', '系统配置', '导出报表', '数据统计'],
  },
  {
    label: '绩效面板',
    perms: ['绩效提交申请', '绩效审核申请', '绩效管理', '绩效查看全部', '绩效导出汇总', '绩效删除记录', '绩效加分扣分'],
  },
  {
    label: '考勤排休',
    perms: ['排休申请', '排休管理'],
  },
];

type ActiveTab = 'accounts' | 'positions' | 'time' | 'logs';

// ===== 子组件：时间输入行 =====
function TimeRow({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-border">
      <Text className="text-sm text-foreground">{label}</Text>
      <TextInput
        className="border border-border rounded-lg px-3 py-1.5 text-sm text-foreground text-center"
        style={{ width: 80 }}
        value={value}
        onChangeText={onChange}
        placeholder="HH:MM"
        maxLength={5}
      />
    </View>
  );
}

export default function AccountManagementScreen() {
  const router = useRouter();
  const { profile: myProfile } = useProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('accounts');
  const [message, setMessage] = useState('');
  // 当前用户是否为超管或拥有"账号管理"权限（用于 UI 权限控制）
  const [canManageAccounts, setCanManageAccounts] = useState(false);
  // 是否为 000 超管（唯一可编辑岗位权限的账号）
  const isSuperAdmin000 = myProfile?.account_id === '000';

  // 编辑账号弹窗
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<string>('user');
  const [editPosition, setEditPosition] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // 修改密码弹窗
  const [pwTarget, setPwTarget] = useState<Profile | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  // 新建账号弹窗
  const [createVisible, setCreateVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPwField, setNewPwField] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>('user');
  const [newPos, setNewPos] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 岗位管理
  const [newPosName, setNewPosName] = useState('');
  const [addingPos, setAddingPos] = useState(false);

  // 时间设置
  const [timeSettings, setTimeSettings] = useState<TimePeriodSettings>(DEFAULT_TIME_SETTINGS);
  const [timeSaving, setTimeSaving] = useState(false);

  // 岗位权限编辑（直接在岗位维度管理）
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [posPerms, setPosPerms] = useState<Record<string, string[]>>({}); // posId -> permissions
  const [permSaving, setPermSaving] = useState(false);

  // 操作日志
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // 批量导入
  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  const loadAll = async () => {
    setLoading(true);
    const [profs, pos, ts] = await Promise.all([getAllProfiles(), getPositions(), getTimeSettings()]);
    setProfiles(profs);
    setPositions(pos);
    setTimeSettings(ts);
    // 初始化岗位权限 map（id -> permissions）
    const permsMap: Record<string, string[]> = {};
    for (const p of pos) permsMap[p.id] = Array.isArray(p.permissions) ? p.permissions : [];
    setPosPerms(permsMap);
    // 判断当前用户是否有"账号管理"权限
    const myRole = myProfile?.role ?? '';
    const myPosName = myProfile?.position ?? '';
    if (myRole === 'super_admin' || myRole === 'admin') {
      setCanManageAccounts(true);
    } else {
      const myPosRecord = pos.find((p) => p.name === myPosName);
      const myPerms: string[] = Array.isArray(myPosRecord?.permissions) ? myPosRecord.permissions : [];
      setCanManageAccounts(myPerms.includes('账号管理'));
    }
    setLoading(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const data = await getOperationLogs({ limit: 200 });
    setLogs(data);
    setLogsLoading(false);
  };

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  // ===== 编辑账号 =====
  const openEdit = (p: Profile) => {
    setEditTarget(p);
    setEditName(p.display_name ?? '');
    setEditRole(p.role);
    setEditPosition(p.position ?? '');
  };
  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    await updateProfile(editTarget.id, {
      display_name: editName.trim() || null,
      role: editRole,
      position: editPosition || null,
    } as any);
    await addOperationLog({
      action: '编辑账号资料',
      target_type: '账号',
      target_name: editName.trim() || editTarget.display_name || editTarget.email || '',
      detail: { role: editRole, position: editPosition },
    });
    setEditTarget(null);
    showMsg('账号资料已更新');
    setEditSaving(false);
    loadAll();
  };

  // ===== 修改密码 =====
  const openPw = (p: Profile) => { setPwTarget(p); setNewPw(''); setPwError(''); };
  const handleSavePw = async () => {
    if (!pwTarget || !newPw.trim()) { setPwError('密码不能为空'); return; }
    if (newPw.length < 6) { setPwError('密码至少 6 位'); return; }
    setPwSaving(true);
    const result = await adminUpdatePassword(pwTarget.id, newPw.trim());
    if (!result.success) { setPwError(result.error ?? '修改失败'); setPwSaving(false); return; }
    await addOperationLog({
      action: '修改密码',
      target_type: '账号',
      target_name: pwTarget.display_name || pwTarget.email || '',
    });
    setPwTarget(null);
    showMsg('密码已修改');
    setPwSaving(false);
  };

  // ===== 创建账号 =====
  const handleCreate = async () => {
    const finalPw = newPwField.trim() || '123456';
    if (!newEmail.trim()) { setCreateError('账号不能为空'); return; }
    if (finalPw.length < 6) { setCreateError('密码至少 6 位'); return; }
    setCreating(true);
    setCreateError('');
    const rawInput = newEmail.trim();
    const emailToUse = rawInput.includes('@') ? rawInput : `${rawInput}@miaoda.app`;
    const result = await adminCreateUser({
      email: emailToUse,
      password: finalPw,
      display_name: newName.trim() || undefined,
      role: newRole,
      position: newPos || undefined,
    });
    if (!result.success) { setCreateError(result.error ?? '创建失败'); setCreating(false); return; }
    await addOperationLog({
      action: '创建账号',
      target_type: '账号',
      target_name: newName.trim() || rawInput,
      detail: { username: rawInput, role: newRole },
    });
    setCreateVisible(false);
    setNewEmail(''); setNewPwField(''); setNewName(''); setNewRole('user'); setNewPos('');
    showMsg('账号已创建');
    setCreating(false);
    // 等待 Edge Function 写入完成再刷新列表
    setTimeout(() => loadAll(), 600);
  };

  // ===== 删除账号 =====
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await adminDeleteUser(deleteTarget.id);
    if (!result.success) {
      setDeleteTarget(null);
      setDeleting(false);
      showMsg(`删除失败：${result.error}`);
      return;
    }
    await addOperationLog({
      action: '删除账号',
      target_type: '账号',
      target_name: deleteTarget.display_name || deleteTarget.email || '',
    });
    setDeleteTarget(null);
    setDeleting(false);
    showMsg('账号已删除');
    loadAll();
  };

  // ===== 批量导入账号 =====
  // 格式：每行 账号 姓名 角色(可选，user/admin/super_admin) 密码(可选)，用逗号或Tab分隔
  const handleBatchImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult('');
    const lines = importText.trim().split('\n').filter((l) => l.trim());
    let success = 0;
    const errors: string[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t，]/).map((p) => p.trim());
      const username = parts[0];
      const displayName = parts[1] || '';
      const roleRaw = parts[2] || 'user';
      const pw = parts[3] || '123456';
      if (!username) continue;
      const role: UserRole = (roleRaw || 'user') as UserRole;
      const email = username.includes('@') ? username : `${username}@miaoda.app`;
      const result = await adminCreateUser({ email, password: pw, display_name: displayName || undefined, role });
      if (result.success) {
        success++;
      } else {
        errors.push(`${username}: ${result.error}`);
      }
    }
    await addOperationLog({
      action: '批量导入账号',
      target_type: '账号',
      detail: { total: lines.length, success, failed: errors.length },
    });
    setImportResult(`导入完成：成功 ${success} 个${errors.length > 0 ? `，失败 ${errors.length} 个（${errors.slice(0, 3).join('；')}）` : ''}`);
    setImporting(false);
    if (success > 0) loadAll();
  };

  // ===== 岗位管理 =====
  const handleAddPos = async () => {
    if (!newPosName.trim()) return;
    setAddingPos(true);
    await createPosition(newPosName.trim());
    setNewPosName('');
    setAddingPos(false);
    const pos = await getPositions();
    setPositions(pos);
  };
  const handleDelPos = async (id: string) => {
    await deletePosition(id);
    const pos = await getPositions();
    setPositions(pos);
  };

  // ===== 时间设置保存 =====
  const handleSaveTime = async () => {
    setTimeSaving(true);
    await saveTimeSettings(timeSettings);
    setTimeSaving(false);
    showMsg('时间设置已保存');
  };

  // ===== 岗位权限保存 =====
  const handleSavePositionPerms = async (posId: string, posName: string) => {
    setPermSaving(true);
    const perms = posPerms[posId] ?? [];
    const { error } = await updatePositionPermissions(posId, perms);
    if (error) {
      setPermSaving(false);
      showMsg(`保存失败：${error}`);
      return;
    }
    await addOperationLog({
      action: '修改岗位权限',
      target_type: '岗位权限',
      target_name: posName,
      detail: { permissions: perms },
    });
    setPermSaving(false);
    setEditingPosId(null);
    showMsg(`岗位「${posName}」权限已保存`);
    // 刷新 positions，保持本地状态同步
    const pos = await getPositions();
    setPositions(pos);
    const permsMap: Record<string, string[]> = {};
    for (const p of pos) permsMap[p.id] = Array.isArray(p.permissions) ? p.permissions : [];
    setPosPerms(permsMap);
  };

  const togglePosPerm = (posId: string, perm: string) => {
    setPosPerms((prev) => {
      const cur = prev[posId] ?? [];
      const next = cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm];
      return { ...prev, [posId]: next };
    });
  };

  const RoleIcon = ({ role }: { role: string }) => {
    if (role === 'super_admin') return <Shield size={16} color="#be185d" />;
    if (role === 'admin') return <UserCheck size={16} color="#059669" />;
    if (role === 'user') return <Users size={16} color="#6b7280" />;
    return <Users size={16} color="#0d9488" />;
  };

  // ===== 主视图 =====
  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 顶部栏 */}
      <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">账号管理</Text>
        {activeTab === 'accounts' && (
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => { setImportText(''); setImportResult(''); setImportVisible(true); }}
              className="flex-row items-center gap-1 bg-muted rounded-xl px-3 py-2"
            >
              <Upload size={15} color="#374151" />
              <Text className="text-foreground text-sm font-medium">批量</Text>
            </Pressable>
            <Pressable
              onPress={() => { setCreateError(''); setCreateVisible(true); }}
              className="flex-row items-center gap-1 bg-primary rounded-xl px-3 py-2"
            >
              <Plus size={16} color="#fff" />
              <Text className="text-white text-sm font-semibold">新建</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Tab 切换 — 固定行，不依赖滚动容器，4等分铺满全宽 */}
      <View className="bg-card border-b border-border flex-row">
        {([
          { key: 'accounts', label: '账号列表', icon: <Users size={13} color={activeTab === 'accounts' ? '#059669' : '#9ca3af'} /> },
          { key: 'positions', label: '岗位权限', icon: <Shield size={13} color={activeTab === 'positions' ? '#059669' : '#9ca3af'} /> },
          { key: 'time', label: '时间设置', icon: <Clock size={13} color={activeTab === 'time' ? '#059669' : '#9ca3af'} /> },
          // 操作日志仅超管可见
          ...(myProfile?.role === 'super_admin' ? [
            { key: 'logs' as const, label: '操作日志', icon: <FileText size={13} color={activeTab === 'logs' ? '#059669' : '#9ca3af'} /> },
          ] : []),
        ] as const).map(({ key, label, icon }) => (
          <Pressable
            key={key}
            onPress={() => {
              // 非超管不得访问日志 Tab（双重拦截）
              if (key === 'logs' && myProfile?.role !== 'super_admin') return;
              setActiveTab(key);
              if (key === 'logs') loadLogs();
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 9, paddingBottom: 9, borderBottomWidth: 2, borderBottomColor: activeTab === key ? '#059669' : 'transparent' }}
          >
            {icon}
            <Text style={{ fontSize: 11, fontWeight: '600', color: activeTab === key ? '#059669' : '#9ca3af' }} numberOfLines={1}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* 反馈消息 */}
      {message ? (
        <View className="mx-4 mt-3 bg-primary/10 rounded-xl px-4 py-3">
          <Text className="text-primary font-medium text-sm text-center">{message}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <>
          {/* ===== 账号列表 Tab ===== */}
          {activeTab === 'accounts' && (
            <FlatList
              data={profiles}
              keyExtractor={(item) => item.id}
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 }}
              renderItem={({ item: profile }) => {
                const displayName = profile.display_name || profile.email?.split('@')[0] || '未知用户';
                const isSelf = profile.id === myProfile?.id;
                // 000 账号特殊保护：只有 000 自己能看到编辑/改密码，其他人只能只读
                const isProtected = profile.email === '000@miaoda.app';
                const canEditThis = !isProtected || isSelf;
                return (
                  <View
                    className="bg-card rounded-2xl p-4"
                    style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
                  >
                    {/* 用户信息 */}
                    <View className="flex-row items-center gap-3 mb-3">
                      <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
                        <RoleIcon role={profile.role} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-base font-semibold text-foreground">{displayName}</Text>
                          {profile.position ? (
                            <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                              <Text className="text-xs text-primary font-medium">{profile.position}</Text>
                            </View>
                          ) : null}
                          {isSelf ? (
                            <View className="bg-accent/20 px-2 py-0.5 rounded-full">
                              <Text className="text-xs text-accent-foreground font-medium">我</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-xs text-muted-foreground mt-0.5">
                          {profile.email?.replace(/@miaoda\.app$/, '') ?? profile.email ?? ''}
                        </Text>
                      </View>
                    </View>

                    {/* 操作行 */}
                    <View className="flex-row gap-2 pt-2 border-t border-border">
                      {canEditThis ? (
                        <>
                          <Pressable
                            onPress={() => openEdit(profile)}
                            className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 bg-muted rounded-xl"
                          >
                            <Edit3 size={14} color="#374151" />
                            <Text className="text-xs text-foreground font-medium">编辑资料</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => openPw(profile)}
                            className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 bg-muted rounded-xl"
                          >
                            <Key size={14} color="#374151" />
                            <Text className="text-xs text-foreground font-medium">改密码</Text>
                          </Pressable>
                        </>
                      ) : (
                        <View className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 bg-muted/50 rounded-xl">
                          <Text className="text-xs text-muted-foreground">受保护账号</Text>
                        </View>
                      )}
                      {!isSelf && !isProtected && (
                        <Pressable
                          onPress={() => setDeleteTarget(profile)}
                          className="flex-row items-center justify-center gap-1.5 py-2.5 px-3 bg-destructive/10 rounded-xl"
                        >
                          <Trash2 size={14} color="#ef4444" />
                          <Text className="text-xs text-destructive font-medium">删除</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* ===== 岗位管理 Tab ===== */}
          {activeTab === 'positions' && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {/* 新增岗位 */}
              <View className="bg-card rounded-2xl p-4" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
                <Text className="text-sm font-semibold text-foreground mb-3">添加岗位</Text>
                <View className="flex-row gap-2">
                  <TextInput
                    className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground"
                    placeholder="输入岗位名称"
                    value={newPosName}
                    onChangeText={setNewPosName}
                    returnKeyType="done"
                    onSubmitEditing={handleAddPos}
                  />
                  <Pressable
                    onPress={handleAddPos}
                    disabled={addingPos || !newPosName.trim()}
                    className="bg-primary rounded-xl px-4 items-center justify-center"
                  >
                    {addingPos ? <ActivityIndicator size="small" color="#fff" /> : <Plus size={18} color="#fff" />}
                  </Pressable>
                </View>
              </View>

              <Text className="text-xs text-muted-foreground px-1 -mt-2">
                {isSuperAdmin000
                  ? '💡 岗位直接关联权限，点击「编辑权限」可为每个岗位配置可用功能。账号的权限由其所属岗位决定。'
                  : '💡 岗位直接关联权限，只有 000 超管可编辑。账号的权限由其所属岗位决定。'}
              </Text>

              {/* 岗位列表（含权限管理） */}
              {positions.length === 0 ? (
                <View className="bg-card rounded-2xl p-6 items-center">
                  <Text className="text-muted-foreground text-sm">暂无岗位，请先添加</Text>
                </View>
              ) : (
                positions.map((pos) => {
                  const isEditing = editingPosId === pos.id;
                  const perms: string[] = posPerms[pos.id] ?? [];
                  return (
                    <View
                      key={pos.id}
                      className="bg-card rounded-2xl p-4"
                      style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }], borderCurve: 'continuous' } as object}
                    >
                      {/* 岗位标题行 */}
                      <View className="flex-row items-center gap-3 mb-3">
                        <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                          <Settings size={17} color="#059669" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-base font-bold text-foreground">{pos.name}</Text>
                          <Text className="text-xs text-muted-foreground mt-0.5">{perms.length} 项权限</Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          {isSuperAdmin000 && (
                            <Pressable
                              onPress={() => setEditingPosId(isEditing ? null : pos.id)}
                              className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl"
                              style={{ backgroundColor: isEditing ? '#dcfce7' : 'rgba(0,0,0,0.06)' }}
                            >
                              <PenLine size={13} color={isEditing ? '#059669' : '#6b7280'} />
                              <Text className="text-xs font-medium" style={{ color: isEditing ? '#059669' : '#6b7280' }}>
                                {isEditing ? '收起' : '编辑权限'}
                              </Text>
                            </Pressable>
                          )}
                          <Pressable onPress={() => handleDelPos(pos.id)} className="w-7 h-7 rounded-lg bg-red-50 items-center justify-center">
                            <Trash2 size={14} color="#ef4444" />
                          </Pressable>
                        </View>
                      </View>

                      {/* 权限标签（查看模式） */}
                      {!isEditing && (
                        <View className="flex-row flex-wrap gap-1.5">
                          {perms.length === 0
                            ? <Text className="text-xs text-muted-foreground">暂无权限</Text>
                            : perms.map((perm) => (
                              <View key={perm} className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10">
                                <View className="w-1.5 h-1.5 rounded-full bg-primary" />
                                <Text className="text-xs font-medium text-primary">{perm}</Text>
                              </View>
                            ))
                          }
                        </View>
                      )}

                      {/* 权限编辑模式 */}
                      {isEditing && (
                        <View className="gap-3 mt-1">
                          {PERM_GROUPS.map((group) => (
                            <View key={group.label}>
                              <Text className="text-xs font-semibold text-muted-foreground mb-1.5 tracking-wider">{group.label}</Text>
                              <View className="flex-row flex-wrap gap-2">
                                {group.perms.map((perm) => {
                                  const active = perms.includes(perm);
                                  return (
                                    <Pressable
                                      key={perm}
                                      onPress={() => togglePosPerm(pos.id, perm)}
                                      className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
                                      style={{ backgroundColor: active ? '#dcfce7' : '#fff', borderColor: active ? '#059669' : '#d1d5db' }}
                                    >
                                      {active && <Check size={11} color="#059669" />}
                                      <Text className="text-xs font-medium" style={{ color: active ? '#059669' : '#6b7280' }}>{perm}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ))}
                          <Pressable
                            onPress={() => handleSavePositionPerms(pos.id, pos.name)}
                            disabled={permSaving}
                            className="flex-row items-center justify-center gap-2 py-3.5 rounded-xl"
                            style={{ backgroundColor: '#059669' }}
                          >
                            {permSaving
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <><Check size={15} color="#fff" /><Text className="text-white text-base font-bold">保存权限配置</Text></>
                            }
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* ===== 时间设置 Tab ===== */}
          {activeTab === 'time' && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <View className="bg-card rounded-2xl p-4" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
                <Text className="text-sm font-semibold text-foreground mb-1">午市时间段</Text>
                <Text className="text-xs text-muted-foreground mb-3">格式：HH:MM（如 07:00）</Text>
                <TimeRow
                  label="开始时间"
                  value={timeSettings.lunchStart}
                  onChange={(v) => setTimeSettings((s) => ({ ...s, lunchStart: v }))}
                />
                <TimeRow
                  label="结束时间"
                  value={timeSettings.lunchEnd}
                  onChange={(v) => setTimeSettings((s) => ({ ...s, lunchEnd: v }))}
                />
              </View>

              <View className="bg-card rounded-2xl p-4" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
                <Text className="text-sm font-semibold text-foreground mb-1">晚市时间段</Text>
                <Text className="text-xs text-muted-foreground mb-3">结束可填 24:00 表示当日结束</Text>
                <TimeRow
                  label="开始时间"
                  value={timeSettings.dinnerStart}
                  onChange={(v) => setTimeSettings((s) => ({ ...s, dinnerStart: v }))}
                />
                <TimeRow
                  label="结束时间"
                  value={timeSettings.dinnerEnd}
                  onChange={(v) => setTimeSettings((s) => ({ ...s, dinnerEnd: v }))}
                />
              </View>

              <Pressable
                onPress={handleSaveTime}
                disabled={timeSaving}
                className="bg-primary rounded-xl py-4 items-center"
              >
                {timeSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">保存时间设置</Text>}
              </Pressable>
            </ScrollView>
          )}

          {/* ===== 操作日志 Tab（仅超管可访问）===== */}
          {activeTab === 'logs' && myProfile?.role === 'super_admin' && (
            <View className="flex-1">
              <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
                <Text className="text-sm font-semibold text-foreground">最近操作记录</Text>
                <Pressable onPress={loadLogs} className="px-3 py-1.5 bg-muted rounded-lg">
                  <Text className="text-xs text-muted-foreground">刷新</Text>
                </Pressable>
              </View>
              {logsLoading ? (
                <View className="flex-1 items-center justify-center gap-2">
                  <ActivityIndicator color="#059669" />
                  <Text className="text-xs text-muted-foreground">加载中...</Text>
                </View>
              ) : logs.length === 0 ? (
                <View className="flex-1 items-center justify-center gap-2 p-8">
                  <FileText size={40} color="#d1d5db" />
                  <Text className="text-sm text-muted-foreground text-center">暂无操作记录</Text>
                </View>
              ) : (
                <FlatList
                  data={logs}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ padding: 12, gap: 8 }}
                  renderItem={({ item }) => {
                    const d = new Date(item.created_at);
                    const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                    return (
                      <View className="bg-card rounded-xl px-4 py-3 gap-1" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.05)' }] } as object}>
                        <View className="flex-row items-center justify-between">
                          <View className="flex-row items-center gap-2">
                            <View className="w-2 h-2 rounded-full bg-primary" />
                            <Text className="text-sm font-semibold text-foreground">{item.action}</Text>
                          </View>
                          <Text className="text-xs text-muted-foreground">{timeStr}</Text>
                        </View>
                        <Text className="text-xs text-muted-foreground ml-4">
                          操作人：{item.operator_name ?? '未知'}
                          {item.target_name ? `  ·  对象：${item.target_name}` : ''}
                        </Text>
                      </View>
                    );
                  }}
                />
              )}
            </View>
          )}
        </>
      )}

      {/* ===== 批量导入账号 Modal ===== */}
      <Modal visible={importVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setImportVisible(false)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
            <Text className="flex-1 text-lg font-bold text-foreground">批量导入账号</Text>
            <Pressable onPress={() => { setImportVisible(false); setImportText(''); setImportResult(''); }}>
              <X size={22} color="#374151" />
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View className="bg-muted rounded-xl p-4 gap-1.5">
                <Text className="text-xs font-semibold text-foreground">格式说明</Text>
                <Text className="text-xs text-muted-foreground leading-5">每行一个账号，字段用逗号分隔：</Text>
                <Text className="text-xs text-muted-foreground leading-5 font-mono">账号, 姓名, 角色, 密码</Text>
                <Text className="text-xs text-muted-foreground leading-5">• 角色可选：user / admin / super_admin</Text>
                <Text className="text-xs text-muted-foreground leading-5">• 密码为空时默认 123456</Text>
                <Text className="text-xs text-muted-foreground leading-5 font-mono">示例：zhangsan,张三,user,abc123</Text>
              </View>
              <View>
                <Text className="text-xs font-semibold text-foreground mb-2">粘贴账号数据</Text>
                <TextInput
                  className="border border-border rounded-xl px-4 py-3 text-sm text-foreground bg-background"
                  style={{ minHeight: 160, textAlignVertical: 'top' }}
                  placeholder={"zhangsan,张三,user,123456\nlisi,李四,admin"}
                  placeholderTextColor="#9ca3af"
                  value={importText}
                  onChangeText={setImportText}
                  multiline
                  autoCapitalize="none"
                />
              </View>
              {importResult ? (
                <View className={`rounded-xl px-4 py-3 ${importResult.includes('失败') ? 'bg-destructive/10' : 'bg-green-50'}`}>
                  <Text className={`text-sm ${importResult.includes('失败') ? 'text-destructive' : 'text-green-700'}`}>{importResult}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={handleBatchImport}
                disabled={importing || !importText.trim()}
                style={{
                  height: 48, borderRadius: 8,
                  backgroundColor: importing || !importText.trim() ? '#d1d5db' : '#2E9D6A',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {importing
                  ? <ActivityIndicator color="#fff" />
                  : (
                    <View className="flex-row items-center gap-2">
                      <Upload size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>开始导入</Text>
                    </View>
                  )
                }
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal visible={!!editTarget} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setEditTarget(null)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
            <Text className="flex-1 text-lg font-bold text-foreground">编辑账号资料</Text>
            <Pressable onPress={() => setEditTarget(null)}><X size={22} color="#374151" /></Pressable>
          </View>
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
              <View>
                <Text className="text-xs text-muted-foreground mb-1">昵称</Text>
                <TextInput
                  className="border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="输入显示名称"
                />
              </View>

              <View>
                <Text className="text-xs text-muted-foreground mb-2">岗位</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => setEditPosition('')}
                    className={`px-4 py-2 rounded-full border ${editPosition === '' ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <Text className={`text-xs ${editPosition === '' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>不设置</Text>
                  </Pressable>
                  {positions.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setEditPosition(p.name)}
                      className={`px-4 py-2 rounded-full border ${editPosition === p.name ? 'border-primary bg-primary/5' : 'border-border'}`}
                    >
                      <Text className={`text-xs ${editPosition === p.name ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{p.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable
                onPress={handleSaveEdit}
                disabled={editSaving}
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', marginTop: 8, alignItems: 'center', justifyContent: 'center' }}
              >
                {editSaving ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Check size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>保存修改</Text>
                  </View>
                )}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ===== 修改密码 Modal ===== */}
      <Modal visible={!!pwTarget} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setPwTarget(null)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
            <Text className="flex-1 text-lg font-bold text-foreground">
              修改密码 · {pwTarget?.display_name || pwTarget?.email?.split('@')[0]}
            </Text>
            <Pressable onPress={() => setPwTarget(null)}><X size={22} color="#374151" /></Pressable>
          </View>
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            <View className="p-4 gap-4">
              <TextInput
                className="border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                placeholder="输入新密码（至少 6 位）"
                value={newPw}
                onChangeText={setNewPw}
                secureTextEntry
                autoFocus
              />
              {pwError ? <Text className="text-destructive text-sm">{pwError}</Text> : null}
              <Pressable
                onPress={handleSavePw}
                disabled={pwSaving}
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', alignItems: 'center', justifyContent: 'center' }}
              >
                {pwSaving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>确认修改密码</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ===== 新建账号 Modal ===== */}
      <Modal visible={createVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateVisible(false)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
            <Text className="flex-1 text-lg font-bold text-foreground">新建账号</Text>
            <Pressable onPress={() => setCreateVisible(false)}><X size={22} color="#374151" /></Pressable>
          </View>
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View>
                <Text className="text-xs text-muted-foreground mb-1">账号（登录名）</Text>
                <TextInput
                  className="border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                  placeholder="输入账号（如：zhangsan）"
                  value={newEmail}
                  onChangeText={setNewEmail}
                  autoCapitalize="none"
                />
                <Text className="text-xs text-muted-foreground mt-1">
                  仅填写用户名即可，系统自动生成登录邮箱
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted-foreground mb-1">初始密码 <Text className="text-muted-foreground/60">（留空默认 123456）</Text></Text>
                <TextInput
                  className="border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                  placeholder="留空默认 123456"
                  placeholderTextColor="#9ca3af"
                  value={newPwField}
                  onChangeText={setNewPwField}
                  secureTextEntry
                />
              </View>
              <View>
                <Text className="text-xs text-muted-foreground mb-1">姓名（可选）</Text>
                <TextInput
                  className="border border-border rounded-xl px-4 py-3 text-sm text-foreground"
                  placeholder="输入真实姓名"
                  value={newName}
                  onChangeText={setNewName}
                />
              </View>
              <View>
                <Text className="text-xs text-muted-foreground mb-2">岗位（可选）</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => setNewPos('')}
                    className={`px-4 py-2 rounded-full border ${newPos === '' ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <Text className={`text-xs ${newPos === '' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>不设置</Text>
                  </Pressable>
                  {positions.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setNewPos(p.name)}
                      className={`px-4 py-2 rounded-full border ${newPos === p.name ? 'border-primary bg-primary/5' : 'border-border'}`}
                    >
                      <Text className={`text-xs ${newPos === p.name ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{p.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {createError ? <Text className="text-destructive text-sm">{createError}</Text> : null}

              <Pressable
                onPress={handleCreate}
                disabled={creating}
                style={{ height: 48, borderRadius: 8, backgroundColor: '#2E9D6A', marginTop: 8, alignItems: 'center', justifyContent: 'center' }}
              >
                {creating ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Plus size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>创建账号</Text>
                  </View>
                )}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ===== 删除确认 Modal ===== */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-card rounded-2xl p-6 w-full" style={{ borderCurve: 'continuous' } as object}>
            <Text className="text-lg font-bold text-foreground mb-2">确认删除账号</Text>
            <Text className="text-sm text-muted-foreground mb-6">
              确定要删除账号{' '}
              <Text className="font-semibold text-foreground">
                {deleteTarget?.display_name || deleteTarget?.email}
              </Text>{' '}
              吗？此操作无法撤销。
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setDeleteTarget(null)}
                className="flex-1 py-3 rounded-xl bg-muted items-center"
              >
                <Text className="text-sm font-semibold text-foreground">取消</Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-destructive items-center"
              >
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text className="text-sm font-semibold text-white">确认删除</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
