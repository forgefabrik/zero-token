import type { DiscoveryProvider } from "./builtin-catalog.js";
import type { CandidateReview, DiscoveryControlConfig } from "./control-types.js";
import { inspectPublicSite } from "./public-site-inspector.js";

const ACCOUNT_REQUIRED = [
  /\bsign[ -]?in\b/i,
  /\blog[ -]?in\b/i,
  /\bregister\b/i,
  /\bcreate (?:an )?account\b/i,
  /\banmelden\b/i,
  /\bregistrieren\b/i,
  /\bkonto erstellen\b/i,
];

const NO_ACCOUNT = [
  /without (?:an )?account/i,
  /without registration/i,
  /no sign[ -]?up/i,
  /no registration/i,
  /ohne anmeldung/i,
  /ohne registrierung/i,
  /kostenlos.*ohne/i,
];

const STREAM_SIGNALS = [
  /text\/event-stream/i,
  /EventSource/i,
  /ReadableStream/i,
  /server-sent events?/i,
  /streaming responses?/i,
  /real[- ]?time responses?/i,
  /data:\s*\[DONE\]/i,
];

const API_SIGNALS = [
  /\/v1\/chat\/completions/i,
  /\/v1\/responses/i,
  /\/api\//i,
  /admin-ajax\.php/i,
  /openai[- ]compatible/i,
  /graphql/i,
];

const MODEL_PATTERN = /\b(?:gpt[- .]?[0-9a-z.]+|claude[- .]?[0-9a-z.]+|gemini[- .]?[0-9a-z.]+|deepseek[- .]?[0-9a-z.]+|llama[- .]?[0-9a-z.]+|qwen[- .]?[0-9a-z.]+|mistral[- .]?[0-9a-z.]+)\b/gi;

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function extractModels(value: string): string[] {
  return [...new Set(value.match(MODEL_PATTERN) ?? [])]
    .map((model) => model.trim().replace(/\s+/g, "-"))
    .slice(0, 25);
}

export async function evaluateCandidate(
  provider: DiscoveryProvider,
  config: DiscoveryControlConfig,
  previous?: CandidateReview,
): Promise<CandidateReview> {
  const now = new Date().toISOString();
  let score = 10;
  const reasons: string[] = [];
  let homepageReachable = false;
  let accountRequired = false;
  let streamPotential = false;
  let apiPotential = false;
  let detectedModels = [...provider.models];

  if (provider.kind === "web") {
    score += 10;
    reasons.push("Öffentliche Web-Oberfläche angegeben");
  }
  if (provider.models.length > 0) {
    score += Math.min(20, provider.models.length * 4);
    reasons.push(`${provider.models.length} Modell-ID(s) im Katalog`);
  }

  if (provider.homepage && config.inspectHomepages) {
    try {
      const inspection = await inspectPublicSite(provider.homepage);
      homepageReachable = inspection.status >= 200 && inspection.status < 400;
      if (homepageReachable) {
        score += 10;
        reasons.push(`Webseite erreichbar (HTTP ${inspection.status})`);
      }

      const searchable = inspection.html.slice(0, 500_000);
      const noAccount = matchesAny(searchable, NO_ACCOUNT);
      accountRequired = !noAccount && matchesAny(searchable, ACCOUNT_REQUIRED);
      streamPotential = matchesAny(searchable, STREAM_SIGNALS);
      apiPotential = matchesAny(searchable, API_SIGNALS);
      detectedModels = [...new Set([...detectedModels, ...extractModels(searchable)])];

      if (noAccount) {
        score += 20;
        reasons.push("Hinweis auf Nutzung ohne Registrierung gefunden");
      } else if (accountRequired) {
        score -= 5;
        reasons.push("Anmeldung oder Account wahrscheinlich erforderlich");
      }
      if (streamPotential) {
        score += 25;
        reasons.push("Hinweise auf Streaming im öffentlichen Client gefunden");
      }
      if (apiPotential) {
        score += 15;
        reasons.push("Hinweise auf API- oder AJAX-Kommunikation gefunden");
      }
      if (detectedModels.length > provider.models.length) {
        score += Math.min(15, (detectedModels.length - provider.models.length) * 3);
        reasons.push("Weitere Modellnamen auf der Webseite erkannt");
      }
    } catch (error) {
      reasons.push(
        `Webseitenprüfung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (!provider.homepage) {
    reasons.push("Keine öffentliche Homepage im Katalog");
  }

  score = Math.max(0, Math.min(100, score));
  const valuable = score >= config.minScore;
  let decision = previous?.decision ?? "new";
  if (!previous && valuable && accountRequired && config.notifyOnAccountRequired) {
    decision = "account-required";
  }

  return {
    providerId: provider.id,
    label: provider.label,
    homepage: provider.homepage,
    kind: provider.kind,
    models: detectedModels,
    source: provider.source,
    score,
    valuable,
    accountRequired,
    homepageReachable,
    streamPotential,
    apiPotential,
    decision,
    reasons,
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastCheckedAt: now,
    decidedAt: previous?.decidedAt,
    note: previous?.note,
  };
}
