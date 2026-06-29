#!/usr/bin/env node
// One-shot backfill of lineups/subs/cards/scorers for ALL finished GROUP matches
// (id 1..72) that are now outside sync-lineups.mjs's kickoff window.
//
// sync-lineups.mjs only fetches summaries inside a window around kickoff, so any
// finished match's XI/subs captured before a schema change (e.g. adding subs)
// stays stale forever. This script re-fetches every finished group match by its
// FIFA code + kickoff date (same matching as sync-lineups), then MERGES the
// fresh lineup over the existing one. Run manually after a lineup-schema change.
//
// Knockout matches use backfill-knockout-lineups.mjs (manual event-id map).

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "public/data");
const WC26 = resolve(OUT_DIR, "wc26.json");
const OUT = resolve(OUT_DIR, "lineups.json");

const STADIUM_TZ = {
  "1": "America/Mexico_City", "2": "America/Mexico_City", "3": "America/Monterrey",
  "4": "America/Chicago", "5": "America/Chicago", "6": "America/Chicago",
  "7": "America/New_York", "8": "America/New_York", "9": "America/New_York",
  "10": "America/New_York", "11": "America/New_York", "12": "America/Toronto",
  "13": "America/Vancouver", "14": "America/Los_Angeles", "15": "America/Los_Angeles",
  "16": "America/Los_Angeles",
};
const VN_TZ = "Asia/Ho_Chi_Minh";

function zonedWallClockToUtc(y, mo, d, h, mi, tz) {
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = dtf.formatToParts(new Date(asIfUtc));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  let hh = get("hour");
  if (hh === 24) hh = 0;
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hh, get("minute"), get("second"));
  return new Date(asIfUtc - (localAsUtc - asIfUtc));
}

function parseKickoff(raw, stadiumId) {
  const m = raw?.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min] = m;
  const tz = STADIUM_TZ[stadiumId] || VN_TZ;
  const d = zonedWallClockToUtc(+yyyy, +mm, +dd, +hh, +min, tz);
  return Number.isNaN(d.getTime()) ? null : d;
}

