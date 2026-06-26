#!/usr/bin/env node
// Build a per-team wiki snapshot for the 48 WC26 nations.
//  - Overview text + page URL: Vietnamese Wikipedia (falls back to English)
//  - Head coach: Wikidata P286 (current statement, no end-time)
//  - Confederation: deterministic map (accurate, not scraped)
// Only stores data we can verify; missing fields are omitted rather than faked.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", process.env.WC_OUT_DIR || "public/data");
const WC26 = resolve(OUT_DIR, "wc26.json");
const OUT = resolve(OUT_DIR, "wiki.json");

const UA = "wc26-meowbiter/1.0 (+https://worldcup.meowbiter.me; contact: hello@meowbiter.me)";

// FIFA code -> English Wikipedia page title for the men's national team.
const EN_TITLE = {
  ALG: "Algeria national football team",
  ARG: "Argentina national football team",
  AUS: "Australia men's national soccer team",
  AUT: "Austria national football team",
  BEL: "Belgium national football team",
  BIH: "Bosnia and Herzegovina national football team",
  BRA: "Brazil national football team",
  CAN: "Canada men's national soccer team",
  CIV: "Ivory Coast national football team",
  COD: "Democratic Republic of the Congo national football team",
  COL: "Colombia national football team",
  CPV: "Cape Verde national football team",
  CRO: "Croatia national football team",
  CUW: "Curaçao national football team",
  CZE: "Czech Republic national football team",
  ECU: "Ecuador national football team",
  EGY: "Egypt national football team",
  ENG: "England national football team",
  ESP: "Spain national football team",
  FRA: "France national football team",
  GER: "Germany national football team",
  GHA: "Ghana national football team",
  HAI: "Haiti national football team",
  IRN: "Iran national football team",
  IRQ: "Iraq national football team",
  JOR: "Jordan national football team",
  JPN: "Japan national football team",
  KOR: "South Korea national football team",
  KSA: "Saudi Arabia national football team",
  MAR: "Morocco national football team",
  MEX: "Mexico national football team",
  NED: "Netherlands national football team",
  NOR: "Norway national football team",
  NZL: "New Zealand national football team",
  PAN: "Panama national football team",
  PAR: "Paraguay national football team",
  POR: "Portugal national football team",
  QAT: "Qatar national football team",
  RSA: "South Africa national football team",
  SCO: "Scotland national football team",
  SEN: "Senegal national football team",
  SUI: "Switzerland national football team",
  SWE: "Sweden national football team",
  TUN: "Tunisia national football team",
  TUR: "Turkey national football team",
  URU: "Uruguay national football team",
  USA: "United States men's national soccer team",
  UZB: "Uzbekistan national football team",
};

const CONFED = {
  UEFA: ["AUT", "BEL", "BIH", "CRO", "CZE", "ENG", "ESP", "FRA", "GER", "NED", "NOR", "POR", "SCO", "SUI", "SWE", "TUR"],
  CONMEBOL: ["ARG", "BRA", "COL", "ECU", "PAR", "URU"],
  CONCACAF: ["CAN", "CUW", "HAI", "MEX", "PAN", "USA"],
  CAF: ["ALG", "CIV", "COD", "CPV", "EGY", "GHA", "MAR", "RSA", "SEN", "TUN"],
  AFC: ["AUS", "IRN", "IRQ", "JOR", "JPN", "KOR", "KSA", "QAT", "UZB"],
  OFC: ["NZL"],
};
const CONFED_LABEL = {
  UEFA: "UEFA (châu Âu)",
  CONMEBOL: "CONMEBOL (Nam Mỹ)",
  CONCACAF: "CONCACAF (Bắc – Trung Mỹ)",
  CAF: "CAF (châu Phi)",
  AFC: "AFC (châu Á)",
  OFC: "OFC (châu Đại Dương)",
};
const confedOf = (code) => {
  for (const [k, list] of Object.entries(CONFED)) if (list.includes(code)) return CONFED_LABEL[k];
  return null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pull(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
      if (res.status === 429 || res.status === 503) {
        await sleep(1000 * 2 ** i);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(600 * 2 ** i);
    }
  }
}

