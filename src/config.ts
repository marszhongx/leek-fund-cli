import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface Config {
  stocks: string[];
  interval: number;
}

export const DEFAULT_INTERVAL = 10000;
const MIN_INTERVAL = 1000;

export function defaultConfig(): Config {
  return { stocks: [], interval: DEFAULT_INTERVAL };
}

export function defaultConfigPath(): string {
  const override = process.env.LEEK_FUND_CLI_CONFIG;
  if (override) {
    return resolve(override);
  }
  return join(homedir(), '.leek-fund-cli', 'config.json');
}

export function loadConfig(file: string): Config {
  if (!existsSync(file)) {
    return defaultConfig();
  }

  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>;
  const stocks = Array.isArray(raw.stocks)
    ? raw.stocks
        .filter((code): code is string => typeof code === 'string')
        .map((code) => code.trim())
        .filter(Boolean)
    : [];

  const interval = Number(raw.interval);

  return {
    stocks: [...new Set(stocks)],
    interval:
      Number.isFinite(interval) && interval >= MIN_INTERVAL
        ? interval
        : DEFAULT_INTERVAL,
  };
}

export function saveConfig(config: Config, file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
