import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Building2,
  Check,
  Clock,
  Edit3,
  FileText,
  Key,
  MapPin,
  Plus,
  Shield,
  Store,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';

import {
  addOperationLog,
  adminCreateUser,
  adminDeleteUser,
  adminUpdatePassword,
  adminUpdateUserProfile,
  createDepartment,
  createPosition,
  createStore,
  deletePosition,
  getAllProfiles,
  getDepartments,
  getOperationLogs,
  getPositions,
  getUserPermsByPosition,
  getStores,
  getTenants,
  updateDepartment,
  updatePositionPermissions,
  updateStore,
} from '@/db/api';
import {
  DEFAULT_TIME_SETTINGS,
  getTimeSettings,
  saveTimeSettings,
  type TimePeriodSettings,
} from '@/lib/timeSettings';
import { useProfile } from '@/context/ProfileContext';
import type {
  DepartmentRecord,
  OperationLog,
  PositionRecord,
  Profile,
  StoreRecord,
  TenantRecord,
  UserRole,
} from '@/types/types';

const ROLE_OPTIONS = [
  { value: 'user', label: '员工' },
  { value: 'admin', label: '品牌管理员' },
];

const PERM_GROUPS: { label: string; perms: string[] }[] = [
  { label: '申购管理', perms: ['提交申购单', '查看申购历史', '审核申购单', '查看采购汇总'] },
  { label: '食材与系统', perms: ['管理食材库', '账号管理', '系统配置', '导出报表', '数据统计'] },
  { label: '绩效面板', perms: ['绩效提交申请', '绩效审核申请', '绩效管理', '绩效查看全部', '绩效导出汇总', '绩效删除记录', '绩效加分扣分'] },
  { label: '考勤排休', perms: ['排休申请', '排休管理'] },
];

type ActiveTab = 'accounts' | 'stores' | 'departments' | 'positions' | 'time' | 'logs';

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <Text className="text-xs text-muted-foreground mb-1">
      {children}
      {required ? <Text className="text-destructive"> *</Text> : null}
    </Text>
  );
}

