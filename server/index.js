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

app.get("/api/purchase/orders", async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const orders = await prisma.purchaseOrder.findMany({
    where: status ? { status } : undefined,
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(ok(orders.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() }))));
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
    include: { items: true },
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

  res.json(ok(order));
});

app.get("/api/admin/registrations", requireAuth, async (_req, res) => {
  const list = await prisma.registration.findMany({ orderBy: { createdAt: "desc" } });
  res.json(ok(list));
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
