/**
 * revive/src/watchdog.ts — Ableton Live plugin-UI recovery watchdog.
 *
 * Clean capability: detects when Ableton's plugin-metadata IPC channel is dead
 * (observable in Log.txt as repeated "could not send message" warnings for a
 * metadata-reimport message) and force-restarts the wedged Index subprocess.
 * Live auto-respawns Index and reconnects the channel, so VSTi UIs reopen.
 *
 * No proprietary internals here — this operates on the public Log.txt surface
 * and the standard process lifecycle. Fully cross-platform (Windows/macOS).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface WatchdogOptions {
  /** Ableton preferences root. Defaults to the platform standard. */
  abletonRoot?: string;
  /** Failure count threshold that triggers recovery. */
  minFailures?: number;
  /** Seconds between recoveries (cooldown). */
  cooldownSec?: number;
  /** Log lines to scan from the tail (keeps the poll fast as Log.txt grows). */
  tailLines?: number;
  /** Extra process names to restart alongside Index. */
  extraPeers?: string[];
  /** Write a run log here. */
  logFile?: string;
}

export interface WatchdogResult {
  /** Path of the Log.txt that was scanned. */
  logPath: string;
  /** Total failure signature count detected. */
  failures: number;
  /** true if recovery was triggered. */
  recovered: boolean;
  /** Process names that were restarted. */
  killed: string[];
  /** Human note. */
  note: string;
}

/** The Index subprocess name per platform (the nanomsg peer Ableton respawns). */
const INDEX_PROCESS = process.platform === "win32" ? "Ableton Index.exe" : "Ableton Index";

/** Default Ableton preferences root per platform. */
export function defaultAbletonRoot(): string {
  if (process.platform === "win32") return join(process.env.APPDATA ?? "", "Ableton");
  if (process.platform === "darwin") return join(homedir(), "Library", "Preferences", "Ableton");
  return join(homedir(), ".config", "Ableton");
}

/** Find the most recently written Log.txt across Live versions. */
export function findLatestLog(root: string): string | null {
  // Walk the version subdirs (Live 12.x.x, Live 13.x.x, ...) and pick the newest Log.txt.
  let best: { path: string; mtime: number } | null = null;
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !existsSync(dir)) return;
    for (const name of readdirSafe(dir)) {
      const p = join(dir, name);
      let st: ReturnType<typeof statSync> | null = null;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (name === "Log.txt" && (!best || st.mtimeMs > best.mtime)) {
        best = { path: p, mtime: st.mtimeMs };
      }
    }
  };
  walk(root, 0);
  return best?.path ?? null;
}

/** Read the tail of a file as a single string. */
export function readTail(path: string, lines: number): string {
  try {
    const data = readFileSync(path, "utf8");
    const split = data.split("\n");
    return split.slice(Math.max(0, split.length - lines)).join("\n");
  } catch {
    return "";
  }
}

/** Count failure-signature occurrences in log text (direct + "repeated N" lines). */
export function countFailures(text: string): number {
  // A "repeated N time(s)" line embeds the same signature, so count it once via
  // its N value, and exclude it from the direct count (else double-count).
  let direct = 0;
  let repeated = 0;
  for (const line of text.split("\n")) {
    const rep = /Last message repeated (\d+) time\(s\): .*could not send message/g.exec(line);
    if (rep) {
      repeated += parseInt(rep[1], 10);
      continue; // skip the direct-count for this line (it's the summary line)
    }
    if (/could not send message: ReimportMetadataForPlugin/.test(line)) direct++;
  }
  return direct + repeated;
}

/** Kill a process by name (best-effort, cross-platform). */
function killProcess(name: string): boolean {
  if (process.platform === "win32") {
    const r = spawnSync("taskkill", ["/F", "/IM", name], { stdio: "ignore" });
    return r.status === 0;
  }
  const r = spawnSync("pkill", ["-f", name], { stdio: "ignore" });
  return r.status === 0;
}

/**
 * Run one watchdog pass. Reads the latest Log.txt, and if the failure signature
 * exceeds the threshold (and the cooldown has elapsed), restarts the wedged
 * Index peer. Returns the outcome.
 */
export function runWatchdog(opts: WatchdogOptions = {}): WatchdogResult {
  const root = opts.abletonRoot ?? defaultAbletonRoot();
  const minFailures = opts.minFailures ?? 20;
  const cooldownSec = opts.cooldownSec ?? 600;
  const tailLines = opts.tailLines ?? 500;
  const logFile = opts.logFile ?? join(tmpdir(), "ableton-ipc-watchdog.log");
  const extraPeers = opts.extraPeers ?? [];

  const logPath = findLatestLog(root);
  if (!logPath) return { logPath: "", failures: 0, recovered: false, killed: [], note: "no Log.txt found" };

  const text = readTail(logPath, tailLines);
  const failures = countFailures(text);
  if (failures < minFailures) {
    return { logPath, failures, recovered: false, killed: [], note: `below threshold (${failures}/${minFailures})` };
  }

  // Cooldown: don't restart repeatedly.
  if (existsSync(logFile)) {
    try {
      const age = (Date.now() - statSync(logFile).mtimeMs) / 1000;
      if (age < cooldownSec) {
        return { logPath, failures, recovered: false, killed: [], note: `cooldown active (${Math.round(age)}s/${cooldownSec}s)` };
      }
    } catch { /* ignore */ }
  }

  // Restart the wedged peers. Ableton auto-respawns them.
  const killed: string[] = [];
  for (const name of [INDEX_PROCESS, ...extraPeers]) {
    if (killProcess(name)) killed.push(name);
  }

  try {
    const stamp = new Date().toISOString();
    const line = killed.length
      ? `${stamp} KILLED wedged peers: ${killed.join(", ")}`
      : `${stamp} signature present but no peer to kill`;
    const { appendFileSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    if (existsSync(logFile)) appendFileSync(logFile, line + "\n");
    else writeFileSync(logFile, line + "\n");
  } catch { /* log write is best-effort */ }

  return {
    logPath,
    failures,
    recovered: killed.length > 0,
    killed,
    note: killed.length ? `restarted ${killed.join(", ")}` : "no peer process found",
  };
}

function readdirSafe(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}