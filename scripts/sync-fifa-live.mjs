#!/usr/bin/env node
// Compute LIVE FIFA Men's World Ranking by applying the FIFA Elo formula
// to all completed World Cup 2026 matches. Reads base points from wiki.json
// (last official FIFA ranking) and match results from wc26.json.
//
// FIFA formula (post-2018): P_new = P_before + I * (W - W_e)
//   I  = match importance (WC group=50, WC knockout before QF=50, WC QF+=60)
//   W  = 1 (win), 0.75 (penalty win), 0.5 (draw / penalty loss), 0 (loss)
//   We = 1 / (10^(-dr/600) + 1)  where dr = P_before_A - P_before_B
//
// Outputs: dist/data/wiki.json updated with fifaLive* fields

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "dist/data");
const WIKI = resolve(OUT_DIR, "wiki.json");
const WC26 = resolve(OUT_DIR, "wc26.json");

// FIFA match importance factor
function importance(type, round) {
  if (type === "group") return 50;
  if (type === "r32" || type === "r16") return 50;
  // qf, sf, third, final
  return 60;
}

// Expected result: We for team A
function expectedResult(ra, rb) {
  const dr = ra - rb;
  return 1.0 / (Math.pow(10, -dr / 600) + 1);
}

// Match result W from team perspective
// win=1, penWin=0.75, draw=0.5, penLoss=0.5, loss=0
function matchResult(homeScore, awayScore, isHome, winner, type) {
  const hs = parseInt(homeScore, 10);
  const as = parseInt(awayScore, 10);

  // Determine if this is a penalty shootout knockout or a regular match
  // In knockout, winner field determines who advances
  // If scores are tied in knockout, it went to pens/ET
  const isKnockout = type !== "group";

  if (isKnockout) {
    if (hs === as) {
      // Draw in knockout → went to penalties or ET with pens
      // winner field tells who won the shootout
      if (winner === "home") {
        return isHome ? 0.75 : 0.5;
      } else if (winner === "away") {
        return isHome ? 0.5 : 0.75;
      }
    }
  }

  // Regular time result
  if (hs > as) return isHome ? 1 : 0;
  if (hs < as) return isHome ? 0 : 1;
  return 0.5; // draw
}

async function main() {
  const wiki = JSON.parse(await readFile(WIKI, "utf8"));
  const wc26 = JSON.parse(await readFile(WC26, "utf8"));

  // Build team lookup: fifa_code -> wiki team entry
  const teamByFifaCode = new Map();
  const teamById = new Map();

  for (const t of wiki.teams ?? []) {
    // Wiki teams have teamCode (FIFA code like FRA, ARG)
    const code = (t.teamCode || "").toUpperCase();
    if (code) teamByFifaCode.set(code, t);
  }

  // Build wc26 team id -> fifa_code
  const idToFifaCode = new Map();
  for (const t of wc26.teams ?? []) {
    const code = (t.fifa_code || "").toUpperCase();
    if (code && t.id) idToFifaCode.set(t.id, code);
  }

  // Initialize live points from official FIFA points
  const livePoints = new Map(); // fifa_code -> { points, rank }
  for (const [code, t] of teamByFifaCode) {
    const pts = t.fifaPoints ?? 0;
    if (pts > 0) livePoints.set(code, pts);
  }

  // Get all games with results, sorted by match order
  const games = (wc26.games ?? []).filter((g) => {
    const hs = g.home_score;
    const aws = g.away_score;
    if (hs == null || aws == null) return false;
    const hi = parseInt(hs, 10);
    const ai = parseInt(aws, 10);
    return !isNaN(hi) && !isNaN(ai) && hi >= 0 && ai >= 0;
  });

  // Track how many matches each team has played
  const matchesPlayed = new Map();

  let pointChanges = 0;

  for (const g of games) {
    const homeCode = idToFifaCode.get(g.home_team_id);
    const awayCode = idToFifaCode.get(g.away_team_id);
    if (!homeCode || !awayCode) continue;

    const homePts = livePoints.get(homeCode);
    const awayPts = livePoints.get(awayCode);
    if (homePts == null || awayPts == null) continue;

    const I = importance(g.type, g.round || "");

    // Expected results
    const weHome = expectedResult(homePts, awayPts);
    const weAway = expectedResult(awayPts, homePts);

    // Actual results
    const wHome = matchResult(g.home_score, g.away_score, true, g.winner, g.type);
    const wAway = matchResult(g.home_score, g.away_score, false, g.winner, g.type);

    // New points
    const newHome = Math.round((homePts + I * (wHome - weHome)) * 100) / 100;
    const newAway = Math.round((awayPts + I * (wAway - weAway)) * 100) / 100;

    if (newHome !== homePts || newAway !== awayPts) pointChanges++;

    livePoints.set(homeCode, newHome);
    livePoints.set(awayCode, newAway);

    matchesPlayed.set(homeCode, (matchesPlayed.get(homeCode) || 0) + 1);
    matchesPlayed.set(awayCode, (matchesPlayed.get(awayCode) || 0) + 1);
  }

  // Compute live rank
  const ranked = [...livePoints.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, pts], i) => ({ code, points: pts, rank: i + 1 }));

  const rankMap = new Map(ranked.map((r) => [r.code, r]));

  // Update wiki.json teams with live ranking data
  let updated = 0;
  for (const t of wiki.teams ?? []) {
    const code = (t.teamCode || "").toUpperCase();
    const live = rankMap.get(code);
    if (live) {
      const oldRank = t.fifaRank ?? 0;
      t.fifaLiveRank = live.rank;
      t.fifaLivePoints = live.points;
      t.fifaLiveMove = oldRank ? oldRank - live.rank : 0; // positive = moved up
      updated++;
    }
  }

  wiki.fifaLiveUpdated = wc26.syncedAt || new Date().toISOString();
  wiki.fifaLiveSource = "WC26 Elo-calculated from official FIFA June 2026 base + WC2026 match results";
  wiki.fifaLiveMatches = games.length;
  wiki.fifaLivePointChanges = pointChanges;

  await writeFile(WIKI, JSON.stringify(wiki), "utf8");

  console.log(`[fifa-live] games=${games.length} pointChanges=${pointChanges} teamsUpdated=${updated}/${(wiki.teams ?? []).length}`);

  // Print top 15
  const top15 = [...rankMap.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 15);
  for (const r of top15) {
    const t = teamByFifaCode.get(r.code);
    const officialRank = t?.fifaRank ?? "?";
    const move = t?.fifaLiveMove ?? 0;
    const arrow = move > 0 ? "↑" : move < 0 ? "↓" : "-";
    console.log(`  ${r.rank}. ${r.code} ${r.points} (official: #${officialRank}) ${arrow}${Math.abs(move)}`);
  }
}

main().catch((e) => {
  console.error("[fifa-live] FAILED:", e.message);
  process.exit(1);
});
