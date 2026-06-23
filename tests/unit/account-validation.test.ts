import { describe, it, expect } from "vitest";
import {
  validateAccountId,
  validateAccountLabel,
  validateEmail,
  validateCookies,
  validateSessionStatus,
  validateUsageState,
  validatePriority,
  validateForSave,
} from "../../src/zero-token/accounts/account-validation.js";

describe("account-validation", () => {
  describe("validateAccountId", () => {
    it("akzeptiert gültige IDs", () => {
      expect(validateAccountId("abc123").valid).toBe(true);
      expect(validateAccountId("a-b_c").valid).toBe(true);
      expect(validateAccountId("x".repeat(128)).valid).toBe(true);
    });

    it("lehnt ungültige IDs ab", () => {
      expect(validateAccountId("").valid).toBe(false);
      expect(validateAccountId(123).valid).toBe(false);
      expect(validateAccountId("x".repeat(129)).valid).toBe(false);
      expect(validateAccountId("abc def").valid).toBe(false);
      expect(validateAccountId("abc/def").valid).toBe(false);
    });
  });

  describe("validateAccountLabel", () => {
    it("akzeptiert gültige Labels", () => {
      expect(validateAccountLabel("Mein Konto").valid).toBe(true);
      expect(validateAccountLabel("Work Account 2").valid).toBe(true);
    });

    it("lehnt ungültige Labels ab", () => {
      expect(validateAccountLabel("").valid).toBe(false);
      expect(validateAccountLabel("   ").valid).toBe(false);
      expect(validateAccountLabel(42).valid).toBe(false);
      expect(validateAccountLabel("x".repeat(257)).valid).toBe(false);
    });
  });

  describe("validateEmail", () => {
    it("akzeptiert gültige E-Mails", () => {
      expect(validateEmail("user@example.com").valid).toBe(true);
      expect(validateEmail("a.b@c.co").valid).toBe(true);
    });

    it("akzeptiert undefined/null", () => {
      expect(validateEmail(undefined).valid).toBe(true);
      expect(validateEmail(null).valid).toBe(true);
    });

    it("lehnt ungültige E-Mails ab", () => {
      expect(validateEmail("invalid").valid).toBe(false);
      expect(validateEmail("").valid).toBe(false);
      expect(validateEmail(123).valid).toBe(false);
    });
  });

  describe("validateCookies", () => {
    it("akzeptiert gültige Cookies", () => {
      expect(validateCookies("session=abc123").valid).toBe(true);
    });

    it("lehnt ungültige Cookies ab", () => {
      expect(validateCookies("").valid).toBe(false);
      expect(validateCookies(123).valid).toBe(false);
    });
  });

  describe("validateSessionStatus", () => {
    it("akzeptiert gültige Stati", () => {
      for (const s of ["unknown", "valid", "expired", "login-required", "error"]) {
        expect(validateSessionStatus(s).valid).toBe(true);
      }
    });

    it("lehnt ungültige Stati ab", () => {
      expect(validateSessionStatus("invalid").valid).toBe(false);
      expect(validateSessionStatus(42).valid).toBe(false);
    });
  });

  describe("validateUsageState", () => {
    it("akzeptiert gültige States", () => {
      for (const s of ["unknown", "available", "limited", "exhausted", "error"]) {
        expect(validateUsageState(s).valid).toBe(true);
      }
    });

    it("akzeptiert undefined/null", () => {
      expect(validateUsageState(undefined).valid).toBe(true);
      expect(validateUsageState(null).valid).toBe(true);
    });

    it("lehnt ungültige States ab", () => {
      expect(validateUsageState("invalid").valid).toBe(false);
    });
  });

  describe("validatePriority", () => {
    it("akzeptiert ganze Zahlen", () => {
      expect(validatePriority(0).valid).toBe(true);
      expect(validatePriority(100).valid).toBe(true);
      expect(validatePriority(-1).valid).toBe(true);
    });

    it("lehnt nicht-ganze Zahlen ab", () => {
      expect(validatePriority(1.5).valid).toBe(false);
      expect(validatePriority("1").valid).toBe(false);
      expect(validatePriority(null).valid).toBe(false);
    });
  });

  describe("validateForSave", () => {
    it("akzeptiert vollständige gültige Account-Daten", () => {
      const result = validateForSave({
        id: "abc123",
        label: "Mein Konto",
        cookies: "session=abc",
        sessionStatus: "valid",
        priority: 0,
        enabled: true,
      });
      expect(result.valid).toBe(true);
    });

    it("lehnt ungültige Account-Daten ab", () => {
      const result = validateForSave({
        id: "",
        label: "",
        cookies: "",
        sessionStatus: "invalid",
        priority: 1.5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it("gibt alle Fehler zurück", () => {
      const result = validateForSave({
        id: "",
        label: "",
        cookies: "",
        sessionStatus: "invalid",
        priority: 1.5,
      });
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
