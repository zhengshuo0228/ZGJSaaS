import { useEffect, useState } from "react";
import { SaaSCard, SaaSTab, SaaSButton, SaaSOutlineButton, EmptyState, StatusBadge, pageStyle, containerStyle, PageTitle } from "../../components/saas";
import { getOrders, reviewPurchaseOrder } from "../../api/mockApi";

type PurchaseOrder = {
  id: string;
  status: "pending" | "approved" | "rejected" | string;
  createdAt: string;
  user?: { realName?: string };
  items: Array<{ name: string; qty: number; unit: string }>;
};

export default function PurchaseReview() {
  const [tab, setTab] = useState("待审核");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const tabs = ["待审核", "已审核", "操作日志"];

  const reload = async () => {
    setLoading(true);
    try {
      const result = await getOrders();
      if (result.code === 0) setOrders(result.data as PurchaseOrder[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const pendingOrders = orders.filter((order) => order.status === "pending");
  const reviewedOrders = orders.filter((order) => order.status !== "pending");

  const itemSummary = (order: PurchaseOrder) => order.items.map((item) => `${item.name} ${item.qty}${item.unit}`).join("，");

  const handleReview = async (id: string, approved: boolean) => {
    if (!confirm(approved ? "确认通过该申购单？" : "确认驳回该申购单？")) return;
    try {
      await reviewPurchaseOrder(id, approved);
      await reload();
      alert(approved ? "已通过申购单" : "已驳回申购单");
    } catch (error: any) {
      alert(error?.response?.data?.message || "审核失败，请稍后再试");
    }
  };

  const renderOrder = (order: PurchaseOrder, showActions: boolean) => {
    const status = order.status === "approved"
      ? { text: "已通过", type: "success" as const }
      : order.status === "rejected"
        ? { text: "已驳回", type: "danger" as const }
        : { text: "待审核", type: "warning" as const };

    return (
      <SaaSCard key={order.id} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{order.id.slice(-8)}</span>
          <StatusBadge text={status.text} type={status.type} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{order.user?.realName || "未知员工"}</div>
        <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>{itemSummary(order)}</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>{new Date(order.createdAt).toLocaleString()}</div>
        {showActions ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <SaaSOutlineButton onClick={() => handleReview(order.id, false)} style={{ color: "#DC2626" }}>驳回</SaaSOutlineButton>
            <SaaSButton onClick={() => handleReview(order.id, true)}>通过</SaaSButton>
          </div>
        ) : null}
      </SaaSCard>
    );
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="申购审核" subtitle="审核门店员工提交的食材申购单" />
        <SaaSTab items={tabs} active={tab} onChange={setTab} />

        {loading ? <SaaSCard><EmptyState icon="⏳" text="加载中..." /></SaaSCard> : null}

        {!loading && tab === "待审核" && (
          pendingOrders.length === 0 ? (
            <SaaSCard><EmptyState icon="📋" text="暂无待审核申购" /></SaaSCard>
          ) : pendingOrders.map((order) => renderOrder(order, true))
        )}

        {!loading && tab === "已审核" && (
          reviewedOrders.length === 0 ? (
            <SaaSCard><EmptyState icon="📭" text="暂无已审核申购" /></SaaSCard>
          ) : reviewedOrders.map((order) => renderOrder(order, false))
        )}

        {!loading && tab === "操作日志" && (
          reviewedOrders.length === 0 ? (
            <SaaSCard><EmptyState icon="📝" text="暂无操作日志" /></SaaSCard>
          ) : reviewedOrders.map((order) => (
            <SaaSCard key={`log_${order.id}`} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
                {new Date(order.createdAt).toLocaleString()} · {order.user?.realName || "未知员工"} 的申购单已{order.status === "approved" ? "通过" : "驳回"}
              </div>
            </SaaSCard>
          ))
        )}
      </div>
    </div>
  );
}
