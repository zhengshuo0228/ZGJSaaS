import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { ChevronRight, Shield } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSTab, ListItem, StatusBadge, EmptyState } from "../../components/saas";
import { getPositions } from "../../api/mockApi";
import type { Position } from "../../types";

const fallbackGroups = [
  {
    group: "厨房组",
    department: "kitchen",
    positions: ["厨师长", "副厨师长", "主配", "炉台", "配菜", "冷菜", "煲档", "洗杀"],
  },
  {
    group: "前厅组",
    department: "dining",
    positions: ["店长", "主管", "收银员", "领班", "服务员", "传菜员"],
  },
];

const permissionLabels: Record<string, string> = {
  purchase_submit: "申购提交",
  purchase_review: "申购审核",
  purchase_summary: "采购汇总",
  purchase_history: "申购记录",
  ingredient_manage: "食材库管理",
  performance_view: "绩效看板",
  performance_apply: "绩效申请",
  performance_review: "绩效审核",
  performance_manage: "绩效管理",
  schedule_view: "考勤排休",
  schedule_manage: "排休管理",
  account_manage: "账号管理",
  account_create: "新建账号",
  registration_approve: "注册审批",
  authorization_manage: "授权管理",
  position_manage: "岗位管理",
};

export default function AdminPosition() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [group, setGroup] = useState("厨房组");

  useEffect(() => {
    getPositions().then((result) => {
      if (result.code === 0) setPositions(Array.isArray(result.data) ? result.data : []);
    });
  }, []);

  const groups = useMemo(() => {
    const kitchen = positions.filter((item) => item.department === "kitchen").sort((a, b) => a.rank - b.rank);
    const dining = positions.filter((item) => item.department === "dining").sort((a, b) => a.rank - b.rank);
    return [
      { group: "厨房组", department: "kitchen", positions: kitchen },
      { group: "前厅组", department: "dining", positions: dining },
    ];
  }, [positions]);

  const selectedGroup = groups.find((item) => item.group === group) || groups[0];
  const fallbackGroup = fallbackGroups.find((item) => item.group === group) || fallbackGroups[0];
  const selectedPositions = selectedGroup.positions.length > 0 ? selectedGroup.positions : fallbackGroup.positions.map((name, index) => ({
    id: `${fallbackGroup.department}_${index}`,
    name,
    department: fallbackGroup.department as Position["department"],
    isPreset: true,
    rank: index + 1,
    permissions: {},
    adminPermissions: [],
    createdAt: "",
  }));
  const permissions = Array.from(
    new Set(selectedPositions.flatMap((position) => Object.values(position.permissions || {}).flat() as string[]))
  );

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="岗位管理" subtitle="岗位是权限载体；注册默认单岗，管理员可在账号管理中调整岗位。" />
        <SaaSTab items={groups.map((item) => item.group)} active={group} onChange={setGroup} />

        <SaaSCard style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          <div style={sectionHeaderStyle}>{selectedGroup.group}</div>
          {selectedPositions.length === 0 ? <EmptyState icon="🧑‍🍳" text="暂无岗位" /> : selectedPositions.map((position) => (
            <ListItem
              key={position.id}
              title={position.name}
              subtitle={`岗位层级 ${position.rank} · ${position.isPreset ? "系统预设" : "自定义岗位"}`}
              right={
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {position.adminPermissions.length > 0 ? <StatusBadge text="管理岗" type="warning" /> : null}
                  <Shield size={14} color="#94A3B8" />
                  <ChevronRight size={16} color="#94A3B8" />
                </div>
              }
            />
          ))}
        </SaaSCard>

        <SaaSCard>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>权限分类 - {selectedGroup.group}</div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12, lineHeight: 1.6 }}>展示当前岗位组已配置的功能权限。权限编辑后续会继续扩展为矩阵配置。</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(permissions.length > 0 ? permissions : Object.keys(permissionLabels).slice(0, 8)).map((perm, index) => (
              <StatusBadge key={perm} text={permissionLabels[perm] || perm} type={index % 3 === 0 ? "success" : index % 3 === 1 ? "info" : "warning"} />
            ))}
          </div>
        </SaaSCard>
      </div>
    </div>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  fontWeight: 700,
  color: "#64748B",
  background: "#F8FAFC",
  borderBottom: "1px solid #E2E8F0",
};
