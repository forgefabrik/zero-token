import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import logger from "../logger.js";

interface RequestSummary {
  model?: string;
  accountId?: string;
  stream?: boolean;
  messages?: number;
}

async function summarizeRequest(request: Request): Promise<RequestSummary | undefined> {
  if (request.method !== "POST") return undefined;
  const path = new URL(request.url).pathname;
  if (![
    "/v1/chat/completions",
    "/v1/responses",
    "/api/playground/chat",
  ].includes(path)) return undefined;

  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    const input = body.messages ?? body.input;
    return {
      model: typeof body.model === "string" ? body.model : undefined,
      accountId: typeof body.accountId === "string" ? body.accountId : undefined,
      stream: body.stream === true,
      messages: Array.isArray(input) ? input.length : input === undefined ? 0 : 1,
    };
  } catch {
    return undefined;
  }
}

export function apiRequestLogger(): MiddlewareHandler {
  return async (context, next) => {
    const startedAt = performance.now();
    const requestId = context.req.header("X-Request-Id")?.trim() || randomUUID();
    const url = new URL(context.req.url);
    const summary = await summarizeRequest(context.req.raw);

    logger.info(
      {
        requestId,
        method: context.req.method,
        path: url.pathname,
        query: url.search || undefined,
        contentLength: context.req.header("Content-Length"),
        ...summary,
      },
      "API-Aufruf gestartet",
    );

    try {
      await next();
      logger.info(
        {
          requestId,
          method: context.req.method,
          path: url.pathname,
          status: context.res.status,
          durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
          contentType: context.res.headers.get("Content-Type") ?? undefined,
          ...summary,
        },
        "API-Aufruf abgeschlossen",
      );
      context.header("X-Request-Id", requestId);
    } catch (error) {
      logger.error(
        {
          requestId,
          method: context.req.method,
          path: url.pathname,
          durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
          error,
          ...summary,
        },
        "API-Aufruf fehlgeschlagen",
      );
      throw error;
    }
  };
}
