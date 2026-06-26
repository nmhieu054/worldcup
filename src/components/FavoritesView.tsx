import type { Match, Team } from "../lib/types";
import { VN_DATETIME } from "../lib/timezone";
import { useI18n, matchSideLabel } from "../lib/i18n";

type TeamCard = {
  team: Team;
  next: Match | null;
  last: Match | null;
};

function resultFor(match: Match, teamId: string, t: (k: "resultWon" | "resultLost" | "resultDraw") => string) {
  if (match.homeScore === null || match.awayScore === null) return null;
  const isHome = match.homeId === teamId;
  const own = isHome ? match.homeScore : match.awayScore;
  const opp = isHome ? match.awayScore : match.homeScore;
  if (own > opp) return { tag: t("resultWon"), color: "var(--accent)" };
  if (own < opp) return { tag: t("resultLost"), color: "var(--text-muted)" };
  return { tag: t("resultDraw"), color: "var(--text-muted)" };
}

function TeamFavCard({
  card,
  onOpenTeam,
  onUnfollow,
  onOpenMatch,
  stadiums,
}: {
  card: TeamCard;
  onOpenTeam: (teamId: string) => void;
  onUnfollow: (teamId: string) => void;
  onOpenMatch: (match: Match) => void;
  stadiums: Map<string, string>;
}) {
  const { t, lang } = useI18n();
  const { team, next, last } = card;
  const focus = next ?? last;
  const isNext = !!next;

  const opponentLabel = focus
    ? focus.homeId === team.id
      ? matchSideLabel(focus, "away", lang)
      : matchSideLabel(focus, "home", lang)
    : null;
  const side = focus ? (focus.homeId === team.id ? "vs" : "@") : "";
  const result = !isNext && last ? resultFor(last, team.id, t) : null;
  const score =
    !isNext && last && last.homeScore !== null && last.awayScore !== null
      ? `${last.homeScore} - ${last.awayScore}`
      : null;

  return (
    <article
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] p-4"
      style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1.5px var(--accent), 0 14px 34px rgba(0,0,0,.12)" }}
    >
      <header className="flex items-center gap-3">
        <button
          onClick={() => onOpenTeam(team.id)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-transform active:scale-[0.99]"
          aria-label={`${team.name}`}
        >
          {team.flag ? (
            <img src={team.flag} alt={team.code} className="size-9 rounded-[7px] object-cover" style={{ boxShadow: "0 0 0 1px var(--border)" }} />
          ) : (
            <span className="grid size-9 place-items-center rounded-[7px] text-[11px] font-bold" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>
              {team.code}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold leading-tight">{team.name}</p>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
              {t("colGroup")} {team.group} · {team.code}
            </p>
          </div>
        </button>
        <button
          onClick={() => onUnfollow(team.id)}
          aria-label={`${t("unfollow")} ${team.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold transition-transform active:scale-90"
          style={{ background: "color-mix(in srgb, var(--accent) 16%, var(--bg-sunken))", color: "var(--accent)" }}
          title={t("unfollow")}
        >
          ★
        </button>
      </header>

      {focus ? (
        <button
          onClick={() => onOpenMatch(focus)}
          className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
          style={{ background: "var(--bg-sunken)" }}
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {isNext ? t("nextMatch") : t("lastMatch")}
            </span>
            <span className="block truncate text-sm font-bold">{side} {opponentLabel}</span>
            <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
              {focus.kickoff ? VN_DATETIME.format(focus.kickoff) : t("noDateYet")}
              {stadiums.get(focus.stadiumId) ? ` · ${stadiums.get(focus.stadiumId)}` : ""}
            </span>
          </span>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
            style={{ background: "var(--bg-elev)", color: result ? result.color : "var(--accent)" }}
          >
            {score ?? (result ? result.tag : focus.group?.toUpperCase() ?? focus.type.toUpperCase())}
          </span>
        </button>
      ) : (
        <p className="rounded-[12px] px-3 py-2.5 text-[13px]" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>
          {t("noFixtures")}
        </p>
      )}
    </article>
  );
}

export function FavoritesView({
  favorites,
  teams,
  matches,
  stadiums,
  onOpenTeam,
  onOpenMatch,
  onToggleFavorite,
  onManage,
}: {
  favorites: Set<string>;
  teams: Map<string, Team>;
  matches: Match[];
  stadiums: Map<string, string>;
  onOpenTeam: (teamId: string) => void;
  onOpenMatch: (match: Match) => void;
  onToggleFavorite: (teamId: string) => void;
  onManage: () => void;
}) {
  const { t } = useI18n();
  if (favorites.size === 0) {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] p-5"
        style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
      >
        <p className="text-base font-extrabold">{t("noFollowTitle")}</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("noFollowHint")}
        </p>
        <button
          onClick={onManage}
          className="rounded-full px-4 py-2 text-sm font-extrabold transition-transform active:scale-95"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
        >
          {t("pickTeamsToFollow")}
        </button>
      </div>
    );
  }

  const cards: TeamCard[] = [...favorites]
    .map((teamId) => teams.get(teamId))
    .filter((team): team is Team => !!team)
    .map((team) => {
      const own = matches.filter((m) => m.homeId === team.id || m.awayId === team.id);
      const next = own
        .filter((m) => m.status !== "finished")
        .sort((a, b) => (a.kickoff?.getTime() ?? Infinity) - (b.kickoff?.getTime() ?? Infinity))[0] ?? null;
      const last = own
        .filter((m) => m.status === "finished")
        .sort((a, b) => (b.kickoff?.getTime() ?? 0) - (a.kickoff?.getTime() ?? 0))[0] ?? null;
      return { team, next, last };
    })
    .sort((a, b) => {
      const ak = a.next?.kickoff?.getTime() ?? Infinity;
      const bk = b.next?.kickoff?.getTime() ?? Infinity;
      if (ak !== bk) return ak - bk;
      return a.team.name.localeCompare(b.team.name);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
          {t("following")} {favorites.size} {t("teamsWord")}
        </p>
        <button
          onClick={onManage}
          className="rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition-transform active:scale-95"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
        >
          {t("manageTeamsShort")}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <TeamFavCard
            key={card.team.id}
            card={card}
            stadiums={stadiums}
            onOpenTeam={onOpenTeam}
            onOpenMatch={onOpenMatch}
            onUnfollow={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
