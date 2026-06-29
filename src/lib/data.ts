import {
  KNOCKOUT_LABEL,
  KNOCKOUT_ORDER,
  type GroupStanding,
  type KnockoutType,
  type Match,
  type MatchLineup,
  type MatchStatus,
  type RawGame,
  type Snapshot,
  type Stadium,
  type StandingRow,
  type Team,
  type TeamRoster,
  type TeamWiki,
} from "./types";
import { STADIUM_TZ, VN_TZ, zonedWallClockToUtc } from "./timezone";
import ANNEX_C from "./annex_c";

/** A label rendered in both supported languages. */
type KoLabelPair = { vi: string; en: string };

/** English knockout round names (Vietnamese lives in KNOCKOUT_LABEL). */
const KNOCKOUT_LABEL_EN: Record<KnockoutType, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  third: "Third place",
  final: "Final",
};

/** Parse "MM/DD/YYYY HH:mm" venue-local time + the stadium's IANA zone into
 *  the true UTC instant. Falls back to VN zone if the stadium is unknown. */
export function parseKickoff(raw: string, stadiumId?: string): Date | null {
  const m = raw?.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min] = m;
  const tz = (stadiumId && STADIUM_TZ[stadiumId]) || VN_TZ;
  const d = zonedWallClockToUtc(
    Number(yyyy),
    Number(mm),
    Number(dd),
    Number(hh),
    Number(min),
    tz
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse the API scorer field. The feed returns a Postgres-style array text
    like {"J. Quiñones 9'","M. Lozano 23'"} (curly braces + smart or straight
    quotes), a plain comma/semicolon list, or the string "null". */
function parseScorers(raw: string | undefined): string[] {
  if (!raw || raw === "null") return [];
  const inner = raw.replace(/^\{/, "").replace(/\}$/, "");
  // The feed quoting is inconsistent (straight " , curly “ ” , and sometimes a
  // closing-curly ” used as the opening quote too). Entry names never contain a
  // comma, so split on comma and strip ANY quote chars off each end — robust to
  // whatever quote variant the upstream throws at us.
  return inner
    .split(",")
    .map((s) => s.replace(/^["“”\s]+|["“”\s]+$/g, "").trim())
    .filter((s) => s && s !== "null");
}

function num(v: string): number {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Extract feeder match ids from a knockout game's placeholder labels,
 *  e.g. "Winner Match 74" / "Loser Match 101" -> ["74"]. Group-stage
 *  placeholders ("Winner Group A") yield nothing. */
function parseFeeders(g: RawGame): string[] {
  const ids: string[] = [];
  for (const lab of [g.home_team_label, g.away_team_label]) {
    const m = lab?.match(/Match\s+(\d+)/i);
    if (m) ids.push(m[1]);
  }
  return ids;
}

// Per-knockout-round noun used when numbering pairs ("Cặp 1 Tứ kết" / "Quarter-final 1").
const KO_PAIR_EN: Record<KnockoutType, string> = {
  r32: "Round-of-32 match",
  r16: "Round-of-16 match",
  qf: "Quarter-final",
  sf: "Semi-final",
  third: "Third-place match",
  final: "Final",
};

/** Map each knockout game id to a human round label in BOTH languages so
 *  bracket placeholders read by round, not by raw match number. */
function buildKnockoutLabels(snap: Snapshot): Map<string, KoLabelPair> {
  const byType = new Map<string, RawGame[]>();
  for (const g of snap.games) {
    if (g.type === "group" || g.type === "third") continue;
    if (!byType.has(g.type)) byType.set(g.type, []);
    byType.get(g.type)!.push(g);
  }
  const map = new Map<string, KoLabelPair>();
  for (const type of KNOCKOUT_ORDER) {
    const games = byType.get(type);
    if (!games) continue;
    games.sort((a, b) => num(a.id) - num(b.id));
    const single = games.length === 1;
    games.forEach((g, i) => {
      map.set(g.id, {
        vi: single ? KNOCKOUT_LABEL[type] : `Cặp ${i + 1} ${KNOCKOUT_LABEL[type]}`,
        en: single ? KNOCKOUT_LABEL_EN[type] : `${KO_PAIR_EN[type]} ${i + 1}`,
      });
    });
  }
  return map;
}

/** Translate the API's English knockout placeholders into a {vi, en} pair.
 *  When a "Match N" reference resolves to a known knockout game, show the
 *  round label instead of the raw match number. */
export function localizeLabel(
  label: string | undefined,
  koLabels?: Map<string, KoLabelPair>
): KoLabelPair {
  if (!label) return { vi: "Chưa xác định", en: "TBD" };
  const win = label.match(/^Winner\s+Match\s+(\d+)/i);
  if (win) {
    const round = koLabels?.get(win[1]);
    return {
      vi: round ? `Thắng ${round.vi}` : `Thắng trận ${win[1]}`,
      en: round ? `Winner ${round.en}` : `Winner Match ${win[1]}`,
    };
  }
  const lose = label.match(/^(?:Loser|Runner-?up)\s+Match\s+(\d+)/i);
  if (lose) {
    const round = koLabels?.get(lose[1]);
    return {
      vi: round ? `Thua ${round.vi}` : `Thua trận ${lose[1]}`,
      en: round ? `Loser ${round.en}` : `Loser Match ${lose[1]}`,
    };
  }
  const grpWin = label.match(/^Winner\s+Group\s+(\w+)/i);
  if (grpWin) return { vi: `Nhất bảng ${grpWin[1]}`, en: `Group ${grpWin[1]} winner` };
  const grpRun = label.match(/^Runner-?up\s+Group\s+(\w+)/i);
  if (grpRun) return { vi: `Nhì bảng ${grpRun[1]}`, en: `Group ${grpRun[1]} runner-up` };
  const grp3 = label.match(/^3rd\s+Place\s+(?:Group\s+)?(\w+)/i);
  if (grp3) return { vi: `Hạng 3 bảng ${grp3[1]}`, en: `Group ${grp3[1]} third` };
  if (/^Best\s+3rd/i.test(label)) return { vi: "Đội hạng 3 tốt nhất", en: "Best third place" };
  // Fallback: keep original for EN, light VI touch-up.
  return { vi: label.replace(/\bGroup\b/gi, "bảng"), en: label };
}

function statusOf(g: RawGame): MatchStatus {
  if (g.finished === "TRUE") return "finished";
  const t = (g.time_elapsed || "").toLowerCase();
  if (t && t !== "notstarted" && t !== "ft") return "live";
  return "upcoming";
}

export function buildTeams(snap: Snapshot): Map<string, Team> {
  const map = new Map<string, Team>();
  for (const t of snap.teams) {
    map.set(t.id, {
      id: t.id,
      name: t.name_en,
      code: t.fifa_code,
      flag: t.flag,
      iso2: t.iso2,
      group: t.groups,
    });
  }
  return map;
}

export function buildMatches(
  snap: Snapshot,
  teams: Map<string, Team>,
  bracket?: BracketResolution | null
): Match[] {
  const koLabels = buildKnockoutLabels(snap);
  const matches = snap.games.map((g): Match => {
    const homeId = g.home_team_id !== "0" ? g.home_team_id : null;
    const awayId = g.away_team_id !== "0" ? g.away_team_id : null;
    let homeTeam = homeId ? teams.get(homeId) ?? null : null;
    let awayTeam = awayId ? teams.get(awayId) ?? null : null;

    // Override knockout teams from bracket resolution — LOCKED teams only
    const resolved = bracket?.matches.get(g.id);
    if (resolved && g.type !== "group") {
      if (!homeTeam && resolved.homeTeam && resolved.homeLocked) {
        homeTeam = resolved.homeTeam;
      }
      if (!awayTeam && resolved.awayTeam && resolved.awayLocked) {
        awayTeam = resolved.awayTeam;
      }
    }

    const status = statusOf(g);
    const scored = status !== "upcoming";
    const homeLoc = homeTeam ? null : localizeLabel(g.home_team_label, koLabels);
    const awayLoc = awayTeam ? null : localizeLabel(g.away_team_label, koLabels);

    return {
      id: g.id,
      homeId: homeTeam ? homeTeam.id : (homeId ?? null),
      awayId: awayTeam ? awayTeam.id : (awayId ?? null),
      homeTeam,
      awayTeam,
      homeLabel: homeTeam?.name ?? homeLoc?.vi ?? "",
      awayLabel: awayTeam?.name ?? awayLoc?.vi ?? "",
      homeLabelEn: homeTeam?.name ?? homeLoc?.en ?? "",
      awayLabelEn: awayTeam?.name ?? awayLoc?.en ?? "",
      homeScore: scored ? num(g.home_score) : null,
      awayScore: scored ? num(g.away_score) : null,
      kickoff: parseKickoff(g.local_date, g.stadium_id),
      stadiumId: g.stadium_id,
      homeScorers: parseScorers(g.home_scorers),
      awayScorers: parseScorers(g.away_scorers),
      matchday: g.matchday,
      type: g.type,
      group: g.group,
      status,
      timeElapsed: g.time_elapsed,
      feeders: g.type === "group" ? [] : parseFeeders(g),
    };
  });
  matches.sort((a, b) => {
    const ta = a.kickoff?.getTime() ?? Infinity;
    const tb = b.kickoff?.getTime() ?? Infinity;
    if (ta !== tb) return ta - tb;
    return num(a.id) - num(b.id);
  });
  return matches;
}

/** Compute group standings FROM finished match results (not the API's
 *  pre-seeded zeros). FIFA tiebreak: points → goal difference → goals for →
 *  head-to-head points. Falls back to alphabetical for fully level teams. */
export function computeStandings(
  snap: Snapshot,
  teams: Map<string, Team>,
  matches: Match[]
): GroupStanding[] {
  const groupLetters = snap.groups
    .map((g) => g.name)
    .sort((a, b) => a.localeCompare(b));

  const groupMatches = matches.filter(
    (m) => m.type === "group" && m.homeTeam && m.awayTeam
  );

  return groupLetters.map((letter) => {
    const groupTeams = [...teams.values()].filter((t) => t.group === letter);
    const stat = new Map<string, StandingRow>();
    for (const t of groupTeams) {
      stat.set(t.id, {
        team: t,
        group: letter,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
        rank: 0,
      });
    }

    const played = groupMatches.filter(
      (m) =>
        m.group.toUpperCase() === letter &&
        m.status === "finished" &&
        m.homeScore !== null &&
        m.awayScore !== null
    );

    // head-to-head points accumulator: key `${a}|${b}`
    const h2h = new Map<string, number>();

    for (const m of played) {
      const home = stat.get(m.homeId!);
      const away = stat.get(m.awayId!);
      if (!home || !away) continue;
      const hs = m.homeScore!;
      const as = m.awayScore!;
      home.played++; away.played++;
      home.gf += hs; home.ga += as;
      away.gf += as; away.ga += hs;
      if (hs > as) {
        home.won++; away.lost++; home.points += 3;
        h2h.set(`${home.team.id}|${away.team.id}`, (h2h.get(`${home.team.id}|${away.team.id}`) ?? 0) + 3);
      } else if (hs < as) {
        away.won++; home.lost++; away.points += 3;
        h2h.set(`${away.team.id}|${home.team.id}`, (h2h.get(`${away.team.id}|${home.team.id}`) ?? 0) + 3);
      } else {
        home.drawn++; away.drawn++; home.points++; away.points++;
        h2h.set(`${home.team.id}|${away.team.id}`, (h2h.get(`${home.team.id}|${away.team.id}`) ?? 0) + 1);
        h2h.set(`${away.team.id}|${home.team.id}`, (h2h.get(`${away.team.id}|${home.team.id}`) ?? 0) + 1);
      }
    }

    const rows = [...stat.values()];
    for (const r of rows) r.gd = r.gf - r.ga;

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      const ab = h2h.get(`${a.team.id}|${b.team.id}`) ?? 0;
      const ba = h2h.get(`${b.team.id}|${a.team.id}`) ?? 0;
      if (ab !== ba) return ba - ab;
      return a.team.name.localeCompare(b.team.name);
    });
    rows.forEach((r, i) => (r.rank = i + 1));

    return { name: letter, rows };
  });
}

