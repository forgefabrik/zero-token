#!/usr/bin/env node

import pino from "pino";

const logger = pino({
  name: "zero-token",
  level: process.env.ZT_LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV === "development" && {
    transport: { target: "pino-pretty" },
  }),
});

function printHeader(): void {
  console.error("");
  console.error("  Zero Token v0.1.0");
  console.error("  ChatGPT-Plus-Chatmodelle lokal bereitstellen");
  console.error("");
  console.error("  Hinweis: Inoffizielles, experimentelles lokales Werkzeug.");
  console.error("  Kein OpenAI-Produkt.");
  console.error("");
}

function printHelp(): void {
  printHeader();
  console.error("  Verwendung:");
  console.error("    zt <command> [options]");
  console.error("");
  console.error("  Befehle:");
  console.error("    login               Bei chatgpt.com anmelden");
  console.error("    start               Gateway starten");
  console.error("    status              Systemstatus anzeigen");
  console.error("    doctor              Systemdiagnose");
  console.error("    accounts list       Gespeicherte Konten auflisten");
  console.error("    accounts validate   Sitzung validieren");
  console.error("    accounts remove     Konto entfernen");
  console.error("    accounts import     Konten importieren");
  console.error("    accounts export     Konten exportieren");
  console.error("    models list         Verfügbare Modelle auflisten");
  console.error("    models refresh      Modellcache aktualisieren");
  console.error("    usage refresh       Nutzungslimits aktualisieren");
  console.error("    config show         Konfiguration anzeigen");
  console.error("    help, --help        Diese Hilfe anzeigen");
  console.error("");
  console.error("  Weitere Informationen:");
  console.error("    https://github.com/bkgoder/zero-token");
  console.error("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "login":
      logger.info("Login-Befehl noch nicht implementiert (PR 3)");
      console.error("  Login über Browser: noch nicht implementiert.");
      process.exit(1);
      break;
    case "start":
      logger.info("Gateway-Start noch nicht implementiert (PR 6)");
      console.error("  Gateway-Start: noch nicht implementiert.");
      process.exit(1);
      break;
    case "status":
      logger.info("Status-Befehl noch nicht implementiert (PR 8)");
      console.error("  Systemstatus: noch nicht implementiert.");
      process.exit(1);
      break;
    case "doctor":
      logger.info("Doctor-Befehl noch nicht implementiert (PR 8)");
      console.error("  Systemdiagnose: noch nicht implementiert.");
      process.exit(1);
      break;
    case "accounts":
      logger.info("Account-Befehle noch nicht implementiert (PR 2-3)");
      console.error("  Account-Verwaltung: noch nicht implementiert.");
      process.exit(1);
      break;
    case "models":
      logger.info("Modell-Befehle noch nicht implementiert (PR 4)");
      console.error("  Modellverwaltung: noch nicht implementiert.");
      process.exit(1);
      break;
    case "usage":
      logger.info("Usage-Befehle noch nicht implementiert (PR 7)");
      console.error("  Nutzungslimits: noch nicht implementiert.");
      process.exit(1);
      break;
    case "config":
      logger.info("Config-Befehle noch nicht implementiert (PR 8)");
      console.error("  Konfiguration: noch nicht implementiert.");
      process.exit(1);
      break;
    default:
      console.error(`  Unbekannter Befehl: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  logger.fatal(err, "Unbehandelter Fehler");
  process.exit(1);
});
