import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

export function zeroTokenHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return join(xdg, "zero-token");
  }
  return join(homedir(), ".config", "zero-token");
}

export function accountsPath(): string {
  return join(zeroTokenHome(), "accounts");
}

export function accountFilePath(id: string): string {
  return join(accountsPath(), `${id}.json`);
}

export function configFilePath(): string {
  return join(zeroTokenHome(), "config.json");
}

export function modelsCachePath(): string {
  return join(zeroTokenHome(), "models-cache.json");
}

export function exportsPath(): string {
  return join(zeroTokenHome(), "exports");
}

export function auditLogPath(): string {
  return join(zeroTokenHome(), "audit.json");
}

export function lockFilePath(): string {
  return join(zeroTokenHome(), "storage.lock");
}
