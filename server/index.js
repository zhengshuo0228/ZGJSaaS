import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";
import { authMiddleware, requireAuth, signToken } from "./lib/auth.js";
import { ok, toPosition, toUser } from "./lib/format.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(authMiddleware);

app.get("/api/health", (_req, res) => {
  res.json(ok({ status: "ok", service: "kxzs-api", time: new Date().toISOString() }));
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = await prisma.user.findUnique({
    where: { username },
    include: { positions: { include: { position: true } } },
  });

  if (!user || user.status !== "active") {
    return res.status(401).json({ code: 401, data: null, message: "账号或密码错误" });
  }

  const matched = await bcrypt.compare(password || "", user.passwordHash);
  if (!matched) {
    return res.status(401).json({ code: 401, data: null, message: "账号或密码错误" });
  }

  res.json(ok({
    token: signToken(user),
    user: toUser(user),
    positions: user.positions.map((item) => toPosition(item.position)),
  }));
});

app.post("/api/logout", (_req, res) => {
  res.json(ok(true));
});

app.get("/api/user/info", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { positions: { include: { position: true } } },
  });

  if (!user) {
    return res.status(404).json({ code: 404, data: null, message: "账号不存在" });
  }

  res.json(ok({ user: toUser(user), positions: user.positions.map((item) => toPosition(item.position)) }));
});

