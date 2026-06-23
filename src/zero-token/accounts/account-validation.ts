import type { ChatGPTPlusAccount, SessionStatus, UsageState } from "./account-types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function err(msg: string): ValidationResult {
  return { valid: false, errors: [msg] };
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  return { valid: errors.length === 0, errors };
}

export function validateAccountId(id: unknown): ValidationResult {
  if (typeof id !== "string") return err("Account-ID muss ein String sein.");
  if (id.length === 0) return err("Account-ID darf nicht leer sein.");
  if (id.length > 128) return err("Account-ID darf maximal 128 Zeichen lang sein.");
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return err("Account-ID enthält ungültige Zeichen.");
  return ok();
}

export function validateAccountLabel(label: unknown): ValidationResult {
  if (typeof label !== "string") return err("Label muss ein String sein.");
  if (label.trim().length === 0) return err("Label darf nicht leer sein.");
  if (label.length > 256) return err("Label darf maximal 256 Zeichen lang sein.");
  return ok();
}

export function validateEmail(email: unknown): ValidationResult {
  if (email === undefined || email === null) return ok();
  if (typeof email !== "string") return err("E-Mail muss ein String sein.");
  if (email.length > 320) return err("E-Mail darf maximal 320 Zeichen lang sein.");
  const simple = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!simple.test(email)) return err("E-Mail hat kein gültiges Format.");
  return ok();
}

export function validateCookies(cookies: unknown): ValidationResult {
  if (typeof cookies !== "string") return err("Cookies müssen ein String sein.");
  if (cookies.length === 0) return err("Cookies dürfen nicht leer sein.");
  return ok();
}

export function validateSessionStatus(status: unknown): ValidationResult {
  const allowed: SessionStatus[] = ["unknown", "valid", "expired", "login-required", "error"];
  if (!allowed.includes(status as SessionStatus)) {
    return err(`Ungültiger Session-Status: ${status}`);
  }
  return ok();
}

export function validateUsageState(state: unknown): ValidationResult {
  const allowed: UsageState[] = ["unknown", "available", "limited", "exhausted", "error"];
  if (state !== undefined && state !== null && !allowed.includes(state as UsageState)) {
    return err(`Ungültiger Usage-State: ${state}`);
  }
  return ok();
}

export function validatePriority(priority: unknown): ValidationResult {
  if (typeof priority !== "number") return err("Priorität muss eine Zahl sein.");
  if (!Number.isInteger(priority)) return err("Priorität muss eine ganze Zahl sein.");
  return ok();
}

export function validateForSave(account: Record<string, unknown>): ValidationResult {
  return merge(
    validateAccountId(account.id),
    validateAccountLabel(account.label),
    validateEmail(account.email),
    validateCookies(account.cookies),
    validateSessionStatus(account.sessionStatus),
    validatePriority(account.priority),
  );
}
