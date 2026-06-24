import type {
  ChatGPTPlusAccount,
  ProviderType,
} from "../accounts/account-types.js";
import { getAccount } from "../accounts/account-repository.js";
import { InferenceError } from "../inference/inference-provider.js";
import { quotaManager } from "../quota/quota-manager.js";

export interface ResolveProviderAccountOptions {
  provider: ProviderType;
  modelId: string;
  requestedAccountId?: string;
  configuredAccountId?: string;
}

export async function resolveProviderAccount(
  options: ResolveProviderAccountOptions,
): Promise<ChatGPTPlusAccount> {
  const accountId = options.requestedAccountId ?? options.configuredAccountId;

  if (!accountId) {
    const selected = await quotaManager.acquireAccount({
      provider: options.provider,
      modelId: options.modelId,
    });
    if (!selected) {
      throw new InferenceError(
        `Kein aktiver ${options.provider}-Account verfügbar.`,
        503,
        options.provider,
      );
    }
    return selected;
  }

  const account = await getAccount(accountId);
  if (!account) {
    throw new InferenceError(
      `Account nicht gefunden: ${accountId}`,
      404,
      options.provider,
    );
  }
  if (account.provider !== options.provider) {
    throw new InferenceError(
      `Account gehört nicht zu ${options.provider}: ${accountId}`,
      400,
      options.provider,
    );
  }
  if (!account.enabled || account.sessionStatus !== "valid") {
    throw new InferenceError(
      `Account-Session nicht aktiv: ${accountId}`,
      403,
      options.provider,
    );
  }

  return account;
}
