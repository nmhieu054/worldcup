import { useEffect, useMemo, useState } from "react";
import type { Team } from "../lib/types";
import { useI18n } from "../lib/i18n";

export function ManageTeamsModal({
  teams,
  favorites,
  onToggle,
  onClear,
  onClose,
}: {
  teams: Map<string, Team>;
  favorites: Set<string>;
  onToggle: (teamId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { t } = useI18n();

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

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...teams.values()].filter((team) => {
      if (!q) return true;
      return team.name.toLowerCase().includes(q) || team.code.toLowerCase().includes(q);
    });
    const buckets = new Map<string, Team[]>();
    for (const team of list) {
      const key = team.group || "?";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(team);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, members]) => ({
        group,
        members: members.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [teams, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <article
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] shadow-2xl sm:rounded-[24px]"
        style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border), 0 24px 80px rgba(0,0,0,0.34)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 p-4 pb-3" style={{ boxShadow: "0 1px 0 var(--border)" }}>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight">{t("manageTeams")}</h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {t("following")} {favorites.size} {t("teamsWord")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-9 shrink-0 place-items-center rounded-full text-lg font-bold transition-transform active:scale-90"
            style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
          >
            ×
          </button>
        </header>

        <div className="flex items-center gap-2 px-4 py-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchTeamsCode")}
            className="h-10 w-full rounded-full px-4 text-[13px] font-semibold outline-none"
            style={{ background: "var(--bg-sunken)", color: "var(--text)", boxShadow: "0 0 0 1px var(--border)" }}
          />
          {favorites.size > 0 && (
            <button
              onClick={onClear}
              className="shrink-0 rounded-full px-3.5 py-2 text-[12px] font-extrabold transition-transform active:scale-95"
              style={{ background: "var(--bg-sunken)", color: "var(--text-muted)", boxShadow: "0 0 0 1px var(--border)" }}
            >
              {t("clearAll")}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          {grouped.length === 0 ? (
            <p className="rounded-[12px] px-3 py-3 text-sm" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>
              {t("noTeamsFound")}
            </p>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ group, members }) => (
                <section key={group}>
                  <h3 className="mb-2 text-[12px] font-extrabold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                    {t("colGroup")} {group}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {members.map((team) => {
                      const active = favorites.has(team.id);
                      return (
                        <button
                          key={team.id}
                          onClick={() => onToggle(team.id)}
                          className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
                          style={{
                            background: active ? "color-mix(in srgb, var(--accent) 14%, var(--bg-sunken))" : "var(--bg-sunken)",
                            boxShadow: active ? "0 0 0 1.5px var(--accent)" : "0 0 0 1px var(--border)",
                          }}
                          aria-pressed={active}
                        >
                          {team.flag ? (
                            <img src={team.flag} alt={team.code} className="size-7 rounded-[5px] object-cover" style={{ boxShadow: "0 0 0 1px var(--border)" }} />
                          ) : (
                            <span className="grid size-7 place-items-center rounded-[5px] text-[10px] font-bold" style={{ background: "var(--bg-elev)", color: "var(--text-muted)" }}>
                              {team.code}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{team.name}</span>
                          <span
                            className="shrink-0 text-[15px]"
                            style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                          >
                            {active ? "★" : "☆"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
