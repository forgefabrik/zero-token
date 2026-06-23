import { APP_NAME, YOYO_SOURCE_URL } from "../app-meta.js";
import { initNovaAgentProject } from "./project-init.js";
import {
  getNovaAgentStatus,
  installYoyoAgent,
  runNovaAgent,
} from "./yoyo-adapter.js";

function readOption(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return undefined;
}

function passthroughArgs(args: string[]): string[] {
  const separator = args.indexOf("--");
  return separator >= 0 ? args.slice(separator + 1) : [];
}

function printAgentHelp(): void {
  console.error("");
  console.error(`  ${APP_NAME} Agent`);
  console.error("  Coding-Agent über das lokale Nova-Gateway");
  console.error("");
  console.error("  Verwendung:");
  console.error("    nova agent [run] [options] [-- <yoyo-args>]");
  console.error("    nova agent doctor");
  console.error("    nova agent install");
  console.error("    nova agent init");
  console.error("");
  console.error("  Optionen:");
  console.error("    --model <id>       Modell-ID aus dem Nova-Modellcache");
  console.error("    --base-url <url>   Gateway-URL, Standard: http://127.0.0.1:3000/v1");
  console.error("    --binary <path>    Pfad zum yoyo-Binary");
  console.error("    --yes              Agent-Ausführungen automatisch bestätigen");
  console.error("");
  console.error(`  Backend: ${YOYO_SOURCE_URL}`);
  console.error("");
}

export async function handleAgentCommand(args: string[]): Promise<number> {
  const first = args[0];
  const command = first && !first.startsWith("-") ? first : "run";
  const model = readOption(args, "model");
  const gatewayUrl = readOption(args, "base-url");
  const binary = readOption(args, "binary");

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printAgentHelp();
      return 0;

    case "doctor":
    case "status": {
      const status = await getNovaAgentStatus({ binary, gatewayUrl });
      console.error("");
      console.error(`  ${APP_NAME} Agent Status`);
      console.error(`  Binary:  ${status.binary}`);
      console.error(`  Installiert: ${status.installed ? "ja" : "nein"}`);
      if (status.version) console.error(`  Version: ${status.version}`);
      console.error(`  Gateway: ${status.gatewayUrl}`);
      console.error(`  Erreichbar: ${status.gatewayReachable ? "ja" : "nein"}`);
      console.error(`  Quelle: ${status.sourceUrl}`);
      console.error("");
      return status.installed && status.gatewayReachable ? 0 : 1;
    }

    case "install": {
      console.error("  Installiere yoyo-agent über Cargo …");
      try {
        return await installYoyoAgent();
      } catch (error) {
        console.error(
          `  Installation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error("  Voraussetzung: Rust/Cargo muss installiert und im PATH verfügbar sein.");
        return 1;
      }
    }

    case "init": {
      const result = await initNovaAgentProject({ model, gatewayUrl });
      for (const path of result.created) console.error(`  ✓ Erstellt: ${path}`);
      for (const path of result.skipped) console.error(`  – Vorhanden, nicht verändert: ${path}`);
      return 0;
    }

    case "run": {
      const status = await getNovaAgentStatus({ binary, gatewayUrl });
      if (!status.installed) {
        console.error("  yoyo wurde nicht gefunden.");
        console.error("  Installiere es mit: nova agent install");
        return 1;
      }
      if (!status.gatewayReachable) {
        console.error(`  Nova-Gateway nicht erreichbar: ${status.gatewayUrl}`);
        console.error("  Starte zuerst: nova start");
        return 1;
      }

      try {
        return await runNovaAgent({
          binary,
          gatewayUrl,
          model,
          yes: args.includes("--yes"),
          extraArgs: passthroughArgs(args),
        });
      } catch (error) {
        console.error(
          `  Agent konnte nicht gestartet werden: ${error instanceof Error ? error.message : String(error)}`,
        );
        return 1;
      }
    }

    default:
      console.error(`  Unbekannter Agent-Befehl: ${command}`);
      printAgentHelp();
      return 1;
  }
}
