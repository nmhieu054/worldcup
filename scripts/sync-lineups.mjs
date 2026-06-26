#!/usr/bin/env node
// Pull starting XI + bench + formation from ESPN's summary endpoint for matches
// that are live or about to kick off, and write a same-origin lineups snapshot.
//
// ESPN only publishes lineups ~1h before kickoff, so to stay light on the public
// endpoint we only fetch summaries for games inside a window around kickoff
// (default: 2h before -> 3h after). Everything else is left untouched.
//
// Match mapping: our games carry FIFA codes (home/away team) + a UTC kickoff we
// derive from the venue-local time. ESPN scoreboard groups events by date and
// exposes the same team abbreviations, so we match on `${date}|${home}|${away}`.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "public/data");
const WC26 = resolve(OUT_DIR, "wc26.json");
const OUT = resolve(OUT_DIR, "lineups.json");

// Window (minutes) around kickoff in which we bother fetching a summary.
const PRE_MIN = Number(process.env.WC_LINEUP_PRE_MIN || 120);
const POST_MIN = Number(process.env.WC_LINEUP_POST_MIN || 210);

// IANA zone per stadium id (mirror of src/lib/timezone.ts so the script is standalone).
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

/** UTC YYYYMMDD plus the neighbours, since a venue-local date can straddle the
 *  UTC date boundary on the scoreboard. */
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
        const raw = res.headers.get("retry-after");
        const retryAfter = raw && Number.isFinite(Number(raw)) ? Number(raw) * 1000 : raw ? Math.max(0, Date.parse(raw) - Date.now()) : null;
        const wait = retryAfter ?? Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[lineups] rate-limited HTTP ${res.status}; retrying in ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw new Error(`${url} -> HTTP ${res.status}`);
    } catch (err) {
      if (attempt < maxAttempts) {
        const wait = Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[lineups] fetch failed (${err.message}); retrying in ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`${url} -> rate limited after ${maxAttempts} attempts`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Read the existing lineups array, distinguishing a genuine first run
 *  (file does not exist -> []) from a transient read/parse error (e.g. reading
 *  the file mid-write). On a real error we THROW so the caller aborts and leaves
 *  the live file untouched, instead of silently overwriting it with []. */
async function readPriorLineups() {
  let raw;
  try {
    raw = await readFile(OUT, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return []; // first run: no file yet
    throw new Error(`refusing to overwrite ${OUT}: read failed (${err.message})`);
  }
  try {
    return JSON.parse(raw).lineups ?? [];
  } catch (err) {
    throw new Error(`refusing to overwrite ${OUT}: existing file is not valid JSON (${err.message})`);
  }
}

/** Atomic write: write to a temp file then rename over the target, so a reader
 *  (frontend poll or another sync run) never sees a half-written file. */
async function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, file);
}

function code(team) { return String(team?.fifa_code ?? team ?? "").toUpperCase(); }

/** Build ESPN event index for the needed dates: `${date}|${home}|${away}` -> eventId. */
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
        const st = comp.status ?? e.status ?? {};
        index.set(`${hc}|${ac}`, {
          eventId: e.id,
          homeScore: home?.score,
          awayScore: away?.score,
          state: st.type?.state, // "pre" | "in" | "post"
          completed: st.type?.completed === true,
          clock: st.displayClock || st.type?.shortDetail || undefined,
        });
      }
    } catch (err) {
      console.warn(`[lineups] scoreboard ${date} failed: ${err.message}`);
    }
    await sleep(120);
  }
  return index;
}

function simplifyEntry(entry) {
  const jersey = Number.parseInt(entry.jersey, 10);
  return {
    name: entry.athlete?.displayName || entry.athlete?.fullName || "—",
    number: Number.isNaN(jersey) ? undefined : jersey,
    position: entry.position?.abbreviation || entry.position?.name || undefined,
  };
}

function extractTeamLineup(rosterSide) {
  const entries = rosterSide?.roster ?? [];
  const starting = [], bench = [];
  for (const e of entries) {
    const p = simplifyEntry(e);
    (e.starter ? starting : bench).push(p);
  }
  return {
    formation: rosterSide?.formation || undefined,
    starting,
    bench,
  };
}

