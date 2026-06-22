import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "kxzs-dev-secret";

export function signToken(user) {
  return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}

export async function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = await prisma.user.findUnique({ where: { id: payload.userId } });
  } catch {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ code: 401, data: null, message: "未登录" });
  next();
}
