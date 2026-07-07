export const RESERVED_SYSTEM_ACCOUNT = '000';
export const RESERVED_ACCOUNT_MESSAGE = '该账号为系统保留账号，不可注册';

export function normalizeAccountInput(value: string) {
  return value.trim().toLowerCase().split('@')[0];
}

export function isReservedSystemAccount(value?: string | null) {
  return normalizeAccountInput(value ?? '') === RESERVED_SYSTEM_ACCOUNT;
}

export function buildInternalLoginCandidates(value: string) {
  const account = normalizeAccountInput(value);
  if (!account) return [];
  return [`${account}@zaoguanjia.app`, `${account}@miaoda.app`];
}

export function displayAccount(profile: { account_id?: string | null; email?: string | null }) {
  if (profile.account_id) return profile.account_id;
  return normalizeAccountInput(profile.email ?? '');
}

export function isProtectedSystemProfile(profile?: { account_id?: string | null; email?: string | null } | null) {
  if (!profile) return false;
  return isReservedSystemAccount(profile.account_id) || isReservedSystemAccount(profile.email);
}
