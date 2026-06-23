import type { ChatGPTPlusAccount } from "./account-types.js";
import {
  readStored,
  writeStored,
  deleteFile,
  listJsonFiles,
} from "../storage/atomic-json-store.js";
import { accountsPath, accountFilePath } from "../config/paths.js";
import { validateForSave } from "./account-validation.js";

export async function listAccounts(): Promise<ChatGPTPlusAccount[]> {
  const dir = accountsPath();
  const files = await listJsonFiles(dir);
  const accounts: ChatGPTPlusAccount[] = [];

  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const account = await getAccount(id);
    if (account) {
      accounts.push(account);
    }
  }

  return accounts.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
}

export async function getAccount(
  id: string,
): Promise<ChatGPTPlusAccount | null> {
  const path = accountFilePath(id);
  return readStored<ChatGPTPlusAccount>(path);
}

export async function saveAccount(
  account: ChatGPTPlusAccount,
): Promise<void> {
  const validation = validateForSave(account as unknown as Record<string, unknown>);
  if (!validation.valid) {
    throw new Error(`Ungültige Account-Daten: ${validation.errors.join("; ")}`);
  }

  const path = accountFilePath(account.id);
  await writeStored(path, account);
}

export async function deleteAccount(id: string): Promise<boolean> {
  const path = accountFilePath(id);
  return deleteFile(path);
}

export async function accountExists(id: string): Promise<boolean> {
  const account = await getAccount(id);
  return account !== null;
}
