export class ChatGPTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatGPTError";
  }
}

export class ChatGPTBrowserError extends ChatGPTError {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = "ChatGPTBrowserError";
  }
}

export class ChatGPTLoginTimeoutError extends ChatGPTError {
  constructor(timeoutMs: number) {
    super(
      `Login-Zeitüberschreitung nach ${timeoutMs / 1000}s. ` +
        "Bitte melde dich manuell bei chatgpt.com an.",
    );
    this.name = "ChatGPTLoginTimeoutError";
  }
}

export class ChatGPTNotPlusError extends ChatGPTError {
  constructor() {
    super(
      "Dieser ChatGPT-Account hat keinen Plus-Zugriff. " +
        "AI Zero Token benötigt einen aktiven ChatGPT Plus Account.",
    );
    this.name = "ChatGPTNotPlusError";
  }
}

export class ChatGPTSessionError extends ChatGPTError {
  constructor(message: string) {
    super(message);
    this.name = "ChatGPTSessionError";
  }
}

/** Wrapper for fetch-level errors (network, proxy, DNS) */
export class ChatGPTNetworkError extends ChatGPTError {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "ChatGPTNetworkError";
  }
}
