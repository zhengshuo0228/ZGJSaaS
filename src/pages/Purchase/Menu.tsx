import { useEffect, useMemo, useRef, useState } from "react";
import { pageStyle, containerStyle, PageTitle, SaaSCard, SaaSTab, SaaSInput, SaaSButton, SaaSOutlineButton, EmptyState } from "../../components/saas";
import { getMenu, getMenuTemplateUrl, uploadMenuItems } from "../../api/mockApi";

type MenuItem = {
  id: string;
  category: string;
  subCategory: string;
  name: string;
  defaultQty: number;
  unit: string;
};

type ParsedRow = Omit<MenuItem, "id"> & {
  row: number;
  valid: boolean;
  error?: string;
};

const ALL = "全部";

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  return lines.slice(1).map((line, index) => {
    const [category = "", subCategory = "", name = "", qty = "0", unit = "斤"] = parseCsvLine(line);
    const defaultQty = Number(qty);
    const errors = [];
    if (!category.trim()) errors.push("分类为空");
    if (!name.trim()) errors.push("品名为空");
    if (!Number.isFinite(defaultQty) || defaultQty < 0) errors.push("默认数量格式错误");
    return {
      row: index + 2,
      category: category.trim(),
      subCategory: subCategory.trim(),
      name: name.trim(),
      defaultQty: Number.isFinite(defaultQty) ? defaultQty : 0,
      unit: unit.trim() || "斤",
      valid: errors.length === 0,
      error: errors.join("，"),
    };
  });
}

export default function PurchaseMenu() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState(ALL);
  const [subCategory, setSubCategory] = useState(ALL);
  const [search, setSearch] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const reload = async () => {
    const result = await getMenu();
    if (result.code === 0) setMenu(result.data as MenuItem[]);
  };

  useEffect(() => {
    reload();
  }, []);

  const categories = useMemo(() => [ALL, ...Array.from(new Set(menu.map((item) => item.category))).filter(Boolean)], [menu]);
  const subCategories = useMemo(() => {
    if (category === ALL) return [ALL];
    return [ALL, ...Array.from(new Set(menu.filter((item) => item.category === category).map((item) => item.subCategory))).filter(Boolean)];
  }, [category, menu]);

  const filtered = menu.filter((item) => {
    if (category !== ALL && item.category !== category) return false;
    if (subCategory !== ALL && item.subCategory !== subCategory) return false;
    if (search && !item.name.includes(search)) return false;
    return true;
  });

  const validRows = parsedRows.filter((row) => row.valid);
  const invalidRows = parsedRows.filter((row) => !row.valid);
  const duplicateNames = Array.from(new Set(validRows.map((row) => row.name).filter((name, index, arr) => arr.indexOf(name) !== index)));

  const handleTemplateDownload = () => {
    const link = document.createElement("a");
    link.href = getMenuTemplateUrl();
    link.download = "食材库模板.csv";
    link.click();
  };

  const handleFileChange = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setParsedRows(parseCsv(text));
  };

  const handleUpload = async () => {
    if (validRows.length === 0) {
      alert("没有可上传的数据");
      return;
    }
    if (invalidRows.length > 0) {
      alert("存在格式错误，请修正后再上传");
      return;
    }

    setUploading(true);
    try {
      const result = await uploadMenuItems(validRows.map(({ category, subCategory, name, defaultQty, unit }) => ({ category, subCategory, name, defaultQty, unit })));
      if (result.code === 0) {
        alert(`上传成功，共处理 ${result.data.count} 条食材`);
        setParsedRows([]);
        if (fileRef.current) fileRef.current.value = "";
        await reload();
      }
    } catch (error: any) {
      const errors = error?.response?.data?.data?.errors;
      alert(errors?.join("\n") || error?.response?.data?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PageTitle title="食材库" subtitle="维护可申购食材，支持模板下载和 CSV 批量上传" />

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <SaaSOutlineButton onClick={handleTemplateDownload}>下载模板</SaaSOutlineButton>
          <SaaSButton onClick={() => fileRef.current?.click()} style={{ background: "#fff", color: "#334155", border: "1.5px solid #E2E8F0" }}>
            批量上传
          </SaaSButton>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(event) => handleFileChange(event.target.files?.[0])} />
        </div>

        {parsedRows.length > 0 ? (
          <SaaSCard style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>上传预览</div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>共 {parsedRows.length} 条，正确 {validRows.length} 条，错误 {invalidRows.length} 条</div>
              </div>
              <SaaSButton onClick={handleUpload} style={{ padding: "9px 14px" }}>
                {uploading ? "上传中..." : "确认上传"}
              </SaaSButton>
            </div>
            {duplicateNames.length > 0 ? <div style={{ fontSize: 12, color: "#D97706", marginBottom: 8 }}>重复品名将按最后一条更新：{duplicateNames.join("、")}</div> : null}
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {parsedRows.slice(0, 20).map((row) => (
                <div key={row.row} style={{ fontSize: 12, color: row.valid ? "#059669" : "#DC2626", padding: "6px 0", borderBottom: "1px solid #F1F5F9" }}>
                  {row.valid ? "✅" : "❌"} 第 {row.row} 行：{row.name || "未填写品名"} {row.defaultQty}{row.unit} {row.category}
                  {row.error ? `（${row.error}）` : ""}
                </div>
              ))}
            </div>
          </SaaSCard>
        ) : null}

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

        <SaaSCard style={{ padding: 0, overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <EmptyState icon="🥬" text="暂无食材" />
          ) : (
            filtered.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid #F1F5F9" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{item.category} · {item.subCategory || "未分类"}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#059669", flexShrink: 0 }}>{item.defaultQty}{item.unit}</div>
              </div>
            ))
          )}
        </SaaSCard>
      </div>
    </div>
  );
}
