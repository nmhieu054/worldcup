import { useEffect } from "react";
import type { Match, MatchLineup, MatchCard, TeamLineup, LineupPlayer, TeamRoster, RosterPlayer } from "../lib/types";
import { VN_DATETIME } from "../lib/timezone";
import { useI18n, matchSideLabel, type DictKey } from "../lib/i18n";

type TFn = (key: DictKey) => string;

function Flag({ url, code }: { url?: string; code?: string }) {
  if (!url) {
    return (
      <span
        className="grid size-9 place-items-center rounded-[8px] text-[11px] font-bold"
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
      className="size-9 rounded-[8px] object-cover"
      style={{ boxShadow: "0 0 0 1px var(--border)" }}
    />
  );
}

function PlayerRow({ player }: { player: LineupPlayer | RosterPlayer }) {
  const age = "age" in player ? player.age : undefined;
  return (
    <li className="flex items-center justify-between gap-3 rounded-[10px] px-3 py-2" style={{ background: "var(--bg-sunken)" }}>
      <span className="min-w-0 truncate text-[13px] font-medium">{player.name}</span>
      <span className="flex shrink-0 items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {age !== undefined && <span>{age}t</span>}
        {player.position && <span>{player.position}</span>}
        {player.number !== undefined && (
          <span className="grid size-6 place-items-center rounded-full font-bold" style={{ background: "var(--bg-elev)", color: "var(--text)" }}>
            {player.number}
          </span>
        )}
      </span>
    </li>
  );
}

function EmptyLineup({ teamName, t }: { teamName: string; t: TFn }) {
  return (
    <div className="rounded-[14px] border border-dashed p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
      {t("lineupEmptyPrefix")}{teamName}{t("lineupEmptySuffix")}
    </div>
  );
}

function compactName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return parts.slice(-2).join(" ");
}

function buildPitchLines(side: TeamLineup) {
  const starting = side.starting.slice(0, 11);
  const keepers = starting.filter((p) => ["G", "GK"].includes(p.position ?? ""));
  const outfield = starting.filter((p) => !["G", "GK"].includes(p.position ?? ""));
  const shape = side.formation?.split("-").map((n) => Number.parseInt(n, 10)).filter(Boolean);

  if (shape?.length && shape.reduce((sum, n) => sum + n, 0) === outfield.length) {
    let cursor = 0;
    const lines = shape.map((count) => {
      const line = outfield.slice(cursor, cursor + count);
      cursor += count;
      return line;
    });
    return [...lines.reverse(), keepers.length ? keepers : outfield.slice(0, 1)];
  }

  const byPosition = ["F", "M", "D"].map((pos) => outfield.filter((p) => p.position === pos));
  return [...byPosition.filter((line) => line.length > 0), keepers.length ? keepers : []];
}

