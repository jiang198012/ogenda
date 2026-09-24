#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEFAULT_VAULT = "/Users/jiang/claude/workbuddian/demo-vault";
export const DEFAULT_PORT = 9333;
export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 900;
export const DEFAULT_BINARY = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";

export function buildLaunchPlan({
  vaultPath,
  port = DEFAULT_PORT,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  binary = DEFAULT_BINARY,
}) {
  return {
    binary,
    args: [
      `--remote-debugging-port=${port}`,
      `--window-size=${width},${height}`,
      "--new-window",
      `--vault=${vaultPath}`,
    ],
  };
}

function usage() {
  return `用法: node scripts/manual-test/launch-demo-vault.mjs [选项]

选项:
  --vault PATH       测试 vault 路径（默认 ${DEFAULT_VAULT}）
  --port PORT        CDP 端口（默认 ${DEFAULT_PORT}）
  --width PX         初始窗口宽度（默认 ${DEFAULT_WIDTH}）
  --height PX        初始窗口高度（默认 ${DEFAULT_HEIGHT}）
  --binary PATH      Obsidian 可执行文件（默认 ${DEFAULT_BINARY}）
  --dry-run          只打印启动计划，不启动 Obsidian
  --help             显示帮助
`;
}

function parseArgs(argv) {
  const options = {
    vaultPath: process.env.OGENDA_DEMO_VAULT ?? DEFAULT_VAULT,
    port: Number(process.env.OGENDA_CDP_PORT ?? DEFAULT_PORT),
    width: Number(process.env.OGENDA_WINDOW_WIDTH ?? DEFAULT_WIDTH),
    height: Number(process.env.OGENDA_WINDOW_HEIGHT ?? DEFAULT_HEIGHT),
    binary: process.env.OGENDA_OBSIDIAN_BIN ?? DEFAULT_BINARY,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") return { help: true };
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const [key, inline] = arg.split("=", 2);
    const value = inline ?? argv[++i];
    if (!value) throw new Error(`缺少 ${key} 的值`);
    if (key === "--vault") options.vaultPath = value;
    else if (key === "--port") options.port = Number(value);
    else if (key === "--width") options.width = Number(value);
    else if (key === "--height") options.height = Number(value);
    else if (key === "--binary") options.binary = value;
    else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function validateOptions(options) {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`CDP 端口无效: ${options.port}`);
  }
  for (const [key, value] of [["width", options.width], ["height", options.height]]) {
    if (!Number.isInteger(value) || value < 200) throw new Error(`${key} 必须是 >= 200 的整数: ${value}`);
  }
  if (!existsSync(options.vaultPath) || !statSync(options.vaultPath).isDirectory()) {
    throw new Error(`vault 路径不存在或不是目录: ${options.vaultPath}`);
  }
  if (!options.dryRun && !existsSync(options.binary)) {
    throw new Error(`Obsidian 可执行文件不存在: ${options.binary}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  validateOptions(options);
  const plan = buildLaunchPlan(options);
  console.log(JSON.stringify({
    vault: options.vaultPath,
    cdp: `http://127.0.0.1:${options.port}`,
    viewport: { width: options.width, height: options.height },
    plan,
    dryRun: options.dryRun,
  }, null, 2));
  if (options.dryRun) return 0;

  const child = spawn(plan.binary, plan.args, { stdio: "inherit" });
  return await new Promise((resolve) => {
    child.once("error", (error) => {
      console.error(`[demo-vault] 启动失败: ${error.message}`);
      resolve(1);
    });
    child.once("exit", (code, signal) => {
      if (signal) console.error(`[demo-vault] Obsidian 被信号 ${signal} 结束`);
      resolve(code ?? 1);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`[demo-vault] ${error.message}`);
    process.exit(1);
  });
}