/** Pull yellow/red cards out of ESPN keyEvents, mapped to home/away by team id. */
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
    // Prefer the named participant; fall back to parsing the text.
    const player =
      ev.participants?.[0]?.athlete?.displayName ||
      ev.text?.split(" (")[0] ||
      "\u2014";
    const minute = ev.clock?.displayValue || undefined;
    cards.push({ player, minute, color, side });
  }
  return cards;
}

/** Pull goals out of ESPN keyEvents, mapped to home/away by team id.
 *  Returns { home: ["Name 9'", ...], away: [...] }. */
function extractGoals(summary, homeTeamId, awayTeamId) {
  const home = [], away = [];
  for (const ev of summary.keyEvents ?? []) {
    const kind = ev.type?.type || "";
    // Goals only (covers "goal", "goal---header", "own-goal", and ESPN's
    // penalty scored event, which is typed as "penalty---scored" instead of a goal type).
    if (!/goal/i.test(kind) && kind !== "penalty---scored") continue;
    const tid = String(ev.team?.id ?? "");
    const side = tid === String(homeTeamId) ? home : tid === String(awayTeamId) ? away : null;
    if (!side) continue;
    const name =
      ev.participants?.[0]?.athlete?.displayName ||
      ev.shortText?.replace(/\s+Goal.*$/i, "") ||
      "\u2014";
    const minute = ev.clock?.displayValue || "";
    side.push(minute ? `${name} ${minute}` : name);
  }
  return { home, away };
}

