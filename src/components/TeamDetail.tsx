import { useEffect, useState } from "react";
import type { Match, StandingRow, Team, TeamRoster, RosterPlayer, TeamWiki } from "../lib/types";
import { VN_DATETIME } from "../lib/timezone";
import { useI18n, matchSideLabel, type DictKey, type Lang } from "../lib/i18n";

type TFn = (key: DictKey) => string;
type DetailTab = "overview" | "squad" | "fixtures";

function positionLabel(position: string, t: TFn) {
  const key: Record<string, DictKey> = { G: "posGK", GK: "posGK", D: "posDF", DF: "posDF", M: "posMF", MF: "posMF", F: "posFW", FW: "posFW" };
  return key[position] ? t(key[position]) : position;
}

/** Men's FIFA World Cup champions — public historical record, by FIFA code.
 *  Only the 8 nations that have ever lifted the trophy. */
const WC_TITLES: Record<string, number[]> = {
  BRA: [1958, 1962, 1970, 1994, 2002],
  GER: [1954, 1974, 1990, 2014],
  ITA: [1934, 1938, 1982, 2006],
  ARG: [1978, 1986, 2022],
  FRA: [1998, 2018],
  URU: [1930, 1950],
  ENG: [1966],
  ESP: [2010],
};

function groupPlayers(players: RosterPlayer[]) {
  return ["G", "D", "M", "F"].map((position) => ({
    position,
    players: players.filter((player) => player.position === position),
  })).filter((group) => group.players.length > 0);
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function PlayerPill({ player }: { player: RosterPlayer }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2" style={{ background: "var(--bg-sunken)" }}>
      <span className="min-w-0 truncate text-sm font-semibold">{player.name}</span>
      <span className="flex shrink-0 items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {player.age !== undefined && <span>{player.age}t</span>}
        {player.number !== undefined && (
          <span className="grid size-6 place-items-center rounded-full font-extrabold" style={{ background: "var(--bg-elev)", color: "var(--text)" }}>
            {player.number}
          </span>
        )}
      </span>
    </li>
  );
}

function MiniMatch({ match, teamId, stadium, onOpen, t, lang }: { match: Match; teamId: string; stadium?: string; onOpen?: (match: Match) => void; t: TFn; lang: Lang }) {
  const opponent = match.homeId === teamId ? matchSideLabel(match, "away", lang) : matchSideLabel(match, "home", lang);
  const side = match.homeId === teamId ? "vs" : "@";
  const score = match.homeScore !== null && match.awayScore !== null ? `${match.homeScore}-${match.awayScore}` : null;

  return (
    <button
      onClick={() => onOpen?.(match)}
      className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition-transform active:scale-[0.99]"
      style={{ background: "var(--bg-sunken)", color: "var(--text)" }}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{side} {opponent}</span>
        <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
          {match.kickoff ? VN_DATETIME.format(match.kickoff) : t("noDateYet")}{stadium ? ` · ${stadium}` : ""}
        </span>
      </span>
      <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-extrabold" style={{ background: "var(--bg-elev)", color: score ? "var(--accent)" : "var(--text-muted)" }}>
        {score ?? match.group?.toUpperCase() ?? match.type.toUpperCase()}
      </span>
    </button>
  );
}

function WikiRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-right text-[13px] font-bold">{value}</span>
    </div>
  );
}

