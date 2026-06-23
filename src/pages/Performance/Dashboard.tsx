import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Toast } from "antd-mobile";
import { Award, CheckCircle2, Plus, Settings, TrendingUp } from "lucide-react";
import { createPerformanceRecord, getAllPerformance, getMyPerformance, getPendingPerformance, getPerformanceRanking } from "../../api/mockApi";
import { pageStyle, containerStyle, PageTitle, SaaSButton, SaaSCard, SaaSFormField, SaaSInput, SaaSTab, StatCard, ListItem, StatusBadge, EmptyState } from "../../components/saas";

type PerformanceRecord = {
  id: string;
  title: string;
  type: string;
  points: number;
  status: string;
  remark?: string;
  createdAt: string;
  user?: { realName?: string };
};

type RankingItem = {
  user?: { realName?: string };
  score: number;
};

const tabs = ["我的绩效", "全员记录", "积分排行", "待审核", "绩效管理"];

export default function PerformanceDashboard() {
  const [tab, setTab] = useState("我的绩效");
  const [myTotal, setMyTotal] = useState(0);
  const [myRecords, setMyRecords] = useState<PerformanceRecord[]>([]);
  const [allRecords, setAllRecords] = useState<PerformanceRecord[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [pending, setPending] = useState<PerformanceRecord[]>([]);
  const [title, setTitle] = useState("食材节约");
  const [type, setType] = useState("加分");
  const [points, setPoints] = useState("1");
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const [myResult, allResult, rankingResult, pendingResult] = await Promise.all([
      getMyPerformance(),
      getAllPerformance(),
      getPerformanceRanking(),
      getPendingPerformance(),
    ]);
    if (myResult.code === 0) {
      const data = myResult.data as { total?: number; records?: PerformanceRecord[] };
      setMyTotal(Number(data.total || 0));
      setMyRecords(Array.isArray(data.records) ? data.records : []);
    }
    if (allResult.code === 0) setAllRecords(Array.isArray(allResult.data) ? allResult.data : []);
    if (rankingResult.code === 0) setRanking(Array.isArray(rankingResult.data) ? rankingResult.data : []);
    if (pendingResult.code === 0) setPending(Array.isArray(pendingResult.data) ? pendingResult.data : []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const monthLevel = useMemo(() => {
    if (myTotal >= 100) return "A";
    if (myTotal >= 60) return "B";
    if (myTotal >= 20) return "C";
    return "D";
  }, [myTotal]);

  const handleCreate = async () => {
    if (!title.trim()) return Toast.show({ content: "请填写绩效事项" });
    const parsedPoints = Number(points);
    if (!Number.isFinite(parsedPoints)) return Toast.show({ content: "积分格式不正确" });

    setLoading(true);
    try {
      const result = await createPerformanceRecord({ title: title.trim(), type, points: parsedPoints, remark });
      if (result.code === 0) {
        Toast.show({ content: "绩效记录已保存", icon: "success" });
        setRemark("");
        await loadData();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="绩效看板" subtitle="绩效记录、积分排行、待审核与绩效管理" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />

        {tab === "我的绩效" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <StatCard icon={<Award size={18} />} label="当前积分" value={myTotal} color="#059669" />
              <StatCard icon={<TrendingUp size={18} />} label="本月评级" value={monthLevel} color="#4F46E5" />
            </div>
            <RecordList records={myRecords} emptyText="暂无绩效记录" />
          </>
        )}

        {tab === "全员记录" && <RecordList records={allRecords} showUser emptyText="暂无全员记录" />}

        {tab === "积分排行" && (
          <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
            {ranking.length === 0 ? <EmptyState icon="🏅" text="暂无排行数据" /> : ranking.map((item, index) => (
              <ListItem
                key={`${item.user?.realName || "员工"}-${index}`}
                title={`${index + 1}. ${item.user?.realName || "未命名员工"}`}
                subtitle="已审核绩效积分"
                right={<span style={{ fontWeight: 800, color: "#059669" }}>{item.score} 分</span>}
              />
            ))}
          </SaaSCard>
        )}

        {tab === "待审核" && <RecordList records={pending} showUser emptyText="暂无待审核记录" pending />}

        {tab === "绩效管理" && (
          <>
            <SaaSCard style={{ marginBottom: 12 }}>
              <div style={sectionTitleStyle}>
                <Settings size={16} color="#4F46E5" /> 新增绩效记录
              </div>
              <SaaSFormField label="绩效事项">
                <SaaSInput placeholder="例如：食材节约" value={title} onChange={setTitle} />
              </SaaSFormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <SaaSFormField label="类型">
                  <select value={type} onChange={(event) => setType(event.target.value)} style={selectStyle}>
                    <option value="加分">加分</option>
                    <option value="扣分">扣分</option>
                  </select>
                </SaaSFormField>
                <SaaSFormField label="积分">
                  <SaaSInput placeholder="积分" value={points} onChange={setPoints} type="number" />
                </SaaSFormField>
              </div>
              <SaaSFormField label="备注">
                <SaaSInput placeholder="选填" value={remark} onChange={setRemark} />
              </SaaSFormField>
              <SaaSButton onClick={handleCreate} block style={{ opacity: loading ? 0.7 : 1 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={16} /> 保存记录</span>
              </SaaSButton>
            </SaaSCard>
            <SaaSCard>
              <div style={sectionTitleStyle}>
                <CheckCircle2 size={16} color="#059669" /> 记录调整
              </div>
              <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>管理员调整绩效后，会自动通知相关员工。</div>
            </SaaSCard>
          </>
        )}
      </div>
    </div>
  );
}

function RecordList({ records, showUser, emptyText, pending }: { records: PerformanceRecord[]; showUser?: boolean; emptyText: string; pending?: boolean }) {
  const safeRecords = Array.isArray(records) ? records : [];
  return (
    <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
      {safeRecords.length === 0 ? <EmptyState icon="📋" text={emptyText} /> : safeRecords.map((record) => {
        const valueStyle = record.points >= 0 ? scorePlus : scoreMinus;
        const statusType = record.status === "approved" ? "success" : record.status === "rejected" ? "danger" : "warning";
        const userName = showUser ? `${record.user?.realName || "未命名员工"} · ` : "";
        return (
          <ListItem
            key={record.id}
            title={`${userName}${record.title}`}
            subtitle={`${record.type} · ${formatDate(record.createdAt)}${record.remark ? ` · ${record.remark}` : ""}`}
            right={<>{pending ? <StatusBadge text="待审核" type="warning" /> : <StatusBadge text={record.status === "approved" ? "已通过" : record.status} type={statusType} />}<span style={valueStyle}>{record.points >= 0 ? "+" : ""}{record.points}</span></>}
          />
        );
      })}
    </SaaSCard>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 };
const scorePlus: React.CSSProperties = { color: "#059669", fontWeight: 800, fontSize: 14 };
const scoreMinus: React.CSSProperties = { color: "#DC2626", fontWeight: 800, fontSize: 14 };
const selectStyle: React.CSSProperties = { width: "100%", height: 45, border: "1.5px solid #E2E8F0", borderRadius: 14, padding: "0 12px", background: "#fff", color: "#0F172A", fontSize: 14 };
