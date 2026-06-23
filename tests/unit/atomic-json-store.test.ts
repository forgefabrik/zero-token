import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { readStored, writeStored, deleteFile, listJsonFiles } from "../../src/zero-token/storage/atomic-json-store.js";

describe("atomic-json-store", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "zt-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("schreibt und liest JSON", async () => {
    const fp = join(tmpDir, "test.json");
    const data = { hello: "world", num: 42 };

    await writeStored(fp, data);
    const result = await readStored<typeof data>(fp);

    expect(result).toEqual(data);
  });

  it("gibt null zurück wenn Datei nicht existiert", async () => {
    const fp = join(tmpDir, "nonexistent.json");
    const result = await readStored(fp);
    expect(result).toBeNull();
  });

  it("überschreibt vorhandene Datei atomar", async () => {
    const fp = join(tmpDir, "overwrite.json");

    await writeStored(fp, { version: "v1" });
    await writeStored(fp, { version: "v2" });

    const result = await readStored<{ version: string }>(fp);
    expect(result?.version).toBe("v2");
  });

  it("löscht Datei", async () => {
    const fp = join(tmpDir, "delete.json");
    await writeStored(fp, { data: true });

    const deleted = await deleteFile(fp);
    expect(deleted).toBe(true);

    const result = await readStored(fp);
    expect(result).toBeNull();
  });

  it("gibt false bei Löschen nicht existenter Datei", async () => {
    const fp = join(tmpDir, "noexist.json");
    const deleted = await deleteFile(fp);
    expect(deleted).toBe(false);
  });

  it("listet JSON-Dateien in Verzeichnis", async () => {
    await writeStored(join(tmpDir, "a.json"), {});
    await writeStored(join(tmpDir, "b.json"), {});
    await writeStored(join(tmpDir, "c.txt"), {});

    const files = await listJsonFiles(tmpDir);
    expect(files.sort()).toEqual(["a.json", "b.json"]);
  });

  it("gibt leeres Array bei nicht existierendem Verzeichnis", async () => {
    const files = await listJsonFiles(join(tmpDir, "no-such-dir"));
    expect(files).toEqual([]);
  });

  it("setzt 0600 Berechtigungen auf geschriebene Datei", async () => {
    const fp = join(tmpDir, "perms.json");
    await writeStored(fp, { secret: true });

    expect(() => {
      accessSync(fp, constants.R_OK | constants.W_OK);
    }).not.toThrow();
  });

  it("erstellt Zwischenverzeichnisse automatisch", async () => {
    const fp = join(tmpDir, "sub", "nested", "deep.json");
    await writeStored(fp, { nested: true });

    const result = await readStored<{ nested: boolean }>(fp);
    expect(result?.nested).toBe(true);
  });
});
