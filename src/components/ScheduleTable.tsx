import { useState } from "react";
import type { Match } from "../lib/types";
import { VN_TIME } from "../lib/timezone";
import { useI18n, roundLabelI18n, matchSideLabel } from "../lib/i18n";

type DayGroup = { key: string; label: string; shortLabel: string; matches: Match[] };

function Flag({ url, code }: { url?: string; code?: string }) {
  return url ? (
    <img src={url} alt={code ?? ""} loading="lazy" className="size-5 rounded-[3px] object-cover" style={{ boxShadow: "0 0 0 1px var(--border)" }} />
  ) : (
    <span className="grid size-5 place-items-center rounded-[3px] text-[8px] font-bold" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>{code ?? "?"}</span>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}

function StarBtn({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={saved ? t("removeSavedMatch") : t("saveMatch")}
      aria-pressed={saved}
      title={saved ? t("removeSavedMatch") : t("saveMatch")}
      className="grid size-7 place-items-center rounded-full text-[13px] transition-transform active:scale-90"
      style={{ background: saved ? "var(--accent)" : "var(--bg-sunken)", color: saved ? "var(--accent-contrast)" : "var(--text-muted)" }}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}

function scorerPreview(scorers: string[], max = 2) {
  if (scorers.length <= max) return scorers.join(", ");
  return `${scorers.slice(0, max).join(", ")} +${scorers.length - max}`;
}

/* Status chip: LIVE (red, pulsing) / FT (finished) / kickoff time (upcoming). */
function StatusChip({ match }: { match: Match }) {
  if (match.status === "live") {
    const elapsed = (match.timeElapsed || "").trim();
    // Only use the feed string as a minute label when it actually looks like
    // match time (has a digit, or HT/ET). State words like "finished"/"ft"/
    // "notstarted" must not be shown literally — fall back to "LIVE".
    const isMinute = /\d/.test(elapsed) || /^(ht|et)$/i.test(elapsed);
    const label = isMinute ? elapsed : "LIVE";
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white"
        style={{ background: "#e8323c" }}
      >
        <span className="size-1.5 rounded-full animate-pulse-soft bg-white" />
        {label}
      </span>
    );
  }
  if (match.status === "finished") {
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
        style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
      >
        FT
      </span>
    );
  }
  return null;
}

/* ---------------- Desktop table row ---------------- */