app.put("/api/user/password", requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ code: 400, data: null, message: "请填写原密码和至少 6 位新密码" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    return res.status(404).json({ code: 404, data: null, message: "账号不存在" });
  }

  const matched = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!matched) {
    return res.status(400).json({ code: 400, data: null, message: "原密码错误" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json(ok(true));
});

app.post("/api/register", async (req, res) => {
  const { username, password, realName, storeId, departmentId, positionId, remark } = req.body || {};
  if (!username || !password || !realName || !storeId || !departmentId || !positionId) {
    return res.status(400).json({ code: 400, data: null, message: "缺少必填字段" });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return res.status(409).json({ code: 409, data: null, message: "用户名已存在" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const registration = await prisma.registration.create({
    data: { username, passwordHash, realName, storeId, departmentId, positionId, remark },
  });

  await prisma.notification.create({
    data: {
      type: "account_review",
      title: "账号审批",
      content: `新账号注册申请：${realName}`,
      linkType: "registration",
      linkId: registration.id,
    },
  });

  res.json(ok(registration));
});

app.get("/api/stores", async (_req, res) => {
  const stores = await prisma.store.findMany({ orderBy: { id: "asc" } });
  res.json(ok(stores));
});

app.get("/api/departments", async (req, res) => {
  const storeId = req.query.storeId ? String(req.query.storeId) : undefined;
  const departments = await prisma.department.findMany({
    where: storeId ? { storeId } : undefined,
    orderBy: { id: "asc" },
  });
  res.json(ok(departments));
});

app.get("/api/positions", async (_req, res) => {
  const positions = await prisma.position.findMany({ orderBy: [{ department: "asc" }, { rank: "asc" }] });
  res.json(ok(positions.map(toPosition)));
});

async function getAccessScope(user) {
  if (!user || user.username === "000") {
    return { all: true, storeIds: [], departmentIds: [] };
  }

  const authorizations = await prisma.authorization.findMany({ where: { userId: user.id } });
  const storeIds = new Set([user.storeId]);
  const departmentIds = new Set([user.departmentId]);

  for (const item of authorizations) {
    if (item.type === "cross_store") storeIds.add(item.targetId);
    if (item.type === "cross_dept") departmentIds.add(item.targetId);
  }

  return { all: false, storeIds: Array.from(storeIds), departmentIds: Array.from(departmentIds) };
}

function scopedStoreWhere(scope) {
  return scope.all ? {} : { storeId: { in: scope.storeIds } };
}

function scopedUserWhere(scope) {
  return scope.all ? {} : { storeId: { in: scope.storeIds }, departmentId: { in: scope.departmentIds } };
}

app.get("/api/stats/summary", requireAuth, async (req, res) => {
  const range = String(req.query.range || "today");
  const now = new Date();
  const start = new Date(now);
  if (range === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setHours(0, 0, 0, 0);
  }
  const end = new Date(start);
  if (range === "yesterday") end.setDate(start.getDate() + 1);
  else end.setTime(now.getTime());

  const scope = await getAccessScope(req.user);
  const createdAt = { gte: start, lt: end };
  const storeWhere = scopedStoreWhere(scope);
  const userWhere = scopedUserWhere(scope);
  const orderWhere = { createdAt, ...storeWhere };
  const recordWhere = { createdAt, ...storeWhere };
  const leaveWhere = { createdAt, type: "休假", ...storeWhere };
  const [totalOrders, approvedOrders, rejectedOrders, pendingOrders, ingredients, activeUsers, unreadNotifications, performanceApplied, performanceApproved, leaveCount] = await Promise.all([
    prisma.purchaseOrder.count({ where: orderWhere }),
    prisma.purchaseOrder.count({ where: { ...orderWhere, status: "approved" } }),
    prisma.purchaseOrder.count({ where: { ...orderWhere, status: "rejected" } }),
    prisma.purchaseOrder.count({ where: { ...orderWhere, status: "pending" } }),
    prisma.ingredient.count(),
    prisma.user.count({ where: { status: "active", ...userWhere } }),
    prisma.notification.count({ where: { OR: [{ recipientId: req.user.id }, { recipientId: null }], read: false } }),
    prisma.performanceRecord.count({ where: recordWhere }),
    prisma.performanceRecord.count({ where: { ...recordWhere, status: "approved" } }),
    prisma.scheduleRecord.count({ where: leaveWhere }),
  ]);

  res.json(ok({
    range,
    purchase: {
      total: totalOrders,
      approved: approvedOrders,
      rejected: rejectedOrders,
      pending: pendingOrders,
      completionRate: totalOrders ? Math.round((approvedOrders / totalOrders) * 100) : 0,
    },
    ingredient: { total: ingredients },
    account: { activeUsers },
    notification: { unread: unreadNotifications },
    performance: { applied: performanceApplied, approved: performanceApproved },
    schedule: { onLeave: leaveCount, onDuty: Math.max(activeUsers - leaveCount, 0) },
  }));
});

app.get("/api/performance/my", requireAuth, async (req, res) => {
  const records = await prisma.performanceRecord.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const total = records.reduce((sum, record) => sum + record.points, 0);
  res.json(ok({ total, records: records.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) }));
});

app.get("/api/performance/all", requireAuth, async (req, res) => {
  const scope = await getAccessScope(req.user);
  const where = scopedStoreWhere(scope);
  const records = await prisma.performanceRecord.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  res.json(ok(records.map((item) => ({ ...item, user: toUser(item.user), createdAt: item.createdAt.toISOString() }))));
});

app.get("/api/performance/ranking", requireAuth, async (req, res) => {
  const scope = await getAccessScope(req.user);
  const where = { status: "approved", ...scopedStoreWhere(scope) };
  const records = await prisma.performanceRecord.findMany({ where, include: { user: true } });
  const grouped = new Map();
  for (const record of records) {
    const current = grouped.get(record.userId) || { user: toUser(record.user), score: 0 };
    current.score += record.points;
    grouped.set(record.userId, current);
  }
  res.json(ok(Array.from(grouped.values()).sort((a, b) => b.score - a.score).slice(0, 20)));
});

app.get("/api/performance/pending", requireAuth, async (req, res) => {
  const scope = await getAccessScope(req.user);
  const where = { status: "pending", ...scopedStoreWhere(scope) };
  const records = await prisma.performanceRecord.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" } });
  res.json(ok(records.map((item) => ({ ...item, user: toUser(item.user), createdAt: item.createdAt.toISOString() }))));
});

app.post("/api/performance/records", requireAuth, async (req, res) => {
  const { userId = req.user.id, title, type = "加分", points = 0, remark = "", status = "approved" } = req.body || {};
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return res.status(404).json({ code: 404, data: null, message: "员工不存在" });
  if (!title) return res.status(400).json({ code: 400, data: null, message: "请填写绩效事项" });
  const record = await prisma.performanceRecord.create({
    data: { userId: target.id, storeId: target.storeId, title, type, points: Number(points), remark, status },
  });
  await prisma.notification.create({
    data: {
      type: "performance_adjust",
      title: "绩效调整",
      content: `你的绩效记录「${title}」已调整 ${Number(points) >= 0 ? "+" : ""}${Number(points)} 分`,
      recipientId: target.id,
      linkType: "performance",
      linkId: record.id,
    },
  });
  res.json(ok({ ...record, createdAt: record.createdAt.toISOString() }));
});

app.get("/api/schedule/monthly", requireAuth, async (req, res) => {
  const scope = await getAccessScope(req.user);
  const where = scopedStoreWhere(scope);
  const records = await prisma.scheduleRecord.findMany({
    where,
    include: { user: true },
    orderBy: { date: "asc" },
    take: 120,
  });
  res.json(ok(records.map((item) => ({ ...item, user: toUser(item.user), date: item.date.toISOString(), createdAt: item.createdAt.toISOString() }))));
});

app.get("/api/schedule/attendance", requireAuth, async (req, res) => {
  const scope = await getAccessScope(req.user);
  const activeUsers = await prisma.user.count({ where: { status: "active", ...scopedUserWhere(scope) } });
  const onLeave = await prisma.scheduleRecord.count({ where: { type: "休假", ...scopedStoreWhere(scope) } });
  res.json(ok({ onDuty: Math.max(activeUsers - onLeave, 0), onLeave }));
});

app.post("/api/schedule", requireAuth, async (req, res) => {
  const { userId = req.user.id, date, type = "休假", remark = "" } = req.body || {};
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return res.status(404).json({ code: 404, data: null, message: "员工不存在" });
  if (!date) return res.status(400).json({ code: 400, data: null, message: "请选择日期" });
  const record = await prisma.scheduleRecord.create({
    data: { userId: target.id, storeId: target.storeId, date: new Date(date), type, remark, status: "approved" },
  });
  await prisma.notification.create({
    data: {
      type: "schedule_adjust",
      title: "排休调整",
      content: `你的排休记录已调整：${new Date(date).toLocaleDateString("zh-CN")} ${type}`,
      recipientId: target.id,
      linkType: "schedule",
      linkId: record.id,
    },
  });
  res.json(ok({ ...record, date: record.date.toISOString(), createdAt: record.createdAt.toISOString() }));
});

app.get("/api/notifications", async (req, res) => {
  const recipientId = req.user?.id;
  const notifications = await prisma.notification.findMany({
    where: recipientId ? { OR: [{ recipientId }, { recipientId: null }] } : { recipientId: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(ok(notifications.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))));
});

app.put("/api/notifications/:id/read", async (req, res) => {
  await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
  res.json(ok(true));
});

app.put("/api/notifications/read-all", async (req, res) => {
  await prisma.notification.updateMany({ where: { recipientId: req.user?.id || null }, data: { read: true } });
  res.json(ok(true));
});

app.get("/api/purchase/menu", async (_req, res) => {
  const menu = await prisma.ingredient.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  res.json(ok(menu));
});

app.get("/api/purchase/menu/template", (_req, res) => {
  const csv = "\uFEFF\u5206\u7c7b,\u5b50\u5206\u7c7b,\u54c1\u540d,\u9ed8\u8ba4\u6570\u91cf,\u5355\u4f4d\n\u852c\u83dc,\u53f6\u83dc\u7c7b,\u9752\u6912,30,\u65a4\n\u79bd\u8089,\u9e21\u8089,\u9e21\u817f,20,\u65a4\n";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=ingredient-template.csv");
  res.send(csv);
});

app.post("/api/purchase/menu/upload", requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ code: 400, data: null, message: "\u8bf7\u4e0a\u4f20\u98df\u6750\u6570\u636e" });
  }

  const errors = [];
  const normalized = [];
  const seen = new Set();

  items.forEach((item, index) => {
    const row = index + 2;
    const category = String(item.category || "").trim();
    const subCategory = String(item.subCategory || "").trim();
    const name = String(item.name || "").trim();
    const defaultQty = Number(item.defaultQty || 0);
    const unit = String(item.unit || "").trim() || "\u65a4";

    if (!category) errors.push(`\u7b2c${row}\u884c\uff1a\u5206\u7c7b\u4e3a\u7a7a`);
    if (!name) errors.push(`\u7b2c${row}\u884c\uff1a\u54c1\u540d\u4e3a\u7a7a`);
    if (!Number.isFinite(defaultQty) || defaultQty < 0) errors.push(`\u7b2c${row}\u884c\uff1a\u9ed8\u8ba4\u6570\u91cf\u683c\u5f0f\u9519\u8bef`);
    if (!category || !name || !Number.isFinite(defaultQty) || defaultQty < 0) return;

    if (seen.has(name)) errors.push(`\u7b2c${row}\u884c\uff1a\u54c1\u540d\u91cd\u590d\uff0c\u5c06\u6309\u6700\u540e\u4e00\u6761\u66f4\u65b0`);
    seen.add(name);
    normalized.push({ category, subCategory, name, defaultQty, unit });
  });

  if (errors.some((error) => error.includes("\u4e3a\u7a7a") || error.includes("\u683c\u5f0f\u9519\u8bef"))) {
    return res.status(400).json({ code: 400, data: { errors }, message: "\u4e0a\u4f20\u6570\u636e\u6821\u9a8c\u5931\u8d25" });
  }

  const deduped = Array.from(new Map(normalized.map((item) => [item.name, item])).values());
  const saved = [];

  for (const item of deduped) {
    const existing = await prisma.ingredient.findFirst({ where: { name: item.name } });
    const data = {
      category: item.category,
      subCategory: item.subCategory,
      name: item.name,
      defaultQty: Math.round(item.defaultQty),
      unit: item.unit,
    };
    if (existing) {
      saved.push(await prisma.ingredient.update({ where: { id: existing.id }, data }));
    } else {
      saved.push(await prisma.ingredient.create({ data: { id: `m_${Date.now()}_${saved.length}`, ...data } }));
    }
  }

  res.json(ok({ count: saved.length, warnings: errors.filter((error) => error.includes("\u91cd\u590d")), items: saved }));
});

