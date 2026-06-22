import api from "./http";
import {
  MENU_ITEMS,
  MOCK_DEPARTMENTS,
  MOCK_NOTIFICATIONS,
  MOCK_POSITIONS,
  MOCK_STORES,
  MOCK_USERS,
  PURCHASE_ORDERS,
} from "./mock";
import { getRandomWelcomeMessage as getPresetWelcomeMessage } from "../types/presets";
import type { User } from "../types";

type ApiResponse<T> = {
  code: number;
  message?: string;
  data: T;
};

type LoginPayload = {
  username: string;
  password: string;
};

type LoginResult = {
  token?: string;
  user: User;
  positions: typeof MOCK_POSITIONS;
};

type RegisterPayload = {
  username: string;
  password: string;
  realName: string;
  storeId: string;
  departmentId: string;
  positionId: string;
  remark?: string;
};

const ok = <T>(data: T): ApiResponse<T> => ({ code: 0, data });
const realApi = api as any;

async function realOrMock<T>(request: () => Promise<T>, fallback: () => T | Promise<T>): Promise<ApiResponse<T>> {
  try {
    const data = await request();
    return ok(data);
  } catch (error) {
    console.warn("真实 API 不可用，已切换本地 Mock：", error);
    return ok(await fallback());
  }
}

function normalizeLoginResult(data: any): LoginResult {
  if (data?.user && data?.positions) return data;
  return data?.data ?? data;
}

export async function login(payload: LoginPayload): Promise<ApiResponse<LoginResult>> {
  try {
    const data = await realApi.post("/login", payload);
    return ok(normalizeLoginResult(data));
  } catch (error) {
    const user = MOCK_USERS.find((item) => item.username === payload.username && item.password === payload.password);
    if (!user) {
      throw error;
    }
    const positions = MOCK_POSITIONS.filter((position) => user.positionIds.includes(position.id));
    return ok({ token: "mock-token", user, positions });
  }
}

export async function logout() {
  return realOrMock(() => realApi.post("/logout"), () => true);
}

export async function register(payload: RegisterPayload) {
  return realOrMock(() => realApi.post("/register", payload), () => ({ ...payload, id: `mock_${Date.now()}`, status: "pending" }));
}

export async function getStores() {
  return realOrMock(() => realApi.get("/stores"), () => MOCK_STORES);
}

export async function getDepartments(storeId?: string) {
  return realOrMock(
    () => realApi.get("/departments", { params: storeId ? { storeId } : undefined }),
    () => (storeId ? MOCK_DEPARTMENTS.filter((department) => department.storeId === storeId) : MOCK_DEPARTMENTS)
  );
}

export async function getPositions() {
  return realOrMock(() => realApi.get("/positions"), () => MOCK_POSITIONS);
}

export async function getNotifications() {
  return realOrMock(() => realApi.get("/notifications"), () => MOCK_NOTIFICATIONS);
}

export async function markNotificationRead(id: string) {
  return realOrMock(() => realApi.put(`/notifications/${id}/read`), () => true);
}

export async function markAllNotificationsRead() {
  return realOrMock(() => realApi.put("/notifications/read-all"), () => true);
}

export async function getMenu() {
  return realOrMock(() => realApi.get("/purchase/menu"), () => MENU_ITEMS);
}

export async function getOrders() {
  return realOrMock(() => realApi.get("/purchase/orders"), () => PURCHASE_ORDERS);
}

export async function getRegistrations() {
  return realOrMock(() => realApi.get("/admin/registrations"), () => []);
}

export async function approveRegistration(id: string, approved: boolean) {
  return realOrMock(() => realApi.put(`/admin/registrations/${id}`, { approved }), () => ({ id, status: approved ? "approved" : "rejected" }));
}

export function getRandomWelcomeMessage() {
  return getPresetWelcomeMessage();
}
