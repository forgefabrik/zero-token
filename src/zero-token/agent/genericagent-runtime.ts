import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  GENERIC_AGENT_SOURCE_URL,
  genericAgentPathExists,
  normalizeGenericGatewayUrl,
  resolveGenericAgentSourceDir,
  type GenericAgentConfigOptions,
} from "./genericagent-config.js";

export type GenericAgentFrontend = "cli" | "tui" | "tui2" | "gui" | "launch" | "hub";

export interface GenericAgentRuntimeOptions extends GenericAgentConfigOptions {
  binary?: string;
  frontend?: GenericAgentFrontend;
  extraArgs?: string[];
}

export interface GenericAgentStatus {
  installed: boolean;
  configured: boolean;
  binary: string;
  version?: string;
  sourceDir: string;
  gatewayUrl: string;
  gatewayReachable: boolean;
  sourceUrl: string;
}

function resolveBinary(options: GenericAgentRuntimeOptions): string {
  if (options.binary?.trim()) return options.binary.trim();
  if (process.env.NOVA_GENERIC_AGENT_BIN) return process.env.NOVA_GENERIC_AGENT_BIN;

  const sourceDir = resolveGenericAgentSourceDir(options.sourceDir);
  const localBinary = join(
    sourceDir,
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "ga.exe" : "ga",
  );
  return localBinary;
}

export async function getGenericAgentStatus(
  options: GenericAgentRuntimeOptions = {},
): Promise<GenericAgentStatus> {
  const sourceDir = resolveGenericAgentSourceDir(options.sourceDir);
  const binary = resolveBinary(options);
  const versionResult = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const installed = !versionResult.error && versionResult.status === 0;
  const version = installed
    ? (versionResult.stdout || versionResult.stderr).trim() || undefined
    : undefined;
  const configured = await genericAgentPathExists(join(sourceDir, "mykey.py"));
  const gatewayUrl = normalizeGenericGatewayUrl(options.gatewayUrl);

  let gatewayReachable = false;
  try {
    const response = await fetch(`${gatewayUrl}/models`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    gatewayReachable = response.ok;
  } catch {
    gatewayReachable = false;
  }

  return {
    installed,
    configured,
    binary,
    version,
    sourceDir,
    gatewayUrl,
    gatewayReachable,
    sourceUrl: GENERIC_AGENT_SOURCE_URL,
  };
}

export async function runGenericAgent(
  options: GenericAgentRuntimeOptions = {},
): Promise<number> {
  const sourceDir = resolveGenericAgentSourceDir(options.sourceDir);
  const binary = resolveBinary(options);
  const args = [options.frontend ?? "cli", ...(options.extraArgs ?? [])];

  return await new Promise<number>((resolveCode, reject) => {
    const child = spawn(binary, args, {
      cwd: sourceDir,
      stdio: "inherit",
      env: {
        ...process.env,
        NOVA_AGENT: "genericagent",
        NOVA_GATEWAY_URL: normalizeGenericGatewayUrl(options.gatewayUrl),
      },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (typeof code === "number") resolveCode(code);
      else resolveCode(signal ? 128 : 1);
    });
  });
}