app.get("/api/purchase/orders", async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const scope = await getAccessScope(req.user);
  const scopeWhere = scopedStoreWhere(scope);
  const orders = await prisma.purchaseOrder.findMany({
    where: status ? { status, ...scopeWhere } : scopeWhere,
    include: { items: true, user: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(ok(orders.map((order) => ({
    ...order,
    user: toUser(order.user),
    createdAt: order.createdAt.toISOString(),
  }))));
});

app.post("/api/purchase/orders", requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ code: 400, data: null, message: "\u8bf7\u9009\u62e9\u98df\u6750" });
  }

  const order = await prisma.purchaseOrder.create({
    data: {
      userId: req.user.id,
      storeId: req.user.storeId,
      items: {
        create: items.map((item) => ({
          menuId: item.menuId,
          name: item.name,
          qty: Number(item.qty),
          unit: item.unit,
        })),
      },
    },
    include: { items: true, user: true },
  });

  await prisma.notification.create({
    data: {
      type: "purchase_submit",
      title: "\u7533\u8d2d\u786e\u8ba4",
      content: `\u7533\u8d2d\u5355\u5df2\u63d0\u4ea4\uff0c\u5171 ${items.length} \u9879`,
      recipientId: req.user.id,
      linkType: "history",
      linkId: order.id,
    },
  });

  res.json(ok({ ...order, user: toUser(order.user), createdAt: order.createdAt.toISOString() }));
});

