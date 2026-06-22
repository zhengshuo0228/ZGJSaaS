import { create } from "zustand";
import type { User, Position, Store, NotificationItem, AdminPermission } from "../types";

interface AppState {
  // Auth
  currentUser: User | null;
  currentPositions: Position[];
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, positions: Position[], token?: string) => void;
  logout: () => void;

  // Store
  currentStoreId: string;
  stores: Store[];
  setCurrentStore: (id: string) => void;

  // Notifications
  notifications: NotificationItem[];
  setNotifications: (n: NotificationItem[]) => void;

  // Permission helper
  hasPermission: (perm: string) => boolean;
  getVisibleScope: () => { stores: Set<string>; departments: Set<string> };
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  currentPositions: [],
  token: null,
  isAuthenticated: false,
  currentStoreId: "",
  stores: [],
  notifications: [],

  login: (user, positions, token = localStorage.getItem("token") || "mock-token") => {
    localStorage.setItem("currentUser", JSON.stringify(user));
    localStorage.setItem("currentPositions", JSON.stringify(positions));
    localStorage.setItem("token", token);
    set({ currentUser: user, currentPositions: positions, token, isAuthenticated: true, currentStoreId: user.storeId || "" });
  },

  logout: () => {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("currentPositions");
    localStorage.removeItem("token");
    localStorage.removeItem("currentStore");
    set({ currentUser: null, currentPositions: [], token: null, isAuthenticated: false, currentStoreId: "" });
  },

  setCurrentStore: (id) => {
    localStorage.setItem("currentStore", id);
    set({ currentStoreId: id });
  },

  setNotifications: (n) => set({ notifications: n }),

  hasPermission: (perm) => {
    const { currentUser, currentPositions } = get();
    if (!currentUser || currentUser.username === "000") return true;
    for (const pos of currentPositions) {
      for (const category of Object.values(pos.permissions)) {
        if (category.includes(perm)) return true;
      }
      if (pos.adminPermissions.includes(perm as AdminPermission)) return true;
    }
    return false;
  },

  getVisibleScope: () => {
    const { currentUser, stores } = get();
    if (!currentUser || currentUser.username === "000") {
      return { stores: new Set(stores.map((s) => s.id)), departments: new Set() };
    }
    const s = new Set([currentUser.storeId]);
    return { stores: s, departments: new Set([currentUser.departmentId]) };
  },
}));

// Init from localStorage
if (typeof window !== "undefined") {
  const savedUser = localStorage.getItem("currentUser");
  const savedPositions = localStorage.getItem("currentPositions");
  const savedStore = localStorage.getItem("currentStore");
  if (savedUser) {
    const s = useAppStore.getState();
    s.login(JSON.parse(savedUser), savedPositions ? JSON.parse(savedPositions) : []);
    if (savedStore) s.setCurrentStore(savedStore);
  }
}
