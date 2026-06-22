import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSInput, SaaSButton, SaaSTab, ListItem, StatusBadge } from "../../components/saas";

export default function AdminAccount() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("账号列表");
  const tabs = ["账号列表", "新建账号", "注册审批", "授权管理"];

  const accounts = (
    <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
      {[
        { name: "管理员", user: "admin", role: "厨师长" },
        { name: "测试员工", user: "user", role: "炉台" },
        { name: "系统超管", user: "000", role: "超级管理员" },
      ].map((item) => (
        <ListItem key={item.user} title={item.name} subtitle={`${item.user} · ${item.role}`} right={<><StatusBadge text="正常" type="success" /><ChevronRight size={16} color="#94A3B8" /></>} />
      ))}
    </SaaSCard>
  );

  const create = (
    <SaaSCard>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>新建账号</div>
      {["门店", "部门"].map((label) => (
        <div key={label} style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>{label}</label>
          <SaaSInput placeholder={`请选择${label}`} value="" onChange={() => {}} />
        </div>
      ))}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>账号名</label>
        <SaaSInput placeholder="请输入账号名" value="" onChange={() => {}} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>密码</label>
        <SaaSInput placeholder="初始密码" value="" onChange={() => {}} type="password" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>姓名</label>
        <SaaSInput placeholder="真实姓名" value="" onChange={() => {}} />
      </div>
      <SaaSButton onClick={() => alert("账号创建成功")} block>
        创建账号
      </SaaSButton>
    </SaaSCard>
  );

  const approval = (
    <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
      <ListItem
        title="注册审批"
        subtitle="查看首页注册申请，通过后员工即可登录"
        right={<><StatusBadge text="去处理" type="warning" /><ChevronRight size={16} color="#94A3B8" /></>}
      />
      <div style={{ padding: "0 16px 16px" }}>
        <SaaSButton onClick={() => navigate("/admin/registration")} block>
          打开注册审批
        </SaaSButton>
      </div>
    </SaaSCard>
  );

  const auth = (
    <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#64748B", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>授权管理</div>
      <ListItem title="跨部门授权" subtitle="门店管理员及以上可设置" right={<ChevronRight size={16} color="#94A3B8" />} />
      <ListItem title="跨门店授权" subtitle="仅超级管理员可设置" right={<ChevronRight size={16} color="#94A3B8" />} />
    </SaaSCard>
  );

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="账号管理" subtitle="管理员维护门店员工账号与权限" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />
        {tab === "账号列表" && accounts}
        {tab === "新建账号" && create}
        {tab === "注册审批" && approval}
        {tab === "授权管理" && auth}
      </div>
    </div>
  );
}
