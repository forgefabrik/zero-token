import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { MiddlewareHandler } from "hono";

let cachedKey: string | undefined;

function configuredApiKey(): string | undefined {
  if (cachedKey !== undefined) return cachedKey || undefined;

  const direct = process.env.NOVA_API_KEY?.trim();
  if (direct) {
    cachedKey = direct;
    return cachedKey;
  }

  const file = process.env.NOVA_API_KEY_FILE?.trim();
  if (file) {
    try {
      cachedKey = readFileSync(file, "utf8").trim();
      return cachedKey || undefined;
    } catch {
      cachedKey = "";
      return undefined;
    }
  }

  cachedKey = "";
  return undefined;
}

function equalSecret(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function requireApiKey(): MiddlewareHandler {
  return async (context, next) => {
    const expected = configuredApiKey();
    if (!expected) {
      return context.json(
        {
          error: {
            message: "Nova API-Key ist nicht konfiguriert.",
            type: "server_error",
            code: "api_key_not_configured",
          },
        },
        503,
      );
    }

    const authorization = context.req.header("Authorization") ?? "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const supplied = match?.[1]?.trim() ?? "";

    if (!supplied || !equalSecret(supplied, expected)) {
      return context.json(
        {
          error: {
            message: "Ungültiger oder fehlender API-Key.",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        },
        401,
        { "WWW-Authenticate": "Bearer" },
      );
    }

    await next();
  };
}