export function TeamDetail({
  team,
  roster,
  wiki,
  standing,
  matches,
  stadiums,
  isFavorite,
  onToggleFavorite,
  onClose,
  onOpenMatch,
}: {
  team: Team;
  roster?: TeamRoster;
  wiki?: TeamWiki;
  standing?: StandingRow;
  matches: Match[];
  stadiums: Map<string, string>;
  isFavorite?: (id: string | null) => boolean;
  onToggleFavorite?: (id: string) => void;
  onClose: () => void;
  onOpenMatch?: (match: Match) => void;
}) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<DetailTab>("overview");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const teamMatches = matches.filter((match) => match.homeId === team.id || match.awayId === team.id);
  const groups = roster ? groupPlayers(roster.players) : [];
  const fav = isFavorite?.(team.id) ?? false;
  const titles = WC_TITLES[team.code] ?? [];

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "overview", label: t("tabOverview") },
    { key: "squad", label: t("tabSquad") },
    { key: "fixtures", label: t("tabFixtures") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <article
        className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[24px] sm:h-[88dvh] sm:rounded-[24px]"
        style={{ background: "var(--bg)", boxShadow: "0 0 0 1px var(--border), 0 24px 80px rgba(0,0,0,0.34)" }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* header */}
        <header className="relative shrink-0 overflow-hidden p-5" style={{ background: "var(--bg-elev)", borderBottom: "1px solid var(--border)" }}>
          {/* flag backdrop, blurred + faded out */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <img src={team.flag} alt="" className="size-full scale-125 object-cover" style={{ filter: "blur(26px)", opacity: 0.32 }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-elev) 30%, transparent) 0%, var(--bg-elev) 100%)" }} />
          </div>
          {/* trophy watermark */}
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute -right-3 -top-2 size-36 opacity-[0.06]" fill="currentColor" aria-hidden>
            <path d="M18 2H6v2H2v4a4 4 0 0 0 4 4 6 6 0 0 0 5 5.9V20H8v2h8v-2h-3v-2.1A6 6 0 0 0 18 12a4 4 0 0 0 4-4V4h-4V2zM4 8V6h2v4a2 2 0 0 1-2-2zm16 0a2 2 0 0 1-2 2V6h2v2z" />
          </svg>

          <div className="relative flex items-start justify-between gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-transform active:scale-95"
              style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
            >
              ← {t("back")}
            </button>
            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(team.id)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-transform active:scale-95"
                style={{
                  background: fav ? "var(--accent)" : "var(--bg-sunken)",
                  color: fav ? "var(--accent-contrast)" : "var(--text-muted)",
                }}
              >
                <HeartIcon filled={fav} />
                {fav ? t("following") : t("setFavorite")}
              </button>
            )}
          </div>

          <div className="relative mt-4 flex items-center gap-4">
            <img src={team.flag} alt={team.code} className="size-16 rounded-[12px] object-cover" style={{ boxShadow: "0 0 0 1px var(--border)" }} />
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-extrabold tracking-tight">{lang === "vi" ? `Đội tuyển ${team.name}` : team.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>{t("countryCode")} · #{team.code}</span>
                <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-sunken)", color: "var(--accent)" }}>{t("colGroup")} {team.group}</span>
                {wiki?.confederation && (
                  <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>{wiki.confederation}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* tabs */}
        <div className="flex shrink-0 gap-1 overflow-x-auto px-5 py-3" style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
              style={{
                background: tab === t.key ? "var(--accent)" : "var(--bg-sunken)",
                color: tab === t.key ? "var(--accent-contrast)" : "var(--text-muted)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "overview" && (
            <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
              <div className="grid gap-4">
                {/* coach */}
                <div className="rounded-[16px] p-4" style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}>
                  <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{t("headCoach")}</h3>
                  {wiki?.coach ? (
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full text-lg font-extrabold" style={{ background: "var(--bg-sunken)", color: "var(--accent)" }}>
                        {wiki.coach.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold">{wiki.coach}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("currentCoach")}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{t("notUpdated")}</p>
                  )}
                </div>

                {/* wiki params */}
                <div className="rounded-[16px] p-4" style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}>
                  <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{t("teamStats")}</h3>
                  {wiki?.fifaRank !== undefined && (
                    <WikiRow
                      label={t("fifaRank")}
                      value={`#${wiki.fifaRank}${wiki.fifaPoints !== undefined ? ` · ${wiki.fifaPoints.toFixed(0)} ${t("ptsWord")}` : ""}`}
                    />
                  )}
                  {wiki?.confederation && <WikiRow label={t("confederation")} value={wiki.confederation} />}
                  {standing && <WikiRow label={t("groupRank")} value={lang === "vi" ? `#${standing.rank} bảng ${team.group}` : `#${standing.rank} in Group ${team.group}`} />}
                  {standing && <WikiRow label={t("pointsGd")} value={`${standing.points} · ${standing.gd > 0 ? `+${standing.gd}` : standing.gd}`} />}
                  <WikiRow label={t("registered")} value={roster ? `${roster.players.length}` : "—"} />
                  <p className="mt-3 rounded-[10px] px-3 py-2 text-[11px] leading-relaxed" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>
                    {wiki?.fifaUpdated
                      ? (lang === "vi" ? `Hạng FIFA cập nhật ${wiki.fifaUpdated} (nguồn FIFA/Coca-Cola). Thành tích chi tiết tại giải sẽ cập nhật theo dữ liệu hệ thống.` : `FIFA rank updated ${wiki.fifaUpdated} (source: FIFA/Coca-Cola). Detailed tournament stats will update from system data.`)
                      : t("teamStatsHint")}
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                {/* overview */}
                <div className="rounded-[16px] p-4" style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}>
                  <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{t("teamOverview")}</h3>
                  {wiki?.overview ? (
                    <p className="text-[14px] leading-relaxed">{wiki.overview}</p>
                  ) : (
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{t("noOverview")}</p>
                  )}
                  {wiki?.wikiUrl && (
                    <a
                      href={wiki.wikiUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {t("readMoreWiki")} →
                    </a>
                  )}
                </div>

                {/* World Cup titles */}
                <div className="rounded-[16px] p-4" style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}>
                  <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{t("wcTitleHistory")}</h3>
                  {titles.length ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black" style={{ color: "var(--accent)" }}>{titles.length}</span>
                        <span className="text-[13px] font-bold">{t("timesChampion")} · 🏆</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {titles.map((year) => (
                          <span key={year} className="rounded-full px-2.5 py-1 text-[12px] font-extrabold tabular-nums" style={{ background: "color-mix(in srgb, var(--accent) 16%, var(--bg-sunken))", color: "var(--accent)" }}>
                            {year}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{t("neverChampion")}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "squad" && (
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold">{t("playerList")}</h3>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{t("espnSource")}</p>
                </div>
                {roster && <span className="text-[12px] font-bold" style={{ color: "var(--accent)" }}>{roster.players.length} {t("playersWord")}</span>}
              </div>
              {groups.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {groups.map((group) => (
                    <div key={group.position}>
                      <h4 className="mb-2 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{positionLabel(group.position, t)}</h4>
                      <ol className="grid gap-2">
                        {group.players.map((player) => <PlayerPill key={player.id} player={player} />)}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[12px] px-3 py-2 text-sm" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>
                  {t("noRoster")}
                </p>
              )}
            </section>
          )}

          {tab === "fixtures" && (
            <section>
              <h3 className="mb-3 text-sm font-extrabold">{t("tournamentFixtures")}</h3>
              {teamMatches.length ? (
                <div className="grid gap-2">
                  {teamMatches.map((match) => (
                    <MiniMatch key={match.id} match={match} teamId={team.id} stadium={stadiums.get(match.stadiumId)} onOpen={onOpenMatch} t={t} lang={lang} />
                  ))}
                </div>
              ) : (
                <p className="rounded-[12px] px-3 py-2 text-sm" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>
                  {t("noTeamFixtures")}
                </p>
              )}
            </section>
          )}
        </div>
      </article>
    </div>
  );
}