/** Rank the 12 third-placed teams; top 8 advance under the WC26 format.
 *  Same tiebreak chain (points, GD, GF) then alphabetical. */
export function computeThirdPlace(standings: GroupStanding[]): StandingRow[] {
  const thirds = standings
    .map((g) => g.rows.find((r) => r.rank === 3))
    .filter((r): r is StandingRow => !!r)
    .map((r) => ({ ...r })); // clone so we don't clobber group-table ranks
  thirds.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.name.localeCompare(b.team.name);
  });
  thirds.forEach((r, i) => (r.rank = i + 1));
  return thirds;
}

// ---------------------------------------------------------------------------
// Annex C — 3rd-place team slot assignment for R32
// ---------------------------------------------------------------------------

/** Match the 8 advancing 3rd-place group letters to the 8 winner slots
 *  using the FIFA Annex C table. Returns Map<matchId, groupLetter>. */
export function matchAnnexC(
  advancingThirdGroups: string[]
): Map<string, string> | null {
  if (advancingThirdGroups.length < 8) return null;

  const key = [...advancingThirdGroups.map((g) => g.toUpperCase())].sort().join("");
  const value = ANNEX_C[key];
  if (!value || value.length !== 8) return null;

  // value is 8 chars in order [1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L]
  // Map to match IDs:       79   85   81   74   82   77   87   80
  const matchIds = ["79", "85", "81", "74", "82", "77", "87", "80"];

  const map = new Map<string, string>();
  for (let i = 0; i < 8; i++) {
    map.set(matchIds[i], value[i]);
  }
  return map;
}

