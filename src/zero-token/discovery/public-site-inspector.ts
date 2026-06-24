import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

async function assertPublicHttpsUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Nur öffentliche HTTPS-Webseiten sind erlaubt.");

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Lokale Hostnamen sind nicht erlaubt.");
  }

  const literalVersion = isIP(hostname);
  if (literalVersion === 4 && isPrivateIpv4(hostname)) throw new Error("Private IP-Adresse abgelehnt.");
  if (literalVersion === 6 && isPrivateIpv6(hostname)) throw new Error("Private IP-Adresse abgelehnt.");

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("Hostname konnte nicht aufgelöst werden.");
  for (const entry of addresses) {
    if (
      (entry.family === 4 && isPrivateIpv4(entry.address)) ||
      (entry.family === 6 && isPrivateIpv6(entry.address))
    ) {
      throw new Error("Hostname verweist auf eine private oder reservierte Adresse.");
    }
  }
  return url;
}

async function readLimitedText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("Webseite ist für Discovery zu groß.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Webseite ist für Discovery zu groß.");
    }
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  return output;
}

export interface PublicSiteInspection {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
}

export async function inspectPublicSite(value: string): Promise<PublicSiteInspection> {
  let current = await assertPublicHttpsUrl(value);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "User-Agent": "Nova-Public-Discovery/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Weiterleitung ohne Ziel.");
      if (redirect === MAX_REDIRECTS) throw new Error("Zu viele Weiterleitungen.");
      current = await assertPublicHttpsUrl(new URL(location, current).toString());
      continue;
    }

    return {
      requestedUrl: value,
      finalUrl: current.toString(),
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      html: await readLimitedText(response),
    };
  }

  throw new Error("Webseite konnte nicht geprüft werden.");
}
