import type { ChatGPTPlusAccount, ProviderType } from "../accounts/account-types.js";
import { listAccounts, updateAccount } from "../accounts/account-service.js";
import { loadConfig } from "../config/config.js";
import logger from "../logger.js";

/**
 * Account selection strategies.
 */
export type SelectionStrategy = "priority" | "round-robin";

/**
 * Result of account selection.
 */
export interface SelectedAccount {
  account: ChatGPTPlusAccount;
}

/**
 * Account Router – selects the best account for inference based on strategy.
 */
export class AccountRouter {
  private strategy: SelectionStrategy = "priority";
  private roundRobinIndex = 0;

  async init(): Promise<void> {
    const config = await loadConfig();
    this.strategy = config.selectionStrategy;
  }

  /**
   * Select an account for inference.
   * Optionally filter by provider and/or model.
   */
  async select(options?: {
    provider?: ProviderType;
    modelId?: string;
    excludeAccountId?: string;
  }): Promise<SelectedAccount | null> {
    const accounts = await this.getAvailableAccounts(options?.provider);

    if (accounts.length === 0) {
      logger.warn("Keine verfügbaren Accounts für Selektion");
      return null;
    }

    const selected = this.strategy === "round-robin"
      ? this.selectRoundRobin(accounts)
      : this.selectByPriority(accounts);

    if (selected) {
      await updateAccount(selected.id, { lastUsedAt: new Date().toISOString() });
    }

    return selected ? { account: selected } : null;
  }

  /**
   * Get all accounts that can be used for inference right now.
   */
  private async getAvailableAccounts(provider?: ProviderType): Promise<ChatGPTPlusAccount[]> {
    const allAccounts = await listAccounts();
    return allAccounts.filter((a) => {
      if (!a.enabled) return false;
      if (a.sessionStatus !== "valid") return false;
      if (provider && a.provider !== provider) return false;
      if (a.usageStatus?.state === "exhausted") return false;
      return true;
    });
  }

  private selectByPriority(accounts: ChatGPTPlusAccount[]): ChatGPTPlusAccount | undefined {
    const sorted = [...accounts].sort((a, b) => {
      // Lower priority number = higher priority
      const prioDiff = (a.priority ?? 100) - (b.priority ?? 100);
      if (prioDiff !== 0) return prioDiff;
      // Same priority: prefer least recently used
      const aLast = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bLast = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return aLast - bLast;
    });
    return sorted[0];
  }

  private selectRoundRobin(accounts: ChatGPTPlusAccount[]): ChatGPTPlusAccount | undefined {
    if (accounts.length === 0) return undefined;
    const index = this.roundRobinIndex % accounts.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % accounts.length;
    return accounts[index];
  }

  /**
   * Mark an account as exhausted (usage limit reached).
   */
  async markExhausted(accountId: string): Promise<void> {
    await updateAccount(accountId, {
      usageStatus: {
        state: "exhausted",
        checkedAt: new Date().toISOString(),
      },
    });
    logger.warn({ accountId }, "Account als exhausted markiert");
  }

  /**
   * Mark an account as available again (after usage reset).
   */
  async markAvailable(accountId: string): Promise<void> {
    await updateAccount(accountId, {
      usageStatus: {
        state: "available",
        checkedAt: new Date().toISOString(),
      },
    });
    logger.info({ accountId }, "Account wieder verfügbar");
  }
}
