#!/usr/bin/env node
// Build wrapper that protects live JSON data in dist/data.
//
// Vite copies public/ into dist during build. This project intentionally keeps
// emptyOutDir=false because the systemd sync timer writes live JSON into
// dist/data, but public/data may contain stale dev snapshots/stubs. Without this
// wrapper, a build can overwrite live data (lineups/cards/scores) with stale
// public files.
//
// Flow:
//   1. Snapshot existing dist/data/*.json into node_modules/.cache.
//   2. Run tsc -b and vite build.
//   3. In a finally step, restore any snapshot that is newer than the file Vite
//      left behind (or restore if Vite left invalid/missing JSON).
//
// If the sync timer happens to write a newer JSON during the build, we keep the
// newer timer output instead of overwriting it with the pre-build snapshot.

import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST_DATA = resolve(ROOT, "dist/data");
const BACKUP_DIR = resolve(ROOT, "node_modules/.cache/worldcup-live-data-before-build");

function bin(name) {
  const ext = process.platform === "win32" ? ".cmd" : "";
  return resolve(ROOT, "node_modules/.bin", `${name}${ext}`);
}

async function jsonFiles(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function timestampOf(body) {
  const ts = body?.syncedAt ?? body?.frozenAt ?? body?.updatedAt;
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isNaN(t) ? null : t;
}

async function readJsonTimestamp(path) {
  try {
    const body = JSON.parse(await readFile(path, "utf8"));
    return { ok: true, ts: timestampOf(body) };
  } catch (err) {
    return { ok: false, ts: null, error: err.message };
  }
}

async function saveLiveData() {
  const files = await jsonFiles(DIST_DATA);
  await rm(BACKUP_DIR, { recursive: true, force: true });
  if (files.length === 0) return;
  await mkdir(BACKUP_DIR, { recursive: true });
  for (const file of files) {
    await copyFile(resolve(DIST_DATA, file), resolve(BACKUP_DIR, file));
  }
  console.log(`[build] saved ${files.length} live data file(s) from dist/data`);
}

async function restoreLiveData() {
  const files = await jsonFiles(BACKUP_DIR);
  if (files.length === 0) return;
  await mkdir(DIST_DATA, { recursive: true });

  let restored = 0;
  let keptNewer = 0;
  for (const file of files) {
    const backup = resolve(BACKUP_DIR, file);
    const target = resolve(DIST_DATA, file);
    const backupMeta = await readJsonTimestamp(backup);
    const targetExists = existsSync(target);
    const targetMeta = targetExists ? await readJsonTimestamp(target) : { ok: false, ts: null };

    // Restore if target is missing/invalid, if target has no timestamp, or if
    // backup has a newer timestamp than the target. Otherwise keep target: it may
    // have been written by the live sync timer during the build.
    const shouldRestore =
      !targetExists ||
      !targetMeta.ok ||
      targetMeta.ts === null ||
      (backupMeta.ts !== null && targetMeta.ts !== null && backupMeta.ts > targetMeta.ts);

    if (shouldRestore) {
      await copyFile(backup, target);
      restored++;
    } else {
      keptNewer++;
    }
  }
  await rm(BACKUP_DIR, { recursive: true, force: true });
  console.log(`[build] restored ${restored} live data file(s), kept ${keptNewer} newer/current file(s)`);
}

function run(name, args) {
  const command = bin(name);
  const res = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: false });
  return res.status ?? 1;
}

let exitCode = 0;
await saveLiveData();
try {
  exitCode = run("tsc", ["-b"]);
  if (exitCode === 0) exitCode = run("vite", ["build"]);
} finally {
  await restoreLiveData();
}
process.exit(exitCode);
