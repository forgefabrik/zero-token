#!/usr/bin/env node

import { APP_NAME, APP_VERSION, LEGACY_APP_NAME } from "./zero-token/app-meta.js";

function printHelp(): void {
  console.error("");
  console.error(`  ${APP_NAME} v${APP_VERSION}`);
  console.error("  Lokales Multi-Provider-AI-Gateway mit Coding-Agent");
  console.error("");
  console.error("  Hinweis: Inoffizielles, experimentelles lokales Werkzeug.");
  console.error("  Kein Produkt der unterstützten KI-Anbieter.");
  console.error("");
  console.error("  Verwendung:");
  console.error("    nova <command> [options]");
  console.error("");
  console.error("  Kernbefehle:");
  console.error("    login --provider=<id>       Provider über Browser anmelden");
  console.error("    providers list              Unterstützte Provider anzeigen");
  console.error("    start                       Lokales Gateway starten");
  console.error("    accounts list|validate      Accounts und Sessions verwalten");
  console.error("    models list|refresh         Modelle anzeigen oder aktualisieren");
  console.error("    status                      Systemstatus anzeigen");
  console.error("    doctor                      Systemdiagnose ausführen");
  console.error("");
  console.error("  Coding-Agent:");
  console.error("    agent                       Agent gegen das lokale Gateway starten");
  console.error("    agent doctor                yoyo-Backend und Gateway prüfen");
  console.error("    agent install               yoyo-agent über Cargo installieren");
  console.error("    agent init                  Projekt für Nova Agent vorbereiten");
  console.error("");
  console.error(`  Kompatibilität: Der bisherige Befehl „zt“ (${LEGACY_APP_NAME}) bleibt gültig.`);
  console.error("");
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (command === "--version" || command === "-v" || command === "version") {
  console.log(APP_VERSION);
} else if (command === "agent") {
  const { handleAgentCommand } = await import("./zero-token/agent/cli.js");
  process.exitCode = await handleAgentCommand(args.slice(1));
} else {
  await import("./zero-token/index.js");
}
