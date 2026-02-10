export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

let currentLevel = process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  return {
    debug: (msg) => {
      if (currentLevel <= LogLevel.DEBUG) console.log(`${prefix} ${msg}`);
    },
    info: (msg) => {
      if (currentLevel <= LogLevel.INFO) console.log(`${prefix} ${msg}`);
    },
    warn: (msg) => {
      if (currentLevel <= LogLevel.WARN) console.warn(`${prefix} ${msg}`);
    },
    error: (msg) => {
      if (currentLevel <= LogLevel.ERROR) console.error(`${prefix} ${msg}`);
    },
  };
}
