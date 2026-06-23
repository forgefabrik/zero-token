import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

function configRoot(): string {
  if (process.env.XDG_CONFIG_HOME) return resolve(process.env.XDG_CONFIG_HOME);
  if (platform() === "win32") {
    return resolve(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"));
  }
  return join(homedir(), ".config");
}

export function legacyZeroTokenHome(): string {
  return join(configRoot(), "zero-token");
}

export function novaHome(): string {
  const explicit = process.env.NOVA_HOME?.trim();
  if (explicit) return resolve(explicit);

  const preferred = join(configRoot(), "nova");
  const legacy = legacyZeroTokenHome();

  if (existsSync(preferred) || !existsSync(legacy)) return preferred;
  return legacy;
}

/** @deprecated Use novaHome(). Kept for source compatibility. */
export function zeroTokenHome(): string {
  return novaHome();
}

export function accountsPath(): string {
  return join(novaHome(), "accounts");
}

export function accountFilePath(id: string): string {
  return join(accountsPath(), `${id}.json`);
}

export function configFilePath(): string {
  return join(novaHome(), "config.json");
}

export function modelsCachePath(): string {
  return join(novaHome(), "models-cache.json");
}

export function exportsPath(): string {
  return join(novaHome(), "exports");
}

export function auditLogPath(): string {
  return join(novaHome(), "audit.json");
}

export function lockFilePath(): string {
  return join(novaHome(), "storage.lock");
}
