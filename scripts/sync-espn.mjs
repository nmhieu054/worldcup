#!/usr/bin/env node
// Pulls live scores from ESPN scoreboard and merges into the frozen static
// metadata (wc26-static.json). Outputs a same-origin snapshot (wc26.json).
// ESPN is the authoritative source for scores and match status.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC = resolve(__dirname, "wc26-static.json");
const OUT_DIR = process.env.WC_OUT_DIR || resolve(__dirname, "..", "public/data");
const OUT = resolve(OUT_DIR, "wc26.json");

// ---------------------------------------------------------------------------
// IANA zone per stadium id (mirror of src/lib/timezone.ts)
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
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function pull(url) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json", "user-agent": "wc26-meowbiter/2.0 (+https://worldcup.meowbiter.me)" },
      });
      if (res.ok) return await res.json();
      if ((res.status === 420 || res.status === 429 || res.status === 503) && attempt < maxAttempts) {
        const raw = res.headers.get("retry-after");
        const wait = raw ? (Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Math.max(0, Date.parse(raw) - Date.now())) : Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[espn] rate-limited HTTP ${res.status}; retrying ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt < maxAttempts) {
        const wait = Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[espn] fetch failed (${err.message}); retrying ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw err;
    } finally { clearTimeout(t); }
  }
  throw new Error(`rate limited after ${maxAttempts} attempts: ${url}`);
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, file);
}

// ---------------------------------------------------------------------------
// Load static metadata
// ---------------------------------------------------------------------------

async function loadStatic() {
  return JSON.parse(await readFile(STATIC, "utf8"));
}

// ---------------------------------------------------------------------------
// Pull all ESPN scoreboard dates
// ---------------------------------------------------------------------------

async function pullAllEspn() {
  const dates = [];
  for (let d = 11; d <= 30; d++) dates.push(`202606${String(d).padStart(2, "0")}`);
  for (let d = 1; d <= 19; d++) dates.push(`202607${String(d).padStart(2, "0")}`);

  console.log(`[espn] Pulling scoreboard for ${dates.length} dates...`);
  const allEvents = [];
  for (const date of dates) {
    try {
      const sb = await pull(`${ESPN}/scoreboard?dates=${date}`);
      for (const e of sb.events ?? []) allEvents.push(e);
    } catch (err) { console.warn(`[espn] scoreboard ${date} failed: ${err.message}`); }
    await sleep(120);
  }
  return allEvents;
}

// ---------------------------------------------------------------------------
// Parse ESPN events
// ---------------------------------------------------------------------------

