import type { StandingRow } from "../lib/types";
import { useI18n } from "../lib/i18n";

/** Standings of the 12 third-placed teams. Top 8 advance under the WC26 format. */
export function ThirdPlaceTable({ rows, onTeamOpen }: { rows: StandingRow[]; onTeamOpen?: (teamId: string) => void }) {
  const { t } = useI18n();
  const anyPlayed = rows.some((r) => r.played > 0);

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-card)]"
      style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
    >
      <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="text-sm font-bold">{t("thirdPlaceTitle")}</h3>
        <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          {t("top8Advance")}
        </span>
      </div>

      {!anyPlayed && (
        <p className="px-3.5 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {t("thirdPlaceEmpty")}
        </p>
      )}

      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-muted)" }}>
            <th className="py-1.5 pl-3.5 text-left font-medium">#</th>
            <th className="py-1.5 text-left font-medium">{t("colTeam")}</th>
            <th className="w-9 py-1.5 text-center font-medium">{t("colGroup")}</th>
            <th className="w-7 py-1.5 text-center font-medium">{t("colGD")}</th>
            <th className="w-7 py-1.5 text-center font-medium">{t("colPts")}</th>
            <th className="w-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const advance = r.rank <= 8;
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
                <td className="py-2 pl-3.5 tabular-nums" style={{ color: "var(--text-muted)" }}>{r.rank}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <img src={r.team.flag} alt={r.team.code} loading="lazy" className="size-5 rounded-[4px] object-cover" style={{ boxShadow: "0 0 0 1px var(--border)" }} />
                    <span style={{ fontWeight: advance ? 700 : 500 }}>{r.team.name}</span>
                  </div>
                </td>
                <td className="py-2 text-center font-semibold" style={{ color: "var(--text-muted)" }}>{r.group}</td>
                <td className="py-2 text-center tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </td>
                <td className="py-2 text-center font-bold tabular-nums">{r.points}</td>
                <td className="pr-2">
                  <span className="block h-6 w-1 rounded-full" style={{ background: advance ? "var(--accent)" : "transparent" }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