const REST_EN = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const REST_VI = "https://vi.wikipedia.org/api/rest_v1/page/summary/";
const enc = (t) => encodeURIComponent(t.replace(/ /g, "_"));

function pickCoachId(entity) {
  const claims = entity?.claims?.P286;
  if (!Array.isArray(claims) || !claims.length) return null;
  // Prefer a statement with no end-time (current), else the last listed.
  const current = claims.filter((c) => !c.qualifiers?.P582 && c.rank !== "deprecated");
  const chosen = (current.length ? current : claims).slice(-1)[0];
  return chosen?.mainsnak?.datavalue?.value?.id ?? null;
}

async function main() {
  const snap = JSON.parse(await readFile(WC26, "utf8"));
  const teams = snap.teams ?? [];
  const out = [];
  const coachIds = new Map(); // teamCode -> coach Q-id

  for (const team of teams) {
    const code = team.fifa_code;
    const enTitle = EN_TITLE[code];
    let qid = null;
    let viTitle = null;
    let overview = null;
    let overviewLang = null;

    // 1) English summary -> wikibase item id
    if (enTitle) {
      try {
        const en = await pull(REST_EN + enc(enTitle));
        qid = en?.wikibase_item ?? null;
        if (en?.extract) {
          overview = en.extract;
          overviewLang = "en";
        }
      } catch (e) {
        console.log(`WARN en ${code}: ${e.message}`);
      }
      await sleep(220);
    }

    // 2) Wikidata entity -> coach id + viwiki sitelink
    if (qid) {
      try {
        const wd = await pull(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
        const entity = wd?.entities?.[qid];
        const cid = pickCoachId(entity);
        if (cid) coachIds.set(code, cid);
        viTitle = entity?.sitelinks?.viwiki?.title ?? null;
      } catch (e) {
        console.log(`WARN wd ${code}: ${e.message}`);
      }
      await sleep(220);
    }

    // 3) Vietnamese summary (preferred overview text)
    if (viTitle) {
      try {
        const vi = await pull(REST_VI + enc(viTitle));
        if (vi?.extract) {
          overview = vi.extract;
          overviewLang = "vi";
        }
      } catch (e) {
        console.log(`WARN vi ${code}: ${e.message}`);
      }
      await sleep(220);
    }

    out.push({
      teamId: String(team.id),
      teamCode: code,
      name: team.name_en,
      confederation: confedOf(code),
      coach: null, // filled below
      overview: overview ? overview.trim() : null,
      overviewLang,
      wikiTitle: viTitle || enTitle || null,
      wikiUrl: viTitle
        ? `https://vi.wikipedia.org/wiki/${enc(viTitle)}`
        : enTitle
          ? `https://en.wikipedia.org/wiki/${enc(enTitle)}`
          : null,
    });
    console.log(`OK ${code} ${team.name_en} | Q=${qid ?? "-"} vi=${viTitle ? "y" : "n"} coach=${coachIds.has(code) ? "y" : "n"}`);
  }

  // Batch-resolve coach labels (prefer vi label, fall back to en).
  const ids = [...new Set([...coachIds.values()])];
  const labelById = new Map();
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join("|")}&props=labels&languages=vi|en&format=json&origin=*`;
    try {
      const data = await pull(url);
      for (const [id, ent] of Object.entries(data?.entities ?? {})) {
        const lbl = ent?.labels?.vi?.value || ent?.labels?.en?.value || null;
        if (lbl) labelById.set(id, lbl);
      }
    } catch (e) {
      console.log(`WARN labels: ${e.message}`);
    }
    await sleep(250);
  }
  for (const row of out) {
    const cid = coachIds.get(row.teamCode);
    if (cid && labelById.has(cid)) row.coach = labelById.get(cid);
  }

  const snapshot = {
    syncedAt: new Date().toISOString(),
    source: "Wikipedia (vi/en) + Wikidata",
    teams: out,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot), "utf8");
  const withOverview = out.filter((t) => t.overview).length;
  const withCoach = out.filter((t) => t.coach).length;
  console.log(`[wiki] ${OUT} ok | teams=${out.length} overview=${withOverview} coach=${withCoach}`);
}

main().catch((e) => {
  console.error("[wiki] FAILED:", e.message);
  process.exit(1);
});
