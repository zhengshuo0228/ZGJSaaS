import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../server/generated/prisma/index.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

function createAdapter() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const url = new URL(databaseUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  });
}

const prisma = new PrismaClient({ adapter: createAdapter() });

const permissionGroups = {
  食材申购: ["purchase_submit", "purchase_review", "purchase_summary", "purchase_history", "ingredient_manage"],
  绩效考核: ["performance_view", "performance_apply", "performance_review", "performance_manage"],
  考勤排休: ["schedule_view", "schedule_manage"],
  账号管理: ["account_manage", "account_create", "registration_approve"],
  授权管理: ["authorization_manage"],
  系统管理: ["position_manage"],
};

const stores = [
  { id: "s1", name: "开小灶总店", city: "北京" },
  { id: "s2", name: "开小灶分店A", city: "上海" },
  { id: "s3", name: "开小灶分店B", city: "广州" },
];

const departments = stores.flatMap((store, index) => [
  { id: index === 0 ? "d_kitchen" : `d_kitchen${index + 1}`, name: "厨房", storeId: store.id, isPreset: true },
  { id: index === 0 ? "d_dining" : `d_dining${index + 1}`, name: "前厅", storeId: store.id, isPreset: true },
]);

const positions = [
  ["k1", "厨师长", "kitchen", 1, ["admin"]],
  ["k2", "副厨师长", "kitchen", 2, ["admin"]],
  ["k3", "主配", "kitchen", 3, []],
  ["k4", "炉台", "kitchen", 4, []],
  ["k5", "配菜", "kitchen", 5, []],
  ["k6", "冷菜", "kitchen", 6, []],
  ["k7", "煲档", "kitchen", 7, []],
  ["k8", "洗杀", "kitchen", 8, []],
  ["d1", "店长", "dining", 1, ["admin", "super_admin"]],
  ["d2", "主管", "dining", 2, ["admin"]],
  ["d3", "收银员", "dining", 3, []],
  ["d4", "领班", "dining", 4, []],
  ["d5", "服务员", "dining", 5, []],
  ["d6", "传菜员", "dining", 6, []],
];

const ingredients = [
  ["m1", "蔬菜", "叶菜类", "青椒", 30, "斤"],
  ["m2", "蔬菜", "叶菜类", "番茄", 20, "斤"],
  ["m3", "蔬菜", "根茎类", "土豆", 50, "斤"],
  ["m4", "禽肉", "鸡肉", "鸡腿", 20, "斤"],
  ["m5", "禽肉", "猪肉", "五花肉", 15, "斤"],
  ["m6", "河鲜", "淡水鱼", "草鱼", 25, "斤"],
  ["m7", "冻品", "冷冻蔬菜", "玉米粒", 10, "斤"],
  ["m8", "干货调料", "调味品", "生抽", 5, "瓶"],
  ["m9", "蔬菜", "菌菇类", "香菇", 10, "斤"],
  ["m10", "其它", "耗材", "打包盒", 100, "个"],
];

async function upsertUser({ id, username, password, realName, storeId, departmentId, positionIds }) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username },
    update: { id, passwordHash, realName, storeId, departmentId, status: "active" },
    create: { id, username, passwordHash, realName, storeId, departmentId, status: "active" },
  });

  await prisma.userPosition.deleteMany({ where: { userId: id } });
  for (const positionId of positionIds) {
    await prisma.userPosition.create({ data: { userId: id, positionId } });
  }
}

async function main() {
  for (const store of stores) {
    await prisma.store.upsert({ where: { id: store.id }, update: store, create: store });
  }

  for (const department of departments) {
    await prisma.department.upsert({ where: { id: department.id }, update: department, create: department });
  }

  for (const [id, name, department, rank, adminPermissions] of positions) {
    await prisma.position.upsert({
      where: { id },
      update: { name, department, rank, permissions: permissionGroups, adminPermissions },
      create: { id, name, department, rank, permissions: permissionGroups, adminPermissions },
    });
  }

  for (const [id, category, subCategory, name, defaultQty, unit] of ingredients) {
    await prisma.ingredient.upsert({
      where: { id },
      update: { category, subCategory, name, defaultQty, unit },
      create: { id, category, subCategory, name, defaultQty, unit },
    });
  }

  await upsertUser({ id: "u000", username: "000", password: "000000", realName: "系统超管", storeId: "s1", departmentId: "d_kitchen", positionIds: ["d1"] });
  await upsertUser({ id: "u1", username: "admin", password: "123456", realName: "管理员", storeId: "s1", departmentId: "d_kitchen", positionIds: ["k1"] });
  await upsertUser({ id: "u2", username: "user", password: "123456", realName: "测试员工", storeId: "s1", departmentId: "d_kitchen", positionIds: ["k4"] });

  const announcementExists = await prisma.notification.findFirst({
    where: { type: "announcement", title: "系统公告", content: "开小灶 PMS 数据库已启用" },
  });

  if (!announcementExists) {
    await prisma.notification.createMany({
      data: [
        { type: "announcement", title: "系统公告", content: "开小灶 PMS 数据库已启用" },
        { type: "purchase_submit", title: "申购确认", content: "你的申购单已提交成功", recipientId: "u2" },
      ],
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