function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`px-3 py-2 rounded-full border ${active ? 'border-primary bg-primary/10' : 'border-border bg-card'} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-xs font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>{label}</Text>
    </Pressable>
  );
}

export default function AccountManagementScreen() {
  const router = useRouter();
  const { profile: myProfile } = useProfile();

  const [activeTab, setActiveTab] = useState<ActiveTab>('accounts');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<string>('user');
  const [editPosition, setEditPosition] = useState('');
  const [editTenantId, setEditTenantId] = useState<string | null>(null);
  const [editStoreId, setEditStoreId] = useState<string | null>(null);
  const [editDepartmentId, setEditDepartmentId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [pwTarget, setPwTarget] = useState<Profile | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  const [createVisible, setCreateVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPwField, setNewPwField] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>('user');
  const [newPos, setNewPos] = useState('');
  const [newTenantId, setNewTenantId] = useState<string | null>(null);
  const [newStoreId, setNewStoreId] = useState<string | null>(null);
  const [newDepartmentId, setNewDepartmentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeSaving, setStoreSaving] = useState(false);

  const [departmentName, setDepartmentName] = useState('');
  const [departmentSaving, setDepartmentSaving] = useState(false);

  const [newPosName, setNewPosName] = useState('');
  const [addingPos, setAddingPos] = useState(false);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [posPerms, setPosPerms] = useState<Record<string, string[]>>({});
  const [permSaving, setPermSaving] = useState(false);

  const [timeSettings, setTimeSettings] = useState<TimePeriodSettings>(DEFAULT_TIME_SETTINGS);
  const [timeSaving, setTimeSaving] = useState(false);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [effectivePerms, setEffectivePerms] = useState<string[]>([]);

  const isPlatformAdmin = myProfile?.account_id === '000' || myProfile?.role === 'super_admin';
  const canManageAccounts = isPlatformAdmin || myProfile?.role === 'admin' || effectivePerms.includes('账号管理');
  const canEditPositionPermissions = myProfile?.account_id === '000';
  const activeTenantId = selectedTenantId ?? myProfile?.tenant_id ?? tenants[0]?.id ?? null;

  const tenantStores = useMemo(
    () => stores.filter((store) => !activeTenantId || store.tenant_id === activeTenantId),
    [stores, activeTenantId]
  );
  const activeStoreId = selectedStoreId ?? tenantStores.find((store) => store.is_active)?.id ?? tenantStores[0]?.id ?? null;
  const storeDepartments = useMemo(
    () => departments.filter((department) => (!activeTenantId || department.tenant_id === activeTenantId) && (!activeStoreId || department.store_id === activeStoreId)),
    [departments, activeTenantId, activeStoreId]
  );
  const filteredProfiles = useMemo(
    () => profiles.filter((profile) => {
      if (activeTenantId && profile.tenant_id !== activeTenantId) return false;
      if (selectedStoreId && profile.store_id !== selectedStoreId) return false;
      if (selectedDepartmentId && profile.department_id !== selectedDepartmentId) return false;
      return true;
    }),
    [profiles, activeTenantId, selectedStoreId, selectedDepartmentId]
  );

  const tenantName = (tenantId?: string | null) => tenants.find((tenant) => tenant.id === tenantId)?.name ?? '未分配品牌';
  const storeNameOf = (storeId?: string | null) => stores.find((store) => store.id === storeId)?.name ?? '未分配门店';
  const departmentNameOf = (departmentId?: string | null) => departments.find((department) => department.id === departmentId)?.name ?? '未分配部门';

  const refreshPositionPerms = (data: PositionRecord[]) => {
    const permsMap: Record<string, string[]> = {};
    for (const position of data) permsMap[position.id] = Array.isArray(position.permissions) ? position.permissions : [];
    setPosPerms(permsMap);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const data = await getOperationLogs({ limit: 200 });
    setLogs(data);
    setLogsLoading(false);
  };

  const loadAll = async () => {
    setLoading(true);
    const [tenantRows, storeRows, departmentRows, profileRows, positionRows, timeRows, permRows] = await Promise.all([
      getTenants(),
      getStores(),
      getDepartments(),
      getAllProfiles(),
      getPositions(),
      getTimeSettings(),
      myProfile?.id ? getUserPermsByPosition(myProfile.id) : Promise.resolve([]),
    ]);
    setTenants(tenantRows);
    setStores(storeRows);
    setDepartments(departmentRows);
    setProfiles(profileRows);
    setPositions(positionRows);
    setTimeSettings(timeRows);
    setEffectivePerms(Array.isArray(permRows) ? permRows : []);
    refreshPositionPerms(positionRows);
    const defaultTenant = selectedTenantId ?? myProfile?.tenant_id ?? tenantRows[0]?.id ?? null;
    const defaultStore = selectedStoreId ?? myProfile?.store_id ?? storeRows.find((store: StoreRecord) => store.tenant_id === defaultTenant)?.id ?? null;
    setSelectedTenantId(defaultTenant);
    setSelectedStoreId(defaultStore);
    setSelectedDepartmentId((current) => current ?? null);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => {
    loadAll();
  }, []));

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2600);
  };

  const openCreate = () => {
    setCreateError('');
    setNewEmail('');
    setNewPwField('');
    setNewName('');
    setNewRole('user');
    setNewPos('');
    setNewTenantId(activeTenantId);
    setNewStoreId(activeStoreId);
    setNewDepartmentId(storeDepartments.find((department) => department.is_active !== false)?.id ?? storeDepartments[0]?.id ?? null);
    setCreateVisible(true);
  };

  const openEdit = (profile: Profile) => {
    setEditTarget(profile);
    setEditName(profile.display_name ?? '');
    setEditRole(profile.role ?? 'user');
    setEditPosition(profile.position ?? '');
    setEditTenantId(profile.tenant_id ?? activeTenantId);
    setEditStoreId(profile.store_id ?? null);
    setEditDepartmentId(profile.department_id ?? null);
  };

  const validateOrg = (tenantId: string | null, storeId: string | null, departmentId: string | null, position: string) => {
    if (!tenantId) return '请选择品牌';
    if (!storeId) return '请选择门店';
    if (!departmentId) return '请选择部门';
    if (!position) return '请选择岗位';
    return '';
  };

  const handleCreate = async () => {
    const finalPw = newPwField.trim() || '123456';
    if (!newEmail.trim()) { setCreateError('账号不能为空'); return; }
    if (!newName.trim()) { setCreateError('姓名不能为空'); return; }
    if (finalPw.length < 6) { setCreateError('密码至少 6 位'); return; }
    const orgError = validateOrg(newTenantId, newStoreId, newDepartmentId, newPos);
    if (orgError) { setCreateError(orgError); return; }
    setCreating(true);
    setCreateError('');
    const rawInput = newEmail.trim();
    const emailToUse = rawInput.includes('@') ? rawInput : `${rawInput}@zaoguanjia.app`;
    const result = await adminCreateUser({
      email: emailToUse,
      password: finalPw,
      display_name: newName.trim(),
      role: newRole,
      position: newPos,
      tenant_id: newTenantId,
      store_id: newStoreId,
      department_id: newDepartmentId,
    });
    if (!result.success) {
      setCreateError(result.error ?? '创建失败');
      setCreating(false);
      return;
    }
    await addOperationLog({
      action: '创建账号',
      target_type: '账号',
      target_name: newName.trim() || rawInput,
      detail: { role: newRole, position: newPos, tenant_id: newTenantId, store_id: newStoreId, department_id: newDepartmentId },
    });
    setCreateVisible(false);
    setCreating(false);
    showMsg('账号已创建');
    setTimeout(() => loadAll(), 500);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const orgError = validateOrg(editTenantId, editStoreId, editDepartmentId, editPosition);
    if (orgError) { showMsg(orgError); return; }
    setEditSaving(true);
    const result = await adminUpdateUserProfile({
      user_id: editTarget.id,
      display_name: editName.trim() || null,
      role: editRole,
      position: editPosition || null,
      tenant_id: editTenantId,
      store_id: editStoreId,
      department_id: editDepartmentId,
    });
    if (!result.success) {
      showMsg(`保存失败：${result.error}`);
      setEditSaving(false);
      return;
    }
    await addOperationLog({
      action: '编辑账号资料',
      target_type: '账号',
      target_name: editName.trim() || editTarget.display_name || editTarget.email || '',
      detail: { role: editRole, position: editPosition, tenant_id: editTenantId, store_id: editStoreId, department_id: editDepartmentId },
    });
    setEditTarget(null);
    setEditSaving(false);
    showMsg('账号资料已更新');
    loadAll();
  };

  const handleSavePw = async () => {
    if (!pwTarget || !newPw.trim()) { setPwError('密码不能为空'); return; }
    if (newPw.length < 6) { setPwError('密码至少 6 位'); return; }
    setPwSaving(true);
    const result = await adminUpdatePassword(pwTarget.id, newPw.trim());
    if (!result.success) {
      setPwError(result.error ?? '修改失败');
      setPwSaving(false);
      return;
    }
    await addOperationLog({ action: '修改密码', target_type: '账号', target_name: pwTarget.display_name || pwTarget.email || '' });
    setPwTarget(null);
    setPwSaving(false);
    showMsg('密码已修改');
  };

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
    await addOperationLog({ action: '删除账号', target_type: '账号', target_name: deleteTarget.display_name || deleteTarget.email || '' });
    setDeleteTarget(null);
    setDeleting(false);
    showMsg('账号已删除');
    loadAll();
  };

  const handleCreateStore = async () => {
    if (!storeName.trim()) return;
    setStoreSaving(true);
    const result = await createStore({ tenant_id: activeTenantId, name: storeName, code: storeCode, address: storeAddress });
    if (!result.success) showMsg(`门店保存失败：${result.error}`);
    else {
      await addOperationLog({ action: '新增门店', target_type: '门店', target_name: storeName.trim() });
      setStoreName('');
      setStoreCode('');
      setStoreAddress('');
      showMsg('门店已新增');
      loadAll();
    }
    setStoreSaving(false);
  };

  const handleToggleStore = async (store: StoreRecord) => {
    const result = await updateStore(store.id, { is_active: !store.is_active });
    if (!result.success) showMsg(`门店状态更新失败：${result.error}`);
    else {
      await addOperationLog({ action: store.is_active ? '停用门店' : '启用门店', target_type: '门店', target_name: store.name });
      loadAll();
    }
  };

  const handleCreateDepartment = async () => {
    if (!departmentName.trim()) return;
    setDepartmentSaving(true);
    const result = await createDepartment({ tenant_id: activeTenantId, store_id: activeStoreId, name: departmentName });
    if (!result.success) showMsg(`部门保存失败：${result.error}`);
    else {
      await addOperationLog({ action: '新增部门', target_type: '部门', target_name: departmentName.trim() });
      setDepartmentName('');
      showMsg('部门已新增');
      loadAll();
    }
    setDepartmentSaving(false);
  };

  const handleToggleDepartment = async (department: DepartmentRecord) => {
    if (department.is_system) {
      showMsg('厨房/前厅为系统部门，不能停用');
      return;
    }
    const nextActive = department.is_active === false;
    const result = await updateDepartment(department.id, { is_active: nextActive });
    if (!result.success) showMsg(`部门状态更新失败：${result.error}`);
    else {
      await addOperationLog({ action: nextActive ? '启用部门' : '停用部门', target_type: '部门', target_name: department.name });
      loadAll();
    }
  };

  const handleAddPos = async () => {
    if (!newPosName.trim()) return;
    setAddingPos(true);
    await createPosition(newPosName.trim());
    setNewPosName('');
    const data = await getPositions();
    setPositions(data);
    refreshPositionPerms(data);
    setAddingPos(false);
  };

  const handleDelPos = async (id: string) => {
    await deletePosition(id);
    const data = await getPositions();
    setPositions(data);
    refreshPositionPerms(data);
  };

  const togglePosPerm = (posId: string, perm: string) => {
    setPosPerms((prev) => {
      const cur = prev[posId] ?? [];
      const next = cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm];
      return { ...prev, [posId]: next };
    });
  };

  const handleSavePositionPerms = async (posId: string, posName: string) => {
    setPermSaving(true);
    const { error } = await updatePositionPermissions(posId, posPerms[posId] ?? []);
    if (error) {
      showMsg(`保存失败：${error}`);
      setPermSaving(false);
      return;
    }
    await addOperationLog({ action: '修改岗位权限', target_type: '岗位权限', target_name: posName, detail: { permissions: posPerms[posId] ?? [] } });
    setEditingPosId(null);
    setPermSaving(false);
    showMsg('岗位权限已保存');
    const data = await getPositions();
    setPositions(data);
    refreshPositionPerms(data);
  };

  const handleSaveTime = async () => {
    setTimeSaving(true);
    await saveTimeSettings(timeSettings);
    setTimeSaving(false);
    showMsg('时间设置已保存');
  };

  const RoleIcon = ({ role }: { role: string }) => {
    if (role === 'super_admin') return <Shield size={16} color="#be185d" />;
    if (role === 'admin') return <UserCheck size={16} color="#059669" />;
    return <Users size={16} color="#6b7280" />;
  };

  if (!loading && !canManageAccounts) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <StatusBar style="dark" />
        <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3 border-b border-border">
          <Pressable onPress={() => router.replace('/(app)/home')} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
            <ArrowLeft size={20} color="#374151" />
          </Pressable>
          <Text className="text-xl font-bold text-foreground flex-1">组织管理</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <Shield size={42} color="#9ca3af" />
          <Text className="text-lg font-bold text-foreground">暂无账号管理权限</Text>
          <Text className="text-sm text-muted-foreground text-center">请联系品牌管理员或 000 平台超管，在岗位权限中开通“账号管理”。</Text>
          <Pressable onPress={() => router.replace('/(app)/home')} className="mt-2 bg-primary rounded-xl px-5 py-3">
            <Text className="text-white font-semibold">返回首页</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const renderTenantChips = (value: string | null, onChange: (id: string) => void) => (
    <View className="flex-row flex-wrap gap-2">
      {tenants.map((tenant) => (
        <Chip key={tenant.id} label={tenant.name} active={value === tenant.id} onPress={() => onChange(tenant.id)} />
      ))}
    </View>
  );

  const renderStoreChips = (tenantId: string | null, value: string | null, onChange: (id: string) => void) => (
    <View className="flex-row flex-wrap gap-2">
      {stores.filter((store) => !tenantId || store.tenant_id === tenantId).map((store) => (
        <Chip key={store.id} label={`${store.name}${store.is_active ? '' : '（停用）'}`} active={value === store.id} onPress={() => onChange(store.id)} />
      ))}
    </View>
  );

  const renderDepartmentChips = (tenantId: string | null, storeId: string | null, value: string | null, onChange: (id: string) => void) => (
    <View className="flex-row flex-wrap gap-2">
      {departments.filter((department) => (!tenantId || department.tenant_id === tenantId) && (!storeId || department.store_id === storeId)).map((department) => (
        <Chip key={department.id} label={`${department.name}${department.is_active === false ? '（停用）' : ''}`} active={value === department.id} onPress={() => onChange(department.id)} />
      ))}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="bg-card px-4 pt-3 pb-3 flex-row items-center gap-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-muted items-center justify-center">
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground">组织管理</Text>
          <Text className="text-xs text-muted-foreground mt-0.5">{isPlatformAdmin ? '平台超管 · 全品牌' : `${tenantName(myProfile?.tenant_id)} · 品牌后台`}</Text>
        </View>
        {activeTab === 'accounts' && canManageAccounts ? (
          <Pressable onPress={openCreate} className="flex-row items-center gap-1 bg-primary rounded-xl px-3 py-2">
            <Plus size={16} color="#fff" />
            <Text className="text-white text-sm font-semibold">新建</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="bg-card border-b border-border">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        {[
          { key: 'accounts', label: '员工', icon: Users },
          { key: 'stores', label: '门店', icon: Store },
          { key: 'departments', label: '部门', icon: Building2 },
          { key: 'positions', label: '岗位权限', icon: Shield },
          { key: 'time', label: '时间', icon: Clock },
          ...(isPlatformAdmin ? [{ key: 'logs', label: '日志', icon: FileText }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <Pressable
            key={key}
            onPress={() => {
              setActiveTab(key as ActiveTab);
              if (key === 'logs') loadLogs();
            }}
            className="items-center justify-center rounded-2xl"
            style={{
              width: 74,
              height: 58,
              backgroundColor: activeTab === key ? '#ecfdf5' : '#f8fafc',
              borderWidth: 1,
              borderColor: activeTab === key ? '#99f6e4' : '#e5e7eb',
            }}
          >
            <Icon size={15} color={activeTab === key ? '#059669' : '#9ca3af'} />
            <Text className={`text-xs mt-1 font-semibold ${activeTab === key ? 'text-primary' : 'text-muted-foreground'}`}>{label}</Text>
          </Pressable>
        ))}
        </ScrollView>
      </View>

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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 36 }}>
          {activeTab === 'accounts' && (
            <>
              <View className="bg-card rounded-2xl p-4 gap-3">
                <Text className="text-sm font-bold text-foreground">员工筛选</Text>
                {isPlatformAdmin ? (
                  <>
                    <FieldLabel>品牌</FieldLabel>
                    {renderTenantChips(activeTenantId, (id) => { setSelectedTenantId(id); setSelectedStoreId(null); setSelectedDepartmentId(null); })}
                  </>
                ) : null}
                <FieldLabel>门店</FieldLabel>
                <View className="flex-row flex-wrap gap-2">
                  <Chip label="全部门店" active={!selectedStoreId} onPress={() => { setSelectedStoreId(null); setSelectedDepartmentId(null); }} />
                  {tenantStores.map((store) => (
                    <Chip key={store.id} label={`${store.name}${store.is_active ? '' : '（停用）'}`} active={selectedStoreId === store.id} onPress={() => { setSelectedStoreId(store.id); setSelectedDepartmentId(null); }} />
                  ))}
                </View>
                <FieldLabel>部门</FieldLabel>
                <View className="flex-row flex-wrap gap-2">
                  <Chip label="全部部门" active={!selectedDepartmentId} onPress={() => setSelectedDepartmentId(null)} />
                  {storeDepartments.map((department) => (
                    <Chip key={department.id} label={department.name} active={selectedDepartmentId === department.id} onPress={() => setSelectedDepartmentId(department.id)} />
                  ))}
                </View>
              </View>

              {filteredProfiles.map((profile) => {
                const displayName = profile.display_name || profile.email?.split('@')[0] || '未命名员工';
                const isSelf = profile.id === myProfile?.id;
                const isProtected = profile.account_id === '000' || profile.email === '000@zaoguanjia.app' || profile.email === '000@miaoda.app';
                const canEditThis = canManageAccounts && (!isProtected || isSelf);
                return (
                  <View key={profile.id} className="bg-card rounded-2xl p-4 gap-3">
                    <View className="flex-row items-center gap-3">
                      <View className="w-11 h-11 rounded-full bg-muted items-center justify-center">
                        <RoleIcon role={profile.role} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 flex-wrap">
                          <Text className="text-base font-semibold text-foreground">{displayName}</Text>
                          {profile.position ? <Text className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{profile.position}</Text> : null}
                          {isSelf ? <Text className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">我</Text> : null}
                        </View>
                        <Text className="text-xs text-muted-foreground mt-1">{profile.email?.replace(/@(zaoguanjia|miaoda)\.app$/, '') ?? profile.email}</Text>
                        <Text className="text-xs text-muted-foreground mt-1">{tenantName(profile.tenant_id)} · {storeNameOf(profile.store_id)} · {departmentNameOf(profile.department_id)}</Text>
                      </View>
                    </View>
                    <View className="flex-row gap-2 pt-2 border-t border-border">
                      {canEditThis ? (
                        <>
                          <Pressable onPress={() => openEdit(profile)} className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 bg-muted rounded-xl">
                            <Edit3 size={14} color="#374151" />
                            <Text className="text-xs text-foreground font-medium">编辑</Text>
                          </Pressable>
                          <Pressable onPress={() => { setPwTarget(profile); setNewPw(''); setPwError(''); }} className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 bg-muted rounded-xl">
                            <Key size={14} color="#374151" />
                            <Text className="text-xs text-foreground font-medium">改密码</Text>
                          </Pressable>
                        </>
                      ) : (
                        <View className="flex-1 items-center py-2.5 bg-muted/60 rounded-xl">
                          <Text className="text-xs text-muted-foreground">000 受保护</Text>
                        </View>
                      )}
                      {!isSelf && !isProtected ? (
                        <Pressable onPress={() => setDeleteTarget(profile)} className="flex-row items-center justify-center gap-1.5 py-2.5 px-3 bg-destructive/10 rounded-xl">
                          <Trash2 size={14} color="#ef4444" />
                          <Text className="text-xs text-destructive font-medium">删除</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {activeTab === 'stores' && (
            <>
              <View className="bg-card rounded-2xl p-4 gap-2">
                <Text className="text-sm font-bold text-foreground">品牌信息</Text>
                <Text className="text-xl font-bold text-foreground">{tenantName(activeTenantId)}</Text>
                <Text className="text-xs text-muted-foreground">当前共 {tenantStores.length} 个门店，启用 {tenantStores.filter((store) => store.is_active).length} 个</Text>
              </View>
              <View className="bg-card rounded-2xl p-4 gap-3">
                <Text className="text-sm font-bold text-foreground">新增门店</Text>
                <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="门店名称" value={storeName} onChangeText={setStoreName} />
                <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="门店编码（可选）" value={storeCode} onChangeText={setStoreCode} autoCapitalize="none" />
                <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="门店地址（可选）" value={storeAddress} onChangeText={setStoreAddress} />
                <Pressable onPress={handleCreateStore} disabled={storeSaving || !storeName.trim()} className="bg-primary rounded-xl py-3 items-center">
                  {storeSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">保存门店</Text>}
                </Pressable>
              </View>
              {tenantStores.map((store) => (
                <View key={store.id} className="bg-card rounded-2xl p-4 flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                    <MapPin size={18} color="#059669" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">{store.name}</Text>
                    <Text className="text-xs text-muted-foreground mt-1">{store.code || '无编码'} · {store.address || '未填写地址'}</Text>
                  </View>
                  <Pressable onPress={() => handleToggleStore(store)} className={`px-3 py-2 rounded-xl ${store.is_active ? 'bg-amber-100' : 'bg-primary/10'}`}>
                    <Text className={`text-xs font-semibold ${store.is_active ? 'text-amber-700' : 'text-primary'}`}>{store.is_active ? '停用' : '启用'}</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}

          {activeTab === 'departments' && (
            <>
              <View className="bg-card rounded-2xl p-4 gap-3">
                <Text className="text-sm font-bold text-foreground">选择门店</Text>
                {renderStoreChips(activeTenantId, activeStoreId, (id) => { setSelectedStoreId(id); setSelectedDepartmentId(null); })}
              </View>
              <View className="bg-card rounded-2xl p-4 gap-3">
                <Text className="text-sm font-bold text-foreground">新增自定义部门</Text>
                <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="例如：仓库、财务、人事" value={departmentName} onChangeText={setDepartmentName} />
                <Pressable onPress={handleCreateDepartment} disabled={departmentSaving || !departmentName.trim() || !activeStoreId} className="bg-primary rounded-xl py-3 items-center">
                  {departmentSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">保存部门</Text>}
                </Pressable>
              </View>
              {storeDepartments.map((department) => (
                <View key={department.id} className="bg-card rounded-2xl p-4 flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
                    <Building2 size={18} color="#374151" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">{department.name}</Text>
                    <Text className="text-xs text-muted-foreground mt-1">{department.is_system ? '系统部门 · 不可停用' : '自定义部门'} · {department.is_active === false ? '已停用' : '启用中'}</Text>
                  </View>
                  <Pressable onPress={() => handleToggleDepartment(department)} disabled={department.is_system} className={`px-3 py-2 rounded-xl ${department.is_active === false ? 'bg-primary/10' : 'bg-amber-100'} ${department.is_system ? 'opacity-50' : ''}`}>
                    <Text className={`text-xs font-semibold ${department.is_active === false ? 'text-primary' : 'text-amber-700'}`}>{department.is_active === false ? '启用' : '停用'}</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}

          {activeTab === 'positions' && (
            <>
              <View className="bg-card rounded-2xl p-4 gap-3">
                <Text className="text-sm font-bold text-foreground">新增岗位</Text>
                <View className="flex-row gap-2">
                  <TextInput className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground" placeholder="输入岗位名称" value={newPosName} onChangeText={setNewPosName} onSubmitEditing={handleAddPos} />
                  <Pressable onPress={handleAddPos} disabled={addingPos || !newPosName.trim()} className="bg-primary rounded-xl px-4 items-center justify-center">
                    {addingPos ? <ActivityIndicator size="small" color="#fff" /> : <Plus size={18} color="#fff" />}
                  </Pressable>
                </View>
                {!canEditPositionPermissions ? (
                  <Text className="text-xs text-muted-foreground">岗位可由品牌管理员新增；权限配置仅 000 平台超管可修改。</Text>
                ) : null}
              </View>
              {positions.map((position) => (
                <View key={position.id} className="bg-card rounded-2xl p-4 gap-3">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-base font-semibold text-foreground">{position.name}</Text>
                      <Text className="text-xs text-muted-foreground mt-1">{(position.permissions ?? []).length} 个权限</Text>
                    </View>
                    <View className="flex-row gap-2">
                      {canEditPositionPermissions ? (
                        <Pressable onPress={() => setEditingPosId(editingPosId === position.id ? null : position.id)} className="px-3 py-2 bg-muted rounded-xl">
                          <Text className="text-xs font-semibold text-foreground">{editingPosId === position.id ? '收起' : '编辑权限'}</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => handleDelPos(position.id)} className="px-3 py-2 bg-destructive/10 rounded-xl">
                        <Text className="text-xs font-semibold text-destructive">删除</Text>
                      </Pressable>
                    </View>
                  </View>
                  {editingPosId === position.id && canEditPositionPermissions ? (
                    <View className="gap-4 pt-2 border-t border-border">
                      {PERM_GROUPS.map((group) => (
                        <View key={group.label} className="gap-2">
                          <Text className="text-xs font-semibold text-foreground">{group.label}</Text>
                          <View className="flex-row flex-wrap gap-2">
                            {group.perms.map((perm) => (
                              <Chip key={perm} label={perm} active={(posPerms[position.id] ?? []).includes(perm)} onPress={() => togglePosPerm(position.id, perm)} />
                            ))}
                          </View>
                        </View>
                      ))}
                      <Pressable onPress={() => handleSavePositionPerms(position.id, position.name)} disabled={permSaving} className="bg-primary rounded-xl py-3 items-center">
                        {permSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">保存权限配置</Text>}
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          )}

          {activeTab === 'time' && (
            <>
              <View className="bg-card rounded-2xl p-4">
                <Text className="text-sm font-semibold text-foreground mb-1">午市时间段</Text>
                <TimeRow label="开始时间" value={timeSettings.lunchStart} onChange={(v) => setTimeSettings((s: TimePeriodSettings) => ({ ...s, lunchStart: v }))} />
                <TimeRow label="结束时间" value={timeSettings.lunchEnd} onChange={(v) => setTimeSettings((s: TimePeriodSettings) => ({ ...s, lunchEnd: v }))} />
              </View>
              <View className="bg-card rounded-2xl p-4">
                <Text className="text-sm font-semibold text-foreground mb-1">晚市时间段</Text>
                <TimeRow label="开始时间" value={timeSettings.dinnerStart} onChange={(v) => setTimeSettings((s: TimePeriodSettings) => ({ ...s, dinnerStart: v }))} />
                <TimeRow label="结束时间" value={timeSettings.dinnerEnd} onChange={(v) => setTimeSettings((s: TimePeriodSettings) => ({ ...s, dinnerEnd: v }))} />
              </View>
              <Pressable onPress={handleSaveTime} disabled={timeSaving} className="bg-primary rounded-xl py-4 items-center">
                {timeSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">保存时间设置</Text>}
              </Pressable>
            </>
          )}

          {activeTab === 'logs' && isPlatformAdmin && (
            <>
              <Pressable onPress={loadLogs} className="bg-muted rounded-xl py-3 items-center">
                <Text className="text-sm text-foreground font-semibold">刷新日志</Text>
              </Pressable>
              {logsLoading ? <ActivityIndicator color="#059669" /> : logs.map((log) => (
                <View key={log.id} className="bg-card rounded-2xl p-4 gap-1">
                  <Text className="text-sm font-semibold text-foreground">{log.action}</Text>
                  <Text className="text-xs text-muted-foreground">操作人：{log.operator_name ?? '未知'}{log.target_name ? ` · 对象：${log.target_name}` : ''}</Text>
                  <Text className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('zh-CN')}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={createVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateVisible(false)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
            <Text className="flex-1 text-lg font-bold text-foreground">新建员工账号</Text>
            <Pressable onPress={() => setCreateVisible(false)}><X size={22} color="#374151" /></Pressable>
          </View>
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View>
                <FieldLabel required>账号</FieldLabel>
                <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="例如 zhangsan" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" />
              </View>
              <View>
                <FieldLabel>初始密码</FieldLabel>
                <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="留空默认 123456" value={newPwField} onChangeText={setNewPwField} secureTextEntry />
              </View>
              <View>
                <FieldLabel required>姓名</FieldLabel>
                <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="真实姓名" value={newName} onChangeText={setNewName} />
              </View>
              {isPlatformAdmin ? <View><FieldLabel required>品牌</FieldLabel>{renderTenantChips(newTenantId, (id) => { setNewTenantId(id); setNewStoreId(null); setNewDepartmentId(null); })}</View> : null}
              <View><FieldLabel required>门店</FieldLabel>{renderStoreChips(newTenantId, newStoreId, (id) => { setNewStoreId(id); setNewDepartmentId(null); })}</View>
              <View><FieldLabel required>部门</FieldLabel>{renderDepartmentChips(newTenantId, newStoreId, newDepartmentId, setNewDepartmentId)}</View>
              <View><FieldLabel required>岗位</FieldLabel><View className="flex-row flex-wrap gap-2">{positions.map((p) => <Chip key={p.id} label={p.name} active={newPos === p.name} onPress={() => setNewPos(p.name)} />)}</View></View>
              <View><FieldLabel>权限角色</FieldLabel><View className="flex-row flex-wrap gap-2">{ROLE_OPTIONS.map((role) => <Chip key={role.value} label={role.label} active={newRole === role.value} onPress={() => setNewRole(role.value)} />)}</View></View>
              {createError ? <Text className="text-destructive text-sm">{createError}</Text> : null}
              <Pressable onPress={handleCreate} disabled={creating} className="bg-primary rounded-xl py-4 items-center">
                {creating ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">创建账号</Text>}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!editTarget} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setEditTarget(null)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
            <Text className="flex-1 text-lg font-bold text-foreground">编辑员工资料</Text>
            <Pressable onPress={() => setEditTarget(null)}><X size={22} color="#374151" /></Pressable>
          </View>
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View><FieldLabel required>姓名</FieldLabel><TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" value={editName} onChangeText={setEditName} placeholder="真实姓名" /></View>
              {isPlatformAdmin ? <View><FieldLabel required>品牌</FieldLabel>{renderTenantChips(editTenantId, (id) => { setEditTenantId(id); setEditStoreId(null); setEditDepartmentId(null); })}</View> : null}
              <View><FieldLabel required>门店</FieldLabel>{renderStoreChips(editTenantId, editStoreId, (id) => { setEditStoreId(id); setEditDepartmentId(null); })}</View>
              <View><FieldLabel required>部门</FieldLabel>{renderDepartmentChips(editTenantId, editStoreId, editDepartmentId, setEditDepartmentId)}</View>
              <View><FieldLabel required>岗位</FieldLabel><View className="flex-row flex-wrap gap-2">{positions.map((p) => <Chip key={p.id} label={p.name} active={editPosition === p.name} onPress={() => setEditPosition(p.name)} />)}</View></View>
              <View><FieldLabel>权限角色</FieldLabel><View className="flex-row flex-wrap gap-2">{ROLE_OPTIONS.map((role) => <Chip key={role.value} label={role.label} active={editRole === role.value} onPress={() => setEditRole(role.value)} />)}</View></View>
              <Pressable onPress={handleSaveEdit} disabled={editSaving} className="bg-primary rounded-xl py-4 items-center">
                {editSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">保存修改</Text>}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!pwTarget} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setPwTarget(null)}>
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
            <Text className="flex-1 text-lg font-bold text-foreground">修改密码</Text>
            <Pressable onPress={() => setPwTarget(null)}><X size={22} color="#374151" /></Pressable>
          </View>
          <View className="p-4 gap-4">
            <Text className="text-sm text-muted-foreground">{pwTarget?.display_name || pwTarget?.email}</Text>
            <TextInput className="border border-border rounded-xl px-4 py-3 text-sm text-foreground" placeholder="输入新密码（至少 6 位）" value={newPw} onChangeText={setNewPw} secureTextEntry autoFocus />
            {pwError ? <Text className="text-destructive text-sm">{pwError}</Text> : null}
            <Pressable onPress={handleSavePw} disabled={pwSaving} className="bg-primary rounded-xl py-4 items-center">
              {pwSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">确认修改</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-card rounded-2xl p-5 w-full gap-4">
            <Text className="text-lg font-bold text-foreground">确认删除账号？</Text>
            <Text className="text-sm text-muted-foreground">删除后该员工将无法登录。历史数据不会被物理清空。</Text>
            <View className="flex-row gap-3">
              <Pressable onPress={() => setDeleteTarget(null)} className="flex-1 bg-muted rounded-xl py-3 items-center">
                <Text className="text-foreground font-semibold">取消</Text>
              </Pressable>
              <Pressable onPress={handleDelete} disabled={deleting} className="flex-1 bg-destructive rounded-xl py-3 items-center">
                {deleting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">删除</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
