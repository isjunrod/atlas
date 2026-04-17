import { config } from "./config";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

function should(level: Level): boolean {
  return LEVELS[level] >= LEVELS[config.LOG_LEVEL];
}

function ts() {
  return new Date().toISOString();
}

function fmt(level: Level, msg: string, meta?: Record<string, unknown>) {
  const metaStr = meta && Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  return `${ts()} [ATLAS] ${level.toUpperCase()}: ${msg}${metaStr}`;
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (should("debug")) console.log(fmt("debug", msg, meta));
  },
  info: (msg: string, meta?: Record<string, unknown>) => {
    if (should("info")) console.log(fmt("info", msg, meta));
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    if (should("warn")) console.warn(fmt("warn", msg, meta));
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    if (should("error")) console.error(fmt("error", msg, meta));
  },
};
