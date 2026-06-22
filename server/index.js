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

  const createdAt = { gte: start, lt: end };
  const orderWhere = req.user.username === "000" ? { createdAt } : { createdAt, storeId: req.user.storeId };
  const [totalOrders, approvedOrders, rejectedOrders, pendingOrders, ingredients, activeUsers, unreadNotifications] = await Promise.all([
    prisma.purchaseOrder.count({ where: orderWhere }),
    prisma.purchaseOrder.count({ where: { ...orderWhere, status: "approved" } }),
    prisma.purchaseOrder.count({ where: { ...orderWhere, status: "rejected" } }),
    prisma.purchaseOrder.count({ where: { ...orderWhere, status: "pending" } }),
    prisma.ingredient.count(),
    prisma.user.count({ where: req.user.username === "000" ? { status: "active" } : { status: "active", storeId: req.user.storeId } }),
    prisma.notification.count({ where: { OR: [{ recipientId: req.user.id }, { recipientId: null }], read: false } }),
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
    performance: { applied: 0, approved: 0 },
    schedule: { onLeave: 0, onDuty: activeUsers },
  }));
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
  const csv = "\uFEFF分类,子分类,品名,默认数量,单位\n蔬菜,叶菜类,青椒,30,斤\n禽肉,鸡肉,鸡腿,20,斤\n";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=ingredient-template.csv");
  res.send(csv);
});

app.post("/api/purchase/menu/upload", requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ code: 400, data: null, message: "请上传食材数据" });
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
    const unit = String(item.unit || "").trim() || "斤";

    if (!category) errors.push(`第${row}行：分类为空`);
    if (!name) errors.push(`第${row}行：品名为空`);
    if (!Number.isFinite(defaultQty) || defaultQty < 0) errors.push(`第${row}行：默认数量格式错误`);
    if (!category || !name || !Number.isFinite(defaultQty) || defaultQty < 0) return;

    const key = name;
    if (seen.has(key)) errors.push(`第${row}行：品名重复，将按最后一条更新`);
    seen.add(key);
    normalized.push({ category, subCategory, name, defaultQty, unit });
  });

  if (errors.some((error) => error.includes("为空") || error.includes("格式错误"))) {
    return res.status(400).json({ code: 400, data: { errors }, message: "上传数据校验失败" });
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

  res.json(ok({ count: saved.length, warnings: errors.filter((error) => error.includes("重复")), items: saved }));
});

app.get("/api/purchase/orders", async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const orders = await prisma.purchaseOrder.findMany({
    where: status ? { status } : undefined,
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
    return res.status(400).json({ code: 400, data: null, message: "请选择食材" });
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
      title: "申购确认",
      content: `申购单已提交，共 ${items.length} 项`,
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

  const itemSummary = order.items.map((item) => `${item.name}${item.qty}${item.unit}`).join("，");
  await prisma.notification.create({
    data: {
      type: "purchase_review",
      title: "申购审核",
      content: `你的申购单「${itemSummary}」已${approved ? "通过" : "驳回"}`,
      recipientId: order.userId,
      linkType: "history",
      linkId: order.id,
    },
  });

  res.json(ok({ ...order, user: toUser(order.user), createdAt: order.createdAt.toISOString() }));
});

app.get("/api/admin/registrations", requireAuth, async (_req, res) => {
  const list = await prisma.registration.findMany({ orderBy: { createdAt: "desc" } });
  res.json(ok(list));
});

app.get("/api/admin/users", requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
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

app.listen(port, () => {
  console.log(`kxzs-api listening on ${port}`);
});
