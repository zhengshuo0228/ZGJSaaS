import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Toast } from "antd-mobile";
import { ChevronRight, UserPlus } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSInput, SaaSButton, SaaSTab, ListItem, StatusBadge, EmptyState } from "../../components/saas";
import { createAdminUser, getAdminUsers, getDepartments, getPositions, getStores, updateUserPositions } from "../../api/mockApi";
import type { Department, Position, Store } from "../../types";

type AdminUser = {
  id: string;
  username: string;
  realName: string;
  storeId: string;
  departmentId: string;
  storeName?: string;
  departmentName?: string;
  status: string;
  positions?: Position[];
};

type CreateForm = {
  username: string;
  password: string;
  realName: string;
  storeId: string;
  departmentId: string;
  positionId: string;
};

const emptyForm: CreateForm = { username: "", password: "123456", realName: "", storeId: "", departmentId: "", positionId: "" };
const tabs = ["账号列表", "新建账号", "注册审批", "授权管理"];

function departmentKey(name?: string) {
  return name === "前厅" ? "dining" : "kitchen";
}

export default function AdminAccount() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("账号列表");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [editingUserId, setEditingUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [userResult, storeResult, departmentResult, positionResult] = await Promise.all([getAdminUsers(), getStores(), getDepartments(), getPositions()]);
      if (userResult.code === 0) setUsers(Array.isArray(userResult.data) ? userResult.data : []);
      if (storeResult.code === 0) {
        const storeList = Array.isArray(storeResult.data) ? storeResult.data : [];
        setStores(storeList);
        setForm((current) => ({ ...current, storeId: current.storeId || storeList[0]?.id || "" }));
      }
      if (departmentResult.code === 0) setDepartments(Array.isArray(departmentResult.data) ? departmentResult.data : []);
      if (positionResult.code === 0) setPositions(Array.isArray(positionResult.data) ? positionResult.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const currentDepartments = departments.filter((department) => department.storeId === form.storeId);
  const selectedDepartment = departments.find((department) => department.id === form.departmentId);
  const currentPositions = useMemo(() => {
    if (!selectedDepartment) return positions;
    return positions.filter((position) => position.department === departmentKey(selectedDepartment.name));
  }, [positions, selectedDepartment]);

  useEffect(() => {
    if (!form.storeId) return;
    const firstDepartment = departments.find((department) => department.storeId === form.storeId);
    if (firstDepartment && !currentDepartments.some((department) => department.id === form.departmentId)) {
      setForm((current) => ({ ...current, departmentId: firstDepartment.id, positionId: "" }));
    }
  }, [form.storeId, form.departmentId, departments]);

  useEffect(() => {
    if (form.departmentId && currentPositions.length > 0 && !currentPositions.some((position) => position.id === form.positionId)) {
      setForm((current) => ({ ...current, positionId: currentPositions[0].id }));
    }
  }, [form.departmentId, currentPositions, form.positionId]);

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.realName || !form.storeId || !form.departmentId || !form.positionId) {
      Toast.show({ content: "请填写完整账号信息" });
      return;
    }
    try {
      const result = await createAdminUser({ username: form.username, password: form.password, realName: form.realName, storeId: form.storeId, departmentId: form.departmentId, positionIds: [form.positionId] });
      if (result.code === 0) {
        Toast.show({ content: "账号创建成功", icon: "success" });
        setForm((current) => ({ ...emptyForm, storeId: current.storeId, departmentId: current.departmentId }));
        setTab("账号列表");
        await reload();
      }
    } catch (error: any) {
      Toast.show({ content: error?.response?.data?.message || "账号创建失败" });
    }
  };

  const handleChangePosition = async (user: AdminUser, positionId: string) => {
    if (user.username === "000") {
      Toast.show({ content: "内置超管账号不可修改" });
      return;
    }
    try {
      await updateUserPositions(user.id, [positionId]);
      Toast.show({ content: "岗位已更新", icon: "success" });
      setEditingUserId("");
      await reload();
    } catch (error: any) {
      Toast.show({ content: error?.response?.data?.message || "岗位更新失败" });
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="账号管理" subtitle="维护门店员工账号、岗位与权限入口" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />

        {tab === "账号列表" && (
          <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
            {loading ? <div style={{ padding: 18, color: "#94A3B8", textAlign: "center" }}>加载中...</div> : null}
            {!loading && users.length === 0 ? <EmptyState icon="👤" text="暂无账号" /> : null}
            {!loading && users.map((user) => {
              const userPositions = Array.isArray(user.positions) ? user.positions : [];
              return (
                <div key={user.id}>
                  <ListItem
                    title={user.realName}
                    subtitle={`${user.username} · ${user.storeName || user.storeId} · ${user.departmentName || user.departmentId} · ${userPositions.map((position) => position.name).join("、") || "未设置岗位"}`}
                    right={<><StatusBadge text={user.status === "active" ? "正常" : user.status} type={user.status === "active" ? "success" : "warning"} /><button onClick={() => setEditingUserId(editingUserId === user.id ? "" : user.id)} style={linkButtonStyle}>改岗位</button></>}
                  />
                  {editingUserId === user.id ? (
                    <div style={{ padding: "0 16px 14px" }}>
                      <select value={userPositions[0]?.id || ""} onChange={(event) => handleChangePosition(user, event.target.value)} style={selectNativeStyle}>
                        <option value="">请选择岗位</option>
                        {positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
                      </select>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </SaaSCard>
        )}

        {tab === "新建账号" && (
          <SaaSCard>
            <div style={cardTitleStyle}><UserPlus size={16} color="#059669" /> 新建账号</div>
            <FormSelect label="门店" value={form.storeId} onChange={(storeId) => setForm((current) => ({ ...current, storeId, departmentId: "", positionId: "" }))} options={stores} />
            <FormSelect label="部门" value={form.departmentId} onChange={(departmentId) => setForm((current) => ({ ...current, departmentId, positionId: "" }))} options={currentDepartments} />
            <FormSelect label="岗位" value={form.positionId} onChange={(positionId) => setForm((current) => ({ ...current, positionId }))} options={currentPositions} />
            <Field label="账号名"><SaaSInput placeholder="请输入账号名" value={form.username} onChange={(username) => setForm((current) => ({ ...current, username }))} /></Field>
            <Field label="初始密码"><SaaSInput placeholder="默认 123456" value={form.password} onChange={(password) => setForm((current) => ({ ...current, password }))} type="password" /></Field>
            <Field label="姓名"><SaaSInput placeholder="真实姓名" value={form.realName} onChange={(realName) => setForm((current) => ({ ...current, realName }))} /></Field>
            <SaaSButton onClick={handleCreate} block>创建账号</SaaSButton>
          </SaaSCard>
        )}

        {tab === "注册审批" && (
          <EntryCard title="注册审批" subtitle="处理首页提交的注册申请，通过后员工即可登录。" button="打开注册审批" onClick={() => navigate("/admin/registration")} />
        )}

        {tab === "授权管理" && (
          <EntryCard title="授权管理" subtitle="设置跨部门、跨门店访问权限。跨门店仅超级管理员可设置。" button="进入授权管理" onClick={() => navigate("/admin/auth")} />
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}><label style={fieldLabelStyle}>{label}</label>{children}</div>;
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; name: string }[] }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={selectNativeStyle}>
        <option value="">请选择{label}</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </Field>
  );
}

function EntryCard({ title, subtitle, button, onClick }: { title: string; subtitle: string; button: string; onClick: () => void }) {
  return (
    <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
      <ListItem title={title} subtitle={subtitle} right={<><StatusBadge text="去处理" type="warning" /><ChevronRight size={16} color="#94A3B8" /></>} />
      <div style={{ padding: "0 16px 16px" }}><SaaSButton onClick={onClick} block>{button}</SaaSButton></div>
    </SaaSCard>
  );
}

const fieldLabelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 };
const selectNativeStyle: React.CSSProperties = { width: "100%", height: 45, border: "1.5px solid #E2E8F0", borderRadius: 14, padding: "0 12px", background: "#fff", color: "#0F172A", fontSize: 14 };
const linkButtonStyle: React.CSSProperties = { border: 0, background: "transparent", color: "#059669", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const cardTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 };
