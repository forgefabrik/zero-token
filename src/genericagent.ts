#!/usr/bin/env node

import {
  configureGenericAgent,
  getGenericAgentStatus,
  runGenericAgent,
} from "./zero-token/agent/external-backend.js";

const args = process.argv.slice(2);
const command = args[0] ?? "doctor";

function option(name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const settings = {
  sourceDir: option("source-dir"),
  gatewayUrl: option("base-url"),
  model: option("model"),
  binary: option("binary"),
};

if (command === "init") {
  const path = await configureGenericAgent(settings);
  console.error(`Nova-Konfiguration erstellt: ${path}`);
} else if (command === "run") {
  const status = await getGenericAgentStatus(settings);
  if (!status.installed || !status.configured || !status.gatewayReachable) {
    console.error("GenericAgent ist nicht bereit. Führe zuerst nova-ga doctor und nova-ga init aus.");
    process.exitCode = 1;
  } else {
    process.exitCode = await runGenericAgent({
      ...settings,
      frontend: (option("frontend") ?? "cli") as "cli" | "tui" | "tui2" | "gui" | "launch" | "hub",
    });
  }
} else {
  const status = await getGenericAgentStatus(settings);
  console.log(JSON.stringify(status, null, 2));
  process.exitCode = status.installed && status.configured && status.gatewayReachable ? 0 : 1;
}
