import type { GroupStanding } from "../lib/types";
import { useI18n, type DictKey } from "../lib/i18n";

const COLS = [
  { key: "played", labelKey: "colP" },
  { key: "won", labelKey: "colW" },
  { key: "drawn", labelKey: "colD" },
  { key: "lost", labelKey: "colL" },
  { key: "gd", labelKey: "colGD" },
  { key: "points", labelKey: "colPts" },
] as const;

export function GroupTable({ group, onTeamOpen }: { group: GroupStanding; onTeamOpen?: (teamId: string) => void }) {
  const { t } = useI18n();
  return (
    <div
      className="overflow-hidden rounded-[var(--radius-card)]"
      style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3 className="text-sm font-bold">{t("colGroup")} {group.name}</h3>
        <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          {t("top2Advance")}
        </span>
      </div>

      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-muted)" }}>
            <th className="py-1.5 pl-3.5 text-left font-medium">#</th>
            <th className="py-1.5 text-left font-medium">{t("colTeam")}</th>
            {COLS.map((c) => (
              <th key={c.key} className="w-7 py-1.5 text-center font-medium tabular-nums">
                {t(c.labelKey as DictKey)}
              </th>
            ))}
            <th className="w-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r) => {
            const qualify = r.rank <= 2;
            const thirdZone = r.rank === 3;
            return (
              <tr
                key={r.team.id}
                role={onTeamOpen ? "button" : undefined}
                tabIndex={onTeamOpen ? 0 : undefined}
                onClick={() => onTeamOpen?.(r.team.id)}
                onKeyDown={(event) => {
                  if (!onTeamOpen) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onTeamOpen(r.team.id);
                  }
                }}
                className={onTeamOpen ? "cursor-pointer transition-colors hover:bg-white/5" : undefined}
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <td className="py-2 pl-3.5 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.rank}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <img
                      src={r.team.flag}
                      alt={r.team.code}
                      loading="lazy"
                      className="size-5 rounded-[4px] object-cover"
                      style={{ boxShadow: "0 0 0 1px var(--border)" }}
                    />
                    <span className="font-medium" style={{ fontWeight: qualify ? 700 : 500 }}>
                      {r.team.name}
                    </span>
                  </div>
                </td>
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className="py-2 text-center tabular-nums"
                    style={{
                      fontWeight: c.key === "points" ? 700 : 400,
                      color: c.key === "points" ? "var(--text)" : "var(--text-muted)",
                    }}
                  >
                    {c.key === "gd" && r.gd > 0 ? `+${r.gd}` : r[c.key]}
                  </td>
                ))}
                <td className="pr-2">
                  <span
                    className="block h-6 w-1 rounded-full"
                    style={{
                      background: qualify
                        ? "var(--accent)"
                        : thirdZone
                          ? "var(--color-pitch-300)"
                          : "transparent",
                      opacity: thirdZone ? 0.6 : 1,
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