async function main() {
  const snap = JSON.parse(await readFile(WC26, "utf8"));
  const teamById = new Map((snap.teams ?? []).map((t) => [String(t.id), t]));
  const now = Date.now();

  // Pick games inside the kickoff window OR already flagged live by the main sync.
  const inWindow = [];
  for (const g of snap.games ?? []) {
    const home = g.home_team_id !== "0" ? teamById.get(g.home_team_id) : null;
    const away = g.away_team_id !== "0" ? teamById.get(g.away_team_id) : null;
    if (!home || !away) continue; // knockout placeholders: no fixed teams yet
    const kickoff = parseKickoff(g.local_date, g.stadium_id);
    if (!kickoff) continue;
    const live = g.finished !== "TRUE" && g.time_elapsed && !["notstarted", "ft"].includes(g.time_elapsed.toLowerCase());
    const mins = (now - kickoff.getTime()) / 60000; // minutes since kickoff
    if (live || (mins >= -PRE_MIN && mins <= POST_MIN)) {
      inWindow.push({ g, home, away, kickoff });
    }
  }

  if (inWindow.length === 0) {
    // Nothing to fetch right now: keep any existing lineups so we don't wipe a
    // recently-finished match's XI mid-day.
    const existing = await readPriorLineups();
    await mkdir(dirname(OUT), { recursive: true });
    await writeAtomic(OUT, JSON.stringify({ syncedAt: new Date().toISOString(), source: "ESPN summary", lineups: existing }));
    console.log(`[lineups] no matches in window (-${PRE_MIN}..+${POST_MIN} min); kept ${existing.length} existing`);
    return;
  }

  const dateKeys = [...new Set(inWindow.flatMap(({ kickoff }) => espnDateKeys(kickoff)))];
  const index = await buildEspnIndex(dateKeys);

  const lineups = [];
  // Score/status/scorer patches keyed by game id. ESPN is more reliable + faster
  // than worldcup26.ir, so when ESPN says a match is in-play or finished we
  // override the main feed (which sometimes lags badly). When ESPN has no data
  // (state "pre" / no event) we leave the worldcup26.ir values untouched.
  const gamePatch = new Map();
  for (const { g, home, away } of inWindow) {
    const espn = index.get(`${code(home)}|${code(away)}`);
    if (!espn?.eventId) {
      console.warn(`[lineups] no ESPN event for ${code(home)} vs ${code(away)} (game ${g.id})`);
      continue;
    }
    const eventId = espn.eventId;

    // Patch live score + status from the scoreboard (cheap, already fetched).
    if (espn.state === "in" || espn.state === "post") {
      const patch = {};
      if (espn.homeScore != null) patch.home_score = String(espn.homeScore);
      if (espn.awayScore != null) patch.away_score = String(espn.awayScore);
      if (espn.state === "post" || espn.completed) {
        patch.finished = "TRUE";
        patch.time_elapsed = "ft";
      } else {
        patch.finished = "FALSE";
        patch.time_elapsed = espn.clock || "live";
      }
      gamePatch.set(g.id, patch);
    }

    try {
      await sleep(150);
      const summary = await pull(`${ESPN}/summary?event=${eventId}`);
      const sides = summary.rosters ?? [];
      const homeSide = sides.find((s) => s.homeAway === "home");
      const awaySide = sides.find((s) => s.homeAway === "away");
      const homeLineup = extractTeamLineup(homeSide);
      const awayLineup = extractTeamLineup(awaySide);
      const cards = extractCards(summary, homeSide?.team?.id, awaySide?.team?.id);
      const goals = extractGoals(summary, homeSide?.team?.id, awaySide?.team?.id);
      // Patch scorers from summary keyEvents (more accurate than the main feed).
      // Always overwrite both sides while ESPN owns the live/post score, even
      // when one side has zero goals. Otherwise a stale scorer from the base
      // source can survive beside a 0 score (e.g. 1-0 with an away scorer).
      if (espn.state === "in" || espn.state === "post") {
        const patch = gamePatch.get(g.id) ?? {};
        patch.home_scorers = goals.home.join(", ");
        patch.away_scorers = goals.away.join(", ");
        gamePatch.set(g.id, patch);
      }
      // Only record lineup if at least one side has a published XI.
      if (homeLineup.starting.length || awayLineup.starting.length) {
        lineups.push({
          matchId: g.id,
          updatedAt: new Date().toISOString(),
          home: homeLineup,
          away: awayLineup,
          cards,
        });
        console.log(`[lineups] game ${g.id} ${code(home)} vs ${code(away)}: XI ${homeLineup.starting.length}/${awayLineup.starting.length}, cards ${cards.length}`);
      } else {
        console.log(`[lineups] game ${g.id} ${code(home)} vs ${code(away)}: lineup not published yet`);
      }
    } catch (err) {
      console.warn(`[lineups] summary ${eventId} failed: ${err.message}`);
    }
  }

  // Apply ESPN score/status/scorer patches back into wc26.json so the frontend
  // (and standings) see the fresher numbers. Guarded: only rewrite when we have
  // at least one patch and the snapshot still looks valid.
  if (gamePatch.size > 0 && Array.isArray(snap.games) && snap.games.length > 0) {
    let patched = 0;
    for (const g of snap.games) {
      const p = gamePatch.get(g.id);
      if (p) { Object.assign(g, p); patched++; }
    }
    try {
      await writeFile(WC26, JSON.stringify(snap), "utf8");
      console.log(`[lineups] patched ${patched} game(s) in wc26.json from ESPN`);
    } catch (err) {
      console.warn(`[lineups] wc26.json patch write failed: ${err.message}`);
    }
  }

  // Merge: fresh lineups override, keep previously-captured ones not in this window.
  const prior = await readPriorLineups();
  const merged = new Map(prior.map((l) => [l.matchId, l]));
  for (const l of lineups) merged.set(l.matchId, l);

  await mkdir(dirname(OUT), { recursive: true });
  await writeAtomic(OUT, JSON.stringify({ syncedAt: new Date().toISOString(), source: "ESPN summary", lineups: [...merged.values()] }));
  console.log(`[lineups] ${OUT} ok | window=${inWindow.length} fetched=${lineups.length} total=${merged.size}`);
}

main().catch((e) => {
  console.error("[lineups] FAILED:", e.message);
  process.exit(1);
});
