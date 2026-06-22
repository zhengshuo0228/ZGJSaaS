import { useEffect, useState } from "react";
import { ChevronRight, Store, Users } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSTab, ListItem, StatusBadge, SaaSButton } from "../../components/saas";
import { getAdminUsers, getDepartments, getStores } from "../../api/mockApi";
import type { Department, Store as StoreType, User } from "../../types";

export default function AdminAuth() {
  const [tab, setTab] = useState("跨部门授权");
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const tabs = ["跨部门授权", "跨门店授权"];

  useEffect(() => {
    Promise.all([getAdminUsers(), getStores(), getDepartments()]).then(([userResult, storeResult, departmentResult]) => {
      if (userResult.code === 0) setUsers(userResult.data as User[]);
      if (storeResult.code === 0) setStores(storeResult.data as StoreType[]);
      if (departmentResult.code === 0) setDepartments(departmentResult.data as Department[]);
    });
  }, []);

  const sampleUser = users.find((user) => user.username !== "000") || users[0];
  const sourceDepartment = departments.find((item) => item.id === sampleUser?.departmentId);
  const targetDepartment = departments.find((item) => item.id !== sampleUser?.departmentId && item.storeId === sampleUser?.storeId);
  const targetStore = stores.find((item) => item.id !== sampleUser?.storeId);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="授权管理" subtitle="管理跨部门与跨门店访问权限，默认员工只看本门店本部门数据" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />

        {tab === "跨部门授权" ? (
          <>
            <SaaSCard style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={16} color="#059669" /> 新建跨部门授权
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={selectBoxStyle}>{sampleUser ? `${sampleUser.realName}（${sampleUser.username}）` : "暂无可选员工"}</div>
                <div style={selectBoxStyle}>{targetDepartment ? `目标部门：${targetDepartment.name}` : "请选择目标部门"}</div>
                <SaaSButton onClick={() => alert("跨部门授权接口后续接入；当前已保留页面入口和权限展示")} block>
                  创建授权
                </SaaSButton>
              </div>
            </SaaSCard>

            <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
              <div style={sectionHeaderStyle}>授权列表</div>
              {sampleUser ? (
                <ListItem
                  title={sampleUser.realName}
                  subtitle={`${sourceDepartment?.name || "本部门"} → ${targetDepartment?.name || "目标部门"}`}
                  right={
                    <>
                      <StatusBadge text="示例" type="info" />
                      <ChevronRight size={16} color="#94A3B8" />
                    </>
                  }
                />
              ) : (
                <ListItem title="暂无员工数据" subtitle="创建账号后可在这里维护跨部门访问权限" />
              )}
            </SaaSCard>
          </>
        ) : (
          <>
            <SaaSCard style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Store size={16} color="#4F46E5" /> 新建跨门店授权
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={selectBoxStyle}>{sampleUser ? `${sampleUser.realName}（${sampleUser.username}）` : "暂无可选员工"}</div>
                <div style={selectBoxStyle}>{targetStore ? `目标门店：${targetStore.name}` : "请选择目标门店"}</div>
                <SaaSButton onClick={() => alert("跨门店授权仅超级管理员可操作，接口后续接入")} block>
                  创建授权
                </SaaSButton>
              </div>
            </SaaSCard>

            <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
              <div style={sectionHeaderStyle}>授权列表</div>
              <ListItem
                title="跨门店权限"
                subtitle="仅超级管理员可维护；有多门店权限时首页显示门店切换器"
                right={
                  <>
                    <StatusBadge text="超管" type="warning" />
                    <ChevronRight size={16} color="#94A3B8" />
                  </>
                }
              />
            </SaaSCard>
          </>
        )}
      </div>
    </div>
  );
}

const selectBoxStyle: React.CSSProperties = {
  padding: "12px 14px",
  border: "1.5px solid #E2E8F0",
  borderRadius: 14,
  color: "#64748B",
  background: "#F8FAFC",
  fontSize: 14,
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  fontWeight: 700,
  color: "#64748B",
  background: "#F8FAFC",
  borderBottom: "1px solid #E2E8F0",
};
