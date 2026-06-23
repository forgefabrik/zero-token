import { afterEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  novaHome,
  zeroTokenHome,
} from "../src/zero-token/config/paths.js";

const originalNovaHome = process.env.NOVA_HOME;

afterEach(() => {
  if (originalNovaHome === undefined) delete process.env.NOVA_HOME;
  else process.env.NOVA_HOME = originalNovaHome;
});

describe("Nova storage paths", () => {
  it("supports an explicit NOVA_HOME override", () => {
    process.env.NOVA_HOME = "./.tmp/nova-home";
    expect(novaHome()).toBe(resolve("./.tmp/nova-home"));
  });

  it("keeps the legacy helper as a compatibility alias", () => {
    process.env.NOVA_HOME = "./.tmp/nova-legacy-alias";
    expect(zeroTokenHome()).toBe(novaHome());
  });
});
