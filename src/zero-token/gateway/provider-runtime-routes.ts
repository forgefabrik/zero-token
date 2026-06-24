import { Hono } from "hono";

export function createProviderRuntimeRoutes(): Hono {
  const app = new Hono();

  app.get("/", async (context) => {
    const [{ listProviders }, { listAccounts }, { getCachedModels }, { isRunnableProvider }] = await Promise.all([
      import("../providers/provider-catalog.js"),
      import("../accounts/account-service.js"),
      import("../models/model-cache.js"),
      import("../providers/provider-runtime-registry.js"),
    ]);
    const accounts = await listAccounts();
    const models = (await getCachedModels()) ?? [];

    return context.json(listProviders().map((provider) => {
      const providerAccounts = accounts.filter((account) => account.provider === provider.implementation);
      const validAccounts = providerAccounts.filter((account) => account.enabled && account.sessionStatus === "valid");
      const providerModels = models.filter((model) => model.provider === provider.implementation);
      const runnable = isRunnableProvider(provider.implementation);
      const status = !runnable
        ? "not-implemented"
        : validAccounts.length === 0
          ? providerAccounts.length > 0 ? "login-required" : "disconnected"
          : providerModels.length === 0 ? "degraded" : "healthy";

      return {
        id: provider.id,
        implementation: provider.implementation,
        label: provider.label,
        runnable,
        status,
        accounts: providerAccounts.length,
        validAccounts: validAccounts.length,
        models: providerModels.length,
        lastError: providerAccounts.map((account) => account.usageStatus?.error).find(Boolean) ?? null,
      };
    }));
  });

  return app;
}
