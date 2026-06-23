export interface ChatGPTBrowserConfig {
  /** CDP remote port (e.g. 9222). If set, connects to existing Chrome. */
  cdpPort?: number;
  /** Timeout for waiting on login, in ms (default: 300000 = 5 min) */
  loginTimeout?: number;
  /** Optional proxy URL for the browser */
  proxy?: string;
  /** Whether to show the browser window (default: true for login) */
  headless?: boolean;
}

export interface ChatGPTSessionData {
  cookies: string;
  accessToken?: string;
  userAgent?: string;
}

export interface ChatGPTAccountInfo {
  email?: string;
  userId?: string;
  name?: string;
  plan: "plus" | "unknown";
  workspaceId?: string;
}

export type LoginResult =
  | { ok: true; session: ChatGPTSessionData; info: ChatGPTAccountInfo }
  | { ok: false; reason: LoginFailureReason };

export type LoginFailureReason =
  | "browser-launch-failed"
  | "login-timeout"
  | "not-plus-account"
  | "session-extraction-failed"
  | "user-cancelled"
  | "unknown-error";

export interface BrowserInstance {
  /** Close the browser / CDP session */
  close(): Promise<void>;
}
