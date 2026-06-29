import type { Match } from "../lib/types";
import { VN_DATETIME } from "../lib/timezone";
import { useI18n, matchSideLabel } from "../lib/i18n";

function Flag({ url, code }: { url?: string; code?: string }) {
  if (!url) {
    return (
      <span
        className="grid size-7 shrink-0 place-items-center rounded-[5px] text-[10px] font-bold"
        style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
      >
        {code ?? "?"}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={code ?? ""}
      loading="lazy"
      className="size-7 shrink-0 rounded-[5px] object-cover"
      style={{ boxShadow: "0 0 0 1px var(--border)" }}
    />
  );
}

function Side({
  name,
  flag,
  code,
  score,
  scorers,
  status,
  winner,
  fav,
  detail,
}: {
  name: string;
  flag?: string;
  code?: string;
  score: number | null;
  scorers: string[];
  status: Match["status"];
  winner: boolean;
  fav: boolean;
  detail?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-start gap-2.5">
        <Flag url={flag} code={code} />
        <span
          className="flex-1 text-[13.5px] leading-tight"
          style={{
            fontWeight: winner ? 700 : 500,
            color: status === "upcoming" && !flag ? "var(--text-muted)" : "var(--text)",
          }}
        >
          {name}
          {fav && <span style={{ color: "var(--accent)" }}> ★</span>}
        </span>
        {score !== null && (
          <span
            className="shrink-0 tabular-nums text-base font-bold"
            style={{ color: winner ? "var(--accent)" : "var(--text)" }}
          >
            {score}
            {detail && winner && (
              <span className="ml-1 text-[10px] font-extrabold uppercase" style={{ color: "var(--accent)" }}>
                {detail === "AET" ? "ET" : detail === "pen" ? "pen" : detail}
              </span>
            )}
          </span>
        )}
      </div>
      {scorers.length > 0 && (
        <span className="pl-[38px] text-[10.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
          {scorers.join(", ")}
        </span>
      )}
    </div>
  );
}

export function MatchCard({
  match,
  stadium,
  isFavorite,
  isFavoriteMatch,
  onToggleFavoriteMatch,
  onOpen,
}: {
  match: Match;
  stadium?: string;
  /** marks favorite *teams* (small star next to a team name) */
  isFavorite?: (id: string | null) => boolean;
  /** whether this whole match is saved */
  isFavoriteMatch?: (matchId: string) => boolean;
  /** toggle saving this whole match */
  onToggleFavoriteMatch?: (matchId: string) => void;
  onOpen?: (match: Match) => void;
}) {
  const { status, kickoff, homeScore, awayScore } = match;
  const { lang, t } = useI18n();
  const homeWin =
    status !== "upcoming" && homeScore !== null && awayScore !== null && homeScore > awayScore;
  const awayWin =
    status !== "upcoming" && homeScore !== null && awayScore !== null && awayScore > homeScore;

  const favHome = isFavorite?.(match.homeId) ?? false;
  const favAway = isFavorite?.(match.awayId) ?? false;
  const savedMatch = isFavoriteMatch?.(match.id) ?? false;
  const highlight = savedMatch || favHome || favAway;
  const penTally = match.penHome != null && match.penAway != null ? ` ${match.penHome}-${match.penAway}` : "";
  const detailLabel = match.timeDetail === "AET" ? " (ET)" : match.timeDetail === "pen" ? ` (pen${penTally})` : "";
  const statusLabel = status === "live" ? `LIVE ${match.timeElapsed}` : status === "finished" ? `${t("fullTime")}${detailLabel}` : match.group?.toUpperCase();
  const railColor = status === "live" || highlight ? "var(--accent)" : status === "finished" ? "var(--text-muted)" : "var(--border)";

  return (
    <article
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(match)}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(match);
        }
      }}
      className={`glass ${highlight ? "" : "glass-edge"} group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] p-3.5 pl-4 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]`}
      style={{
        boxShadow: highlight ? "0 0 0 1.5px var(--accent), 0 14px 34px rgba(0,0,0,.18)" : undefined,
        cursor: onOpen ? "pointer" : "default",
      }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: railColor }} />

      <header className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span className="font-medium">
          {kickoff ? `${VN_DATETIME.format(kickoff)}` : t("noDateYet")}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 font-bold"
            style={{ background: status === "live" ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "var(--bg-sunken)", color: status === "live" ? "var(--accent)" : "var(--text-muted)" }}
          >
            {status === "live" && <span className="size-1.5 rounded-full animate-pulse-soft" style={{ background: "var(--accent)" }} />}
            {statusLabel}
          </span>
          {onToggleFavoriteMatch && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavoriteMatch(match.id);
              }}
              aria-label={savedMatch ? t("removeSavedMatch") : t("saveMatch")}
              aria-pressed={savedMatch}
              title={savedMatch ? t("removeSavedMatch") : t("saveMatch")}
              className="grid size-6 place-items-center rounded-full text-[13px] transition-transform active:scale-90"
              style={{ background: savedMatch ? "var(--accent)" : "var(--bg-sunken)", color: savedMatch ? "var(--accent-contrast)" : "var(--text-muted)" }}
            >
              {savedMatch ? "★" : "☆"}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <Side name={matchSideLabel(match, "home", lang)} flag={match.homeTeam?.flag} code={match.homeTeam?.code} score={homeScore} scorers={match.homeScorers} status={status} winner={homeWin} fav={favHome} detail={match.timeDetail} />
        <Side name={matchSideLabel(match, "away", lang)} flag={match.awayTeam?.flag} code={match.awayTeam?.code} score={awayScore} scorers={match.awayScorers} status={status} winner={awayWin} fav={favAway} detail={match.timeDetail} />
      </div>

      {stadium && (
        <footer className="flex items-center gap-2">
          <span className="truncate text-[10.5px]" style={{ color: "var(--text-muted)" }}>{stadium}</span>
        </footer>
      )}
    </article>
  );
}
