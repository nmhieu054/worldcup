import { useMemo, useState } from "react";
import type { Team, TeamWiki } from "../lib/types";
import { useI18n } from "../lib/i18n";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function TeamCard({
  team,
  fifaRank,
  fav,
  onToggleFav,
  onOpen,
}: {
  team: Team;
  fifaRank?: number;
  fav: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="group relative flex flex-col items-center gap-2 rounded-[var(--radius-card)] p-4 text-center transition-transform duration-200 hover:-translate-y-0.5"
      style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
    >
      <button
        onClick={onToggleFav}
        aria-label={fav ? t("unfollow") : t("follow")}
        aria-pressed={fav}
        className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full transition-colors"
        style={{ background: "var(--bg-sunken)", color: fav ? "var(--accent)" : "var(--text-muted)" }}
      >
        <HeartIcon filled={fav} />
      </button>

      <button onClick={onOpen} className="flex flex-1 flex-col items-center gap-2">
        <div className="relative mt-1">
          <img
            src={team.flag}
            alt={team.code}
            loading="lazy"
            className="h-12 w-[68px] rounded-[7px] object-cover"
            style={{ boxShadow: "0 0 0 1px var(--border)" }}
          />
          {fifaRank !== undefined && (
            <span
              className="absolute -left-2 -top-2 grid min-w-[22px] place-items-center rounded-full px-1 text-[10px] font-extrabold"
              style={{ background: "var(--accent)", color: "var(--accent-contrast)", boxShadow: "0 0 0 2px var(--bg-elev)" }}
              title={`${t("fifaRank")} #${fifaRank}`}
            >
              #{fifaRank}
            </span>
          )}
        </div>
        <h3 className="text-[15px] font-bold leading-tight">{team.name}</h3>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {t("colGroup")} {team.group} · #{team.code}
        </p>
      </button>

      <button
        onClick={onOpen}
        className="mt-1 text-[11px] font-extrabold uppercase tracking-wide transition-colors"
        style={{ color: "var(--accent)" }}
      >
        {t("viewProfile")} →
      </button>
    </div>
  );
}

export function TeamsView({
  teams,
  wiki,
  isFavorite,
  onToggleFavorite,
  onOpenTeam,
}: {
  teams: Team[];
  wiki: Map<string, TeamWiki>;
  isFavorite: (id: string | null) => boolean;
  onToggleFavorite: (id: string) => void;
  onOpenTeam: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "rank">("name");
  const { t } = useI18n();

  const sorted = useMemo(() => {
    const byName = (a: Team, b: Team) => a.name.localeCompare(b.name);
    const byRank = (a: Team, b: Team) => {
      const ra = wiki.get(a.id)?.fifaRank ?? Infinity;
      const rb = wiki.get(b.id)?.fifaRank ?? Infinity;
      return ra - rb || byName(a, b);
    };
    const list = [...teams].sort(sort === "rank" ? byRank : byName);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        `bảng ${t.group}`.toLowerCase().includes(q) ||
        `group ${t.group}`.toLowerCase().includes(q)
    );
  }, [teams, query, sort, wiki]);

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">{t("exploreTeams").replace("{n}", String(teams.length))}</h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {t("teamsSubtitle")}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="flex shrink-0 gap-1 rounded-full p-1" style={{ background: "var(--bg-sunken)", boxShadow: "0 0 0 1px var(--border)" }}>
            {([["name", "A→Z"], ["rank", t("fifaRank")]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors"
                style={{
                  background: sort === key ? "var(--accent)" : "transparent",
                  color: sort === key ? "var(--accent-contrast)" : "var(--text-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative w-full sm:w-56">
            <span className="sr-only">{t("searchTeamsLabel")}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchTeamOrGroup")}
              className="h-10 w-full rounded-full px-4 text-[13px] font-semibold outline-none"
              style={{ background: "var(--bg-sunken)", color: "var(--text)", boxShadow: "0 0 0 1px var(--border)" }}
            />
          </label>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("noTeamsFound")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sorted.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              fifaRank={wiki.get(team.id)?.fifaRank}
              fav={isFavorite(team.id)}
              onToggleFav={() => onToggleFavorite(team.id)}
              onOpen={() => onOpenTeam(team.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
