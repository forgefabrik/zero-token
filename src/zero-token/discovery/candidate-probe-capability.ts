import { existsSync } from "node:fs";
import { chromium } from "playwright";

export interface CandidateProbeCapability {
  available: boolean;
  browser: "chromium";
}

export function getCandidateProbeCapability(): CandidateProbeCapability {
  const executablePath = chromium.executablePath();
  return {
    available: Boolean(executablePath) && existsSync(executablePath),
    browser: "chromium",
  };
}
