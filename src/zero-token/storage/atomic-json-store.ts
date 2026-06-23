import {
  access,
  chmod,
  constants,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

const STORAGE_VERSION = 1;

export interface StoredData<T> {
  version: number;
  data: T;
  updatedAt: string;
}

async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
  } catch {
    return;
  }
}

export async function readStored<T>(filePath: string): Promise<T | null> {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    return null;
  }

  const raw = await readFile(filePath, "utf-8");
  const parsed: StoredData<T> = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "number") {
    throw new Error(`Invalid storage format in ${filePath}`);
  }

  return parsed.data;
}

export async function writeStored<T>(
  filePath: string,
  data: T,
): Promise<void> {
  await ensureDir(dirname(filePath));

  const stored: StoredData<T> = {
    version: STORAGE_VERSION,
    data,
    updatedAt: new Date().toISOString(),
  };

  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const content = JSON.stringify(stored, null, 2) + "\n";

  await writeFile(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, filePath);
}

export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listJsonFiles(dirPath: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name);
  } catch {
    return [];
  }
}