function RowWithDay({
  match,
  dayLabel,
  dayKey,
  daySpan,
  isFirstOfDay,
  isFavorite,
  isFavoriteMatch,
  onToggleFavoriteMatch,
  onOpen,
  onSelectDay,
}: {
  match: Match;
  dayLabel: string | null;
  dayKey: string;
  daySpan: number;
  isFirstOfDay: boolean;
  isFavorite?: (id: string | null) => boolean;
  isFavoriteMatch?: (matchId: string) => boolean;
  onToggleFavoriteMatch?: (matchId: string) => void;
  onOpen?: (m: Match) => void;
  onSelectDay?: (dayKey: string) => void;
}) {
  const { lang, t } = useI18n();
  const { status, homeScore, awayScore } = match;
  const homeWin = status !== "upcoming" && homeScore !== null && awayScore !== null && homeScore > awayScore;
  const awayWin = status !== "upcoming" && homeScore !== null && awayScore !== null && awayScore > homeScore;
  const favHome = isFavorite?.(match.homeId) ?? false;
  const favAway = isFavorite?.(match.awayId) ?? false;
  const saved = isFavoriteMatch?.(match.id) ?? false;
  const highlight = saved || favHome || favAway;
  const score = homeScore !== null && awayScore !== null ? `${homeScore}-${awayScore}` : null;
  const finished = status === "finished";

  const [hover, setHover] = useState(false);

  // Highlight/hover live on the match cells only, never the ID or date column —
  // the date cell spans multiple rows (rowSpan), so row-level styling would leak
  // across matches and look out of sync.
  const matchBg = hover
    ? "var(--bg-sunken)"
    : highlight
      ? "color-mix(in srgb, var(--accent) 9%, transparent)"
      : "transparent";
  const matchCell = "cursor-pointer px-3 py-2.5 transition-colors";
  // Finished matches dim a touch (kết quả still readable) so the eye favours
  // upcoming/live fixtures; hover lifts the dim back to full opacity.
  const cellProps = {
    onClick: () => onOpen?.(match),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: { background: matchBg, opacity: finished && !hover ? 0.62 : 1 },
  };

  return (
    <tr
      style={{
        borderTop: isFirstOfDay
          ? "1px solid color-mix(in srgb, var(--accent) 22%, var(--border))"
          : "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
      }}
    >
      <td className="px-3 py-2.5 text-center text-[11px] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>{match.id}</td>
      {isFirstOfDay ? (
        <td
          rowSpan={daySpan}
          className="px-3 py-2.5 text-center align-middle"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectDay?.(dayKey); }}
            title={t("viewThisDate")}
            className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[12px] font-extrabold transition-transform active:scale-95"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, var(--bg-sunken))", color: "var(--accent)" }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            {dayLabel}
          </button>
        </td>
      ) : null}
      <td className={matchCell} {...cellProps}>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: status === "live" ? "var(--accent)" : "var(--text)" }}>
          <span style={{ color: status === "live" ? "var(--accent)" : "var(--text-muted)" }}><ClockIcon /></span>
          {match.kickoff ? VN_TIME.format(match.kickoff) : "TBD"}
        </span>
      </td>
      <td className={matchCell} {...cellProps}>
        <span className="inline-flex min-w-max whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--bg-elev)", color: "var(--text-muted)", boxShadow: "0 0 0 1px var(--border)" }}>
          {roundLabelI18n(match.type, match.group, lang)}
        </span>
      </td>
      <td className={matchCell} {...cellProps}>
        <div className="flex items-center justify-end gap-2">
          <span className="min-w-0 max-w-full overflow-hidden">
            <span className="block truncate text-right text-[13px]" style={{ fontWeight: homeWin ? 700 : 500 }}>
              {matchSideLabel(match, "home", lang)}
              {favHome && <span style={{ color: "var(--accent)" }}> ★</span>}
            </span>
            {match.homeScorers.length > 0 && (
              <span className="block truncate text-right text-[10.5px] leading-snug" title={match.homeScorers.join(", ")} style={{ color: "var(--text-muted)" }}>
                {scorerPreview(match.homeScorers)}
              </span>
            )}
          </span>
          <Flag url={match.homeTeam?.flag} code={match.homeTeam?.code} />
        </div>
      </td>
      <td className={`${matchCell} px-2 text-center`} {...cellProps}>
        <div className="flex flex-col items-center gap-1">
          {score ? (
            <span className="tabular-nums text-[14px] font-extrabold" style={{ color: "var(--accent)" }}>{score}</span>
          ) : (
            <span className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>vs</span>
          )}
          <StatusChip match={match} />
        </div>
      </td>
      <td className={matchCell} {...cellProps}>
        <div className="flex items-center gap-2">
          <Flag url={match.awayTeam?.flag} code={match.awayTeam?.code} />
          <span className="min-w-0 max-w-full overflow-hidden">
            <span className="block truncate text-[13px]" style={{ fontWeight: awayWin ? 700 : 500 }}>
              {matchSideLabel(match, "away", lang)}
              {favAway && <span style={{ color: "var(--accent)" }}> ★</span>}
            </span>
            {match.awayScorers.length > 0 && (
              <span className="block truncate text-[10.5px] leading-snug" title={match.awayScorers.join(", ")} style={{ color: "var(--text-muted)" }}>
                {scorerPreview(match.awayScorers)}
              </span>
            )}
          </span>
        </div>
      </td>
      <td
        className="px-3 py-2.5 transition-colors"
        style={{ background: matchBg }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="flex items-center justify-end">
          {onToggleFavoriteMatch && <StarBtn saved={saved} onClick={() => onToggleFavoriteMatch(match.id)} />}
        </div>
      </td>
    </tr>
  );
}

/* ---------------- Mobile compact row ---------------- */

function MobileMatch({
  match,
  isFavorite,
  isFavoriteMatch,
  onToggleFavoriteMatch,
  onOpen,
}: {
  match: Match;
  isFavorite?: (id: string | null) => boolean;
  isFavoriteMatch?: (matchId: string) => boolean;
  onToggleFavoriteMatch?: (matchId: string) => void;
  onOpen?: (m: Match) => void;
}) {
  const { lang, t } = useI18n();
  const { status, homeScore, awayScore } = match;
  const homeWin = status !== "upcoming" && homeScore !== null && awayScore !== null && homeScore > awayScore;
  const awayWin = status !== "upcoming" && homeScore !== null && awayScore !== null && awayScore > homeScore;
  const favHome = isFavorite?.(match.homeId) ?? false;
  const favAway = isFavorite?.(match.awayId) ?? false;
  const saved = isFavoriteMatch?.(match.id) ?? false;
  const highlight = saved || favHome || favAway;
  const decided = homeScore !== null && awayScore !== null;
  const finished = status === "finished";
  const homeCode = match.homeTeam?.code ?? matchSideLabel(match, "home", lang);
  const awayCode = match.awayTeam?.code ?? matchSideLabel(match, "away", lang);

  return (
    <div
      onClick={() => onOpen?.(match)}
      className="flex cursor-pointer items-center gap-2 px-2.5 py-2 text-[12.5px]"
      style={{
        borderTop: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
        background: highlight ? "color-mix(in srgb, var(--accent) 9%, transparent)" : "transparent",
        opacity: finished ? 0.62 : 1,
      }}
    >
      {/* time / status */}
      <span className="flex w-[46px] shrink-0 flex-col items-start gap-0.5">
        <span className="tabular-nums font-bold" style={{ color: status === "live" ? "var(--accent)" : "var(--text-muted)" }}>
          {match.kickoff ? VN_TIME.format(match.kickoff) : "TBD"}
        </span>
        <StatusChip match={match} />
      </span>

      {/* home code + flag */}
      <span className="flex flex-1 items-center justify-end gap-1.5 truncate">
        <span className="truncate text-right" style={{ fontWeight: homeWin ? 800 : 600 }}>
          {homeCode}{favHome && <span style={{ color: "var(--accent)" }}>★</span>}
        </span>
        <Flag url={match.homeTeam?.flag} code={match.homeTeam?.code} />
      </span>

      {/* score / vs */}
      <span className="w-[40px] shrink-0 text-center tabular-nums font-extrabold" style={{ color: decided ? "var(--accent)" : "var(--text-muted)" }}>
        {decided ? `${homeScore}-${awayScore}` : "vs"}
      </span>

      {/* away flag + code */}
      <span className="flex flex-1 items-center gap-1.5 truncate">
        <Flag url={match.awayTeam?.flag} code={match.awayTeam?.code} />
        <span className="truncate" style={{ fontWeight: awayWin ? 800 : 600 }}>
          {awayCode}{favAway && <span style={{ color: "var(--accent)" }}>★</span>}
        </span>
      </span>

      {/* favorite match toggle */}
      {onToggleFavoriteMatch && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavoriteMatch(match.id); }}
          aria-label={saved ? t("removeSavedMatch") : t("saveMatch")}
          aria-pressed={saved}
          className="shrink-0 text-[15px]"
          style={{ color: saved ? "var(--accent)" : "var(--text-muted)" }}
        >
          {saved ? "★" : "☆"}
        </button>
      )}
    </div>
  );
}