/** Lock analysis: for each group, which positions (0=1st..3=4th) can each team finish in? */
export interface GroupLocks {
  /** Map teamId → set of possible positions (0-indexed). Locked if size === 1. */
  possiblePositions: Map<string, Set<number>>;
  /** Teams locked as group winner (teamId) or null if undecided. */
  lockedWinner: string | null;
  /** Teams locked as runner-up (teamId) or null if undecided. */
  lockedRunnerUp: string | null;
  /** Teams locked as 3rd place (teamId) or null if undecided. */
  lockedThird: string | null;
}

/** Analyze which positions each team in a group can still mathematically finish in,
 *  by enumerating all possible outcomes of the remaining group matches. */
export function analyzeGroupLocks(
  groupName: string,
  matches: Match[]
): GroupLocks {
  const groupMatches = matches.filter(
    (m) => m.group.toUpperCase() === groupName.toUpperCase() && m.homeTeam && m.awayTeam
  );
  const finished = groupMatches.filter(
    (m) => m.status === "finished" && m.homeScore !== null && m.awayScore !== null
  );
  const remaining = groupMatches.filter((m) => m.status !== "finished");

  // Gather all 4 team IDs
  const teamIds = new Set<string>();
  for (const m of groupMatches) {
    if (m.homeTeam) teamIds.add(m.homeTeam.id);
    if (m.awayTeam) teamIds.add(m.awayTeam.id);
  }

  const possiblePositions = new Map<string, Set<number>>();
  for (const tid of teamIds) possiblePositions.set(tid, new Set());

  // Team name lookup for tiebreaker
  const teamName = new Map<string, string>();
  for (const m of groupMatches) {
    if (m.homeTeam) teamName.set(m.homeTeam.id, m.homeTeam.name);
    if (m.awayTeam) teamName.set(m.awayTeam.id, m.awayTeam.name);
  }

  // Base standings from finished matches
  interface SimRow {
    id: string;
    p: number;
    gf: number;
    ga: number;
    name: string;
  }
  const baseSim = new Map<string, SimRow>();
  for (const tid of teamIds) {
    baseSim.set(tid, { id: tid, p: 0, gf: 0, ga: 0, name: teamName.get(tid) ?? tid });
  }
  for (const m of finished) {
    const h = baseSim.get(m.homeTeam!.id)!;
    const a = baseSim.get(m.awayTeam!.id)!;
    h.gf += m.homeScore!; h.ga += m.awayScore!;
    a.gf += m.awayScore!; a.ga += m.homeScore!;
    if (m.homeScore! > m.awayScore!) { h.p += 3; }
    else if (m.homeScore! < m.awayScore!) { a.p += 3; }
    else { h.p += 1; a.p += 1; }
  }

  const rankSim = (rows: SimRow[]): SimRow[] =>
    [...rows].sort((a, b) => {
      if (b.p !== a.p) return b.p - a.p;
      const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
      if (gdB !== gdA) return gdB - gdA;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });

  if (remaining.length === 0) {
    const rows = rankSim([...baseSim.values()]);
    rows.forEach((r, i) => possiblePositions.get(r.id)!.add(i));
  } else {
    // Enumerate all 3^remaining outcomes (9 max per group)
    const outcomes: [number, number][] = [[1, 0], [0, 0], [0, 1]];
    const total = Math.pow(3, remaining.length);
    for (let mask = 0; mask < total; mask++) {
      const sim = new Map<string, SimRow>();
      for (const tid of teamIds) {
        const b = baseSim.get(tid)!;
        sim.set(tid, { ...b });
      }
      let m = mask;
      for (const game of remaining) {
        const [hg, ag] = outcomes[m % 3];
        m = Math.floor(m / 3);
        const h = sim.get(game.homeTeam!.id)!;
        const a = sim.get(game.awayTeam!.id)!;
        h.gf += hg; h.ga += ag;
        a.gf += ag; a.ga += hg;
        if (hg > ag) h.p += 3;
        else if (hg < ag) a.p += 3;
        else { h.p += 1; a.p += 1; }
      }
      const rows = rankSim([...sim.values()]);
      rows.forEach((r, i) => possiblePositions.get(r.id)!.add(i));
    }
  }

  // Determine locked positions
  let lockedWinner: string | null = null;
  let lockedRunnerUp: string | null = null;
  let lockedThird: string | null = null;
  for (const [tid, positions] of possiblePositions) {
    if (positions.size === 1) {
      const pos = positions.values().next().value as number;
      if (pos === 0) lockedWinner = tid;
      else if (pos === 1) lockedRunnerUp = tid;
      else if (pos === 2) lockedThird = tid;
    }
  }

  return { possiblePositions, lockedWinner, lockedRunnerUp, lockedThird };
}

