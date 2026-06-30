#!/usr/bin/env node
// Light 5-second sync: pull today's ESPN scoreboard only, update scores + status
// + period into wc26.json. Skips lineups, cards, scorers, and historical dates.
// Keeps existing scorer/card data intact — never overwrites them.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.WC_OUT_DIR || resolve(__dirname, "..", "public/data");
const OUT = resolve(OUT_DIR, "wc26.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, file);
}

async function pull(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "wc26-meowbiter/2.0 (+https://worldcup.meowbiter.me)" },
    });
    if (res.ok) return await res.json();
    throw new Error(`HTTP ${res.status}`);
  } finally { clearTimeout(t); }
}

function todayDateKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dateKey = todayDateKey();
  console.log(`[fast] pulling scoreboard for ${dateKey}`);

  const sb = await pull(`${ESPN}/scoreboard?dates=${dateKey}`);
  const events = sb.events ?? [];
  console.log(`[fast] got ${events.length} events`);

  if (events.length === 0) {
    console.log(`[fast] no events today, skipping`);
    return;
  }

  // Parse ESPN events into a lookup map by FIFA code + by date
  const espnByCode = new Map();
  const espnByDate = [];
  for (const e of events) {
    const comp = e.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c) => c.homeAway === "home");
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const hc = home.team?.abbreviation?.toUpperCase() || "";
    const ac = away.team?.abbreviation?.toUpperCase() || "";
    const st = comp.status?.type ?? {};
    const ev = {
      id: e.id,
      date: e.date,
      homeCode: hc,
      awayCode: ac,
      homeScore: home.score ?? 0,
      awayScore: away.score ?? 0,
      homeShootout: home.shootoutScore,
      awayShootout: away.shootoutScore,
      homeWinner: home.winner ?? false,
      awayWinner: away.winner ?? false,
      state: st.state,
      completed: st.completed === true,
      shortDetail: st.shortDetail || st.detail || null,
      clock: comp.status?.displayClock || null,
      period: comp.status?.period ?? null,
    };
    if (hc && ac) espnByCode.set(`${hc}|${ac}`, ev);
    espnByDate.push(ev);
  }

  // Read current snapshot
  const snap = JSON.parse(await readFile(OUT, "utf8"));
  if (!Array.isArray(snap.games)) {
    console.log("[fast] no games in snapshot, skipping");
    return;
  }

  let patched = 0;
  const usedEvents = new Set();

  // Phase 1: match by FIFA code
  for (const g of snap.games) {
    const codeKey = `${g.home_fifa || ""}|${g.away_fifa || ""}`;
    const ev = espnByCode.get(codeKey);
    if (ev && !usedEvents.has(ev.id)) {
      usedEvents.add(ev.id);
      applyLiveOverlay(g, ev);
      patched++;
    }
  }

  // Phase 2: match knockout placeholders by kickoff date (within 3h window)
  const unmatched = snap.games.filter((g) => !g._fastPatched && (g.home_team_id === "0" || g.away_team_id === "0"));
  if (unmatched.length > 0) {
    const sortedGames = [...unmatched].sort((a, b) => {
      const ta = parseStaticKickoff(a.local_date, a.stadium_id)?.getTime() ?? Infinity;
      const tb = parseStaticKickoff(b.local_date, b.stadium_id)?.getTime() ?? Infinity;
      return ta - tb;
    });
    const sortedEv = [...espnByDate].filter((ev) => !usedEvents.has(ev.id)).sort(
      (a, b) => (a.date || "").localeCompare(b.date || "")
    );
    let gi = 0;
    for (const ev of sortedEv) {
      while (gi < sortedGames.length && sortedGames[gi]._fastPatched) gi++;
      if (gi >= sortedGames.length) break;
      const g = sortedGames[gi];
      const gt = parseStaticKickoff(g.local_date, g.stadium_id);
      const et = ev.date ? new Date(ev.date) : null;
      if (gt && et && Math.abs(gt - et) < 3 * 3600000) {
        applyLiveOverlay(g, ev);
        patched++;
        gi++;
      }
    }
  }

  // Clean up internal flags
  for (const g of snap.games) delete g._fastPatched;

  if (patched > 0) {
    // Re-read the latest file before writing to avoid overwriting fresher
    // data (e.g. scorers/cards) written by the full sync in the last 5s.
    // Only overlay score + status + period — never touch scorer/card fields.
    const latest = JSON.parse(await readFile(OUT, "utf8"));
    const latestById = new Map((latest.games ?? []).map((g) => [String(g.id), g]));
    for (const g of snap.games) {
      const lg = latestById.get(String(g.id));
      if (lg) {
        // Apply only our overlays; keep everything else from the latest file
        lg.home_score = g.home_score;
        lg.away_score = g.away_score;
        lg.finished = g.finished;
        lg.time_elapsed = g.time_elapsed;
        if (g.time_detail !== undefined) lg.time_detail = g.time_detail;
        if (g.pen_winner_side !== undefined) lg.pen_winner_side = g.pen_winner_side;
        if (g.pen_home !== undefined) lg.pen_home = g.pen_home;
        if (g.pen_away !== undefined) lg.pen_away = g.pen_away;
      }
    }
    await writeAtomic(OUT, JSON.stringify(latest));
    console.log(`[fast] patched ${patched} game(s) (re-read before write)`);
  } else {
    console.log(`[fast] no live patches needed`);
  }
}

// ---------------------------------------------------------------------------
// Stadium TZ map (mirror of sync-espn.mjs + src/lib/timezone.ts)
// ---------------------------------------------------------------------------
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

function parseStaticKickoff(raw, stadiumId) {
  const m = raw?.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min] = m;
  const tz = STADIUM_TZ[stadiumId] || VN_TZ;
  const d = zonedWallClockToUtc(+yyyy, +mm, +dd, +hh, +min, tz);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Live overlay (scores + status + period/pen only — never touches scorers/cards)
// ---------------------------------------------------------------------------

function applyLiveOverlay(game, ev) {
  game._fastPatched = true;
  game.home_score = String(ev.homeScore);
  game.away_score = String(ev.awayScore);

  // Preserve fresher scorer data from prior sync cycles (full sync handles scorers).
  // This fast sync never clears them.

  if (ev.state === "post") {
    game.finished = "TRUE";
    game.time_elapsed = "finished";
    const sd = String(ev.shortDetail ?? "").toUpperCase();
    if (sd.includes("PEN")) {
      game.time_detail = "pen";
      game.pen_winner_side = ev.homeWinner ? "home" : ev.awayWinner ? "away" : undefined;
      game.pen_home = ev.homeShootout != null ? String(ev.homeShootout) : undefined;
      game.pen_away = ev.awayShootout != null ? String(ev.awayShootout) : undefined;
    } else if (sd.includes("AET") || sd.includes("ET") || sd.includes("EXTRA")) {
      game.time_detail = "AET";
    } else {
      game.time_detail = undefined;
    }
  } else if (ev.state === "in") {
    game.finished = "FALSE";
    game.time_elapsed = ev.clock || "live";
    // Live period-based pen/ET detection
    if (ev.period != null && ev.period >= 5) {
      game.time_detail = "pen";
    } else if (ev.period != null && ev.period >= 3) {
      game.time_detail = "AET";
    }
  } else {
    game.finished = "FALSE";
    game.time_elapsed = "notstarted";
  }
}

main().catch((err) => {
  console.error("[fast] FATAL:", err.message);
  process.exitCode = 1;
});
