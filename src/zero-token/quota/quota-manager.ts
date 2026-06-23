import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import { updateAccount } from "../accounts/account-service.js";
import { AccountRouter } from "../multi-account/router.js";
import logger from "../logger.js";

/**
 * Rate-Limiter pro Account (In-Memory).
 */
class AccountRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private counters = new Map<string, { count: number; resetAt: number }>();

  constructor(windowMs = 60_000, maxRequests = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(accountId: string): boolean {
    const now = Date.now();
    const entry = this.counters.get(accountId);

    if (!entry || now > entry.resetAt) {
      this.counters.set(accountId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  getRemaining(accountId: string): number {
    const entry = this.counters.get(accountId);
    if (!entry) return this.maxRequests;
    if (Date.now() > entry.resetAt) return this.maxRequests;
    return Math.max(0, this.maxRequests - entry.count);
  }

  getResetTime(accountId: string): number | undefined {
    const entry = this.counters.get(accountId);
    return entry?.resetAt;
  }
}

/**
 * Quota-Manager – integriert Account-Auswahl, Rate-Limiting und Usage-Tracking.
 * Zentraler Einstiegspunkt für den Inference-Core.
 */
export class QuotaManager {
  private router: AccountRouter;
  private rateLimiter: AccountRateLimiter;
  private consecutiveErrors = new Map<string, number>();

  constructor() {
    this.router = new AccountRouter();
    this.rateLimiter = new AccountRateLimiter(60_000, 10);
  }

  async init(): Promise<void> {
    await this.router.init();
  }

  /**
   * Wählt einen Account aus und prüft Rate-Limit.
   * Gibt null zurück wenn kein Account verfügbar ist.
   */
  async acquireAccount(options?: {
    provider?: string;
    modelId?: string;
    excludeAccountId?: string;
  }): Promise<ChatGPTPlusAccount | null> {
    const result = await this.router.select({
      provider: options?.provider as any,
      modelId: options?.modelId,
      excludeAccountId: options?.excludeAccountId,
    });

    if (!result) return null;

    const account = result.account;

    // Check rate limit
    if (!this.rateLimiter.isAllowed(account.id)) {
      const resetAt = this.rateLimiter.getResetTime(account.id);
      logger.warn({
        accountId: account.id,
        resetAt: resetAt ? new Date(resetAt).toISOString() : "unknown",
      }, "Rate-Limit für Account erreicht – versuche anderen Account");

      // Try to get a different account (exclude this one)
      return this.acquireAccount({
        ...options,
        excludeAccountId: account.id,
      });
    }

    // Check consecutive error threshold
    const errors = this.consecutiveErrors.get(account.id) ?? 0;
    if (errors >= 3) {
      logger.warn({ accountId: account.id, errors }, "Account nach 3 Fehlschlägen deaktiviert");
      await updateAccount(account.id, {
        enabled: false,
        sessionStatus: "error",
      });
      // Retry with another account
      return this.acquireAccount({
        ...options,
        excludeAccountId: account.id,
      });
    }

    return account;
  }

  /**
   * Report a successful inference.
   */
  async reportSuccess(accountId: string): Promise<void> {
    this.consecutiveErrors.set(accountId, 0);
    await updateAccount(accountId, {
      usageStatus: {
        state: "available",
        checkedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Report a failed inference.
   */
  async reportError(accountId: string, error: Error): Promise<void> {
    const errors = (this.consecutiveErrors.get(accountId) ?? 0) + 1;
    this.consecutiveErrors.set(accountId, errors);

    // Check for auth errors
    if (error.name === "InferenceAuthError") {
      await updateAccount(accountId, {
        sessionStatus: "expired",
        enabled: false,
      });
      logger.warn({ accountId }, "Account aufgrund von Auth-Fehler deaktiviert");
    }

    await updateAccount(accountId, {
      usageStatus: {
        state: "error",
        error: error.message,
        checkedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Report a rate limit hit.
   */
  async reportRateLimited(accountId: string): Promise<void> {
    await this.router.markExhausted(accountId);
  }

  /**
   * Get remaining requests for an account in the current window.
   */
  getRemainingRequests(accountId: string): number {
    return this.rateLimiter.getRemaining(accountId);
  }
}

/** Singleton */
export const quotaManager = new QuotaManager();
