import { describe, expect, it } from "vitest";

import { createProviderService } from "./create-provider-service.js";

describe("createProviderService", () => {
  it("shares one registry between provider lookup and model discovery", async () => {
    const service = createProviderService();

    service.registry.register({
      id: "local",
      async listModels() {
        return [
          {
            id: "demo",
            displayName: "Demo",
            providerId: "local",
            supportsStreaming: false,
          },
        ];
      },
    });

    await service.models.refresh();

    expect(service.registry.has("local")).toBe(true);
    expect(service.models.find("local", "demo")?.displayName).toBe("Demo");
  });
});
