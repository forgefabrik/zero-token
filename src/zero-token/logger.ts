import pino from "pino";

const logger = pino({
  name: "zero-token",
  level: process.env.ZT_LOG_LEVEL ?? "info",
  ...(process.env.ZT_PRETTY === "1" && {
    transport: { target: "pino-pretty" },
  }),
  redact: {
    paths: [
      "cookies",
      "accessToken",
      "*.cookies",
      "*.accessToken",
      "authorization",
      "Authorization",
      "cookie",
      "Cookie",
    ],
    censor: "[REDACTED]",
  },
});

export default logger;
