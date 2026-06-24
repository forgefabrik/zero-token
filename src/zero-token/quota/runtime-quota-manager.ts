import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import { updateAccount } from "../accounts/account-service.js";
import { AccountRouter } from "../multi-account/router.js";
import logger from "../logger.js";

class AccountRateLimiter {
  private counters = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private windowMs = 60_000,
    private maxRequests = 10,
  ) {}

  isAllowed(accountId: string): boolean {
    const now = Date.now();
    const entry = this.counters.get(accountId);
    if (!entry || now > entry.resetAt) {
      this.counters.set(accountId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.maxRequests) return false;
    entry.count += 1;
    return true;
  }

  getRemaining(accountId: string): number {
    const entry = this.counters.get(accountId);
    if (!entry || Date.now() > entry.resetAt) return this.maxRequests;
    return Math.max(0, this.maxRequests - entry.count);
  }

  getResetTime(accountId: string): number | undefined {
    return this.counters.get(accountId)?.resetAt;
  }
}

export class QuotaManager {
  private router = new AccountRouter();
  private rateLimiter = new AccountRateLimiter();
  private consecutiveErrors = new Map<string, number>();
  private consecutiveAuthErrors = new Map<string, number>();

  async init(): Promise<void> {
    await this.router.init();
  }

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
    if (!this.rateLimiter.isAllowed(account.id)) {
      logger.warn(
        {
          accountId: account.id,
          resetAt: this.rateLimiter.getResetTime(account.id),
        },
        "Rate-Limit erreicht – versuche anderen Account",
      );
      return this.acquireAccount({ ...options, excludeAccountId: account.id });
    }

    if ((this.consecutiveErrors.get(account.id) ?? 0) >= 3) {
      await updateAccount(account.id, { enabled: false, sessionStatus: "error" });
      return this.acquireAccount({ ...options, excludeAccountId: account.id });
    }

    return account;
  }

  async reportSuccess(accountId: string): Promise<void> {
    this.consecutiveErrors.set(accountId, 0);
    this.consecutiveAuthErrors.set(accountId, 0);
    const now = new Date().toISOString();
    await updateAccount(accountId, {
      sessionStatus: "valid",
      lastUsedAt: now,
      usageStatus: { state: "available", checkedAt: now },
    });
  }

  async reportError(accountId: string, error: Error): Promise<void> {
    this.consecutiveErrors.set(
      accountId,
      (this.consecutiveErrors.get(accountId) ?? 0) + 1,
    );

    if (error.name === "InferenceAuthError") {
      const count = (this.consecutiveAuthErrors.get(accountId) ?? 0) + 1;
      this.consecutiveAuthErrors.set(accountId, count);

      if (count >= 3) {
        await updateAccount(accountId, {
          enabled: false,
          sessionStatus: "expired",
          usageStatus: {
            state: "error",
            error: error.message,
            checkedAt: new Date().toISOString(),
          },
        });
        logger.warn(
          { accountId, count },
          "Account nach drei aufeinanderfolgenden Auth-Fehlern deaktiviert",
        );
        return;
      }

      await updateAccount(accountId, {
        usageStatus: {
          state: "error",
          error: `Temporärer Auth-Fehler ${count}/3: ${error.message}`,
          checkedAt: new Date().toISOString(),
        },
      });
      logger.warn(
        { accountId, count },
        "Temporärer Auth-Fehler – Account bleibt aktiv",
      );
      return;
    }

    await updateAccount(accountId, {
      usageStatus: {
        state: "error",
        error: error.message,
        checkedAt: new Date().toISOString(),
      },
    });
  }

  async reportRateLimited(accountId: string): Promise<void> {
    await this.router.markExhausted(accountId);
  }

  getRemainingRequests(accountId: string): number {
    return this.rateLimiter.getRemaining(accountId);
  }
}

export const quotaManager = new QuotaManager();
