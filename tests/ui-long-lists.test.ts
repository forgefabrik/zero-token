import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("long list safeguards", () => {
  it("paginates account and model tables", () => {
    for (const file of [
      "web-console/src/pages/AccountsSheet.svelte",
      "web-console/src/pages/ModelsSheet.svelte",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("PAGE_SIZE = 50");
      expect(source).toContain("visibleRows");
      expect(source).toContain('class="pager"');
    }
  });

  it("caps live logs and constrains table layout", () => {
    const logs = readFileSync("web-console/src/pages/LogsSheet.svelte", "utf8");
    const css = readFileSync("web-console/src/responsive.css", "utf8");
    expect(logs).toContain("VISIBLE_LIMIT = 100");
    expect(css).toContain("table-layout:fixed!important");
    expect(css).toContain("text-overflow:ellipsis!important");
  });
});
