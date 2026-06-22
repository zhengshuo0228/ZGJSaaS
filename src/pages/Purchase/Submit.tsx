import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSButton, SaaSTab, SaaSInput } from "../../components/saas";
import { getMenu, submitPurchaseOrder } from "../../api/mockApi";

type MenuItem = {
  id: string;
  category: string;
  subCategory: string;
  supplier?: string;
  name: string;
  defaultQty: number;
  unit: string;
};

type SelectedItem = {
  menuId: string;
  name: string;
  qty: number;
  unit: string;
};

const ALL = "全部";

export default function PurchaseSubmit() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState(ALL);
  const [subCategory, setSubCategory] = useState(ALL);
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [showSelected, setShowSelected] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getMenu().then((result) => {
      if (result.code === 0) setMenu(result.data as MenuItem[]);
    });
  }, []);

  const categories = useMemo(() => [ALL, ...Array.from(new Set(menu.map((item) => item.category))).filter(Boolean)], [menu]);
  const subCategories = useMemo(() => {
    if (category === ALL) return [ALL];
    return [ALL, ...Array.from(new Set(menu.filter((item) => item.category === category).map((item) => item.subCategory))).filter(Boolean)];
  }, [category, menu]);

  const filteredMenu = menu.filter((item) => {
    if (category !== ALL && item.category !== category) return false;
    if (subCategory !== ALL && item.subCategory !== subCategory) return false;
    if (search && !item.name.includes(search)) return false;
    return true;
  });

  const addItem = (item: MenuItem) => {
    setItems((prev) => {
      const existing = prev.find((entry) => entry.menuId === item.id);
      return existing
        ? prev.map((entry) => (entry.menuId === item.id ? { ...entry, qty: entry.qty + item.defaultQty } : entry))
        : [...prev, { menuId: item.id, name: item.name, qty: item.defaultQty, unit: item.unit }];
    });
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((entry) => entry.menuId !== id));
  const updateQty = (id: string, qty: number) => setItems((prev) => prev.map((entry) => (entry.menuId === id ? { ...entry, qty } : entry)));

  const handleSubmit = async () => {
    if (items.length === 0) {
      alert("请先选择食材");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitPurchaseOrder(items.map((item) => ({ menuId: item.menuId, name: item.name, qty: item.qty, unit: item.unit })));
      if (result.code === 0) {
        alert(`申购单已提交，共 ${items.length} 项`);
        setItems([]);
        setShowSelected(false);
      }
    } catch (error: any) {
      alert(error?.response?.data?.message || "提交失败，请重新登录后再试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="申购提交" subtitle="选择食材并填写数量，提交后会生成申购记录和通知" />

        <SaaSInput placeholder="搜索食材名称" value={search} onChange={setSearch} style={{ marginBottom: 12 }} />
        <SaaSTab items={categories} active={category} onChange={(value) => { setCategory(value); setSubCategory(ALL); }} />

        {subCategories.length > 1 ? (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 16 }}>
            {subCategories.map((item) => (
              <div
                key={item}
                onClick={() => setSubCategory(item)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 14,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1.5px solid ${subCategory === item ? "#059669" : "#E2E8F0"}`,
                  background: subCategory === item ? "#ECFDF5" : "#fff",
                  color: subCategory === item ? "#059669" : "#64748B",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        ) : null}

        {items.length > 0 ? (
          <SaaSCard style={{ background: "#ECFDF5", borderColor: "#A7F3D0", marginBottom: 16, cursor: "pointer" }}>
            <div onClick={() => setShowSelected(!showSelected)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={18} color="#059669" />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>已选 {items.length} 项</span>
              </div>
              <div style={{ fontSize: 12, color: "#059669", display: "flex", alignItems: "center", gap: 4 }}>
                {showSelected ? "收起" : "展开"} <ChevronDown size={14} />
              </div>
            </div>
          </SaaSCard>
        ) : null}

        {showSelected && items.length > 0 ? (
          <SaaSCard style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
            {items.map((item) => (
              <div key={item.menuId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid #F1F5F9" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{item.unit}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div onClick={() => updateQty(item.menuId, Math.max(1, item.qty - 1))} style={qtyButtonStyle}><Minus size={12} /></div>
                  <span style={{ width: 38, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{item.qty}</span>
                  <div onClick={() => updateQty(item.menuId, item.qty + 1)} style={{ ...qtyButtonStyle, background: "#059669", color: "#fff", border: "none" }}><Plus size={12} /></div>
                  <div onClick={() => removeItem(item.menuId)} style={{ cursor: "pointer", padding: 4 }}><Trash2 size={16} color="#DC2626" /></div>
                </div>
              </div>
            ))}
          </SaaSCard>
        ) : null}

        <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
          {filteredMenu.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>暂无符合条件的食材</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, padding: 12 }}>
              {filteredMenu.map((menuItem) => {
                const isSelected = items.some((entry) => entry.menuId === menuItem.id);
                return (
                  <div
                    key={menuItem.id}
                    onClick={() => addItem(menuItem)}
                    style={{ padding: 12, borderRadius: 16, background: isSelected ? "#ECFDF5" : "#fff", border: `1.5px solid ${isSelected ? "#A7F3D0" : "#E2E8F0"}`, cursor: "pointer", textAlign: "center", position: "relative" }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", lineHeight: 1.3 }}>{menuItem.name}</div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{menuItem.category} · {menuItem.subCategory}</div>
                    <div style={{ fontSize: 12, color: "#059669", fontWeight: 700, marginTop: 6 }}>{menuItem.defaultQty}{menuItem.unit}</div>
                    {isSelected ? (
                      <div style={{ position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckCircle2 size={10} color="#fff" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </SaaSCard>

        <SaaSButton block onClick={handleSubmit} style={{ marginTop: 20 }}>
          {submitting ? "提交中..." : `确认提交 (${items.length})`}
        </SaaSButton>
      </div>
    </div>
  );
}

const qtyButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "1.5px solid #E2E8F0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  background: "#fff",
};
