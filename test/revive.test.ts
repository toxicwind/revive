import { describe, expect, test } from "bun:test";
import { countFailures, findLatestLog, readTail } from "../src/watchdog.ts";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SAMPLE = `
2026-11-18T03:16:58.119671: warning: TNanoMsgIPCChannel: could not send message: ReimportMetadataForPlugin
2026-11-18T03:16:58.119706: warning: TNanoMsgIPCChannel: could not send message: ReimportMetadataForPlugin
2026-11-18T03:17:00.992427: warning: Last message repeated 139 time(s): TNanoMsgIPCChannel: could not send message: ReimportMetadataForPlugin
2026-11-18T03:17:03.913285: info: VST3: plugin processor successfully loaded: Cableguys 'ShaperBox 3'
`;

describe("countFailures", () => {
  test("counts direct + repeated lines", () => {
    // 2 direct + 139 repeated = 141
    expect(countFailures(SAMPLE)).toBe(141);
  });

  test("clean log = 0", () => {
    expect(countFailures("info: everything fine\ninfo: VST3: Created: ShaperBox 3\n")).toBe(0);
  });
});

describe("findLatestLog + readTail", () => {
  test("finds newest Log.txt across version dirs", () => {
    const dir = mkdtempSync(join(tmpdir(), "revive-test-"));
    const v1 = join(dir, "Live 12.4.6", "Preferences");
    const v2 = join(dir, "Live 12.4.7", "Preferences");
    mkdirSync(v1, { recursive: true });
    mkdirSync(v2, { recursive: true });
    const old = join(v1, "Log.txt");
    const latest = join(v2, "Log.txt");
    writeFileSync(old, "old\n");
    writeFileSync(latest, "new\n");
    expect(findLatestLog(dir)).toBe(latest);
    expect(readTail(latest, 10)).toContain("new");
    rmSync(dir, { recursive: true, force: true });
  });
});