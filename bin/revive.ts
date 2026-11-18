#!/usr/bin/env bun
/**
 * revive CLI — Ableton Live plugin-UI recovery watchdog.
 *
 *   revive run [--root DIR] [--min N] [--cooldown SEC]   run one pass
 *   revive install [--interval MIN]                      register the scheduled task
 *   revive uninstall                                     remove the scheduled task
 *   revive check [--root DIR]                            dry-run: detect only, no kill
 */
import { runWatchdog, findLatestLog, countFailures, readTail, defaultAbletonRoot } from "../src/watchdog.ts";
import { installScheduledTask, uninstallScheduledTask } from "../src/install.ts";

const args = process.argv.slice(2);
const cmd = args[0] ?? "run";
const get = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

switch (cmd) {
  case "run": {
    const r = runWatchdog({
      abletonRoot: get("--root"),
      minFailures: get("--min") ? Number(get("--min")) : undefined,
      cooldownSec: get("--cooldown") ? Number(get("--cooldown")) : undefined,
    });
    console.log(`log: ${r.logPath || "(none)"}`);
    console.log(`failures: ${r.failures}`);
    console.log(`recovered: ${r.recovered}`);
    if (r.killed.length) console.log(`killed: ${r.killed.join(", ")}`);
    console.log(`note: ${r.note}`);
    process.exit(r.recovered ? 0 : 1);
  }
  case "check": {
    const root = get("--root") ?? defaultAbletonRoot();
    const logPath = findLatestLog(root);
    if (!logPath) { console.log("no Log.txt found"); process.exit(1); }
    const text = readTail(logPath, 500);
    console.log(`log: ${logPath}`);
    console.log(`failures (last 500 lines): ${countFailures(text)}`);
    process.exit(0);
  }
  case "install": {
    const r = installScheduledTask({ intervalMin: get("--interval") ? Number(get("--interval")) : 10 });
    console.log(`[${r.platform}] ${r.detail}`);
    process.exit(r.ok ? 0 : 1);
  }
  case "uninstall": {
    const r = uninstallScheduledTask();
    console.log(r.detail);
    process.exit(r.ok ? 0 : 1);
  }
  default:
    console.log("usage: revive {run|check|install|uninstall} [--root DIR] [--min N] [--cooldown SEC] [--interval MIN]");
    process.exit(2);
}