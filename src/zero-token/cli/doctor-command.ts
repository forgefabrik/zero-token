import { execSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { zeroTokenHome } from "../config/paths.js";
import { listAccounts } from "../accounts/account-service.js";

export interface DoctorResult {
  checks: DoctorCheck[];
  allPassed: boolean;
}

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

/**
 * Führt die Systemdiagnose durch.
 */
export async function runDoctor(): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  // 1. Node.js-Version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (major >= 22) {
    checks.push({ name: "Node.js Version", status: "ok", message: `${nodeVersion} (≥ 22.15.0)` });
  } else {
    checks.push({ name: "Node.js Version", status: "fail", message: `${nodeVersion} – mind. 22.15.0 erforderlich` });
  }

  // 2. Chromium/Playwright
  try {
    execSync("npx playwright install --dry-run 2>/dev/null || npx playwright --version", {
      stdio: "pipe",
      timeout: 10_000,
    });
    checks.push({ name: "Playwright / Chromium", status: "ok", message: "installiert" });
  } catch {
    checks.push({ name: "Playwright / Chromium", status: "warn", message: "nicht geprüft (npx playwright install erforderlich?)" });
  }

  // 3. Konfigurationsverzeichnis
  const home = zeroTokenHome();
  try {
    accessSync(home, constants.R_OK | constants.W_OK);
    checks.push({ name: "Config-Verzeichnis", status: "ok", message: home });
  } catch {
    checks.push({ name: "Config-Verzeichnis", status: "warn", message: `${home} – existiert nicht oder nicht beschreibbar` });
  }

  // 4. Accounts
  try {
    const accounts = await listAccounts();
    const valid = accounts.filter((a) => a.sessionStatus === "valid").length;
    if (accounts.length === 0) {
      checks.push({ name: "Accounts", status: "warn", message: "Keine Accounts konfiguriert (zt login)" });
    } else {
      const total = accounts.length;
      checks.push({ name: "Accounts", status: valid > 0 ? "ok" : "warn", message: `${total} Accounts (${valid} gültig)` });
    }
  } catch (err) {
    checks.push({ name: "Accounts", status: "fail", message: `Fehler: ${err instanceof Error ? err.message : String(err)}` });
  }

  // 5. Modellcache
  const { getCachedModels } = await import("../models/model-cache.js");
  const cached = await getCachedModels();
  if (cached && cached.length > 0) {
    checks.push({ name: "Modellcache", status: "ok", message: `${cached.length} Modelle gecacht` });
  } else {
    checks.push({ name: "Modellcache", status: "warn", message: "Kein Cache (zt models refresh)" });
  }

  // 6. Konfiguration
  const { loadConfig } = await import("../config/config.js");
  try {
    const config = await loadConfig();
    checks.push({ name: "Konfiguration", status: "ok", message: `Gateway: ${config.gateway.host}:${config.gateway.port}` });
  } catch {
    checks.push({ name: "Konfiguration", status: "warn", message: "Keine config.json" });
  }

  const allPassed = checks.every((c) => c.status === "ok");

  return { checks, allPassed };
}

/**
 * Print doctor results to console.
 */
export function printDoctorResult(result: DoctorResult): void {
  console.error("");
  console.error("  Systemdiagnose:");
  console.error("");

  for (const check of result.checks) {
    const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✗";
    console.error(`    ${icon} ${check.name.padEnd(25)} ${check.message}`);
  }

  console.error("");
  if (result.allPassed) {
    console.error("  ✓ Alle Prüfungen bestanden.");
  } else {
    const fails = result.checks.filter((c) => c.status !== "ok").length;
    console.error(`  ${fails} Prüfung(en) mit Warnung/Fehler.`);
  }
  console.error("");
}
