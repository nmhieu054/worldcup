#!/usr/bin/env node
// Pull the official FIFA Men's World Ranking from the Wikipedia data module
// (sourced from FIFA.com) and merge rank/points into public/data/wiki.json.
// No API key required. Run: node scripts/sync-fifa-rank.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "public/data");
const WIKI = resolve(OUT_DIR, "wiki.json");
const MODULE_URL =
  "https://en.wikipedia.org/w/index.php?title=Module:SportsRankings/data/FIFA_World_Rankings&action=raw";

// FIFA module name -> our team name (data.ts uses name_en).
const NAME_MAP = {
  "USA": "United States",
  "Türkiye": "Turkey",
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Côte d'Ivoire": "Ivory Coast",
  "Congo DR": "Democratic Republic of the Congo",
  "Czechia": "Czech Republic",
  "Cape Verde Islands": "Cape Verde",
  "Cabo Verde": "Cape Verde",
  "Aotearoa New Zealand": "New Zealand",
};

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

async function pull(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "wc26-meowbiter/1.0 (+https://worldcup.meowbiter.me)" },
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function parseUpdated(lua) {
  const m = lua.match(/data\.updated\s*=\s*\{\s*day\s*=\s*(\d+),\s*month\s*=\s*'(\w+)',\s*year\s*=\s*(\d+)/);
  if (!m) return null;
  const [, day, month, year] = m;
  const mo = MONTHS[month] ?? 1;
  return `${year}-${String(mo).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function parseRankings(lua) {
  // matches lines like: {  "France", 1, 2, 1877.32 },
  const re = /\{\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*([\d.]+)\s*\}/g;
  const out = new Map();
  let m;
  while ((m = re.exec(lua))) {
    const [, name, rank, move, points] = m;
    const mapped = NAME_MAP[name] ?? name;
    out.set(mapped, { rank: Number(rank), move: Number(move), points: Number(points) });
  }
  return out;
}

async function main() {
  const lua = await pull(MODULE_URL);
  const updated = parseUpdated(lua);
  const ranks = parseRankings(lua);
  if (ranks.size === 0) throw new Error("no rankings parsed — module format may have changed");

  const wiki = JSON.parse(await readFile(WIKI, "utf8"));
  let matched = 0;
  const missing = [];

  for (const team of wiki.teams ?? []) {
    const r = ranks.get(team.name);
    if (r) {
      team.fifaRank = r.rank;
      team.fifaPoints = r.points;
      team.fifaMove = r.move;
      team.fifaUpdated = updated;
      matched++;
    } else {
      missing.push(`${team.name} (${team.teamCode})`);
    }
  }

  wiki.fifaRankingUpdated = updated;
  wiki.fifaRankingSource = "FIFA/Coca-Cola Men's World Ranking via Wikipedia";

  await writeFile(WIKI, JSON.stringify(wiki), "utf8");
  console.log(`[fifa-rank] updated=${updated} parsed=${ranks.size} matched=${matched}/${(wiki.teams ?? []).length}`);
  if (missing.length) console.log(`[fifa-rank] UNMATCHED: ${missing.join(", ")}`);
}

main().catch((e) => {
  console.error("[fifa-rank] FAILED:", e.message);
  process.exit(1);
});
