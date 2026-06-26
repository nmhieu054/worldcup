#!/usr/bin/env node
// One-shot: freeze the STATIC tournament metadata from worldcup26.ir into a
// committed snapshot. This is the immovable half of the hybrid data model:
//   static (this file)  = teams, groups membership, stadiums, fixture skeleton
//                          (who/where/when + knockout bracket placeholders)
//   live  (ESPN, later) = scores, scorers, finished, time_elapsed, advancement
//
// Run manually (NOT on the timer) when the schedule/teams/venues genuinely
// change (group draw finalised, venue swap). It deliberately drops every
// volatile match field so a frozen result can never leak back into the UI.
//
// Output: scripts/wc26-static.json  (read by the future hybrid sync.mjs)
//
// Usage: node scripts/snapshot-static.mjs
//        node scripts/snapshot-static.mjs --from-current   (derive from the
//          last good dist/data|public/data wc26.json instead of hitting .ir)

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://worldcup26.ir";
const ENDPOINTS = {
  teams: "/get/teams",
  groups: "/get/groups",
  games: "/get/games",
  stadiums: "/get/stadiums",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "wc26-static.json");

// Volatile per-match fields owned by the LIVE feed, never by the static snapshot.
const LIVE_GAME_FIELDS = [
  "home_score",
  "away_score",
  "home_scorers",
  "away_scorers",
  "finished",
  "time_elapsed",
];

async function pull(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(BASE + path, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "wc26-meowbiter/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Keep only the immutable schedule fields of a game; drop everything live. */
function staticGame(g) {
  const out = {};
  for (const [k, v] of Object.entries(g)) {
    if (!LIVE_GAME_FIELDS.includes(k)) out[k] = v;
  }
  return out;
}

async function fromCurrent() {
  for (const dir of ["dist/data", "public/data"]) {
    try {
      const p = resolve(__dirname, "..", dir, "wc26.json");
      const j = JSON.parse(await readFile(p, "utf8"));
      console.log(`[static] deriving from ${dir}/wc26.json`);
      return j;
    } catch { /* try next */ }
  }
  throw new Error("no existing wc26.json found to derive from");
}

async function main() {
  const useCurrent = process.argv.includes("--from-current");

  let teams, groups, games, stadiums;
  if (useCurrent) {
    const j = await fromCurrent();
    ({ teams, groups, games, stadiums } = j);
  } else {
    const [t, gr, ga, st] = await Promise.all([
      pull(ENDPOINTS.teams),
      pull(ENDPOINTS.groups),
      pull(ENDPOINTS.games),
      pull(ENDPOINTS.stadiums),
    ]);
    teams = t.teams ?? t;
    groups = gr.groups ?? gr;
    games = ga.games ?? ga;
    stadiums = st.stadiums ?? st;
  }

  const c = (a) => (Array.isArray(a) ? a.length : 0);
  if (c(teams) === 0 || c(games) === 0 || c(stadiums) === 0) {
    throw new Error(
      `refusing to freeze incomplete metadata (teams=${c(teams)} games=${c(games)} stadiums=${c(stadiums)})`
    );
  }

  // Strip standings numbers from group rows: membership (team_id) is static,
  // the W/D/L/pts are recomputed client-side anyway, so don't freeze stale zeros.
  const groupsStatic = (groups ?? []).map((gr) => ({
    ...gr,
    teams: (gr.teams ?? []).map((row) => ({ team_id: row.team_id })),
  }));

  const snapshot = {
    frozenAt: new Date().toISOString(),
    source: `${BASE} (frozen static metadata)`,
    note: "Static half of hybrid model. Live scores/status come from the feed and are overlaid at sync time. Re-run scripts/snapshot-static.mjs only when schedule/teams/venues change.",
    teams,
    groups: groupsStatic,
    stadiums,
    games: (games ?? []).map(staticGame),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot, null, 0), "utf8");

  console.log(
    `[static] froze ${OUT}\n` +
    `         teams=${c(snapshot.teams)} groups=${c(snapshot.groups)} ` +
    `stadiums=${c(snapshot.stadiums)} games=${c(snapshot.games)} @ ${snapshot.frozenAt}`
  );
}

main().catch((e) => {
  console.error("[static] FAILED:", e.message);
  process.exit(1);
});
