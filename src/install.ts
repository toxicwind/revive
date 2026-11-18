/**
 * revive/src/install.ts — register the watchdog as a durable scheduled task.
 *
 * Windows: registers a Task Scheduler task that runs the watchdog at logon and
 * every N minutes, with restart-on-failure, in the interactive desktop session.
 * macOS/Linux: installs a launchd/cron entry (best-effort).
 */
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface InstallOptions {
  /** Task name (Windows). */
  taskName?: string;
  /** Poll interval in minutes. */
  intervalMin?: number;
  /** Absolute path to the watchdog script/bin. */
  scriptPath?: string;
}

export interface InstallResult {
  ok: boolean;
  platform: string;
  detail: string;
}

/** Absolute path to the revive bin (for the scheduled task command). */
export function reviveBinPath(): string {
  return join(process.cwd(), "bin", "revive.ts");
}

/** Register the watchdog as a durable scheduled task. */
export function installScheduledTask(opts: InstallOptions = {}): InstallResult {
  const taskName = opts.taskName ?? "AbletonIPCWatchdog";
  const intervalMin = opts.intervalMin ?? 10;
  const script = opts.scriptPath ?? reviveBinPath();

  if (process.platform !== "win32") {
    // macOS/Linux: best-effort cron entry.
    const cronLine = `*/${intervalMin} * * * * bun ${script} run`;
    const r = spawnSync("crontab", ["-"], { input: `${cronLine}\n`, encoding: "utf8" });
    return { ok: r.status === 0, platform: process.platform, detail: `crontab: ${cronLine}` };
  }

  // Windows: Task Scheduler XML with logon + interval triggers + restart-on-failure.
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>revive - Ableton plugin-UI IPC recovery watchdog</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
    <TimeTrigger>
      <StartBoundary>2026-01-01T00:00:00</StartBoundary>
      <Repetition>
        <Interval>PT${intervalMin}M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -File "${script}"</Arguments>
    </Exec>
  </Actions>
</Task>`;

  const xmlPath = join(process.env.TEMP ?? "/tmp", "revive-task.xml");
  writeFileSync(xmlPath, xml, "utf8");
  const r = spawnSync("schtasks", ["/Create", "/TN", taskName, "/XML", xmlPath, "/F"], { encoding: "utf8" });
  return {
    ok: r.status === 0,
    platform: "win32",
    detail: r.stdout?.toString() || r.stderr?.toString() || `task ${taskName} registered`,
  };
}

/** Remove the scheduled task. */
export function uninstallScheduledTask(taskName = "AbletonIPCWatchdog"): InstallResult {
  const r = spawnSync("schtasks", ["/Delete", "/TN", taskName, "/F"], { encoding: "utf8" });
  return { ok: r.status === 0, platform: process.platform, detail: r.stdout?.toString() || r.stderr?.toString() || "removed" };
}