function espnDateKeys(kickoff) {
  const keys = new Set();
  for (const shift of [-1, 0, 1]) {
    const d = new Date(kickoff.getTime() + shift * 86400000);
    keys.add(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`);
  }
  return [...keys];
}

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
        await sleep(Math.min(15000, 1000 * 2 ** (attempt - 1)));
        continue;
      }
      throw new Error(`${url} -> HTTP ${res.status}`);
    } catch (err) {
      if (attempt < maxAttempts) { await sleep(Math.min(15000, 1000 * 2 ** (attempt - 1))); continue; }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`${url} -> rate limited`);
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

function extractSubs(summary, homeTeamId, awayTeamId) {
  const subs = [];
  for (const ev of summary.keyEvents ?? []) {
    if (ev.type?.type !== "substitution") continue;
    const tid = String(ev.team?.id ?? "");
    const side = tid === String(homeTeamId) ? "home" : tid === String(awayTeamId) ? "away" : null;
    if (!side) continue;
    subs.push({
      in: ev.participants?.[0]?.athlete?.displayName || undefined,
      out: ev.participants?.[1]?.athlete?.displayName || undefined,
      minute: ev.clock?.displayValue || undefined,
      side,
    });
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

async function buildEspnIndex(dateKeys) {
  const index = new Map();
  for (const date of dateKeys) {
    try {
      const sb = await pull(`${ESPN}/scoreboard?dates=${date}`);
      for (const e of sb.events ?? []) {
        const comp = e.competitions?.[0];
        if (!comp) continue;
        const home = comp.competitors?.find((c) => c.homeAway === "home");
        const away = comp.competitors?.find((c) => c.homeAway === "away");
        const hc = code(home?.team?.abbreviation);
        const ac = code(away?.team?.abbreviation);
        if (!hc || !ac) continue;
        index.set(`${hc}|${ac}`, { eventId: e.id });
      }
    } catch (err) {
      console.warn(`[backfill-all] scoreboard ${date} failed: ${err.message}`);
    }
    await sleep(120);
  }
  return index;
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, file);
}

async function main() {
  const snap = JSON.parse(await readFile(WC26, "utf8"));
  const teamById = new Map((snap.teams ?? []).map((t) => [String(t.id), t]));

  let prior = [];
  try {
    prior = JSON.parse(await readFile(OUT, "utf8")).lineups ?? [];
  } catch (err) {
    if (err.code !== "ENOENT") throw new Error(`refusing to overwrite ${OUT}: ${err.message}`);
  }
  const merged = new Map(prior.map((l) => [l.matchId, l]));

  // Finished GROUP matches with real teams.
  const targets = [];
  for (const g of snap.games ?? []) {
    if (g.type !== "group" || g.finished !== "TRUE") continue;
    const home = teamById.get(g.home_team_id);
    const away = teamById.get(g.away_team_id);
    const kickoff = parseKickoff(g.local_date, g.stadium_id);
    if (!home || !away || !kickoff) continue;
    targets.push({ g, home, away, kickoff });
  }
  console.log(`[backfill-all] ${targets.length} finished group matches to backfill`);

  const dateKeys = [...new Set(targets.flatMap(({ kickoff }) => espnDateKeys(kickoff)))];
  const index = await buildEspnIndex(dateKeys);

  const gamePatch = new Map();
  let ok = 0, miss = 0;
  for (const { g, home, away } of targets) {
    const espn = index.get(`${code(home)}|${code(away)}`);
    if (!espn?.eventId) { console.warn(`[backfill-all] no ESPN event ${code(home)} vs ${code(away)} (game ${g.id})`); miss++; continue; }
    try {
      await sleep(150);
      const summary = await pull(`${ESPN}/summary?event=${espn.eventId}`);
      const sides = summary.rosters ?? [];
      const homeSide = sides.find((s) => s.homeAway === "home");
      const awaySide = sides.find((s) => s.homeAway === "away");
      const homeLineup = extractTeamLineup(homeSide);
      const awayLineup = extractTeamLineup(awaySide);
      const cards = extractCards(summary, homeSide?.team?.id, awaySide?.team?.id);
      const subs = extractSubs(summary, homeSide?.team?.id, awaySide?.team?.id);
      const goals = extractGoals(summary, homeSide?.team?.id, awaySide?.team?.id);

      const prev = merged.get(g.id) || {};
      merged.set(g.id, {
        matchId: g.id,
        updatedAt: new Date().toISOString(),
        // Keep a previously-captured XI if ESPN no longer returns one; otherwise refresh.
        home: homeLineup.starting.length ? homeLineup : prev.home,
        away: awayLineup.starting.length ? awayLineup : prev.away,
        cards,
        subs,
      });
      gamePatch.set(g.id, { home_scorers: goals.home.join(", "), away_scorers: goals.away.join(", ") });
      ok++;
      if (ok % 10 === 0) console.log(`[backfill-all] ${ok}/${targets.length}...`);
    } catch (err) {
      console.warn(`[backfill-all] summary ${espn.eventId} (game ${g.id}) failed: ${err.message}`);
      miss++;
    }
  }

  if (gamePatch.size > 0 && Array.isArray(snap.games)) {
    let patched = 0;
    for (const g of snap.games) {
      const p = gamePatch.get(g.id);
      if (p) { Object.assign(g, p); patched++; }
    }
    await writeFile(WC26, JSON.stringify(snap), "utf8");
    console.log(`[backfill-all] patched ${patched} game(s) in wc26.json`);
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeAtomic(OUT, JSON.stringify({ syncedAt: new Date().toISOString(), source: "ESPN summary", lineups: [...merged.values()] }));
  console.log(`[backfill-all] done | ok=${ok} miss=${miss} total=${merged.size}`);
}

main().catch((e) => { console.error("[backfill-all] FAILED:", e.message); process.exit(1); });
