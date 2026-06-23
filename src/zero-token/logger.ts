import pino from "pino";
import { liveLogStream } from "./logging/log-events.js";

const consoleStream = process.env.ZT_PRETTY === "1"
  ? pino.transport({ target: "pino-pretty" })
  : pino.destination(1);

const logger = pino(
  {
    name: "nova",
    level: process.env.NOVA_LOG_LEVEL ?? process.env.ZT_LOG_LEVEL ?? "info",
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
  },
  pino.multistream([
    { level: "trace", stream: consoleStream },
    { level: "trace", stream: liveLogStream },
  ]),
);

export default logger;
