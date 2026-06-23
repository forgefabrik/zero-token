import { describe, it, expect } from "vitest";
import type { ChatGPTPlusAccount } from "../../src/zero-token/accounts/account-types.js";
import { maskAccount, maskEmail, generateId } from "../../src/zero-token/accounts/account-service.js";

describe("account-service", () => {
  const makeAccount = (overrides: Partial<ChatGPTPlusAccount> = {}): ChatGPTPlusAccount => ({
    id: "test-1",
    label: "Test",
    cookies: "session=secret123",
    accessToken: "token_secret",
    enabled: true,
    priority: 0,
    sessionStatus: "valid",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  describe("maskAccount", () => {
    it("entfernt cookies und accessToken", () => {
      const masked = maskAccount(makeAccount());
      expect(masked).not.toHaveProperty("cookies");
      expect(masked).not.toHaveProperty("accessToken");
    });

    it("behält alle anderen Felder", () => {
      const masked = maskAccount(makeAccount());
      expect(masked.id).toBe("test-1");
      expect(masked.label).toBe("Test");
      expect(masked.enabled).toBe(true);
      expect(masked.sessionStatus).toBe("valid");
    });
  });

  describe("maskEmail", () => {
    it("maskiert E-Mail vor @", () => {
      expect(maskEmail("user@example.com")).toBe("u***@example.com");
    });

    it("gibt undefined bei keinem Email", () => {
      expect(maskEmail(undefined)).toBeUndefined();
      expect(maskEmail("")).toBeUndefined();
    });

    it("lässt kurze E-Mails unverändert", () => {
      expect(maskEmail("a@b.co")).toBe("a@b.co");
    });
  });

  describe("generateId", () => {
    it("erzeugt einen String der Länge 12", () => {
      const id = generateId();
      expect(id).toHaveLength(12);
    });

    it("enthält nur alphanumerische Zeichen", () => {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    it("erzeugt unterschiedliche IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });
});
