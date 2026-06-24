import type { ChatGPTPlusAccount } from "./account-types.js";
import { getAccount, listAccounts, saveAccount, deleteAccount } from "./account-repository.js";

export type MaskedAccount = Omit<ChatGPTPlusAccount, "cookies" | "accessToken">;

export type CreateAccountData = Partial<
  Omit<ChatGPTPlusAccount, "id" | "label" | "provider" | "createdAt" | "updatedAt">
>;

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return id;
}

export function maskAccount(account: ChatGPTPlusAccount): MaskedAccount {
  const { cookies, accessToken, ...rest } = account;
  return rest;
}

export function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return email;
  return email[0] + "***" + email.slice(atIndex);
}

export async function createAccount(
  label: string,
  provider: ChatGPTPlusAccount["provider"] = "chatgpt",
  data: CreateAccountData = {},
): Promise<ChatGPTPlusAccount> {
  const now = new Date().toISOString();
  const hasCredentials = Boolean(data.cookies?.trim() || data.accessToken?.trim());
  const account: ChatGPTPlusAccount = {
    id: generateId(),
    label,
    provider,
    cookies: data.cookies ?? "",
    enabled: data.enabled ?? true,
    priority: data.priority ?? 0,
    sessionStatus: data.sessionStatus ?? (hasCredentials ? "valid" : "unknown"),
    createdAt: now,
    updatedAt: now,
    ...(data.email !== undefined && { email: data.email }),
    ...(data.userId !== undefined && { userId: data.userId }),
    ...(data.workspaceId !== undefined && { workspaceId: data.workspaceId }),
    ...(data.plan !== undefined && { plan: data.plan }),
    ...(data.accessToken !== undefined && { accessToken: data.accessToken }),
    ...(data.userAgent !== undefined && { userAgent: data.userAgent }),
    ...(data.lastUsedAt !== undefined && { lastUsedAt: data.lastUsedAt }),
    ...(data.lastValidatedAt !== undefined && { lastValidatedAt: data.lastValidatedAt }),
    ...(data.usageStatus !== undefined && { usageStatus: data.usageStatus }),
  };
  await saveAccount(account);
  return account;
}

export async function updateAccount(
  id: string,
  updates: Partial<Omit<ChatGPTPlusAccount, "id" | "createdAt">>,
): Promise<ChatGPTPlusAccount> {
  const existing = await getAccount(id);
  if (!existing) {
    throw new Error(`Account nicht gefunden: ${id}`);
  }

  const updated: ChatGPTPlusAccount = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await saveAccount(updated);
  return updated;
}

export {
  generateId,
  getAccount,
  listAccounts,
  saveAccount,
  deleteAccount,
};
