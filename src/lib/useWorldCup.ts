import { useEffect, useMemo, useState } from "react";
import {
  buildMatches,
  buildStadiums,
  buildTeams,
  computeStandings,
  computeThirdPlace,
  loadLineups,
  loadRosters,
  loadSnapshot,
  loadWiki,
  resolveKnockoutBracket,
} from "./data";
import type {
  GroupStanding,
  Match,
  MatchLineup,
  Snapshot,
  Stadium,
  StandingRow,
  Team,
  TeamRoster,
  TeamWiki,
} from "./types";

export interface WcData {
  loading: boolean;
  error: string | null;
  snapshot: Snapshot | null;
  teams: Map<string, Team>;
  matches: Match[];
  standings: GroupStanding[];
  thirdPlace: StandingRow[];
  stadiums: Map<string, string>;
  stadiumList: Stadium[];
  lineups: Map<string, MatchLineup>;
  rosters: Map<string, TeamRoster>;
  wiki: Map<string, TeamWiki>;
  refresh: () => void;
}

export function useWorldCup(): WcData {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [lineups, setLineups] = useState<Map<string, MatchLineup>>(new Map());
  const [wiki, setWiki] = useState<Map<string, TeamWiki>>(new Map());
  const [rosters, setRosters] = useState<Map<string, TeamRoster>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([loadSnapshot(), loadLineups(), loadRosters(), loadWiki()])
      .then(([s, l, r, w]) => {
        if (!alive) return;
        setSnapshot(s);
        setLineups(l);
        setRosters(r);
        setWiki(w);
        setError(null);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  // Re-pull frequently while matches are live; backend sync is intentionally fast during live windows.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const derived = useMemo(() => {
    if (!snapshot) {
      return {
        teams: new Map<string, Team>(),
        matches: [] as Match[],
        standings: [] as GroupStanding[],
        thirdPlace: [] as StandingRow[],
        stadiums: new Map<string, string>(),
        stadiumList: [] as Stadium[],
      };
    }
    const teams = buildTeams(snapshot);
    // Compute standings early so we can resolve the knockout bracket
    const matchesForStandings = buildMatches(snapshot, teams);
    const standings = computeStandings(snapshot, teams, matchesForStandings);
    const thirdPlace = computeThirdPlace(standings);

    // Resolve knockout bracket from group standings (Annex C)
    const finishedGroupGames = snapshot.games.filter(
      (g) => g.type === "group" && g.finished === "TRUE"
    ).length;
    const bracket = resolveKnockoutBracket(standings, matchesForStandings, finishedGroupGames);

    // Rebuild matches with bracket resolution applied
    const matches = buildMatches(snapshot, teams, bracket);
    const stadiumList = buildStadiums(snapshot);
    const stadiums = new Map(
      snapshot.stadiums.map((s) => [s.id, `${s.fifa_name || s.name_en}, ${s.city_en}`])
    );
    return { teams, matches, standings, thirdPlace, stadiums, stadiumList };
  }, [snapshot]);

  return {
    loading,
    error,
    snapshot,
    ...derived,
    lineups,
    rosters,
    wiki,
    refresh: () => {
      setLoading(true);
      setTick((t) => t + 1);
    },
  };
}
