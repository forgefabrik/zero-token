import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import type { ChatGPTPlusAccount } from "../../src/zero-token/accounts/account-types.js";

// Mock paths to use temp directory
const tmpDir = mkdtempSync(join(tmpdir(), "zt-repo-test-"));

vi.mock("../../src/zero-token/config/paths.js", () => ({
  accountsPath: () => join(tmpDir, "accounts"),
  accountFilePath: (id: string) => join(tmpDir, "accounts", `${id}.json`),
}));

const { listAccounts, getAccount, saveAccount, deleteAccount, accountExists } = await import(
  "../../src/zero-token/accounts/account-repository.js"
);

const makeAccount = (id: string, overrides: Partial<ChatGPTPlusAccount> = {}): ChatGPTPlusAccount => ({
  id,
  label: `Account ${id}`,
  cookies: "session=abc",
  enabled: true,
  priority: 0,
  sessionStatus: "unknown",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("account-repository", () => {
  beforeEach(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(tmpDir, "accounts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(join(tmpDir, "accounts"), { recursive: true, force: true });
  });

  it("speichert und liest einen Account", async () => {
    const account = makeAccount("test-1");
    await saveAccount(account);

    const loaded = await getAccount("test-1");
    expect(loaded).toEqual(account);
  });

  it("gibt null für nicht existierenden Account", async () => {
    const loaded = await getAccount("nicht-da");
    expect(loaded).toBeNull();
  });

  it("aktualisiert vorhandenen Account", async () => {
    const account = makeAccount("upd-1", { label: "Alt" });
    await saveAccount(account);

    const updated = { ...account, label: "Neu", updatedAt: "2026-06-01T00:00:00.000Z" };
    await saveAccount(updated);

    const loaded = await getAccount("upd-1");
    expect(loaded?.label).toBe("Neu");
    expect(loaded?.updatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("löscht einen Account", async () => {
    const account = makeAccount("del-1");
    await saveAccount(account);

    const deleted = await deleteAccount("del-1");
    expect(deleted).toBe(true);

    const loaded = await getAccount("del-1");
    expect(loaded).toBeNull();
  });

  it("gibt false beim Löschen nicht existierender Accounts", async () => {
    const deleted = await deleteAccount("nicht-da");
    expect(deleted).toBe(false);
  });

  it("prüft ob Account existiert", async () => {
    const account = makeAccount("exists-1");
    await saveAccount(account);

    expect(await accountExists("exists-1")).toBe(true);
    expect(await accountExists("nicht-da")).toBe(false);
  });

  it("listet alle Accounts sortiert nach Priorität (absteigend)", async () => {
    await saveAccount(makeAccount("a", { priority: 1 }));
    await saveAccount(makeAccount("b", { priority: 5 }));
    await saveAccount(makeAccount("c", { priority: 3 }));

    const all = await listAccounts();
    expect(all.map((a) => a.id)).toEqual(["b", "c", "a"]);
  });

  it("listet leere Liste bei keinem Account", async () => {
    const all = await listAccounts();
    expect(all).toEqual([]);
  });

  it("wirft Fehler bei ungültigen Account-Daten", async () => {
    const bad = { ...makeAccount("bad-1"), id: "" } as unknown as ChatGPTPlusAccount;
    await expect(saveAccount(bad)).rejects.toThrow("Ungültige Account-Daten");
  });
});