export function ScheduleTable({
  days,
  isFavorite,
  isFavoriteMatch,
  onToggleFavoriteMatch,
  onOpen,
  onSelectDay,
}: {
  days: DayGroup[];
  isFavorite?: (id: string | null) => boolean;
  isFavoriteMatch?: (matchId: string) => boolean;
  onToggleFavoriteMatch?: (matchId: string) => void;
  onOpen?: (m: Match) => void;
  onSelectDay?: (dayKey: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {/* Mobile: compact list grouped by day */}
      <div className="space-y-4 sm:hidden">
        {days.map((d) => (
          <section key={d.key} className="glass glass-edge overflow-hidden rounded-[var(--radius-card)]">
            <button
              type="button"
              onClick={() => onSelectDay?.(d.key)}
              title={t("viewThisDate")}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
              style={{ borderBottom: "2px solid var(--accent)" }}
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-extrabold capitalize" style={{ color: "var(--text)" }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                {d.label}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "color-mix(in srgb, var(--accent) 14%, var(--bg-sunken))", color: "var(--accent)" }}>{d.matches.length} {t("matchesWord")}</span>
            </button>
            <div>
              {d.matches.map((m) => (
                <MobileMatch
                  key={m.id}
                  match={m}
                  isFavorite={isFavorite}
                  isFavoriteMatch={isFavoriteMatch}
                  onToggleFavoriteMatch={onToggleFavoriteMatch}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Desktop: full table */}
      <div className="glass glass-edge hidden overflow-hidden overflow-x-auto rounded-[var(--radius-card)] sm:block">
        <table className="w-full min-w-[900px] table-fixed border-collapse">
          <colgroup>
            <col className="w-[56px]" />
            <col className="w-[112px]" />
            <col className="w-[82px]" />
            <col className="w-[132px]" />
            <col className="w-[24%]" />
            <col className="w-[78px]" />
            <col className="w-[24%]" />
            <col className="w-[92px]" />
          </colgroup>
          <thead>
            <tr className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--bg-sunken)", borderBottom: "2px solid var(--accent)" }}>
              <th className="px-3 py-3 text-center font-bold">{t("thId")}</th>
              <th className="px-3 py-3 text-center font-bold">{t("thDate")}</th>
              <th className="px-3 py-3 text-left font-bold">{t("thTime")}</th>
              <th className="px-3 py-3 text-left font-bold">{t("thRound")}</th>
              <th className="px-3 py-3 text-right font-bold">{t("thHome")}</th>
              <th className="px-2 py-3 text-center font-bold">{t("thScore")}</th>
              <th className="px-3 py-3 text-left font-bold">{t("thAway")}</th>
              <th className="px-3 py-3 text-right font-bold">{t("thFav")}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) =>
              d.matches.map((m, i) => (
                <RowWithDay
                  key={m.id}
                  match={m}
                  dayLabel={i === 0 ? d.shortLabel : null}
                  dayKey={d.key}
                  daySpan={d.matches.length}
                  isFirstOfDay={i === 0}
                  isFavorite={isFavorite}
                  isFavoriteMatch={isFavoriteMatch}
                  onToggleFavoriteMatch={onToggleFavoriteMatch}
                  onOpen={onOpen}
                  onSelectDay={onSelectDay}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
