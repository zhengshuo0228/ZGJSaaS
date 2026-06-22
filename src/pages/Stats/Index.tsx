import { useEffect, useState } from "react";
import { SaaSTab, StatCard, pageStyle, containerStyle, PageTitle, SaaSCard, ListItem } from "../../components/saas";
import { BarChart3, Bell, ShoppingCart, Sprout, Users } from "lucide-react";
import { getStatsSummary } from "../../api/mockApi";

type StatsSummary = {
  purchase: { total: number; approved: number; rejected: number; pending: number; completionRate: number };
  ingredient: { total: number };
  account: { activeUsers: number };
  notification: { unread: number };
  performance: { applied: number; approved: number };
  schedule: { onLeave: number; onDuty: number };
};

const emptyStats: StatsSummary = {
  purchase: { total: 0, approved: 0, rejected: 0, pending: 0, completionRate: 0 },
  ingredient: { total: 0 },
  account: { activeUsers: 0 },
  notification: { unread: 0 },
  performance: { applied: 0, approved: 0 },
  schedule: { onLeave: 0, onDuty: 0 },
};

const rangeOptions = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "week", label: "近7天" },
  { key: "month", label: "本月" },
];

export default function StatsPage() {
  const [range, setRange] = useState("today");
  const [stats, setStats] = useState<StatsSummary>(emptyStats);

  useEffect(() => {
    getStatsSummary(range).then((result) => {
      if (result.code === 0) setStats(result.data as StatsSummary);
    });
  }, [range]);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="数据统计" subtitle="查看门店申购、食材、员工与通知概览" />
        <SaaSTab items={rangeOptions.map((item) => item.label)} active={rangeOptions.find((item) => item.key === range)?.label || "今天"} onChange={(label) => setRange(rangeOptions.find((item) => item.label === label)?.key || "today")} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
          <StatCard icon={<ShoppingCart size={18} />} label="申购单数" value={stats.purchase.total} detail={`通过 ${stats.purchase.approved} · 待审 ${stats.purchase.pending}`} color="#059669" />
          <StatCard icon={<BarChart3 size={18} />} label="完成率" value={`${stats.purchase.completionRate}%`} detail={`驳回 ${stats.purchase.rejected}`} color="#6366F1" />
          <StatCard icon={<Sprout size={18} />} label="食材数量" value={stats.ingredient.total} detail="食材库总数" color="#D97706" />
          <StatCard icon={<Users size={18} />} label="员工数量" value={stats.account.activeUsers} detail={`出勤参考 ${stats.schedule.onDuty}`} color="#8B5CF6" />
        </div>

        <SaaSCard style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#64748B", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>运营概览</div>
          <ListItem title="申购审核状态" subtitle={`通过 ${stats.purchase.approved} · 待审 ${stats.purchase.pending} · 驳回 ${stats.purchase.rejected}`} right={<span style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{stats.purchase.total} 单</span>} />
          <ListItem title="未读通知" subtitle="当前账号相关通知" right={<span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 700, color: "#D97706" }}><Bell size={14} />{stats.notification.unread}</span>} />
          <ListItem title="绩效/排休" subtitle={`绩效申请 ${stats.performance.applied} · 请休 ${stats.schedule.onLeave}`} right={<span style={{ fontSize: 14, fontWeight: 700, color: "#64748B" }}>待接入</span>} />
        </SaaSCard>
      </div>
    </div>
  );
}
