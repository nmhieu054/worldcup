#!/usr/bin/env node
// One-shot backfill: fetch lineups from ESPN for all finished matches that are
// missing lineup data in lineups.json. sync-lineups.mjs only polls within a
// -2h/+3.5h kickoff window, so older matches are permanently skipped.
// This script fills the gap.
//
// Usage: node scripts/backfill-lineups.mjs [--dry-run]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "dist/data");
const WC26 = resolve(OUT_DIR, "wc26.json");
const OUT = resolve(OUT_DIR, "lineups.json");

async function pull(url) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json", "user-agent": "wc26-meowbiter/1.0 (+https://worldcup.meowbiter.me)" },
      });
      if (res.ok) return await res.json();
      if ((res.status === 420 || res.status === 429 || res.status === 503) && attempt < maxAttempts) {
        const raw = res.headers.get("retry-after");
        const retryAfter = raw && Number.isFinite(Number(raw)) ? Number(raw) * 1000 : raw ? Math.max(0, Date.parse(raw) - Date.now()) : null;
        const wait = retryAfter ?? Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[backfill] rate-limited HTTP ${res.status}; retrying in ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt < maxAttempts) {
        const wait = Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[backfill] fetch failed (${err.message}); retrying in ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error("rate limited after max attempts");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function code(team) { return String(team?.fifa_code ?? team ?? "").toUpperCase(); }

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

/** Build ESPN event index for the given date key (YYYYMMDD). */
async function fetchScoreboard(dateKey) {
  try {
    const sb = await pull(`${ESPN}/scoreboard?dates=${dateKey}`);
    const events = [];
    for (const e of sb.events ?? []) {
      const comp = e.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      const hc = code(home?.team?.abbreviation);
      const ac = code(away?.team?.abbreviation);
      if (!hc || !ac) continue;
      events.push({ eventId: e.id, homeCode: hc, awayCode: ac });
    }
    return events;
  } catch (err) {
    console.warn(`[backfill] scoreboard ${dateKey} failed: ${err.message}`);
    return [];
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const snap = JSON.parse(await readFile(WC26, "utf8"));
  const teamById = new Map((snap.teams ?? []).map((t) => [String(t.id), t]));

  // Find finished matches
  const finished = (snap.games ?? []).filter((g) => g.finished === "TRUE");
  console.log(`[backfill] Found ${finished.length} finished matches`);

  // Read existing lineups
  let existing = { lineups: [] };
  try {
    existing = JSON.parse(await readFile(OUT, "utf8"));
  } catch { /* first run */ }
  const existingIds = new Set((existing.lineups ?? []).map((l) => l.matchId));
  console.log(`[backfill] Existing lineups: ${existingIds.size} (${[...existingIds].sort((a,b)=>Number(a)-Number(b)).join(", ")})`);

  // Find missing
  const missing = finished.filter((g) => !existingIds.has(String(g.id)));
  console.log(`[backfill] Missing lineups: ${missing.length} (${missing.map((g) => g.id).join(", ")})`);

  if (missing.length === 0) {
    console.log("[backfill] Nothing to do!");
    return;
  }

  if (dryRun) {
    console.log("[backfill] DRY RUN - would fetch for:", missing.map((g) => `${g.id} (${g.home_team_name_en} vs ${g.away_team_name_en})`).join(", "));
    return;
  }

  // For missing matches, we need ESPN event IDs. The scoreboard groups by date,
  // so compute date keys from the match's local_date (MM/DD/YYYY HH:MM format).
  const dateKeys = new Set();
  for (const g of missing) {
    const m = g.local_date?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) {
      const [, mm, dd, yyyy] = m;
      // Try the match date + neighbours (venue-local date can straddle UTC)
      const baseDate = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
      for (const shift of [-1, 0, 1]) {
        const d = new Date(baseDate.getTime() + shift * 86400000);
        dateKeys.add(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`);
      }
    }
  }

  console.log(`[backfill] Date keys to query: ${[...dateKeys].sort().join(", ")}`);

  // Fetch all relevant scoreboards
  const eventIndex = new Map(); // `${home}|${away}` -> eventId
  for (const dateKey of [...dateKeys].sort()) {
    const events = await fetchScoreboard(dateKey);
    for (const ev of events) {
      eventIndex.set(`${ev.homeCode}|${ev.awayCode}`, ev.eventId);
    }
    await sleep(120);
  }
  console.log(`[backfill] ESPN event index built: ${eventIndex.size} events`);

  // Fetch summaries for missing matches
  const newLineups = [];
  const failed = [];
  for (const g of missing) {
    const home = teamById.get(g.home_team_id);
    const away = teamById.get(g.away_team_id);
    if (!home || !away) {
      console.warn(`[backfill] Match ${g.id}: missing team data, skipping`);
      failed.push(g.id);
      continue;
    }

    const key = `${code(home)}|${code(away)}`;
    const eventId = eventIndex.get(key);
    if (!eventId) {
      console.warn(`[backfill] Match ${g.id} (${code(home)} vs ${code(away)}): no ESPN event found in index`);
      failed.push(g.id);
      continue;
    }

    try {
      await sleep(200); // Be gentle to ESPN
      const summary = await pull(`${ESPN}/summary?event=${eventId}`);
      const sides = summary.rosters ?? [];
      const homeSide = sides.find((s) => s.homeAway === "home");
      const awaySide = sides.find((s) => s.homeAway === "away");
      const homeLineup = extractTeamLineup(homeSide);
      const awayLineup = extractTeamLineup(awaySide);
      const cards = extractCards(summary, homeSide?.team?.id, awaySide?.team?.id);

      if (homeLineup.starting.length || awayLineup.starting.length || cards.length) {
        newLineups.push({
          matchId: String(g.id),
          updatedAt: new Date().toISOString(),
          home: homeLineup,
          away: awayLineup,
          cards,
        });
        console.log(`[backfill] ✅ Match ${g.id} (${code(home)} vs ${code(away)}): home XI ${homeLineup.starting.length}/${homeLineup.bench.length}, away XI ${awayLineup.starting.length}/${awayLineup.bench.length}, cards ${cards.length}`);
      } else {
        console.log(`[backfill] ⚠️  Match ${g.id} (${code(home)} vs ${code(away)}): ESPN has no lineup data`);
        failed.push(g.id);
      }
    } catch (err) {
      console.warn(`[backfill] ❌ Match ${g.id} (${code(home)} vs ${code(away)}): ${err.message}`);
      failed.push(g.id);
    }
  }

  // Merge
  const merged = new Map((existing.lineups ?? []).map((l) => [l.matchId, l]));
  for (const l of newLineups) merged.set(l.matchId, l);

  // Write atomically via temp file
  const tmp = `${OUT}.tmp-${process.pid}`;
  const output = JSON.stringify({ syncedAt: new Date().toISOString(), source: "ESPN summary (backfill)", lineups: [...merged.values()] });
  await writeFile(tmp, output, "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, OUT);

  console.log(`\n[backfill] DONE: ${newLineups.length} new lineups, ${failed.length} failed (${failed.join(", ") || "none"}), total records: ${merged.size}`);
}

main().catch((e) => {
  console.error("[backfill] FAILED:", e.message);
  process.exit(1);
});