function parseEspnEvents(rawEvents) {
  return rawEvents.map((e) => {
    const comp = e.competitions?.[0];
    if (!comp) return null;
    const home = comp.competitors?.find((c) => c.homeAway === "home");
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) return null;
    const st = comp.status?.type ?? {};
    return {
      espnId: e.id,
      date: e.date,
      homeAbbr: home.team?.abbreviation || "",
      awayAbbr: away.team?.abbreviation || "",
      homeScore: home.score ?? 0,
      awayScore: away.score ?? 0,
      homeWinner: home.winner ?? false,
      awayWinner: away.winner ?? false,
      state: st.state,
      completed: st.completed === true,
      detail: st.detail || st.shortDetail || null,
      clock: comp.status?.displayClock || null,
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Enrich static games with FIFA codes & UTC kickoff
// ---------------------------------------------------------------------------

function enrichStatic(staticData) {
  const teamCode = new Map();
  for (const t of staticData.teams) teamCode.set(t.id, (t.fifa_code || "").toUpperCase());

  const games = staticData.games.map((g) => ({
    ...g,
    home_fifa: teamCode.get(g.home_team_id) || "",
    away_fifa: teamCode.get(g.away_team_id) || "",
    _kickoffUtc: parseStaticKickoff(g.local_date, g.stadium_id),
  }));
  return { ...staticData, games, teamCode };
}

// ---------------------------------------------------------------------------
// Main merge logic
// ---------------------------------------------------------------------------

async function main() {
  const staticData = await loadStatic();
  const enriched = enrichStatic(staticData);
  const espnEvents = parseEspnEvents(await pullAllEspn());
  console.log(`[espn] Got ${espnEvents.length} ESPN events, ${enriched.games.length} static games`);

  // ---- Phase 1: Match by FIFA codes (group stage + confirmed KO teams) ----
  const remaining = [];
  for (const ev of espnEvents) {
    const matched = matchByFifa(ev, enriched.games);
    if (matched) {
      overlayEspn(matched, ev);
    } else {
      remaining.push(ev);
    }
  }

  const fifaMatched = espnEvents.length - remaining.length;
  console.log(`[espn] FIFA-code matched: ${fifaMatched}, remaining: ${remaining.length}`);

  // ---- Phase 2: Match remaining (knockout placeholders) by date/order ----
  if (remaining.length > 0) {
    const unmatchedGames = enriched.games.filter((g) => !g._espnMatched);
    const koRemaining = matchByDate(remaining, unmatchedGames);
    for (const [ev, game] of koRemaining) {
      overlayEspn(game, ev);
    }
    console.log(`[espn] Date-matched knockout: ${koRemaining.length}, still unmatched espn: ${remaining.length - koRemaining.length}`);
  }

  // ---- Phase 3: Clean up, set defaults, and write ----
  const cleanGames = enriched.games.map(({ home_fifa, away_fifa, _kickoffUtc, _espnMatched, ...g }) => {
    // Ensure critical fields exist with safe defaults
    g.home_score = g.home_score ?? "0";
    g.away_score = g.away_score ?? "0";
    g.home_scorers = g.home_scorers ?? null;
    g.away_scorers = g.away_scorers ?? null;
    g.finished = g.finished ?? "FALSE";
    g.time_elapsed = g.time_elapsed ?? "notstarted";
    g.home_team_name_en = g.home_team_name_en ?? "";
    g.away_team_name_en = g.away_team_name_en ?? "";
    return g;
  });

  const snapshot = {
    syncedAt: new Date().toISOString(),
    source: "ESPN scoreboard + static metadata",
    teams: staticData.teams,
    groups: staticData.groups,
    games: cleanGames,
    stadiums: staticData.stadiums,
  };

  // Preserve fresher data from existing file
  try {
    const existing = JSON.parse(await readFile(OUT, "utf8"));
    const byId = new Map((existing.games ?? []).map((g) => [String(g.id), g]));
    for (const game of snapshot.games) {
      const prior = byId.get(String(game.id));
      if (!prior) continue;
      const nt = Number(game.home_score ?? 0) + Number(game.away_score ?? 0);
      const pt = Number(prior.home_score ?? 0) + Number(prior.away_score ?? 0);
      if (String(game.finished).toUpperCase() !== "TRUE" && String(prior.finished).toUpperCase() !== "TRUE" && pt >= nt && pt > 0) {
        game.home_score = prior.home_score;
        game.away_score = prior.away_score;
      }
      if ((!game.home_scorers || game.home_scorers === "null") && prior.home_scorers) {
        game.home_scorers = prior.home_scorers;
        game.away_scorers = prior.away_scorers;
      }
    }
  } catch { /* first run */ }

  await mkdir(OUT_DIR, { recursive: true });
  await writeAtomic(OUT, JSON.stringify(snapshot));

  const finished = cleanGames.filter((g) => g.finished === "TRUE").length;
  console.log(`[espn] Wrote ${OUT} — ${finished}/${cleanGames.length} finished`);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function matchByFifa(ev, games) {
  const hc = ev.homeAbbr, ac = ev.awayAbbr;
  if (!hc || !ac) return null;
  // Try exact
  for (const g of games) {
    if (g._espnMatched) continue;
    if (g.home_fifa === hc && g.away_fifa === ac) return g;
  }
  // Try reversed
  for (const g of games) {
    if (g._espnMatched) continue;
    if (g.home_fifa === ac && g.away_fifa === hc) return g;
  }
  return null;
}

function matchByDate(espnEvents, games) {
  // Sort both by date
  const sortedEspn = [...espnEvents].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const sortedGames = [...games].sort((a, b) => {
    const ta = a._kickoffUtc?.getTime() ?? Infinity;
    const tb = b._kickoffUtc?.getTime() ?? Infinity;
    return ta - tb;
  });

  const pairs = [];
  let gi = 0;
  for (const ev of sortedEspn) {
    while (gi < sortedGames.length && sortedGames[gi]._espnMatched) gi++;
    if (gi >= sortedGames.length) break;
    const game = sortedGames[gi];
    const gameTime = game._kickoffUtc;
    const evTime = ev.date ? new Date(ev.date) : null;
    // Match if within 3 hours
    if (gameTime && evTime && Math.abs(gameTime - evTime) < 3 * 3600000) {
      pairs.push([ev, game]);
      gi++;
    }
  }
  return pairs;
}

function overlayEspn(game, ev) {
  game._espnMatched = true;
  // Always set score fields
  game.home_score = String(ev.homeScore);
  game.away_score = String(ev.awayScore);
  if (ev.state === "post") {
    game.finished = "TRUE";
    game.time_elapsed = "finished";
  } else if (ev.state === "in") {
    game.finished = "FALSE";
    game.time_elapsed = ev.clock || "live";
  } else {
    // Upcoming
    game.finished = "FALSE";
    game.time_elapsed = "notstarted";
  }
}

main().catch((err) => { console.error("[espn] FATAL:", err.message); process.exitCode = 1; });
