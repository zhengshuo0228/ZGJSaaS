import { useEffect, useState } from "react";
import { SaaSCard, SaaSTab, StatCard, PageTitle, pageStyle, containerStyle, ListItem } from "../../components/saas";
import { getStatsSummary } from "../../api/mockApi";

type StatsSummary = {
  purchase: { total: number; approved: number; rejected: number; pending: number; completionRate: number };
  ingredient: { total: number };
};

const emptyStats: StatsSummary = {
  purchase: { total: 0, approved: 0, rejected: 0, pending: 0, completionRate: 0 },
  ingredient: { total: 0 },
};

const ranges = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
];

export default function PurchaseSummary() {
  const [range, setRange] = useState("today");
  const [stats, setStats] = useState<StatsSummary>(emptyStats);

  useEffect(() => {
    getStatsSummary(range).then((result) => {
      if (result.code === 0) setStats(result.data as StatsSummary);
    });
  }, [range]);

  const activeLabel = ranges.find((item) => item.key === range)?.label || "今天";

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="采购汇总" subtitle="查看申购审核与采购准备概览" />
        <SaaSTab items={ranges.map((item) => item.label)} active={activeLabel} onChange={(label) => setRange(ranges.find((item) => item.label === label)?.key || "today")} />

        <SaaSCard>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <StatCard icon={"📋"} label="申购总数" value={stats.purchase.total} detail={`完成率 ${stats.purchase.completionRate}%`} color="#059669" />
            <StatCard icon={"✅"} label="已通过" value={stats.purchase.approved} detail="可进入采购准备" color="#4F46E5" />
            <StatCard icon={"⏳"} label="待审核" value={stats.purchase.pending} detail="等待管理员处理" color="#D97706" />
            <StatCard icon={"❌"} label="已驳回" value={stats.purchase.rejected} detail="需重新提交" color="#DC2626" />
          </div>
        </SaaSCard>

        <SaaSCard style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#64748B", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>采购准备</div>
          <ListItem title="待采购食材库" subtitle={`当前食材库共 ${stats.ingredient.total} 个食材`} />
          <ListItem title="采购建议" subtitle={stats.purchase.approved > 0 ? "请根据已通过申购单汇总采购" : "暂无已通过申购单"} />
        </SaaSCard>
      </div>
    </div>
  );
}
