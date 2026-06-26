import { useEffect, useState } from "react";
import type { Match } from "../lib/types";
import { VN_DATETIME, TZ_LABEL } from "../lib/timezone";
import { useI18n, matchSideLabel } from "../lib/i18n";

function diffParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="tabular-nums text-3xl font-extrabold leading-none text-white sm:text-4xl">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-white/60 sm:text-[11px]">{label}</span>
    </div>
  );
}

export function Countdown({ match, favorite }: { match: Match | null; favorite?: boolean }) {
  const { lang, t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!match?.kickoff) return null;
  const remaining = match.kickoff.getTime() - now;
  const live = match.status === "live" || (remaining <= 0 && match.status !== "finished");
  // Show the elapsed minute when the feed provides real match time (e.g. "45'",
  // HT, ET). State words like "finished"/"ft"/"notstarted" are NOT minutes —
  // show "LIVE" instead so we never print a status word as the clock.
  const elapsed = (match.timeElapsed || "").trim();
  const liveLabel = /\d/.test(elapsed) || /^(ht|et)$/i.test(elapsed) ? elapsed : "LIVE";

  return (
    <div
      className="flex w-full flex-col gap-4 rounded-[var(--radius-card)] p-5 sm:w-auto sm:min-w-[380px] sm:p-6"
      style={{ background: "rgba(10,13,11,0.55)", backdropFilter: "blur(16px) saturate(1.2)", WebkitBackdropFilter: "blur(16px) saturate(1.2)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(255,255,255,0.10), 0 18px 44px rgba(0,0,0,0.34)" }}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide sm:text-[12px]">
        {live ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white"
            style={{ background: "#e8323c", boxShadow: "0 0 0 1px rgba(255,255,255,.25)" }}
          >
            <span className="size-1.5 rounded-full animate-pulse-soft bg-white" />
            {liveLabel}
          </span>
        ) : (
          <span className="text-white/75">{favorite ? t("nextSavedMatch") : t("nextMatch")}</span>
        )}
      </div>

      {live ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <TeamMini name={matchSideLabel(match, "home", lang)} flag={match.homeTeam?.flag} />
            {match.homeScorers.map((s, i) => (
              <span key={`h${i}`} className="min-w-0 truncate text-[11px] font-medium leading-snug text-white">
                <span className="mr-1.5 text-[13px]">⚽</span>{s}
              </span>
            ))}
          </div>
          <span className="shrink-0 px-1 pt-1 text-center tabular-nums text-4xl font-black leading-none text-white sm:px-2 sm:text-5xl">
            {match.homeScore ?? 0}<span className="px-1.5 text-white/40">-</span>{match.awayScore ?? 0}
          </span>
          <div className="flex min-w-0 flex-col items-end gap-1.5">
            <TeamMini name={matchSideLabel(match, "away", lang)} flag={match.awayTeam?.flag} reverse />
            {match.awayScorers.map((s, i) => (
              <span key={`a${i}`} className="min-w-0 truncate text-right text-[11px] font-medium leading-snug text-white">
                {s}<span className="ml-1.5 text-[13px]">⚽</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
            <TeamMini name={matchSideLabel(match, "home", lang)} flag={match.homeTeam?.flag} />
            <span className="shrink-0 text-sm font-bold text-white/55">vs</span>
            <TeamMini name={matchSideLabel(match, "away", lang)} flag={match.awayTeam?.flag} reverse />
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {(() => {
              const p = diffParts(remaining);
              return (
                <>
                  <Unit value={p.d} label={t("unitDays")} />
                  <Sep />
                  <Unit value={p.h} label={t("unitHours")} />
                  <Sep />
                  <Unit value={p.m} label={t("unitMins")} />
                  <Sep />
                  <Unit value={p.s} label={t("unitSecs")} />
                </>
              );
            })()}
          </div>
        </>
      )}

      <span className="text-[11px] text-white/70">
        {live ? t("livePrefix") : ""}{VN_DATETIME.format(match.kickoff)} ({TZ_LABEL})
      </span>
    </div>
  );
}

function Sep() {
  return <span className="text-2xl font-bold text-white/35 sm:text-3xl">:</span>;
}

function TeamMini({ name, flag, reverse }: { name: string; flag?: string; reverse?: boolean }) {
  return (
    <div className={`flex min-w-0 w-full items-center gap-2 ${reverse ? "flex-row-reverse" : ""}`}>
      {flag ? (
        <img src={flag} alt="" className="size-6 shrink-0 rounded-[5px] object-cover" />
      ) : (
        <span className="size-6 shrink-0 rounded-[5px] bg-white/20" />
      )}
      <span className={`min-w-0 flex-1 truncate whitespace-nowrap text-[14px] font-semibold leading-tight text-white sm:text-[15px] ${reverse ? "text-right" : ""}`}>{name}</span>
    </div>
  );
}
