import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Dialog, Toast } from "antd-mobile";
import { Store, Trash2, Users } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSTab, ListItem, StatusBadge, SaaSButton, EmptyState } from "../../components/saas";
import {
  createCrossDepartmentAuthorization,
  createCrossStoreAuthorization,
  deleteCrossDepartmentAuthorization,
  deleteCrossStoreAuthorization,
  getAdminUsers,
  getCrossDepartmentAuthorizations,
  getCrossStoreAuthorizations,
  getDepartments,
  getStores,
} from "../../api/mockApi";
import type { Department, Store as StoreType, User } from "../../types";

type AuthRecord = {
  id: string;
  userId: string;
  targetId: string;
  user?: { realName?: string; username?: string; storeName?: string; departmentName?: string } | null;
  target?: { id: string; name: string; storeName?: string; type: string };
  createdAt: string;
};

const tabs = ["跨部门授权", "跨门店授权"];

export default function AdminAuth() {
  const [tab, setTab] = useState("跨部门授权");
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptAuths, setDeptAuths] = useState<AuthRecord[]>([]);
  const [storeAuths, setStoreAuths] = useState<AuthRecord[]>([]);
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [storeId, setStoreId] = useState("");

  const loadData = async () => {
    const [userResult, storeResult, departmentResult, deptAuthResult, storeAuthResult] = await Promise.all([
      getAdminUsers(),
      getStores(),
      getDepartments(),
      getCrossDepartmentAuthorizations(),
      getCrossStoreAuthorizations(),
    ]);
    const userList = userResult.code === 0 && Array.isArray(userResult.data) ? userResult.data as User[] : [];
    const storeList = storeResult.code === 0 && Array.isArray(storeResult.data) ? storeResult.data as StoreType[] : [];
    const departmentList = departmentResult.code === 0 && Array.isArray(departmentResult.data) ? departmentResult.data as Department[] : [];
    setUsers(userList);
    setStores(storeList);
    setDepartments(departmentList);
    setDeptAuths(deptAuthResult.code === 0 && Array.isArray(deptAuthResult.data) ? deptAuthResult.data as AuthRecord[] : []);
    setStoreAuths(storeAuthResult.code === 0 && Array.isArray(storeAuthResult.data) ? storeAuthResult.data as AuthRecord[] : []);
    setUserId((current) => current || userList.find((user) => user.username !== "000")?.id || userList[0]?.id || "");
    setDepartmentId((current) => current || departmentList[0]?.id || "");
    setStoreId((current) => current || storeList[0]?.id || "");
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedUser = users.find((user) => user.id === userId);
  const departmentOptions = useMemo(() => departments.filter((department) => department.id !== selectedUser?.departmentId), [departments, selectedUser]);
  const storeOptions = useMemo(() => stores.filter((store) => store.id !== selectedUser?.storeId), [stores, selectedUser]);

  const createDepartmentAuth = async () => {
    if (!userId || !departmentId) return Toast.show({ content: "请选择员工和目标部门" });
    const result = await createCrossDepartmentAuthorization({ userId, targetId: departmentId });
    if (result.code === 0) {
      Toast.show({ content: "跨部门授权已创建", icon: "success" });
      await loadData();
    }
  };

  const createStoreAuth = async () => {
    if (!userId || !storeId) return Toast.show({ content: "请选择员工和目标门店" });
    const result = await createCrossStoreAuthorization({ userId, targetId: storeId });
    if (result.code === 0) {
      Toast.show({ content: "跨门店授权已创建", icon: "success" });
      await loadData();
    }
  };

  const deleteAuth = async (id: string, type: "department" | "store") => {
    const confirmed = await Dialog.confirm({ content: "确认取消该授权？" });
    if (!confirmed) return;
    const result = type === "department" ? await deleteCrossDepartmentAuthorization(id) : await deleteCrossStoreAuthorization(id);
    if (result.code === 0) {
      Toast.show({ content: "授权已取消", icon: "success" });
      await loadData();
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="授权管理" subtitle="管理员设置跨部门访问，超级管理员设置跨门店访问。" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />

        {tab === "跨部门授权" ? (
          <>
            <SaaSCard style={{ marginBottom: 16 }}>
              <div style={titleStyle}><Users size={16} color="#059669" /> 新建跨部门授权</div>
              <FormSelect label="员工" value={userId} onChange={setUserId} options={users.map((user) => ({ id: user.id, name: `${user.realName}（${user.username}）` }))} />
              <FormSelect label="目标部门" value={departmentId} onChange={setDepartmentId} options={departmentOptions.map((department) => ({ id: department.id, name: `${department.name} · ${stores.find((store) => store.id === department.storeId)?.name || department.storeId}` }))} />
              <SaaSButton onClick={createDepartmentAuth} block>创建授权</SaaSButton>
            </SaaSCard>
            <AuthList records={deptAuths} type="department" onDelete={deleteAuth} emptyText="暂无跨部门授权" />
          </>
        ) : (
          <>
            <SaaSCard style={{ marginBottom: 16 }}>
              <div style={titleStyle}><Store size={16} color="#4F46E5" /> 新建跨门店授权</div>
              <FormSelect label="员工" value={userId} onChange={setUserId} options={users.map((user) => ({ id: user.id, name: `${user.realName}（${user.username}）` }))} />
              <FormSelect label="目标门店" value={storeId} onChange={setStoreId} options={storeOptions.map((store) => ({ id: store.id, name: store.name }))} />
              <SaaSButton onClick={createStoreAuth} block>创建授权</SaaSButton>
            </SaaSCard>
            <AuthList records={storeAuths} type="store" onDelete={deleteAuth} emptyText="暂无跨门店授权" />
          </>
        )}
      </div>
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; name: string }[] }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={fieldLabelStyle}>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
        <option value="">请选择{label}</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </div>
  );
}

function AuthList({ records, type, onDelete, emptyText }: { records: AuthRecord[]; type: "department" | "store"; onDelete: (id: string, type: "department" | "store") => void; emptyText: string }) {
  const safeRecords = Array.isArray(records) ? records : [];
  return (
    <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
      <div style={sectionHeaderStyle}>授权列表</div>
      {safeRecords.length === 0 ? <EmptyState icon="🔐" text={emptyText} /> : safeRecords.map((record) => (
        <ListItem
          key={record.id}
          title={record.user?.realName || record.userId}
          subtitle={`${record.user?.storeName || ""}${record.user?.departmentName ? ` · ${record.user.departmentName}` : ""} → ${record.target?.name || record.targetId}${record.target?.storeName ? ` · ${record.target.storeName}` : ""}`}
          right={<><StatusBadge text={type === "department" ? "跨部门" : "跨门店"} type={type === "department" ? "info" : "warning"} /><button onClick={() => onDelete(record.id, type)} style={deleteButtonStyle}><Trash2 size={14} /></button></>}
        />
      ))}
    </SaaSCard>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 };
const fieldLabelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 };
const selectStyle: React.CSSProperties = { width: "100%", height: 45, border: "1.5px solid #E2E8F0", borderRadius: 14, padding: "0 12px", background: "#fff", color: "#0F172A", fontSize: 14 };
const deleteButtonStyle: React.CSSProperties = { width: 30, height: 30, borderRadius: 10, border: "1px solid #FEE2E2", background: "#fff", color: "#DC2626", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const sectionHeaderStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  fontWeight: 700,
  color: "#64748B",
  background: "#F8FAFC",
  borderBottom: "1px solid #E2E8F0",
};
