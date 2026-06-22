import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, UserPlus } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSInput, SaaSButton } from "../../components/saas";
import { getDepartments, getPositions, getStores, register } from "../../api/mockApi";
import type { Department, Position, Store } from "../../types";

type RegisterForm = {
  username: string;
  password: string;
  realName: string;
  storeId: string;
  departmentId: string;
  positionId: string;
  remark: string;
};

const initialForm: RegisterForm = {
  username: "",
  password: "",
  realName: "",
  storeId: "",
  departmentId: "",
  positionId: "",
  remark: "",
};

function departmentKey(name: string) {
  return name === "前厅" ? "dining" : "kitchen";
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterForm>(initialForm);
  const [stores, setStores] = useState<Store[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([getStores(), getPositions()]).then(([storeResult, positionResult]) => {
      if (storeResult.code === 0) {
        setStores(storeResult.data);
        setForm((current) => ({ ...current, storeId: current.storeId || storeResult.data[0]?.id || "" }));
      }
      if (positionResult.code === 0) setPositions(positionResult.data);
    });
  }, []);

  useEffect(() => {
    if (!form.storeId) return;
    getDepartments(form.storeId).then((result) => {
      if (result.code !== 0) return;
      setDepartments(result.data);
      setForm((current) => {
        const departmentStillExists = result.data.some((department) => department.id === current.departmentId);
        return {
          ...current,
          departmentId: departmentStillExists ? current.departmentId : result.data[0]?.id || "",
          positionId: departmentStillExists ? current.positionId : "",
        };
      });
    });
  }, [form.storeId]);

  const selectedDepartment = departments.find((department) => department.id === form.departmentId);
  const availablePositions = useMemo(() => {
    if (!selectedDepartment) return positions;
    return positions.filter((position) => position.department === departmentKey(selectedDepartment.name));
  }, [positions, selectedDepartment]);

  const labelMap = {
    store: stores.find((store) => store.id === form.storeId)?.name || "请选择门店",
    department: selectedDepartment?.name || "请选择部门",
    position: positions.find((position) => position.id === form.positionId)?.name || "请选择岗位",
  };

  const chooseFromList = (title: string, items: { id: string; name: string }[], onPick: (id: string) => void) => {
    if (items.length === 0) {
      alert(`暂无可选${title}`);
      return;
    }
    const choice = prompt(`请选择${title}：${items.map((item) => item.name).join("、")}`);
    const found = items.find((item) => item.name === choice || item.id === choice);
    if (found) onPick(found.id);
  };

  const handleSubmit = async () => {
    if (!form.username || !form.password || !form.realName || !form.storeId || !form.departmentId || !form.positionId) {
      alert("请填写完整注册信息");
      return;
    }
    if (form.password.length < 6) {
      alert("密码至少 6 位");
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({
        username: form.username,
        password: form.password,
        realName: form.realName,
        storeId: form.storeId,
        departmentId: form.departmentId,
        positionId: form.positionId,
        remark: form.remark,
      });
      if (result.code === 0) {
        alert("注册申请已提交，请等待管理员审批");
        navigate("/login");
      }
    } catch (error: any) {
      alert(error?.response?.data?.message || "注册提交失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  const renderSelect = (label: string, value: string, onClick: () => void) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>
        {label} <span style={{ color: "#DC2626" }}>*</span>
      </label>
      <div
        onClick={onClick}
        style={{
          width: "100%",
          padding: "12px 14px",
          border: "1.5px solid #E2E8F0",
          borderRadius: 14,
          fontSize: 14,
          background: "#fff",
          color: "#0F172A",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{value}</span>
        <ChevronRight size={16} color="#94A3B8" />
      </div>
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="注册账号" subtitle="提交后需管理员在账号管理中审批，通过后即可登录" />

        <SaaSCard style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={17} color="#059669" /> 基本信息
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>用户名 *</label>
            <SaaSInput placeholder="请输入登录账号" value={form.username} onChange={(username) => setForm((current) => ({ ...current, username }))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>密码 *</label>
            <SaaSInput placeholder="至少 6 位" value={form.password} onChange={(password) => setForm((current) => ({ ...current, password }))} type="password" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>姓名 *</label>
            <SaaSInput placeholder="请输入真实姓名" value={form.realName} onChange={(realName) => setForm((current) => ({ ...current, realName }))} />
          </div>
        </SaaSCard>

        <SaaSCard style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>门店与岗位</div>
          {renderSelect("申请门店", labelMap.store, () =>
            chooseFromList("门店", stores, (storeId) => setForm((current) => ({ ...current, storeId, departmentId: "", positionId: "" })))
          )}
          {renderSelect("申请部门", labelMap.department, () =>
            chooseFromList("部门", departments, (departmentId) => setForm((current) => ({ ...current, departmentId, positionId: "" })))
          )}
          {renderSelect("申请岗位", labelMap.position, () =>
            chooseFromList("岗位", availablePositions, (positionId) => setForm((current) => ({ ...current, positionId })))
          )}
        </SaaSCard>

        <SaaSCard style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>备注</div>
          <SaaSInput placeholder="申请说明，可选" value={form.remark} onChange={(remark) => setForm((current) => ({ ...current, remark }))} />
        </SaaSCard>

        <SaaSButton onClick={handleSubmit} block>
          {submitting ? "提交中..." : "提交注册"}
        </SaaSButton>
      </div>
    </div>
  );
}