/** Build lock map for all 12 groups from current matches. */
export function buildAllGroupLocks(matches: Match[]): Map<string, GroupLocks> {
  const groups = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const map = new Map<string, GroupLocks>();
  for (const g of groups) map.set(g, analyzeGroupLocks(g, matches));
  return map;
}

/** Result of resolving the full knockout bracket from group standings. */
export interface BracketResolution {
  /** Map matchId → {homeTeam, awayTeam, homeLocked, awayLocked}. */
  matches: Map<string, {
    homeTeam: Team | null;
    awayTeam: Team | null;
    homeLocked: boolean;
    awayLocked: boolean;
  }>;
  /** Whether all group matches have finished (projection vs confirmed). */
  projected: boolean;
  /** The Annex C option name, e.g. "Option 246". */
  optionId: string | null;
}

/** Resolve the entire R32 knockout bracket from group standings.
 *  Uses Annex C for 3rd-place assignments. Only fills teams that are
 *  mathematically locked into their group positions.
 *  Returns null when group stage hasn't produced enough data. */
export function resolveKnockoutBracket(
  standings: GroupStanding[],
  matches: Match[],
  gamesFinished: number
): BracketResolution | null {
  const allLocks = buildAllGroupLocks(matches);

  // Use standings for current projections
  const winnerByGroup = new Map<string, Team>();
  const runnerUpByGroup = new Map<string, Team>();
  const thirdByGroup = new Map<string, Team>();
  for (const gs of standings) {
    const rows = gs.rows;
    if (rows.length >= 1) winnerByGroup.set(gs.name, rows[0].team);
    if (rows.length >= 2) runnerUpByGroup.set(gs.name, rows[1].team);
    if (rows.length >= 3) thirdByGroup.set(gs.name, rows[2].team);
  }

  // Annex C: compute projected 3rd-place advancing groups
  const thirds = computeThirdPlace(standings);
  const advancing = thirds.length >= 8 ? thirds.slice(0, 8).map((r) => r.group) : null;
  const annex = advancing ? matchAnnexC(advancing) : null;

  // Check which 3rd-place groups are locked
  const allThirdLocked = advancing
    ? advancing.every((g) => allLocks.get(g)?.lockedThird !== null)
    : false;

  const projected = gamesFinished < 72;

  const map = new Map<string, {
    homeTeam: Team | null;
    awayTeam: Team | null;
    homeLocked: boolean;
    awayLocked: boolean;
  }>();

  // R32 match assignments
  const r32Assignments: [string, string, string][] = [
    ["73", "2A", "2B"],
    ["74", "1E", "3RD"],
    ["75", "1F", "2C"],
    ["76", "1C", "2F"],
    ["77", "1I", "3RD"],
    ["78", "2E", "2I"],
    ["79", "1A", "3RD"],
    ["80", "1L", "3RD"],
    ["81", "1D", "3RD"],
    ["82", "1G", "3RD"],
    ["83", "2K", "2L"],
    ["84", "1H", "2J"],
    ["85", "1B", "3RD"],
    ["86", "1J", "2H"],
    ["87", "1K", "3RD"],
    ["88", "2D", "2G"],
  ];

  for (const [matchId, homeSlot, awaySlot] of r32Assignments) {
    const [homeTeam, homeLocked] = resolveSlotLocked(
      homeSlot, winnerByGroup, runnerUpByGroup, thirdByGroup, annex, matchId, allLocks, allThirdLocked
    );
    const [awayTeam, awayLocked] = resolveSlotLocked(
      awaySlot, winnerByGroup, runnerUpByGroup, thirdByGroup, annex, matchId, allLocks, allThirdLocked
    );
    map.set(matchId, { homeTeam, awayTeam, homeLocked, awayLocked });
  }

  const sorted = advancing ? [...advancing].sort().join("") : null;

  return { matches: map, projected, optionId: sorted };
}

