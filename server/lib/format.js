export function ok(data = null, message = "ok") {
  return { code: 0, data, message };
}

export function toUser(user) {
  return {
    id: user.id,
    username: user.username,
    password: "",
    email: user.email || "",
    realName: user.realName,
    storeId: user.storeId,
    departmentId: user.departmentId,
    positionIds: user.positions?.map((item) => item.positionId) || [],
    status: user.status,
  };
}

export function toPosition(position) {
  return {
    id: position.id,
    name: position.name,
    department: position.department,
    isPreset: position.isPreset,
    rank: position.rank,
    permissions: position.permissions,
    adminPermissions: position.adminPermissions,
    createdAt: position.createdAt.toISOString(),
  };
}
