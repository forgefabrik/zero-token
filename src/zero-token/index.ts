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
  console.error("  KI-Chatmodelle lokal bereitstellen");
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
  console.error("    login [--provider=<id>]    Bei einem KI-Provider anmelden");
  console.error("    providers list             Verfügbare Provider auflisten");
  console.error("    start                      Gateway starten");
  console.error("    status                     Systemstatus anzeigen");
  console.error("    doctor                     Systemdiagnose");
  console.error("    accounts list              Gespeicherte Konten auflisten");
  console.error("    accounts validate          Sitzung validieren");
  console.error("    accounts remove            Konto entfernen");
  console.error("    accounts import            Konten importieren");
  console.error("    accounts export            Konten exportieren");
  console.error("    models list                Verfügbare Modelle auflisten");
  console.error("    models refresh             Modellcache aktualisieren");
  console.error("    usage refresh              Nutzungslimits aktualisieren");
  console.error("    config show                Konfiguration anzeigen");
  console.error("    help, --help               Diese Hilfe anzeigen");
  console.error("");
  console.error("  Beispiele:");
  console.error("    zt login --provider=chatgpt-web");
  console.error("    zt login --provider=claude-web");
  console.error("    zt login --provider=glm-intl-web");
  console.error("    zt providers list");
  console.error("");
  console.error("  Weitere Informationen:");
  console.error("    https://github.com/bkgoder/zero-token");
  console.error("");
}