function resolveSlotLocked(
  slot: string,
  winnerByGroup: Map<string, Team>,
  runnerUpByGroup: Map<string, Team>,
  thirdByGroup: Map<string, Team>,
  annex: Map<string, string> | null,
  matchId: string,
  locks: Map<string, GroupLocks>,
  allThirdLocked: boolean
): [Team | null, boolean] {
  if (slot === "3RD") {
    const group = annex?.get(matchId);
    if (!group) return [null, false];
    const locked = allThirdLocked && locks.get(group)?.lockedThird !== null;
    // Always return projected 3rd-place team with locked flag
    const team = thirdByGroup.get(group) ?? null;
    return [team, locked];
  }
  const group = slot.slice(1);
  const gl = locks.get(group);
  if (slot.startsWith("1")) {
    const locked = gl?.lockedWinner !== null;
    const team = winnerByGroup.get(group) ?? null;
    return [team, locked];
  }
  if (slot.startsWith("2")) {
    const locked = gl?.lockedRunnerUp !== null;
    const team = runnerUpByGroup.get(group) ?? null;
    return [team, locked];
  }
  return [null, false];
}

export function buildStadiums(snap: Snapshot): Stadium[] {
  const counts = new Map<string, number>();
  for (const g of snap.games) {
    counts.set(g.stadium_id, (counts.get(g.stadium_id) ?? 0) + 1);
  }
  return snap.stadiums
    .map((s): Stadium => ({
      id: s.id,
      name: s.fifa_name || s.name_en,
      realName: s.name_en,
      city: s.city_en,
      country: s.country_en,
      capacity: s.capacity,
      region: s.region,
      timezone: STADIUM_TZ[s.id] ?? VN_TZ,
      matchCount: counts.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.matchCount - a.matchCount || a.city.localeCompare(b.city));
}

export async function loadSnapshot(): Promise<Snapshot> {
  const res = await fetch(`data/wc26.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Không tải được dữ liệu (HTTP ${res.status})`);
  return res.json();
}

export async function loadLineups(): Promise<Map<string, MatchLineup>> {
  try {
    const res = await fetch(`data/lineups.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return new Map();
    const body = (await res.json()) as { lineups?: MatchLineup[] };
    return new Map((body.lineups ?? []).map((lineup) => [lineup.matchId, lineup]));
  } catch {
    return new Map();
  }
}

export async function loadRosters(): Promise<Map<string, TeamRoster>> {
  try {
    const res = await fetch(`data/rosters.json?t=${Math.floor(Date.now() / 60000)}`);
    if (!res.ok) return new Map();
    const body = (await res.json()) as { rosters?: TeamRoster[] };
    return new Map((body.rosters ?? []).map((roster) => [roster.teamId, roster]));
  } catch {
    return new Map();
  }
}

export async function loadWiki(): Promise<Map<string, TeamWiki>> {
  try {
    const res = await fetch(`data/wiki.json?t=${Math.floor(Date.now() / 3600000)}`);
    if (!res.ok) return new Map();
    const body = (await res.json()) as { teams?: TeamWiki[] };
    return new Map((body.teams ?? []).map((w) => [w.teamId, w]));
  } catch {
    return new Map();
  }
}
