#!/usr/bin/env node
// One-shot restore: rebuild a single match's lineup record (XI + bench + cards)
// from ESPN and merge it into the live lineups.json WITHOUT touching any other
// record. Used when sync-lineups.mjs evicts a finished match's lineup (it only
// keeps matches inside the kickoff window, and a prior-read glitch can drop one).
//
// Usage: node scripts/restore-lineup.mjs <gameId> <ESPN_EVENT_ID>
//   e.g. node scripts/restore-lineup.mjs 1 760415
//
// Writes the same shape sync-lineups.mjs produces, so the frontend reads it
// identically. Guarded: refuses to write if it can't build a non-empty record.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "dist/data");
const OUT = resolve(OUT_DIR, "lineups.json");

async function pull(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "wc26-meowbiter/1.0" },
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function simplifyEntry(entry) {
  const jersey = Number.parseInt(entry.jersey, 10);
  return {
    name: entry.athlete?.displayName || entry.athlete?.fullName || "\u2014",
    number: Number.isNaN(jersey) ? undefined : jersey,
    position: entry.position?.abbreviation || entry.position?.name || undefined,
  };
}

function extractTeamLineup(side) {
  const entries = side?.roster ?? [];
  const starting = [], bench = [];
  for (const e of entries) (e.starter ? starting : bench).push(simplifyEntry(e));
  return { formation: side?.formation || undefined, starting, bench };
}

function extractCards(summary, homeTeamId, awayTeamId) {
  const cards = [];
  for (const ev of summary.keyEvents ?? []) {
    const kind = ev.type?.type;
    let color;
    if (kind === "yellow-card") color = "yellow";
    else if (kind === "red-card" || kind === "red-card---second-yellow") color = "red";
    else continue;
    const tid = String(ev.team?.id ?? "");
    const side = tid === String(homeTeamId) ? "home" : tid === String(awayTeamId) ? "away" : null;
    if (!side) continue;
    const player = ev.participants?.[0]?.athlete?.displayName || ev.text?.split(" (")[0] || "\u2014";
    const minute = ev.clock?.displayValue || undefined;
    cards.push({ player, minute, color, side });
  }
  return cards;
}

async function main() {
  const gameId = process.argv[2];
  const eventId = process.argv[3];
  if (!gameId || !eventId) {
    console.error("usage: node scripts/restore-lineup.mjs <gameId> <ESPN_EVENT_ID>");
    process.exit(1);
  }

  const summary = await pull(`${ESPN}/summary?event=${eventId}`);
  const sides = summary.rosters ?? [];
  const homeSide = sides.find((s) => s.homeAway === "home");
  const awaySide = sides.find((s) => s.homeAway === "away");
  const home = extractTeamLineup(homeSide);
  const away = extractTeamLineup(awaySide);
  const cards = extractCards(summary, homeSide?.team?.id, awaySide?.team?.id);

  if (!home.starting.length && !away.starting.length && cards.length === 0) {
    throw new Error("ESPN summary returned no XI and no cards; refusing to write empty record");
  }

  const record = {
    matchId: String(gameId),
    updatedAt: new Date().toISOString(),
    home,
    away,
    cards,
  };

  // Merge into live file, replacing only this matchId, keeping every other record.
  let prior = [];
  try { prior = (JSON.parse(await readFile(OUT, "utf8")).lineups) ?? []; } catch { /* first run */ }
  const merged = new Map(prior.map((l) => [l.matchId, l]));
  merged.set(record.matchId, record);

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({ syncedAt: new Date().toISOString(), source: "ESPN summary", lineups: [...merged.values()] }),
    "utf8"
  );

  console.log(
    `[restore] game ${gameId} (event ${eventId}) restored: ` +
    `home XI ${home.starting.length}/bench ${home.bench.length}, ` +
    `away XI ${away.starting.length}/bench ${away.bench.length}, cards ${cards.length}. ` +
    `Total records now: ${merged.size}`
  );
}

main().catch((e) => {
  console.error("[restore] FAILED:", e.message);
  process.exit(1);
});
