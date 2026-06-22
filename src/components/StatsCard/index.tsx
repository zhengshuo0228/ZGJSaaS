import { useEffect, useState } from "react";
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

export default function StatsCard() {
  const [range, setRange] = useState("today");
  const [stats, setStats] = useState<StatsSummary>(emptyStats);

  useEffect(() => {
    getStatsSummary(range).then((result) => {
      if (result.code === 0) setStats(result.data as StatsSummary);
    });
  }, [range]);

  return (
    <div className="pms-card ripple-container" style={{ background: "#22D9AE", marginBottom: 16, borderRadius: 22, padding: 16, boxShadow: "0 10px 30px rgba(15,23,42,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>📊 数据统计</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "today", label: "今天" },
            { key: "yesterday", label: "昨天" },
          ].map((item) => (
            <div
              key={item.key}
              onClick={() => setRange(item.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 12,
                fontSize: 12,
                cursor: "pointer",
                background: range === item.key ? "#fff" : "rgba(255,255,255,0.6)",
                fontWeight: range === item.key ? 700 : 400,
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ background: "rgba(255,255,255,0.86)", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#475569" }}>📋 申购单数</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.purchase.total}</div>
          <div style={{ fontSize: 12, color: "#059669" }}>通过 {stats.purchase.approved}</div>
          <div style={{ fontSize: 12, color: "#D97706" }}>待审 {stats.purchase.pending}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.86)", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#475569" }}>🥬 食材数量</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.ingredient.total}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>通知未读 {stats.notification.unread}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>员工 {stats.account.activeUsers}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.86)", borderRadius: 14, padding: 12, gridColumn: "span 2" }}>
          <div style={{ fontSize: 12, color: "#475569" }}>✅ 申购完成率</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{stats.purchase.completionRate}%</div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            驳回 {stats.purchase.rejected} 单 · 出勤 {stats.schedule.onDuty} 人
          </div>
        </div>
      </div>
    </div>
  );
}
