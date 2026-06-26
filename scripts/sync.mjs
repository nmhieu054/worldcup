#!/usr/bin/env node
// Pulls WC26 data from worldcup26.ir (no key) and writes a single same-origin
// snapshot the frontend can fetch. Run on a timer; frontend never hits the
// upstream API directly (avoids CORS + keeps one cached source of truth).

import { readFile, writeFile, mkdir } from "node:fs/promises";
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
// Write into dist/data when built, else public/data in dev.
const OUT = resolve(__dirname, "..", process.env.WC_OUT_DIR || "public/data", "wc26.json");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function retryAfterMs(res) {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(raw);
  return Number.isNaN(when) ? null : Math.max(0, when - Date.now());
}

async function pull(path) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(BASE + path, {
        signal: ctrl.signal,
        headers: { accept: "application/json", "user-agent": "wc26-meowbiter/1.0" },
      });
      if (res.ok) return await res.json();
      if ((res.status === 420 || res.status === 429 || res.status === 503) && attempt < maxAttempts) {
        const wait = retryAfterMs(res) ?? Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[sync] ${path} rate-limited HTTP ${res.status}; retrying in ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt < maxAttempts) {
        const wait = Math.min(15000, 1000 * 2 ** (attempt - 1));
        console.warn(`[sync] ${path} failed (${err.message}); retrying in ${wait}ms (${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`rate limited after ${maxAttempts} attempts: ${path}`);
}

async function main() {
  const [teams, groups, games, stadiums] = await Promise.all([
    pull(ENDPOINTS.teams),
    pull(ENDPOINTS.groups),
    pull(ENDPOINTS.games),
    pull(ENDPOINTS.stadiums),
  ]);

  const snapshot = {
    syncedAt: new Date().toISOString(),
    source: BASE,
    teams: teams.teams ?? teams,
    groups: groups.groups ?? groups,
    games: games.games ?? games,
    stadiums: stadiums.stadiums ?? stadiums,
  };

  // ESPN patches live score/scorers after the base source sync. With a fast
  // timer, the frontend can read wc26.json in the small gap between base write
  // and ESPN patch. Preserve a newer/higher live score from the existing file
  // so the base source never rolls a live match backwards.
  try {
    const existing = JSON.parse(await readFile(OUT, "utf8"));
    const existingById = new Map((existing.games ?? []).map((g) => [String(g.id), g]));
    for (const game of snapshot.games) {
      const prior = existingById.get(String(game.id));
      if (!prior) continue;
      const nextTotal = Number(game.home_score ?? 0) + Number(game.away_score ?? 0);
      const priorTotal = Number(prior.home_score ?? 0) + Number(prior.away_score ?? 0);
      const sameUnfinishedMatch = String(game.finished).toUpperCase() !== "TRUE" && String(prior.finished).toUpperCase() !== "TRUE";
      if (sameUnfinishedMatch && priorTotal >= nextTotal) {
        game.home_score = prior.home_score;
        game.away_score = prior.away_score;
        game.home_scorers = prior.home_scorers;
        game.away_scorers = prior.away_scorers;
        game.time_elapsed = prior.time_elapsed;
        game.finished = prior.finished;
      }

      // The base source sometimes returns scorer names in Persian/Arabic script
      // while ESPN patches them in Latin. Once we have Latin scorer names, keep
      // them across later base-source syncs, including finished matches.
      const hasLatin = (v) => /[A-Za-zÀ-ž]/.test(String(v ?? ""));
      const hasArabic = (v) => /[\u0600-\u06ff]/.test(String(v ?? ""));
      if (hasLatin(prior.home_scorers) && hasArabic(game.home_scorers)) game.home_scorers = prior.home_scorers;
      if (hasLatin(prior.away_scorers) && hasArabic(game.away_scorers)) game.away_scorers = prior.away_scorers;
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("[sync] live score preservation skipped:", err.message);
  }

  const c = (a) => (Array.isArray(a) ? a.length : 0);
  // Guard: never overwrite a good snapshot with an empty/broken upstream reply.
  // A live match could otherwise flap back to "upcoming" mid-game.
  if (c(snapshot.games) === 0 || c(snapshot.teams) === 0) {
    throw new Error(
      `refusing to write empty snapshot (teams=${c(snapshot.teams)} games=${c(snapshot.games)})`
    );
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot), "utf8");

  // Keep sitemap lastmod fresh so search engines see the page changes.
  try {
    const today = snapshot.syncedAt.slice(0, 10);
    const sitemap = resolve(dirname(OUT), "..", "sitemap.xml");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://worldcup.meowbiter.me/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>hourly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
    await writeFile(sitemap, xml, "utf8");
  } catch (e) {
    console.warn("[sync] sitemap lastmod update skipped:", e.message);
  }

  console.log(
    `[sync] ${OUT} ok @ ${snapshot.syncedAt} | teams=${c(snapshot.teams)} groups=${c(
      snapshot.groups
    )} games=${c(snapshot.games)} stadiums=${c(snapshot.stadiums)}`
  );
}

main().catch((e) => {
  console.error("[sync] FAILED:", e.message);
  process.exit(1);
});
