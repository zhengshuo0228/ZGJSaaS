import { useState } from "react";
import { Award, CheckCircle2, Settings, TrendingUp } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSTab, StatCard, ListItem, StatusBadge } from "../../components/saas";

export default function PerformanceDashboard() {
  const [tab, setTab] = useState("我的绩效");
  const tabs = ["我的绩效", "全员记录", "积分排行", "待审核", "绩效管理"];

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="绩效看板" subtitle="绩效记录、申请、审核与管理概览" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />

        {tab === "我的绩效" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <StatCard icon={<Award size={18} />} label="当前积分" value="128" color="#059669" />
              <StatCard icon={<TrendingUp size={18} />} label="本月评级" value="A" color="#4F46E5" />
            </div>
            <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
              <ListItem title="食材节约" subtitle="节约蔬菜类 5 斤" right={<span style={{ color: "#059669", fontWeight: 700, fontSize: 14 }}>+10</span>} />
              <ListItem title="按时到岗" subtitle="本月 22 天全勤" right={<span style={{ color: "#059669", fontWeight: 700, fontSize: 14 }}>+22</span>} />
              <ListItem title="卫生检查" subtitle="不合格，需整改" right={<span style={{ color: "#DC2626", fontWeight: 700, fontSize: 14 }}>-5</span>} />
            </SaaSCard>
          </>
        )}

        {tab === "全员记录" && (
          <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
            {[
              { name: "张三", dept: "厨房", score: "128", level: "A" },
              { name: "李四", dept: "厨房", score: "105", level: "B" },
            ].map((item) => (
              <ListItem key={item.name} title={item.name} subtitle={`${item.dept} · 积分 ${item.score}`} right={<StatusBadge text={`评级 ${item.level}`} type={item.level === "A" ? "success" : "info"} />} />
            ))}
          </SaaSCard>
        )}

        {tab === "积分排行" && (
          <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
            {[
              { rank: 1, name: "张三", score: 128 },
              { rank: 2, name: "王五", score: 115 },
              { rank: 3, name: "李四", score: 105 },
            ].map((item) => (
              <ListItem key={item.name} title={`${item.rank}. ${item.name}`} subtitle={`积分 ${item.score}`} right={<span style={{ fontWeight: 700, color: "#059669" }}>{item.score} 分</span>} />
            ))}
          </SaaSCard>
        )}

        {tab === "待审核" && (
          <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
            <ListItem title="张三 · 绩效申请" subtitle="食材节约 3 斤 · 2026-06-10" right={<><StatusBadge text="待审核" type="warning" /><span style={{ marginLeft: 8, cursor: "pointer", color: "#059669", fontWeight: 700, fontSize: 13 }}>审核</span></>} />
            <ListItem title="李四 · 绩效申请" subtitle="迟到 2 次 · 2026-06-09" right={<><StatusBadge text="待审核" type="warning" /><span style={{ marginLeft: 8, cursor: "pointer", color: "#059669", fontWeight: 700, fontSize: 13 }}>审核</span></>} />
          </SaaSCard>
        )}

        {tab === "绩效管理" && (
          <>
            <SaaSCard style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <Settings size={16} color="#4F46E5" /> 预设管理
              </div>
              {[
                { name: "食材节约", type: "加分", value: "+10" },
                { name: "按时到岗", type: "加分", value: "+1" },
                { name: "卫生检查不合格", type: "扣分", value: "-5" },
                { name: "迟到早退", type: "扣分", value: "-3" },
              ].map((item) => (
                <ListItem key={item.name} title={item.name} subtitle={`${item.type} · 默认 ${item.value}`} right={<StatusBadge text={item.type} type={item.type === "加分" ? "success" : "danger"} />} />
              ))}
            </SaaSCard>
            <SaaSCard>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={16} color="#059669" /> 记录调整
              </div>
              <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
                管理员可对员工绩效记录进行手动调整；深度功能后续接入数据库和通知。
              </div>
            </SaaSCard>
          </>
        )}
      </div>
    </div>
  );
}
