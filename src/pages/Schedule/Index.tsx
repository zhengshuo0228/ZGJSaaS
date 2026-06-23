import { useEffect, useState } from "react";
import type React from "react";
import { Toast } from "antd-mobile";
import { CalendarPlus, Clock, Users } from "lucide-react";
import { createScheduleRecord, getScheduleAttendance, getScheduleMonthly } from "../../api/mockApi";
import { pageStyle, containerStyle, PageTitle, SaaSButton, SaaSCard, SaaSFormField, SaaSInput, SaaSTab, ListItem, StatusBadge, StatCard, EmptyState } from "../../components/saas";

type ScheduleRecord = {
  id: string;
  date: string;
  type: string;
  status: string;
  remark?: string;
  user?: { realName?: string };
};

const tabs = ["考勤", "月度排休", "排休管理"];

export default function SchedulePage() {
  const [tab, setTab] = useState("考勤");
  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [attendance, setAttendance] = useState({ onDuty: 0, onLeave: 0 });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("休假");
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const [monthlyResult, attendanceResult] = await Promise.all([getScheduleMonthly(), getScheduleAttendance()]);
    if (monthlyResult.code === 0) setRecords(Array.isArray(monthlyResult.data) ? monthlyResult.data : []);
    if (attendanceResult.code === 0) {
      const data = attendanceResult.data as { onDuty?: number; onLeave?: number };
      setAttendance({ onDuty: Number(data.onDuty || 0), onLeave: Number(data.onLeave || 0) });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    if (!date) return Toast.show({ content: "请选择日期" });
    setLoading(true);
    try {
      const result = await createScheduleRecord({ date, type, remark });
      if (result.code === 0) {
        Toast.show({ content: "排休记录已保存", icon: "success" });
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
        <PageTitle title="考勤排休" subtitle="考勤记录、月度排休与排休管理" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />

        {tab === "考勤" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <StatCard icon={<Users size={18} />} label="今日出勤" value={attendance.onDuty} color="#059669" />
              <StatCard icon={<Clock size={18} />} label="休假人数" value={attendance.onLeave} color="#8B5CF6" />
            </div>
            <ScheduleList records={records.slice(0, 8)} emptyText="暂无考勤排休记录" />
          </>
        )}

        {tab === "月度排休" && (
          <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
            <div style={sectionHeaderStyle}>本月排休表</div>
            <ScheduleListInner records={records} emptyText="暂无月度排休记录" />
          </SaaSCard>
        )}

        {tab === "排休管理" && (
          <>
            <SaaSCard style={{ marginBottom: 12 }}>
              <div style={sectionTitleStyle}>
                <CalendarPlus size={16} color="#059669" /> 新增排休记录
              </div>
              <SaaSFormField label="日期">
                <SaaSInput placeholder="选择日期" value={date} onChange={setDate} type="date" />
              </SaaSFormField>
              <SaaSFormField label="类型">
                <select value={type} onChange={(event) => setType(event.target.value)} style={selectStyle}>
                  <option value="休假">休假</option>
                  <option value="出勤">出勤</option>
                  <option value="病假">病假</option>
                  <option value="事假">事假</option>
                </select>
              </SaaSFormField>
              <SaaSFormField label="备注">
                <SaaSInput placeholder="选填" value={remark} onChange={setRemark} />
              </SaaSFormField>
              <SaaSButton onClick={handleCreate} block style={{ opacity: loading ? 0.7 : 1 }}>保存排休</SaaSButton>
            </SaaSCard>
            <SaaSCard>
              <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>管理员调整排休后，会自动通知相关员工。</div>
            </SaaSCard>
          </>
        )}
      </div>
    </div>
  );
}

function ScheduleList({ records, emptyText }: { records: ScheduleRecord[]; emptyText: string }) {
  return (
    <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
      <ScheduleListInner records={records} emptyText={emptyText} />
    </SaaSCard>
  );
}

function ScheduleListInner({ records, emptyText }: { records: ScheduleRecord[]; emptyText: string }) {
  const safeRecords = Array.isArray(records) ? records : [];
  if (safeRecords.length === 0) return <EmptyState icon="📅" text={emptyText} />;
  return (
    <>
      {safeRecords.map((record) => {
        const badgeType = record.type === "休假" || record.type === "病假" || record.type === "事假" ? "info" : "success";
        return (
          <ListItem
            key={record.id}
            title={`${formatDate(record.date)} · ${record.user?.realName || "未命名员工"}`}
            subtitle={record.remark ? `${record.type} · ${record.remark}` : record.type}
            right={<StatusBadge text={record.type} type={badgeType} />}
          />
        );
      })}
    </>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const sectionHeaderStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#64748B", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" };
const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 };
const selectStyle: React.CSSProperties = { width: "100%", height: 45, border: "1.5px solid #E2E8F0", borderRadius: 14, padding: "0 12px", background: "#fff", color: "#0F172A", fontSize: 14 };
