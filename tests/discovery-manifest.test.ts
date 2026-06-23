import { describe, expect, it } from "vitest";
import {
  parseDiscoveryManifest,
  validateManifestSource,
} from "../src/zero-token/discovery/manifest.js";

describe("provider discovery manifests", () => {
  it("accepts only GitHub raw HTTPS sources", () => {
    expect(
      validateManifestSource(
        "https://raw.githubusercontent.com/example/catalog/main/providers.json",
      ).hostname,
    ).toBe("raw.githubusercontent.com");

    expect(() => validateManifestSource("http://raw.githubusercontent.com/test.json")).toThrow();
    expect(() => validateManifestSource("https://example.com/providers.json")).toThrow();
  });

  it("imports remote providers as disabled candidates", () => {
    const providers = parseDiscoveryManifest(
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: "example-web",
            label: "Example Web",
            kind: "web",
            homepage: "https://example.com",
            models: ["example-chat", "example-chat", "bad model id"],
          },
        ],
      }),
      "https://raw.githubusercontent.com/example/catalog/main/providers.json",
    );

    expect(providers).toEqual([
      expect.objectContaining({
        id: "example-web",
        status: "candidate",
        kind: "web",
        models: ["example-chat"],
      }),
    ]);
  });

  it("rejects malformed manifests", () => {
    expect(() => parseDiscoveryManifest('{"version":2}', "test")).toThrow(
      "Ungültiges Discovery-Manifest",
    );
  });
});
