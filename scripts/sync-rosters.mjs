#!/usr/bin/env node
// Pull FIFA World Cup 2026 team rosters from ESPN's public site API and
// writes a same-origin roster snapshot. No API key required.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "public/data");
const WC26 = resolve(OUT_DIR, "wc26.json");
const OUT = resolve(OUT_DIR, "rosters.json");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pull(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": "wc26-meowbiter/1.0 (+https://worldcup.meowbiter.me)",
      },
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function posRank(pos) {
  return { G: 0, GK: 0, D: 1, DF: 1, M: 2, MF: 2, F: 3, FW: 3 }[pos] ?? 9;
}

function simplifyPlayer(p) {
  const position = p.position?.abbreviation || p.position?.name || undefined;
  const jersey = Number.parseInt(p.jersey, 10);
  const headshot = Array.isArray(p.headshots) ? p.headshots[0]?.href : undefined;
  const playerUrl = Array.isArray(p.links)
    ? p.links.find((l) => l.rel?.includes("playercard") || l.rel?.includes("athlete"))?.href
    : undefined;

  return {
    id: String(p.id ?? ""),
    name: p.displayName || p.fullName || p.shortName || "Unknown player",
    shortName: p.shortName || undefined,
    number: Number.isNaN(jersey) ? undefined : jersey,
    position,
    age: typeof p.age === "number" ? p.age : undefined,
    headshot,
    url: playerUrl,
  };
}

async function main() {
  const snap = JSON.parse(await readFile(WC26, "utf8"));
  const localTeams = snap.teams ?? [];

  const teamList = await pull(`${ESPN}/teams`);
  const espnTeams = [];
  for (const sport of teamList.sports ?? []) {
    for (const league of sport.leagues ?? []) {
      for (const item of league.teams ?? []) {
        const t = item.team ?? {};
        if (t.id && t.abbreviation) espnTeams.push(t);
      }
    }
  }

  const byCode = new Map(espnTeams.map((t) => [String(t.abbreviation).toUpperCase(), t]));
  const rosters = [];
  const missing = [];

  for (const team of localTeams) {
    const espn = byCode.get(String(team.fifa_code).toUpperCase());
    if (!espn) {
      missing.push(`${team.name_en} (${team.fifa_code})`);
      continue;
    }

    await sleep(80); // be gentle with the public endpoint
    const roster = await pull(`${ESPN}/teams/${espn.id}/roster`);
    const players = (roster.athletes ?? [])
      .map(simplifyPlayer)
      .sort((a, b) => posRank(a.position) - posRank(b.position) || (a.number ?? 999) - (b.number ?? 999));

    rosters.push({
      teamId: String(team.id),
      teamName: team.name_en,
      teamCode: team.fifa_code,
      espnTeamId: String(espn.id),
      espnTeamName: espn.displayName,
      players,
    });
  }

  const snapshot = {
    syncedAt: new Date().toISOString(),
    source: "ESPN public site API",
    rosters,
    missing,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot), "utf8");
  console.log(`[rosters] ${OUT} ok @ ${snapshot.syncedAt} | teams=${rosters.length} players=${rosters.reduce((n, r) => n + r.players.length, 0)} missing=${missing.length}`);
  if (missing.length) console.log(`[rosters] missing: ${missing.join(", ")}`);
}

main().catch((e) => {
  console.error("[rosters] FAILED:", e.message);
  process.exit(1);
});