function PitchView({ side }: { side: TeamLineup }) {
  if (!side.starting.length) return null;
  const lines = buildPitchLines(side).filter((line) => line.length > 0);
  const rows = lines.length;

  return (
    <div
      className="relative mb-4 aspect-[3/4] w-full overflow-hidden rounded-[18px]"
      style={{
        background:
          "repeating-linear-gradient(180deg, #126b4f 0px, #126b4f 56px, #0f6048 56px, #0f6048 112px)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16), inset 0 0 60px rgba(0,0,0,.32)",
      }}
    >
      {/* pitch markings (SVG, percentage viewBox) */}
      <svg className="pointer-events-none absolute inset-0" viewBox="0 0 100 133" fill="none" preserveAspectRatio="none" aria-hidden>
        <g stroke="rgba(255,255,255,.34)" strokeWidth="0.5">
          <rect x="4" y="4" width="92" height="125" rx="1.5" />
          <line x1="4" y1="66.5" x2="96" y2="66.5" />
          {/* penalty + goal boxes top */}
          <rect x="22" y="4" width="56" height="20" />
          <rect x="38" y="4" width="24" height="8" />
          {/* penalty + goal boxes bottom */}
          <rect x="22" y="109" width="56" height="20" />
          <rect x="38" y="121" width="24" height="8" />
        </g>
        <circle cx="50" cy="66.5" r="11" stroke="rgba(255,255,255,.34)" strokeWidth="0.5" />
        <circle cx="50" cy="66.5" r="1" fill="rgba(255,255,255,.34)" />
      </svg>

      {/* players positioned by percentage so nothing overflows */}
      {lines.map((line, lineIndex) => {
        const top = rows <= 1 ? 50 : 8 + (lineIndex / (rows - 1)) * 84;
        return line.map((player, playerIndex) => {
          const n = line.length;
          const left = ((playerIndex + 1) / (n + 1)) * 100;
          return (
            <div
              key={`${player.name}-${player.number ?? playerIndex}`}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: `${left}%`, top: `${top}%`, width: "22%" }}
            >
              <span className="grid size-8 place-items-center rounded-full text-[12px] font-extrabold sm:size-9 sm:text-[13px]" style={{ background: "var(--accent)", color: "var(--accent-contrast)", boxShadow: "0 6px 16px rgba(0,0,0,.4)" }}>
                {player.number ?? player.position ?? "•"}
              </span>
              <span className="max-w-full truncate rounded-full px-1.5 py-0.5 text-center text-[9.5px] font-bold leading-tight sm:text-[10.5px]" style={{ background: "rgba(4,12,15,.72)", color: "#effffb" }}>
                {compactName(player.name)}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
}

function positionLabel(position: string, t: TFn) {
  const key: Record<string, DictKey> = { G: "posGK", GK: "posGK", D: "posDF", DF: "posDF", M: "posMF", MF: "posMF", F: "posFW", FW: "posFW" };
  return key[position] ? t(key[position]) : position;
}

function SquadFallback({ roster, t }: { roster: TeamRoster; t: TFn }) {
  const groups = ["G", "D", "M", "F"].map((position) => ({
    position,
    players: roster.players.filter((player) => player.position === position),
  })).filter((group) => group.players.length > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-dashed p-3 text-[13px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        {t("squadFallbackPrefix")}{roster.players.length}{t("squadFallbackSuffix")}
      </div>
      {groups.map((group) => (
        <section key={group.position}>
          <h4 className="mb-2 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{positionLabel(group.position, t)}</h4>
          <ol className="grid gap-2">
            {group.players.map((player) => <PlayerRow key={player.id} player={player} />)}
          </ol>
        </section>
      ))}
    </div>
  );
}

function LineupBlock({ title, side, roster, t }: { title: string; side?: TeamLineup; roster?: TeamRoster; t: TFn }) {
  if (!side || (side.starting.length === 0 && side.bench.length === 0)) {
    return roster ? <SquadFallback roster={roster} t={t} /> : <EmptyLineup teamName={title} t={t} />;
  }

  return (
    <div className="space-y-4">
      {side.formation && (
        <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
          {t("formation")} {side.formation}
        </p>
      )}
      <PitchView side={side} />
      <section>
        <h4 className="mb-2 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{t("starting")}</h4>
        {side.starting.length ? (
          <ol className="grid gap-2">
            {side.starting.map((p, i) => <PlayerRow key={`${p.name}-${p.number ?? i}`} player={p} />)}
          </ol>
        ) : <EmptyLineup teamName={title} t={t} />}
      </section>
      <section>
        <h4 className="mb-2 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{t("bench")}</h4>
        {side.bench.length ? (
          <ol className="grid gap-2">
            {side.bench.map((p, i) => <PlayerRow key={`${p.name}-${p.number ?? i}`} player={p} />)}
          </ol>
        ) : (
          <p className="rounded-[10px] px-3 py-2 text-[13px]" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}>
            {t("noBench")}
          </p>
        )}
      </section>
    </div>
  );
}

function GoalRow({ scorer, reverse }: { scorer: string; reverse?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}>
      <span className="shrink-0 text-[13px]">⚽</span>
      <span className="truncate" style={{ color: "var(--text)" }}>{scorer}</span>
    </span>
  );
}

function CardRow({ card, reverse }: { card: MatchCard; reverse?: boolean }) {
  const color = card.color === "red" ? "#e8323c" : "#f5c518";
  return (
    <span className={`flex items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}>
      <span className="inline-block h-[15px] w-[11px] shrink-0 rounded-[2px]" style={{ background: color, boxShadow: "0 1px 2px rgba(0,0,0,.4)" }} />
      <span className="truncate" style={{ color: "var(--text)" }}>{card.player}{card.minute ? ` ${card.minute}` : ""}</span>
    </span>
  );
}

function TeamHeader({ label, flag, code, onOpen, reverse }: { label: string; flag?: string; code?: string; onOpen?: () => void; reverse?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={`flex min-w-0 w-full items-center gap-2 rounded-[12px] transition-transform enabled:active:scale-[0.99] sm:gap-3 ${reverse ? "flex-row-reverse text-right" : "text-left"}`}
      style={{ cursor: onOpen ? "pointer" : "default" }}
    >
      <Flag url={flag} code={code} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold sm:text-[15px]">{label}</p>
        {code && <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>{code}</p>}
      </div>
    </button>
  );
}

export function MatchDetail({
  match,
  stadium,
  lineup,
  homeRoster,
  awayRoster,
  onClose,
  onOpenTeam,
}: {
  match: Match;
  stadium?: string;
  lineup?: MatchLineup;
  homeRoster?: TeamRoster;
  awayRoster?: TeamRoster;
  onClose: () => void;
  onOpenTeam?: (teamId: string) => void;
}) {
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

  const { lang, t } = useI18n();
  const kickoff = match.kickoff ? VN_DATETIME.format(match.kickoff) : t("noDateYet");
  const homeLineup = lineup?.home;
  const awayLineup = lineup?.away;
  const hasLineup = (homeLineup?.starting.length ?? 0) > 0 || (awayLineup?.starting.length ?? 0) > 0;
  const homeName = matchSideLabel(match, "home", lang);
  const awayName = matchSideLabel(match, "away", lang);
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const statusText = isLive
    ? `${t("livePrefix")}${match.timeElapsed && match.timeElapsed !== "notstarted" ? `${match.timeElapsed}` : ""}`.trim().replace(/·\s*$/, "").trim()
    : isFinished
      ? t("fullTime")
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <article
        className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-t-[24px] p-4 shadow-2xl sm:rounded-[24px] sm:p-5"
        style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border), 0 24px 80px rgba(0,0,0,0.34)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
              Match {match.id} · {match.type === "group" ? `${t("colGroup")} ${match.group}` : match.type.toUpperCase()}
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{t("matchInfo")}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {kickoff}{stadium ? ` · ${stadium}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("closeMatch")}
            className="grid size-9 shrink-0 place-items-center rounded-full text-lg font-bold transition-transform active:scale-90"
            style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
          >
            ×
          </button>
        </header>

        <section className="mb-5 rounded-[18px] p-4" style={{ background: "var(--bg-sunken)" }}>
          {statusText && (
            <div className="mb-3 flex justify-center">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide"
                style={{
                  background: isLive ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "var(--bg-elev)",
                  color: isLive ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {isLive && <span className="size-1.5 rounded-full animate-pulse-soft" style={{ background: "var(--accent)" }} />}
                {statusText}
              </span>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
            <TeamHeader label={homeName} flag={match.homeTeam?.flag} code={match.homeTeam?.code} onOpen={match.homeId ? () => onOpenTeam?.(match.homeId!) : undefined} />
            <div className="flex shrink-0 items-center justify-center gap-1.5 px-1 sm:gap-2 sm:px-2">
              {match.homeScore !== null || match.awayScore !== null ? (
                <>
                  <span className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--accent)" }}>{match.homeScore ?? 0}</span>
                  <span className="text-lg font-bold" style={{ color: "var(--text-muted)" }}>-</span>
                  <span className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--accent)" }}>{match.awayScore ?? 0}</span>
                </>
              ) : (
                <span className="px-1 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>VS</span>
              )}
            </div>
            <TeamHeader label={awayName} flag={match.awayTeam?.flag} code={match.awayTeam?.code} onOpen={match.awayId ? () => onOpenTeam?.(match.awayId!) : undefined} reverse />
          </div>
          {(match.homeScorers.length > 0 || match.awayScorers.length > 0) && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              <div className="flex flex-col gap-1">
                {match.homeScorers.length ? match.homeScorers.map((s, i) => <GoalRow key={`h${i}`} scorer={s} />) : <span>{t("noGoals")}</span>}
              </div>
              <div className="flex flex-col items-end gap-1">
                {match.awayScorers.length ? match.awayScorers.map((s, i) => <GoalRow key={`a${i}`} scorer={s} reverse />) : <span>{t("noGoals")}</span>}
              </div>
            </div>
          )}
          {(lineup?.cards?.length ?? 0) > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-1.5 border-t pt-3 text-[12px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <div className="flex flex-col gap-1">
                {lineup!.cards!.filter((c) => c.side === "home").map((c, i) => <CardRow key={`h${i}`} card={c} />)}
              </div>
              <div className="flex flex-col items-end gap-1">
                {lineup!.cards!.filter((c) => c.side === "away").map((c, i) => <CardRow key={`a${i}`} card={c} reverse />)}
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3">
            <h3 className="text-lg font-extrabold">{t("lineupsBench")}</h3>
            {!hasLineup && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("lineupsHint")}
              </p>
            )}
            {lineup?.updatedAt && (
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{t("updatedAt")} {VN_DATETIME.format(new Date(lineup.updatedAt))}</p>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[18px] p-4" style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}>
              <div className="mb-3 flex items-center gap-2">
                <Flag url={match.homeTeam?.flag} code={match.homeTeam?.code} />
                <h4 className="min-w-0 truncate font-extrabold">{homeName}</h4>
              </div>
              <LineupBlock title={homeName} side={homeLineup} roster={homeRoster} t={t} />
            </div>
            <div className="rounded-[18px] p-4" style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}>
              <div className="mb-3 flex items-center gap-2">
                <Flag url={match.awayTeam?.flag} code={match.awayTeam?.code} />
                <h4 className="min-w-0 truncate font-extrabold">{awayName}</h4>
              </div>
              <LineupBlock title={awayName} side={awayLineup} roster={awayRoster} t={t} />
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