app.put("/api/purchase/orders/:id", requireAuth, async (req, res) => {
  const { approved } = req.body || {};
  const status = approved ? "approved" : "rejected";
  const order = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status },
    include: { items: true, user: true },
  });

  const itemSummary = order.items.map((item) => `${item.name}${item.qty}${item.unit}`).join("\uff0c");
  await prisma.notification.create({
    data: {
      type: "purchase_review",
      title: "\u7533\u8d2d\u5ba1\u6838",
      content: `\u4f60\u7684\u7533\u8d2d\u5355\u300c${itemSummary}\u300d\u5df2${approved ? "\u901a\u8fc7" : "\u9a73\u56de"}`,
      recipientId: order.userId,
      linkType: "history",
      linkId: order.id,
    },
  });

  res.json(ok({ ...order, user: toUser(order.user), createdAt: order.createdAt.toISOString() }));
});

app.get("/api/admin/registrations", requireAuth, async (req, res) => {
  const scope = await getAccessScope(req.user);
  const list = await prisma.registration.findMany({ where: scopedStoreWhere(scope), orderBy: { createdAt: "desc" } });
  res.json(ok(list));
});

app.get("/api/admin/users", requireAuth, async (req, res) => {
  const scope = await getAccessScope(req.user);
  const users = await prisma.user.findMany({
    where: scopedUserWhere(scope),
    include: {
      store: true,
      department: true,
      positions: { include: { position: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(ok(users.map((user) => ({
    ...toUser(user),
    storeName: user.store.name,
    departmentName: user.department.name,
    positions: user.positions.map((item) => toPosition(item.position)),
    createdAt: user.createdAt.toISOString(),
  }))));
});

app.post("/api/admin/users", requireAuth, async (req, res) => {
  const { username, password, realName, storeId, departmentId, positionIds } = req.body || {};
  if (!username || !password || !realName || !storeId || !departmentId || !Array.isArray(positionIds) || positionIds.length === 0) {
    return res.status(400).json({ code: 400, data: null, message: "缺少必填字段" });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return res.status(409).json({ code: 409, data: null, message: "用户名已存在" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      id: `u_${Date.now()}`,
      username,
      passwordHash,
      realName,
      storeId,
      departmentId,
      status: "active",
      positions: { create: positionIds.map((positionId) => ({ positionId })) },
    },
    include: { store: true, department: true, positions: { include: { position: true } } },
  });

  res.json(ok({
    ...toUser(user),
    storeName: user.store.name,
    departmentName: user.department.name,
    positions: user.positions.map((item) => toPosition(item.position)),
    createdAt: user.createdAt.toISOString(),
  }));
});

app.put("/api/admin/users/:id/positions", requireAuth, async (req, res) => {
  const positionIds = Array.isArray(req.body?.positionIds) ? req.body.positionIds : [];
  if (positionIds.length === 0) {
    return res.status(400).json({ code: 400, data: null, message: "请选择岗位" });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ code: 404, data: null, message: "账号不存在" });
  }
  if (target.username === "000") {
    return res.status(403).json({ code: 403, data: null, message: "内置超管账号不可修改" });
  }

  await prisma.userPosition.deleteMany({ where: { userId: target.id } });
  for (const positionId of positionIds) {
    await prisma.userPosition.create({ data: { userId: target.id, positionId } });
  }

  const user = await prisma.user.findUnique({
    where: { id: target.id },
    include: { store: true, department: true, positions: { include: { position: true } } },
  });

  res.json(ok({
    ...toUser(user),
    storeName: user.store.name,
    departmentName: user.department.name,
    positions: user.positions.map((item) => toPosition(item.position)),
    createdAt: user.createdAt.toISOString(),
  }));
});

app.put("/api/admin/registrations/:id", requireAuth, async (req, res) => {
  const { approved } = req.body || {};
  const registration = await prisma.registration.findUnique({ where: { id: req.params.id } });
  if (!registration) {
    return res.status(404).json({ code: 404, data: null, message: "申请不存在" });
  }

  if (!approved) {
    const updated = await prisma.registration.update({ where: { id: registration.id }, data: { status: "rejected" } });
    return res.json(ok(updated));
  }

  const user = await prisma.user.create({
    data: {
      id: `u_${Date.now()}`,
      username: registration.username,
      passwordHash: registration.passwordHash,
      realName: registration.realName,
      storeId: registration.storeId,
      departmentId: registration.departmentId,
      status: "active",
      positions: { create: { positionId: registration.positionId } },
    },
  });

  await prisma.registration.update({ where: { id: registration.id }, data: { status: "approved" } });
  await prisma.notification.create({
    data: {
      type: "account_review",
      title: "账号审批",
      content: "账号申请已通过",
      recipientId: user.id,
    },
  });

  res.json(ok(user));
});

async function listAuthorizations(type) {
  const authorizations = await prisma.authorization.findMany({
    where: { type },
    orderBy: { createdAt: "desc" },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: authorizations.map((item) => item.userId) } },
    include: { store: true, department: true, positions: { include: { position: true } } },
  });
  const userMap = new Map(users.map((user) => [user.id, user]));
  const departments = type === "cross_dept"
    ? await prisma.department.findMany({ where: { id: { in: authorizations.map((item) => item.targetId) } }, include: { store: true } })
    : [];
  const stores = type === "cross_store"
    ? await prisma.store.findMany({ where: { id: { in: authorizations.map((item) => item.targetId) } } })
    : [];
  const departmentMap = new Map(departments.map((department) => [department.id, department]));
  const storeMap = new Map(stores.map((store) => [store.id, store]));

  return authorizations.map((item) => {
    const user = userMap.get(item.userId);
    const department = departmentMap.get(item.targetId);
    const store = storeMap.get(item.targetId);
    return {
      ...item,
      user: user ? {
        ...toUser(user),
        storeName: user.store?.name,
        departmentName: user.department?.name,
        positions: user.positions?.map((entry) => toPosition(entry.position)) || [],
      } : null,
      target: department ? { id: department.id, name: department.name, storeName: department.store?.name, type: "department" } : store ? { id: store.id, name: store.name, type: "store" } : { id: item.targetId, name: item.targetId, type },
      createdAt: item.createdAt.toISOString(),
    };
  });
}

async function createAuthorization(req, res, type) {
  const { userId, targetId } = req.body || {};
  if (!userId || !targetId) return res.status(400).json({ code: 400, data: null, message: "请选择员工和授权目标" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ code: 404, data: null, message: "员工不存在" });
  if (type === "cross_dept") {
    const department = await prisma.department.findUnique({ where: { id: targetId } });
    if (!department) return res.status(404).json({ code: 404, data: null, message: "目标部门不存在" });
  }
  if (type === "cross_store") {
    const store = await prisma.store.findUnique({ where: { id: targetId } });
    if (!store) return res.status(404).json({ code: 404, data: null, message: "目标门店不存在" });
  }
  const exists = await prisma.authorization.findFirst({ where: { userId, type, targetId } });
  if (!exists) {
    await prisma.authorization.create({ data: { userId, type, targetId } });
  }
  res.json(ok(await listAuthorizations(type)));
}

app.get("/api/admin/auth/cross-dept", requireAuth, async (_req, res) => {
  res.json(ok(await listAuthorizations("cross_dept")));
});

app.post("/api/admin/auth/cross-dept", requireAuth, async (req, res) => {
  await createAuthorization(req, res, "cross_dept");
});

app.delete("/api/admin/auth/cross-dept/:id", requireAuth, async (req, res) => {
  await prisma.authorization.delete({ where: { id: req.params.id } });
  res.json(ok(true));
});

app.get("/api/admin/auth/cross-store", requireAuth, async (_req, res) => {
  res.json(ok(await listAuthorizations("cross_store")));
});

app.post("/api/admin/auth/cross-store", requireAuth, async (req, res) => {
  await createAuthorization(req, res, "cross_store");
});

app.delete("/api/admin/auth/cross-store/:id", requireAuth, async (req, res) => {
  await prisma.authorization.delete({ where: { id: req.params.id } });
  res.json(ok(true));
});

app.listen(port, () => {
  console.log(`kxzs-api listening on ${port}`);
});
