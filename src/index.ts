/**
 * revive — Ableton Live plugin-UI recovery watchdog.
 * Detects the dead plugin-metadata IPC channel and restarts the wedged Index
 * peer so VSTi UIs reopen. Clean capability, no proprietary internals.
 */
export * from "./watchdog.ts";
export * from "./install.ts";