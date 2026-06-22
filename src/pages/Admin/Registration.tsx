import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Toast } from "antd-mobile";
import { ChevronRight } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, ListItem, StatusBadge, EmptyState } from "../../components/saas";
import { approveRegistration, getDepartments, getPositions, getRegistrations, getStores } from "../../api/mockApi";
import type { Department, Position, Store } from "../../types";

type Registration = {
  id: string;
  username: string;
  realName: string;
  storeId: string;
  departmentId: string;
  positionId: string;
  remark?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export default function AdminRegistration() {
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [registrationResult, storeResult, departmentResult, positionResult] = await Promise.all([getRegistrations(), getStores(), getDepartments(), getPositions()]);
      if (registrationResult.code === 0) setRegistrations(Array.isArray(registrationResult.data) ? registrationResult.data : []);
      if (storeResult.code === 0) setStores(Array.isArray(storeResult.data) ? storeResult.data : []);
      if (departmentResult.code === 0) setDepartments(Array.isArray(departmentResult.data) ? departmentResult.data : []);
      if (positionResult.code === 0) setPositions(Array.isArray(positionResult.data) ? positionResult.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const maps = useMemo(() => ({
    store: new Map(stores.map((store) => [store.id, store.name])),
    department: new Map(departments.map((department) => [department.id, department.name])),
    position: new Map(positions.map((position) => [position.id, position.name])),
  }), [stores, departments, positions]);

  const handleApprove = async (id: string, approved: boolean) => {
    if (!confirm(approved ? "确认通过该注册申请？" : "确认驳回该注册申请？")) return;
    try {
      const result = await approveRegistration(id, approved);
      if (result.code === 0) {
        Toast.show({ content: approved ? "已通过，账号现在可以登录" : "已驳回", icon: "success" });
        await reload();
      }
    } catch (error: any) {
      Toast.show({ content: error?.response?.data?.message || "审批失败，请稍后再试" });
    }
  };

  const pendingList = registrations.filter((registration) => registration.status === "pending");
  const doneList = registrations.filter((registration) => registration.status !== "pending").slice(0, 10);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="注册审批" subtitle="审批首页注册账号申请，通过后员工即可登录。" />
        {loading ? <SaaSCard>加载中...</SaaSCard> : null}
        {!loading && pendingList.length === 0 ? <SaaSCard><EmptyState icon="👤" text="暂无待审批注册申请" /></SaaSCard> : null}
        {!loading && pendingList.map((registration) => renderRegistration(registration, maps, handleApprove))}
        {!loading && doneList.length > 0 ? <><div style={sectionLabelStyle}>最近已处理</div>{doneList.map((registration) => renderRegistration(registration, maps, handleApprove))}</> : null}
        <SaaSCard style={{ padding: 0, overflow: "hidden", marginTop: 12, position: "relative" }}>
          <ListItem title="账号管理入口" subtitle="进入账号列表、新建账号和授权管理" right={<ChevronRight size={16} color="#94A3B8" />} />
          <div onClick={() => navigate("/admin/account")} style={{ position: "absolute", inset: 0, cursor: "pointer" }} />
        </SaaSCard>
      </div>
    </div>
  );
}

function renderRegistration(
  registration: Registration,
  maps: { store: Map<string, string>; department: Map<string, string>; position: Map<string, string> },
  onApprove: (id: string, approved: boolean) => void
) {
  const statusText = registration.status === "pending" ? "待审批" : registration.status === "approved" ? "已通过" : "已驳回";
  const statusType = registration.status === "pending" ? "warning" : registration.status === "approved" ? "success" : "danger";
  return (
    <SaaSCard key={registration.id} style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{registration.realName}</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>账号：{registration.username}</div>
        </div>
        <StatusBadge text={statusText} type={statusType} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={metaStyle}>门店：{maps.store.get(registration.storeId) || registration.storeId}</div>
        <div style={metaStyle}>部门：{maps.department.get(registration.departmentId) || registration.departmentId}</div>
        <div style={metaStyle}>岗位：{maps.position.get(registration.positionId) || registration.positionId}</div>
        <div style={metaStyle}>时间：{formatDate(registration.createdAt)}</div>
      </div>
      {registration.remark ? <div style={{ fontSize: 12, color: "#64748B", padding: "8px 12px", background: "#F8FAFC", borderRadius: 12, marginBottom: 12 }}>{registration.remark}</div> : null}
      {registration.status === "pending" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onApprove(registration.id, true)} style={approveButtonStyle}>通过</button>
          <button onClick={() => onApprove(registration.id, false)} style={rejectButtonStyle}>驳回</button>
        </div>
      ) : null}
    </SaaSCard>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

const metaStyle: React.CSSProperties = { fontSize: 12, color: "#64748B" };
const sectionLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#64748B", margin: "18px 2px 10px" };
const approveButtonStyle: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 14, background: "#059669", color: "#fff", border: 0, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const rejectButtonStyle: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 14, background: "#fff", color: "#DC2626", border: "1.5px solid #FEE2E2", fontSize: 13, fontWeight: 700, cursor: "pointer" };
