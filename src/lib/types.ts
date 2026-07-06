// Domain types for the WC26 snapshot produced by scripts/sync.mjs.
// All upstream numeric fields arrive as strings; we normalise on load.

export interface RawTeam {
  _id: string;
  name_en: string;
  name_fa: string;
  flag: string;
  fifa_code: string;
  iso2: string;
  groups: string; // group letter, e.g. "A"
  id: string;
}

export interface RawGroupRow {
  team_id: string;
  mp: string;
  w: string;
  l: string;
  d: string;
  pts: string;
  gf: string;
  ga: string;
  gd: string;
}

export interface RawGroup {
  _id: string;
  name: string;
  teams: RawGroupRow[];
}

export interface RawGame {
  _id: string;
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  home_scorers?: string;
  away_scorers?: string;
  group: string;
  matchday: string;
  local_date: string; // "MM/DD/YYYY HH:mm"
  stadium_id: string;
  finished: string; // "TRUE" | "FALSE"
  time_elapsed: string; // "notstarted" | "FT" | minute | "HT" ...
  type: KnockoutType | "group";
  home_team_label?: string;
  away_team_label?: string;
  /** ET/penalty detail: "AET" (after extra time), "pen" (penalty shootout) */
  time_detail?: string;
  /** Penalty winner side ("home" | "away") */
  pen_winner_side?: string;
  /** Penalty shootout tally, e.g. "4" / "2" */
  pen_home?: string;
  pen_away?: string;
}

export interface RawStadium {
  _id: string;
  id: string;
  name_en: string;
  fifa_name: string;
  city_en: string;
  country_en: string;
  capacity: number;
  region: string;
}

export interface Snapshot {
  syncedAt: string;
  source: string;
  teams: RawTeam[];
  groups: RawGroup[];
  games: RawGame[];
  stadiums: RawStadium[];
}

export type KnockoutType = "r32" | "r16" | "qf" | "sf" | "third" | "final";

export const KNOCKOUT_ORDER: KnockoutType[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "third",
  "final",
];

export const KNOCKOUT_LABEL: Record<KnockoutType, string> = {
  r32: "Vòng 1/16",
  r16: "Vòng 1/8",
  qf: "Tứ kết",
  sf: "Bán kết",
  third: "Tranh hạng 3",
  final: "Chung kết",
};

// ---- Normalised view models ----

export interface Team {
  id: string;
  name: string;
  code: string;
  flag: string;
  iso2: string;
  group: string;
}

export type MatchStatus = "upcoming" | "live" | "finished";

export interface Match {
  id: string;
  homeId: string | null;
  awayId: string | null;
  homeLabel: string; // resolved team name or VI placeholder ("Nhì bảng A")
  awayLabel: string;
  homeLabelEn: string; // resolved team name or EN placeholder ("Group A runner-up")
  awayLabelEn: string;
  homeTeam: Team | null;
  awayTeam: Team | null;
  homeScore: number | null;
  awayScore: number | null;
  homeScorers: string[];
  awayScorers: string[];
  kickoff: Date | null;
  stadiumId: string;
  matchday: string;
  type: KnockoutType | "group";
  group: string;
  status: MatchStatus;
  timeElapsed: string;
  /** Knockout feeder match ids (the ties whose winners play this tie). */
  feeders: string[];
  /** ET/penalty detail: null (regular time), "AET", or "pen" */
  timeDetail: string | null;
  /** Penalty shootout tally (only when timeDetail === "pen"), else null */
  penHome: number | null;
  penAway: number | null;
  /** Which side won the shootout: "home" | "away" | null */
  penWinnerSide: "home" | "away" | null;
}

export interface StandingRow {
  team: Team;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  rank: number;
}

export interface GroupStanding {
  name: string;
  rows: StandingRow[];
}

export interface Stadium {
  id: string;
  name: string; // FIFA tournament name
  realName: string; // commercial / real name
  city: string;
  country: string;
  capacity: number;
  region: string;
  timezone: string;
  matchCount: number;
}

export interface LineupPlayer {
  name: string;
  number?: number;
  position?: string;
}

export interface TeamLineup {
  formation?: string;
  starting: LineupPlayer[];
  bench: LineupPlayer[];
}

export interface MatchCard {
  player: string;
  minute?: string;
  color: "yellow" | "red";
  side: "home" | "away";
}

export interface MatchSub {
  in?: string; // player coming on
  out?: string; // player going off
  minute?: string;
  side: "home" | "away";
}

export interface MatchLineup {
  matchId: string;
  updatedAt?: string;
  home?: TeamLineup;
  away?: TeamLineup;
  cards?: MatchCard[];
  subs?: MatchSub[];
}

export interface RosterPlayer extends LineupPlayer {
  id: string;
  shortName?: string;
  age?: number;
  headshot?: string;
  url?: string;
}

export interface TeamRoster {
  teamId: string;
  teamName: string;
  teamCode: string;
  espnTeamId: string;
  espnTeamName: string;
  players: RosterPlayer[];
}

export interface TeamWiki {
  teamId: string;
  teamCode: string;
  name: string;
  confederation: string;
  coach?: string;
  overview?: string;
  overviewLang?: string;
  wikiTitle?: string;
  wikiUrl?: string;
  fifaRank?: number;
  fifaPoints?: number;
  fifaMove?: number;
  fifaUpdated?: string;
  fifaLiveRank?: number;
  fifaLivePoints?: number;
  fifaLiveMove?: number;
  fifaLiveUpdated?: string;
}
