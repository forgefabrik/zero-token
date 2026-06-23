import { spawn, spawnSync } from "node:child_process";
import { DEFAULT_GATEWAY_URL, YOYO_SOURCE_URL } from "../app-meta.js";

export interface NovaAgentOptions {
  binary?: string;
  gatewayUrl?: string;
  model?: string;
  cwd?: string;
  yes?: boolean;
  extraArgs?: string[];
}

export interface NovaAgentStatus {
  installed: boolean;
  binary: string;
  version?: string;
  gatewayUrl: string;
  gatewayReachable: boolean;
  sourceUrl: string;
}

export function normalizeGatewayUrl(value?: string): string {
  const raw = value?.trim() || process.env.NOVA_GATEWAY_URL || DEFAULT_GATEWAY_URL;
  return raw.replace(/\/+$/, "");
}

export function resolveAgentBinary(value?: string): string {
  return value?.trim() || process.env.NOVA_AGENT_BINARY || "yoyo";
}

export function buildYoyoArgs(options: NovaAgentOptions = {}): string[] {
  const args = [
    "--provider",
    "custom",
    "--base-url",
    normalizeGatewayUrl(options.gatewayUrl),
    "--model",
    options.model?.trim() || process.env.NOVA_MODEL || "gpt-4o",
  ];

  if (options.yes) args.push("--yes");
  if (options.extraArgs?.length) args.push(...options.extraArgs);
  return args;
}

export async function getNovaAgentStatus(
  options: Pick<NovaAgentOptions, "binary" | "gatewayUrl"> = {},
): Promise<NovaAgentStatus> {
  const binary = resolveAgentBinary(options.binary);
  const versionResult = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const installed = !versionResult.error && versionResult.status === 0;
  const version = installed
    ? (versionResult.stdout || versionResult.stderr).trim() || undefined
    : undefined;
  const gatewayUrl = normalizeGatewayUrl(options.gatewayUrl);

  let gatewayReachable = false;
  try {
    const response = await fetch(`${gatewayUrl}/models`, {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: "application/json" },
    });
    gatewayReachable = response.ok;
  } catch {
    gatewayReachable = false;
  }

  return {
    installed,
    binary,
    version,
    gatewayUrl,
    gatewayReachable,
    sourceUrl: YOYO_SOURCE_URL,
  };
}

export async function runNovaAgent(options: NovaAgentOptions = {}): Promise<number> {
  const binary = resolveAgentBinary(options.binary);
  const args = buildYoyoArgs(options);

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        NOVA_AGENT: "1",
        NOVA_GATEWAY_URL: normalizeGatewayUrl(options.gatewayUrl),
      },
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (typeof code === "number") resolve(code);
      else resolve(signal ? 128 : 1);
    });
  });
}

export async function installYoyoAgent(cwd = process.cwd()): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn("cargo", ["install", "yoyo-agent"], {
      cwd,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
