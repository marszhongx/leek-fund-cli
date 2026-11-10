#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LeekFundApp } from './app.js';
import { defaultConfigPath, loadConfig } from './config.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')
  ) as { version?: string };
  return pkg.version ?? '0.0.0';
}

function printHelp(): void {
  console.log(`leek-fund-cli - Leek Fund 股票行情 TUI

用法:
  leek-fund-cli [--config <文件>]

快捷键:
  ↑/↓       选择股票
  a         添加股票代码
  d         删除选中的股票代码
  r         立即刷新
  q         退出

配置:
  ${defaultConfigPath()}
  也可通过 --config 或 LEEK_FUND_CLI_CONFIG 指定配置文件。`);
}

interface Options {
  configFile: string;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Options {
  let configFile = defaultConfigPath();
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--config' || arg === '-c') {
      const value = argv[++i];
      if (!value) {
        throw new Error(`${arg} 缺少文件路径`);
      }
      configFile = resolve(value);
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--version' || arg === '-v') {
      version = true;
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  return { configFile, help, version };
}

let options: Options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  console.error('使用 leek-fund-cli --help 查看用法。');
  process.exit(1);
}

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.version) {
  console.log(readVersion());
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error('leek-fund-cli 需要在交互式终端中运行。');
  process.exit(1);
}

let app: LeekFundApp;
try {
  app = new LeekFundApp(loadConfig(options.configFile), options.configFile);
} catch (error) {
  console.error(`加载配置失败: ${(error as Error).message}`);
  process.exit(1);
}

process.on('SIGINT', () => {
  app.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  app.stop();
  process.exit(0);
});

app.start();