/** Parses --key=value or --key value style arguments. */
function parseArgs(args: string[]): { command: string[]; flags: Record<string, string> } {
  const flags: Record<string, string> = {};
  const command: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[arg.slice(2)] = args[++i];
      } else {
        flags[arg.slice(2)] = "true";
      }
    } else {
      command.push(arg);
    }
  }

  return { command, flags };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    printHelp();
    process.exit(0);
  }

  const { command, flags } = parseArgs(args);
  const cmd = command[0];

  switch (cmd) {
    case "login": {
      const providerInput = flags.provider ?? "chatgpt-web";
      const { listProviders, login, resolveProvider } = await import("./providers/registry.js");
      const provider = resolveProvider(providerInput);

      if (!provider) {
        console.error(`  ✗ Unbekannter Provider: ${providerInput}`);
        console.error(
          `    Verfügbare Provider: ${listProviders()
            .map((item) => item.id)
            .join(", ")}`,
        );
        process.exit(1);
      }

      if (provider.authType === "api-key") {
        console.error(`  ${provider.label} verwendet API-Key-Konfiguration statt Browser-Login.`);
        process.exit(1);
      }

      console.error(`  Anmelden bei ${provider.label} …`);
      const result = await login(provider.id, {
        cdpPort: flags["cdp-port"] ? Number(flags["cdp-port"]) : undefined,
        headless: flags.headless === "true",
      });

      if (result.ok) {
        const { createAccount, updateAccount } = await import("./accounts/account-service.js");
        const label = result.info.email
          ? result.info.email.split("@")[0]
          : provider.label;
        const account = await createAccount(label, provider.implementation);
        await updateAccount(account.id, {
          email: result.info.email,
          userId: result.info.userId,
          plan: result.info.plan,
          cookies: result.session.cookies,
          accessToken: result.session.accessToken,
          userAgent: result.session.userAgent,
          sessionStatus: "valid",
          lastValidatedAt: new Date().toISOString(),
        });

        console.error(`  ✓ Login bei ${provider.label} erfolgreich!`);
        if (result.info.email) {
          console.error(`    Account: ${result.info.email}`);
        }
        console.error(`    Plan:    ${result.info.plan}`);
        process.exit(0);
      } else {
        const messages: Record<string, string> = {
          "browser-launch-failed": "Browser konnte nicht gestartet werden.",
          "login-timeout": "Zeitüberschreitung – bitte melde dich manuell an.",
          "plan-not-supported": "Dieser Account hat nicht den benötigten Zugriff.",
          "session-extraction-failed": "Session-Daten konnten nicht gelesen werden.",
          "configuration-required": "Dieser Provider muss über die Konfiguration eingerichtet werden.",
          "unknown-provider": "Der Provider ist nicht registriert.",
          "user-cancelled": "Login abgebrochen.",
          "unknown-error": "Ein unbekannter Fehler ist aufgetreten.",
        };
        console.error(`  ✗ ${messages[result.reason] ?? "Fehler"}`);
        process.exit(1);
      }
      break;
    }

    case "providers": {
      const sub = command[1];
      if (sub === "list") {
        const { listProviders } = await import("./providers/registry.js");
        const providers = listProviders();
        console.error("  Verfügbare Provider:");
        console.error("");
        for (const provider of providers) {
          const planTag = provider.requiredPlan ? ` (${provider.requiredPlan})` : "";
          const authTag = provider.authType === "api-key" ? " [API key]" : "";
          console.error(
            `    ${provider.id.padEnd(18)} ${provider.label}${planTag}${authTag}`,
          );
        }
        console.error("");
        console.error("  Nutzung: zt login --provider=<provider-id>");
        process.exit(0);
      } else {
        console.error(`  Unbekannter Befehl: providers ${sub ?? ""}`);
        printHelp();
        process.exit(1);
      }
      break;
    }

    case "start": {
      console.error("  Starte Gateway …");
      const { startGateway } = await import("./gateway/gateway.js");
      const server = await startGateway({
        host: flags.host ?? "127.0.0.1",
        port: flags.port ? Number(flags.port) : 3000,
      });
      await new Promise<void>((resolve) => {
        process.on("SIGINT", () => {
          console.error("\n  Gateway heruntergefahren.");
          resolve();
        });
        process.on("SIGTERM", () => {
          console.error("\n  Gateway heruntergefahren.");
          resolve();
        });
      });
      await server.close();
      process.exit(0);
      break;
    }

    case "status":
      {
        console.error("  Systemstatus:");
        console.error("");
        const { loadConfig } = await import("./config/config.js");
        const { listAccounts } = await import("./accounts/account-service.js");
        const { getCachedModels } = await import("./models/model-cache.js");
        const config = await loadConfig();
        const accounts = await listAccounts();
        const valid = accounts.filter((a) => a.sessionStatus === "valid").length;
        const cached = await getCachedModels();
        console.error(`    Gateway:     ${config.gateway.host}:${config.gateway.port}`);
        console.error(`    Accounts:    ${accounts.length} (${valid} gültig)`);
        console.error(`    Modelle:     ${cached?.length ?? 0} gecacht`);
        console.error(`    Strategie:   ${config.selectionStrategy}`);
        process.exit(0);
      }
      break;

    case "doctor":
      {
        const { runDoctor, printDoctorResult } = await import("./cli/doctor-command.js");
        const result = await runDoctor();
        printDoctorResult(result);
        process.exit(result.allPassed ? 0 : 1);
      }
      break;

    case "accounts":
      if (command[1] === "list") {
        const { listAccounts } = await import("./accounts/account-service.js");
        const accounts = await listAccounts();
        if (accounts.length === 0) {
          console.error("  Keine Konten gespeichert.");
          process.exit(0);
        }
        console.error("  Gespeicherte Konten:");
        for (const account of accounts) {
          const label = account.label.padEnd(20);
          const provider = (account.provider ?? "chatgpt").padEnd(12);
          const status = account.sessionStatus.padEnd(10);
          console.error(`    ${account.id.padEnd(14)} ${label} ${provider} ${status}`);
        }
        process.exit(0);
      } else if (command[1] === "validate") {
        const accountId = command[2];
        const { validateAccountSession, validateAllSessions } = await import(
          "./session/session-service.js"
        );

        if (accountId) {
          const { getAccount } = await import("./accounts/account-repository.js");
          const account = await getAccount(accountId);
          if (!account) {
            console.error(`  ✗ Account nicht gefunden: ${accountId}`);
            process.exit(1);
          }
          console.error(`  Validiere Account ${accountId} …`);
          const result = await validateAccountSession(account);
          if (result.valid) {
            console.error(`  ✓ Session gültig (${result.provider})`);
            if (result.email) console.error(`    Email: ${result.email}`);
            if (result.plan) console.error(`    Plan:  ${result.plan}`);
          } else {
            console.error(`  ✗ Session ungültig: ${result.error ?? result.status}`);
          }
        } else {
          console.error("  Validiere alle Accounts …");
          const results = await validateAllSessions();
          if (results.length === 0) {
            console.error("  Keine Accounts gespeichert.");
            process.exit(0);
          }
          let valid = 0;
          let invalid = 0;
          for (const result of results) {
            const icon = result.valid ? "✓" : "✗";
            console.error(
              `    ${icon} ${result.accountId.padEnd(14)} ${result.provider.padEnd(12)} ${
                result.valid ? "gültig" : (result.error ?? result.status)
              }`,
            );
            if (result.valid) valid++;
            else invalid++;
          }
          console.error(`  ${valid} gültig, ${invalid} ungültig`);
        }
        process.exit(0);
      } else if (command[1] === "remove") {
        const accountId = command[2];
        if (!accountId) {
          console.error("  Bitte Account-ID angeben: zt accounts remove <id>");
          process.exit(1);
        }
        const { getAccount } = await import("./accounts/account-repository.js");
        const { deleteAccount } = await import("./accounts/account-service.js");
        const existing = await getAccount(accountId);
        if (!existing) {
          console.error(`  ✗ Account nicht gefunden: ${accountId}`);
          process.exit(1);
        }
        await deleteAccount(accountId);
        console.error(`  ✓ Account entfernt: ${existing.label} (${accountId})`);
        process.exit(0);
      } else if (command[1] === "import") {
        logger.info("Accounts import noch nicht implementiert (PR 8)");
        console.error("  Konten importieren: noch nicht implementiert.");
        process.exit(1);
      } else if (command[1] === "export") {
        logger.info("Accounts export noch nicht implementiert (PR 8)");
        console.error("  Konten exportieren: noch nicht implementiert.");
        process.exit(1);
      } else {
        console.error(`  Unbekannter Befehl: accounts ${command[1] ?? ""}`);
        printHelp();
        process.exit(1);
      }
      break;

    case "models":
      if (command[1] === "list") {
        const { listModels } = await import("./models/model-service.js");
        const models = await listModels();
        if (models.length === 0) {
          console.error("  Keine Modelle gefunden.");
          process.exit(0);
        }
        console.error(`  Verfügbare Modelle (${models.length}):`);
        console.error("");
        for (const model of models) {
          const tags = [];
          if (model.capabilities.vision) tags.push("vision");
          if (model.capabilities.voice) tags.push("voice");
          const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
          console.error(
            `    ${model.id.padEnd(30)} ${model.provider.padEnd(12)}${tagStr}`,
          );
        }
        process.exit(0);
      } else if (command[1] === "refresh") {
        console.error("  Aktualisiere Modellcache …");
        const { refreshModels } = await import("./models/model-service.js");
        const models = await refreshModels();
        console.error(`  ✓ ${models.length} Modelle geladen.`);
        process.exit(0);
      } else {
        console.error(`  Unbekannter Befehl: models ${command[1] ?? ""}`);
        printHelp();
        process.exit(1);
      }
      break;

    case "usage":
      logger.info("Usage-Befehle noch nicht implementiert (PR 7)");
      console.error("  Nutzungslimits: noch nicht implementiert.");
      process.exit(1);
      break;

    case "config":
      if (command[1] === "show") {
        const { loadConfig } = await import("./config/config.js");
        const config = await loadConfig();
        console.error("  Konfiguration:");
        console.error("");
        console.error(`    Gateway:       ${config.gateway.host}:${config.gateway.port}`);
        console.error(`    Log-Level:     ${config.gateway.logLevel}`);
        console.error(`    CORS:          ${config.gateway.cors}`);
        console.error(`    Strategie:     ${config.selectionStrategy}`);
        console.error(`    Cache-TTL:     ${config.modelsCacheTTL}s`);
        if (config.proxy?.global) {
          const p = config.proxy.global;
          console.error(`    Proxy:         ${p.protocol}://${p.host}:${p.port}`);
        }
        console.error(`    UI:            ${config.ui.enabled ? `Port ${config.ui.port}` : "deaktiviert"}`);
        process.exit(0);
      } else {
        console.error(`  Unbekannter Befehl: config ${command[1] ?? ""}`);
        printHelp();
        process.exit(1);
      }
      break;

    default:
      console.error(`  Unbekannter Befehl: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  logger.fatal(err, "Unbehandelter Fehler");
  process.exit(1);
});
