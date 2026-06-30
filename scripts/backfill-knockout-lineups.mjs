#!/usr/bin/env node
// Backfill lineups / scorers / cards for KNOCKOUT matches.
//
// Why a separate script: sync-lineups.mjs matches games to ESPN by FIFA code,
// but knockout games carry home_team_id="0"/away_team_id="0" (teams resolved in
// the frontend), so they never match an ESPN event there. They also fall outside
// the live kickoff window once finished. This script maps our knockout game id
// straight to a known ESPN event id, fetches the summary, and merges the lineup
// (+ patches scorers into wc26.json). Add an entry to EVENT_MAP per knockout
// match as it gets an ESPN event id.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "public/data");
const WC26 = resolve(OUT_DIR, "wc26.json");
const OUT = resolve(OUT_DIR, "lineups.json");

// game id (our wc26.json) -> ESPN event id. Extend as knockout matches play.
const EVENT_MAP = {
  "73": "760486", // R32: Runner-up A (South Africa) vs Runner-up B (Canada)
  "76": "760487", // R32: Winner C (Brazil) vs Runner-up F (Japan)
};

async function pull(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "wc26-meowbiter/1.0 (+https://worldcup.meowbiter.me)" },
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

function extractTeamLineup(rosterSide) {
  const entries = rosterSide?.roster ?? [];
  const starting = [], bench = [];
  for (const e of entries) (e.starter ? starting : bench).push(simplifyEntry(e));
  return { formation: rosterSide?.formation || undefined, starting, bench };
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
    cards.push({ player, minute: ev.clock?.displayValue || undefined, color, side });
  }
  return cards;
}

/** Pull substitutions out of ESPN keyEvents. ESPN convention: participants[0]
 *  comes on, participants[1] goes off ("X replaces Y"). Map to home/away by team id. */
function extractSubs(summary, homeTeamId, awayTeamId) {
  const subs = [];
  for (const ev of summary.keyEvents ?? []) {
    if (ev.type?.type !== "substitution") continue;
    const tid = String(ev.team?.id ?? "");
    const side = tid === String(homeTeamId) ? "home" : tid === String(awayTeamId) ? "away" : null;
    if (!side) continue;
    const inName = ev.participants?.[0]?.athlete?.displayName || undefined;
    const outName = ev.participants?.[1]?.athlete?.displayName || undefined;
    subs.push({ in: inName, out: outName, minute: ev.clock?.displayValue || undefined, side });
  }
  return subs;
}

function extractGoals(summary, homeTeamId, awayTeamId) {
  const home = [], away = [];
  for (const ev of summary.keyEvents ?? []) {
    const kind = ev.type?.type || "";
    if (!/goal/i.test(kind) && kind !== "penalty---scored") continue;
    const tid = String(ev.team?.id ?? "");
    const side = tid === String(homeTeamId) ? home : tid === String(awayTeamId) ? away : null;
    if (!side) continue;
    const name = ev.participants?.[0]?.athlete?.displayName || ev.shortText?.replace(/\s+Goal.*$/i, "") || "\u2014";
    const minute = ev.clock?.displayValue || "";
    side.push(minute ? `${name} ${minute}` : name);
  }
  return { home, away };
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, file);
}

async function main() {
  const snap = JSON.parse(await readFile(WC26, "utf8"));
  let prior = [];
  try {
    prior = JSON.parse(await readFile(OUT, "utf8")).lineups ?? [];
  } catch (err) {
    if (err.code !== "ENOENT") throw new Error(`refusing to overwrite ${OUT}: ${err.message}`);
  }
  const merged = new Map(prior.map((l) => [l.matchId, l]));
  const gamePatch = new Map();

  for (const [gameId, eventId] of Object.entries(EVENT_MAP)) {
    try {
      const summary = await pull(`${ESPN}/summary?event=${eventId}`);
      const sides = summary.rosters ?? [];
      const homeSide = sides.find((s) => s.homeAway === "home");
      const awaySide = sides.find((s) => s.homeAway === "away");
      const homeLineup = extractTeamLineup(homeSide);
      const awayLineup = extractTeamLineup(awaySide);
      const cards = extractCards(summary, homeSide?.team?.id, awaySide?.team?.id);
      const goals = extractGoals(summary, homeSide?.team?.id, awaySide?.team?.id);
      const subs = extractSubs(summary, homeSide?.team?.id, awaySide?.team?.id);

      // ET/penalty detail + shootout tally from the summary header status.
      const hComp = summary.header?.competitions?.[0];
      const hHome = hComp?.competitors?.find((c) => c.homeAway === "home");
      const hAway = hComp?.competitors?.find((c) => c.homeAway === "away");
      const sd = String(hComp?.status?.type?.shortDetail ?? hComp?.status?.type?.detail ?? "").toUpperCase();
      const detailPatch = {};
      if (sd.includes("PEN")) {
        detailPatch.time_detail = "pen";
        if (hHome?.shootoutScore != null) detailPatch.pen_home = String(hHome.shootoutScore);
        if (hAway?.shootoutScore != null) detailPatch.pen_away = String(hAway.shootoutScore);
      } else if (sd.includes("AET") || sd.includes("EXTRA")) {
        detailPatch.time_detail = "AET";
      }

      if (homeLineup.starting.length || awayLineup.starting.length) {
        merged.set(gameId, {
          matchId: gameId,
          updatedAt: new Date().toISOString(),
          home: homeLineup,
          away: awayLineup,
          cards,
          subs,
        });
        console.log(`[backfill] game ${gameId} (event ${eventId}): XI ${homeLineup.starting.length}/${awayLineup.starting.length}, cards ${cards.length}`);
      } else {
        console.warn(`[backfill] game ${gameId} (event ${eventId}): no published XI`);
      }

      // Patch scorers + ET/penalty into wc26.json (knockout games often lack these in the base feed).
      // Only overwrite scorers when the summary actually has goal data, to avoid
      // clearing them if the ESPN API returns empty keyEvents transiently.
      const goalsHome = goals.home.join(", ");
      const goalsAway = goals.away.join(", ");
      gamePatch.set(gameId, {
        home_scorers: goals.home.length > 0 ? goalsHome : undefined,
        away_scorers: goals.away.length > 0 ? goalsAway : undefined,
        ...detailPatch,
      });
    } catch (err) {
      console.warn(`[backfill] game ${gameId} (event ${eventId}) failed: ${err.message}`);
    }
  }

  if (gamePatch.size > 0 && Array.isArray(snap.games)) {
    let patched = 0;
    for (const g of snap.games) {
      const p = gamePatch.get(g.id);
      if (p) { Object.assign(g, p); patched++; }
    }
    await writeAtomic(WC26, JSON.stringify(snap));
      console.log(`[backfill] patched ${patched} game(s) in wc26.json`);
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeAtomic(OUT, JSON.stringify({ syncedAt: new Date().toISOString(), source: "ESPN summary", lineups: [...merged.values()] }));
  console.log(`[backfill] ${OUT} ok | total=${merged.size}`);
}

main().catch((e) => {
  console.error("[backfill] FAILED:", e.message);
  process.exit(1);
});
