/**
 * CodeBuddy runtime state files under ~/.openviking/state/cb/.
 *
 * Hooks (auto-recall, auto-capture) write small JSON snapshots here so the
 * statusline script can render up-to-date info without making network calls
 * for things only the hook knows (last recall stats, pending capture count).
 *
 * The `cb` segment keeps this client's snapshots out of the shared state root:
 * every file here is a single-slot "last run" record, so two harnesses writing
 * the same name would overwrite each other's view.
 *
 * Atomic write: temp file + rename, so the statusline never reads a half-
 * written file. Stale entries (older than maxAgeMs) read as null so the
 * statusline degrades to "idle" instead of showing day-old data.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OV_HOME = process.env.OPENVIKING_HOME && process.env.OPENVIKING_HOME.trim()
  ? process.env.OPENVIKING_HOME.replace(/^~(?=$|\/)/, homedir())
  : join(homedir(), ".openviking");
// `cb` is this client's segment (`cb-` sessions, `cb-hooks.log`), so CodeBuddy
// snapshots stay independent of any other harness writing to the shared root.
export const STATE_DIR = join(OV_HOME, "state", "cb");

function ensureDir() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
  } catch { /* best effort — caller will see write failure */ }
}

export function statePath(name) {
  return join(STATE_DIR, name);
}

export function writeJsonState(name, payload) {
  ensureDir();
  const target = statePath(name);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify({ ...payload, ts: payload?.ts ?? Date.now() }));
    renameSync(tmp, target);
  } catch { /* best effort: statusline tolerates missing files */ }
}

export function readJsonState(name, { maxAgeMs } = {}) {
  let raw;
  try {
    raw = readFileSync(statePath(name), "utf-8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (maxAgeMs && typeof parsed?.ts === "number" && Date.now() - parsed.ts > maxAgeMs) {
    return null;
  }
  return parsed;
}
