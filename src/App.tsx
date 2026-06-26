import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useWorldCup } from "./lib/useWorldCup";
import { useTheme } from "./lib/useTheme";
import { useFavorites } from "./lib/useFavorites";
import { useFavoriteMatches } from "./lib/useFavoriteMatches";
import { MatchCard } from "./components/MatchCard";
import { GroupTable } from "./components/GroupTable";
import { ThirdPlaceTable } from "./components/ThirdPlaceTable";
import { Countdown } from "./components/Countdown";
import { ScheduleTable } from "./components/ScheduleTable";
import { MatchCalendar } from "./components/MatchCalendar";
import { downloadIcs } from "./lib/ics";
import { FavoritesView } from "./components/FavoritesView";

// Lazy-loaded: heavier or less-used views/modals split into their own chunks so
// the default Schedule tab + first paint stay light. Each only fetches when opened.
const Bracket = lazy(() => import("./components/Bracket").then((m) => ({ default: m.Bracket })));
const StadiumsView = lazy(() => import("./components/StadiumsView").then((m) => ({ default: m.StadiumsView })));
const TeamsView = lazy(() => import("./components/TeamsView").then((m) => ({ default: m.TeamsView })));
const MatchDetail = lazy(() => import("./components/MatchDetail").then((m) => ({ default: m.MatchDetail })));
const TeamDetail = lazy(() => import("./components/TeamDetail").then((m) => ({ default: m.TeamDetail })));
const ManageTeamsModal = lazy(() => import("./components/ManageTeamsModal").then((m) => ({ default: m.ManageTeamsModal })));
import { vnDayKey, USER_TZ, TZ_LABEL } from "./lib/timezone";
import { useI18n, type DictKey } from "./lib/i18n";
import type { Match } from "./lib/types";

type Tab = "schedule" | "groups" | "bracket" | "stadiums" | "teams";
type Phase = "all" | "fav" | "favmatch";
type ViewMode = "all" | "calendar";

// Day formatters per language (the schedule groups by the visitor's local day).
const DAY_LONG = {
  vi: new Intl.DateTimeFormat("vi-VN", { timeZone: USER_TZ, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: USER_TZ, weekday: "long", day: "2-digit", month: "short", year: "numeric" }),
};
const DAY_PICKER = {
  vi: new Intl.DateTimeFormat("vi-VN", { timeZone: USER_TZ, weekday: "short", day: "2-digit", month: "2-digit" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: USER_TZ, weekday: "short", day: "2-digit", month: "short" }),
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}

function groupByVnDay(matches: Match[], lang: "vi" | "en") {
  const buckets = new Map<string, { key: string; label: string; shortLabel: string; matches: Match[] }>();
  for (const m of matches) {
    const key = m.kickoff ? vnDayKey(m.kickoff) : "tbd";
    const label = m.kickoff ? DAY_LONG[lang].format(m.kickoff) : (lang === "vi" ? "Chưa xác định lịch" : "Date TBD");
    const shortLabel = m.kickoff ? DAY_PICKER[lang].format(m.kickoff) : (lang === "vi" ? "Chưa lịch" : "TBD");
    if (!buckets.has(key)) buckets.set(key, { key, label, shortLabel, matches: [] });
    buckets.get(key)!.matches.push(m);
  }
  return [...buckets.values()];
}

export default function App() {
  const { theme, toggle } = useTheme();
  const { lang, toggle: toggleLang, t } = useI18n();
  const { loading, error, snapshot, teams, matches, standings, thirdPlace, stadiums, stadiumList, lineups, rosters, wiki, refresh } =
    useWorldCup();
  const { toggle: toggleFav, clear: clearFav, isFavorite, favorites } = useFavorites();
  const { toggleMatch, isFavoriteMatch, favoriteMatches } = useFavoriteMatches();
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(location.search).get("tab");
    return t === "groups" || t === "bracket" || t === "schedule" || t === "stadiums" || t === "teams" ? t : "schedule";
  });
  const [phase, setPhase] = useState<Phase>(() => {
    const p = new URLSearchParams(location.search).get("phase");
    return p === "fav" || p === "favmatch" ? p : "all";
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = new URLSearchParams(location.search).get("by");
    return v === "calendar" ? "calendar" : "all";
  });
  const [dateKey, setDateKey] = useState(() => {
    const d = new URLSearchParams(location.search).get("date");
    return d && d !== "all" && d !== "today" ? d : "";
  });
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [scheduleView, setScheduleView] = useState<"table" | "grid">(() => {
    const v = new URLSearchParams(location.search).get("view");
    return v === "grid" ? "grid" : "table";
  });
  // Calendar collapses once a day is chosen; a summary chip reopens it.
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Deep-link: persist tab + filters in the URL so shared links restore state.
  useEffect(() => {
    const u = new URL(location.href);
    u.searchParams.set("tab", tab);
    if (tab === "schedule" && phase !== "all") u.searchParams.set("phase", phase);
    else u.searchParams.delete("phase");
    if (tab === "schedule" && phase === "all" && viewMode === "calendar") u.searchParams.set("by", "calendar");
    else u.searchParams.delete("by");
    if (tab === "schedule" && phase === "all" && viewMode === "calendar" && dateKey) u.searchParams.set("date", dateKey);
    else u.searchParams.delete("date");
    if (tab === "schedule" && phase !== "fav" && scheduleView === "grid") u.searchParams.set("view", "grid");
    else u.searchParams.delete("view");
    history.replaceState(null, "", u);
  }, [tab, phase, viewMode, dateKey, scheduleView]);

  // Per-tab <title> + meta description so each view targets its own keywords
  // and shared deep-links read correctly in search results / link previews.
  useEffect(() => {
    const seo: Record<Tab, { vi: { t: string; d: string }; en: { t: string; d: string } }> = {
      schedule: {
        vi: { t: "Lịch thi đấu World Cup 2026 | 104 trận, giờ Việt Nam", d: "Lịch thi đấu FIFA World Cup 2026 đầy đủ 104 trận theo giờ Việt Nam, tự cập nhật tỉ số trực tiếp, đội hình ra sân và người ghi bàn." },
        en: { t: "World Cup 2026 Schedule | All 104 Matches, Local Time", d: "Full FIFA World Cup 2026 fixture list, all 104 matches in your local time with live scores, lineups and goalscorers updating automatically." },
      },
      groups: {
        vi: { t: "Bảng xếp hạng World Cup 2026 | 12 bảng đấu", d: "Bảng xếp hạng FIFA World Cup 2026 đầy đủ 12 bảng, tự tính theo luật FIFA: điểm, hiệu số, bàn thắng, đối đầu. Cập nhật theo tỉ số trực tiếp." },
        en: { t: "World Cup 2026 Standings | All 12 Groups", d: "Live FIFA World Cup 2026 group standings for all 12 groups, computed by FIFA rules: points, goal difference, goals for and head-to-head." },
      },
      bracket: {
        vi: { t: "Sơ đồ knockout World Cup 2026 | Vòng loại trực tiếp", d: "Sơ đồ vòng loại trực tiếp FIFA World Cup 2026: vòng 1/16, 1/8, tứ kết, bán kết, chung kết. Cập nhật theo kết quả thực tế." },
        en: { t: "World Cup 2026 Bracket | Knockout Stage", d: "FIFA World Cup 2026 knockout bracket: round of 32, round of 16, quarter-finals, semi-finals and final, updating with real results." },
      },
      stadiums: {
        vi: { t: "Sân vận động World Cup 2026 | 16 sân chủ nhà", d: "Danh sách 16 sân vận động đăng cai FIFA World Cup 2026 tại Mỹ, Canada và Mexico cùng các trận đấu diễn ra tại từng sân." },
        en: { t: "World Cup 2026 Stadiums | 16 Host Venues", d: "All 16 host stadiums of FIFA World Cup 2026 across the USA, Canada and Mexico, with the matches played at each venue." },
      },
      teams: {
        vi: { t: "Đội tuyển World Cup 2026 | 48 đội", d: "Danh sách 48 đội tuyển dự FIFA World Cup 2026, hạng FIFA, bảng đấu, đội hình đăng ký và lịch thi đấu của từng đội." },
        en: { t: "World Cup 2026 Teams | All 48 Nations", d: "All 48 nations at FIFA World Cup 2026 with FIFA ranking, group, registered squad and each team's fixtures." },
      },
    };
    const meta = seo[tab][lang];
    document.title = meta.t;
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta.d);
    document.documentElement.lang = lang;
  }, [tab, lang]);

  const todayKey = vnDayKey(new Date());

  const phaseFiltered = useMemo(() => {
    return matches.filter((m) => {
      if (phase === "favmatch") return isFavoriteMatch(m.id);
      if (phase === "fav") return isFavorite(m.homeId) || isFavorite(m.awayId);
      return true;
    });
  }, [matches, phase, isFavorite, isFavoriteMatch]);

  const dateOptions = useMemo(() => groupByVnDay(phaseFiltered, lang), [phaseFiltered, lang]);

  // Match-day metadata for the calendar picker.
  const matchDayKeys = useMemo(() => new Set(dateOptions.map((day) => day.key).filter((k) => k !== "tbd")), [dateOptions]);
  const matchDayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of dateOptions) if (day.key !== "tbd") map.set(day.key, day.matches.length);
    return map;
  }, [dateOptions]);

  const calendarActive = phase === "all" && viewMode === "calendar";
  const activeDateKey = calendarActive && dateKey && matchDayKeys.has(dateKey) ? dateKey : "";

  // "Today" rarely lands on a match day (rest days, pre-tournament). Default the
  // day view to today if it has matches, otherwise the next upcoming match day,
  // otherwise the first match day — never an empty screen.
  const defaultDateKey = useMemo(() => {
    if (matchDayKeys.has(todayKey)) return todayKey;
    const sorted = [...matchDayKeys].sort();
    return sorted.find((k) => k >= todayKey) ?? sorted[sorted.length - 1] ?? "";
  }, [matchDayKeys, todayKey]);

  const filtered = useMemo(() => {
    if (!calendarActive || !activeDateKey) return phaseFiltered;
    return phaseFiltered.filter((m) => (m.kickoff ? vnDayKey(m.kickoff) : "tbd") === activeDateKey);
  }, [phaseFiltered, calendarActive, activeDateKey]);

  const days = useMemo(() => groupByVnDay(filtered, lang), [filtered, lang]);

  // Next match: prefer a saved match, then a favorite team's match, then next overall.
  const nextMatchInfo = useMemo(() => {
    const upcoming = matches.filter((m) => m.status !== "finished");
    const savedNext = upcoming.find((m) => isFavoriteMatch(m.id));
    if (savedNext) return { match: savedNext, fav: true };
    const favTeamNext = upcoming.find((m) => isFavorite(m.homeId) || isFavorite(m.awayId));
    if (favTeamNext) return { match: favTeamNext, fav: true };
    return { match: upcoming[0] ?? null, fav: false };
  }, [matches, isFavorite, isFavoriteMatch]);
  const nextMatch = nextMatchInfo.match;

  // Skip the match already shown in the hero countdown to avoid duplication.
  const nextMatches = useMemo(
    () => matches.filter((m) => m.status !== "finished" && m.id !== nextMatch?.id).slice(0, 6),
    [matches, nextMatch]
  );

  // The modal holds the match captured at click time; re-resolve it against the
  // freshly synced `matches` so an open detail view shows live score/status.
  const liveSelectedMatch = useMemo(
    () => (selectedMatch ? matches.find((m) => m.id === selectedMatch.id) ?? selectedMatch : null),
    [selectedMatch, matches]
  );

  const synced = snapshot
    ? new Date(snapshot.syncedAt).toLocaleTimeString("vi-VN", {
        timeZone: USER_TZ,
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="relative min-h-[100dvh]">
      {/* ---- ONE fixed photo behind the whole app — there is only this single image
          crop anywhere, so two crops can never meet = no seam. Everything else is
          translucent liquid glass scrolling over it. A bottom gradient melts the
          photo into the page bg so the lower page reads as solid theme colour. */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        {/* mobile: dedicated vertical crop. desktop: wide opening-ceremony shot. */}
        <img src="assets/hero-mobile-v1.webp" alt="" className="absolute inset-0 size-full object-cover object-top blur-[2px] sm:hidden" />
        <img src="assets/hero-v3.webp" alt="" className="absolute inset-0 hidden size-full object-cover object-top sm:block" />
        {/* Flat-capped veil: opacity rises gently top->bottom but NEVER reaches fully
            opaque, so the photo is always faintly present everywhere. With no opaque
            stop there is no fixed-position boundary = no seam, ever. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              theme === "dark"
                ? "rgba(12,15,13,0.28)"
                : "rgba(247,248,247,0.28)",
          }}
        />
        {/* extra veil on mobile only — small screens read text over the photo more,
            so darken/lighten a touch more there for legibility */}
        <div
          className="absolute inset-0 sm:hidden"
          style={{
            background:
              theme === "dark"
                ? "rgba(12,15,13,0.36)"
                : "rgba(247,248,247,0.38)",
          }}
        />
      </div>

      {/* ---- Hero ---- */}
      <header className="relative flex min-h-[460px] flex-col sm:min-h-[560px]">
        {/* No scrim layer at all — the fixed backdrop shows through and text legibility
            comes purely from per-element text-shadows. Any box-shaped scrim clipped by
            the hero was creating the horizontal seam + the soft dark blob, so it's gone. */}
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-10 pt-6 sm:pt-8">
          <nav className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-tight text-white">WC26 · meowbiter</span>
          </nav>

          <div className="flex flex-col gap-7 pt-6 sm:flex-row sm:items-end sm:justify-between sm:pt-10">
            <div className="max-w-xl">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                {t("heroBadge")}
              </span>
              <h1 className="mt-4 text-4xl font-black leading-[1.16] tracking-[-0.035em] text-white sm:text-6xl" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.55), 0 4px 28px rgba(0,0,0,0.5)" }}>
                {t("heroTitle")}
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/95" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6), 0 2px 14px rgba(0,0,0,0.55)" }}>
                {t("heroSub")}
              </p>
            </div>
            {!loading && !error && nextMatch && <Countdown match={nextMatch} favorite={nextMatchInfo.fav} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-44 sm:pb-20">
        {/* ---- Next up rail ---- */}
        {!loading && !error && nextMatches.length > 0 && (
          <section className="mb-8 pt-2">
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text)" }}>
              <span className="inline-block h-3.5 w-1 rounded-full" style={{ background: "var(--accent)" }} />
              {t("nextUp")}
            </h2>
            <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 pt-1 sm:mx-0 sm:grid sm:gap-3 sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-1 md:grid-cols-3">
              {nextMatches.map((m) => (
                <div key={m.id} className="w-[calc(100vw-2rem)] shrink-0 snap-start sm:w-auto sm:shrink sm:snap-align-none">
                  <MatchCard match={m} stadium={stadiums.get(m.stadiumId)} isFavorite={isFavorite} isFavoriteMatch={isFavoriteMatch} onToggleFavoriteMatch={toggleMatch} onOpen={setSelectedMatch} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---- Primary nav (segmented pills) — tabs only, one clean row ---- */}
        <div className="sticky top-0 z-10 -mx-4 mb-6 hidden px-4 py-2.5 sm:block">
          <nav className="glass glass-edge no-scrollbar flex gap-1 overflow-x-auto rounded-full p-1" aria-label={t("mainNav")}>
            {([["schedule", t("tabSchedule")], ["groups", t("tabStandings")], ["bracket", t("tabBracket")], ["stadiums", t("tabStadiums")], ["teams", t("tabTeams")]] as const).map(
              ([key, label]) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    aria-current={active ? "page" : undefined}
                    className="flex-1 shrink-0 rounded-full px-4 py-1.5 text-[13.5px] tracking-tight transition-colors"
                    style={{
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "var(--accent-contrast)" : "var(--text-muted)",
                      fontWeight: active ? 800 : 600,
                    }}
                  >
                    {label}
                  </button>
                );
              }
            )}
          </nav>
        </div>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={refresh} />}

        {!loading && !error && tab === "schedule" && (
          <>
            {/* one cohesive toolbar: left = view + favorites in a single track,
                right = table/grid + ics. No more scattered far-apart clusters. */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="glass glass-edge inline-flex shrink-0 items-center gap-0.5 rounded-full p-1">
                <div role="tablist" aria-label={t("scheduleViewLabel")} className="inline-flex gap-0.5">
                  {([
                    ["all", t("allMatches")],
                    ["calendar", t("byDate")],
                  ] as const).map(([key, label]) => {
                    const active = phase === "all" && viewMode === key;
                    return (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setPhase("all");
                          setViewMode(key);
                          if (key === "calendar") {
                            setDateKey(defaultDateKey);
                            setCalendarOpen(false);
                          }
                        }}
                        className="shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-colors"
                        style={{
                          background: active ? "var(--accent)" : "transparent",
                          color: active ? "var(--accent-contrast)" : "var(--text-muted)",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <span className="mx-0.5 h-5 w-px" style={{ background: "var(--border)" }} aria-hidden />
                <div role="tablist" aria-label={t("favoritesLabel")} className="inline-flex gap-0.5">
                  {([
                    ["favmatch", t("favMatches"), "★", favoriteMatches.size],
                    ["fav", t("favTeams"), "♥", favorites.size],
                  ] as const).map(([key, label, glyph, count]) => {
                    const active = phase === key;
                    return (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={active}
                        onClick={() => setPhase(active ? "all" : key)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors"
                        style={{
                          background: active ? "var(--accent)" : "transparent",
                          color: active ? "var(--accent-contrast)" : "var(--text-muted)",
                        }}
                      >
                        <span style={{ color: active ? "var(--accent-contrast)" : "var(--accent)" }}>{glyph}</span>
                        {label}
                        {count > 0 && (
                          <span
                            className="grid min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-extrabold"
                            style={{
                              background: active ? "var(--accent-contrast)" : "var(--accent)",
                              color: active ? "var(--accent)" : "var(--accent-contrast)",
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* table/grid + ics — only when showing the list */}
              {phase === "all" && (
                <div className="glass glass-edge inline-flex shrink-0 items-center gap-0.5 rounded-full p-1">
                  <div role="tablist" aria-label={t("scheduleViewLabel")} className="inline-flex gap-0.5">
                    {([["table", t("viewTable")], ["grid", t("viewGrid")]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={scheduleView === key}
                        onClick={() => setScheduleView(key)}
                        className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
                        style={{
                          background: scheduleView === key ? "var(--accent)" : "transparent",
                          color: scheduleView === key ? "var(--accent-contrast)" : "var(--text-muted)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="mx-0.5 h-5 w-px" style={{ background: "var(--border)" }} aria-hidden />
                  <button
                    onClick={() => downloadIcs(phaseFiltered, stadiums, "wc26-lich-thi-dau.ics")}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors"
                    style={{ color: "var(--text)" }}
                    title={t("downloadIcsTitle")}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 4 5-4M5 21h14" /></svg>
                    {t("downloadIcs")}
                  </button>
                </div>
              )}
            </div>

            {phase === "fav" ? (
              <FavoritesView
                favorites={favorites}
                teams={teams}
                matches={matches}
                stadiums={stadiums}
                onOpenTeam={setSelectedTeamId}
                onOpenMatch={setSelectedMatch}
                onToggleFavorite={toggleFav}
                onManage={() => setManageOpen(true)}
              />
            ) : (
              <>
                {calendarActive && (calendarOpen ? (
                  <div className="mb-6 mx-auto max-w-xs lg:mx-0">
                    <MatchCalendar
                      matchDays={matchDayKeys}
                      counts={matchDayCounts}
                      selected={activeDateKey}
                      todayKey={todayKey}
                      onSelect={(key) => {
                        setDateKey(key);
                        setCalendarOpen(false);
                      }}
                    />
                    {activeDateKey && (
                      <button
                        type="button"
                        onClick={() => setCalendarOpen(false)}
                        className="mt-2 w-full rounded-full px-3 py-2 text-[12px] font-bold transition-colors"
                        style={{ background: "var(--bg-sunken)", color: "var(--text-muted)", boxShadow: "0 0 0 1px var(--border)" }}
                      >
                        Đóng lịch
                      </button>
                    )}
                  </div>
                ) : (
                  // collapsed: compact summary chip — tap to reopen the calendar
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(true)}
                    className="mb-6 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-3 text-left transition-transform active:scale-[0.99]"
                    style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-extrabold capitalize" style={{ color: "var(--text)" }}>
                          {activeDateKey ? days[0]?.label ?? t("pickDate") : t("allDates")}
                        </span>
                        <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {activeDateKey
                            ? (lang === "vi"
                                ? `${filtered.length} trận${activeDateKey === todayKey ? " hôm nay" : ""} · bấm để chọn ngày khác`
                                : `${filtered.length} matches${activeDateKey === todayKey ? " today" : ""} · tap to change date`)
                            : t("tapPickCalendar")}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {activeDateKey && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={t("showAllDates")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDateKey("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              setDateKey("");
                            }
                          }}
                          className="grid size-7 place-items-center rounded-full"
                          style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </span>
                      )}
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                    </span>
                  </button>
                ))}

                {days.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>{t("noMatchesDay")}</p>
                ) : scheduleView === "table" ? (
                  <ScheduleTable
                    days={days}
                    isFavorite={isFavorite}
                    isFavoriteMatch={isFavoriteMatch}
                    onToggleFavoriteMatch={toggleMatch}
                    onOpen={setSelectedMatch}
                    onSelectDay={(key) => {
                      setPhase("all");
                      setViewMode("calendar");
                      setDateKey(key);
                      setCalendarOpen(false);
                    }}
                  />
                ) : (
                  <div className="space-y-8">
                    {days.map((d) => (
                      <section key={d.key}>
                        <h3 className="mb-3 text-[13px] font-bold capitalize" style={{ color: "var(--accent)" }}>
                          {d.label}
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {d.matches.map((m) => (
                            <MatchCard key={m.id} match={m} stadium={stadiums.get(m.stadiumId)} isFavorite={isFavorite} isFavoriteMatch={isFavoriteMatch} onToggleFavoriteMatch={toggleMatch} onOpen={setSelectedMatch} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!loading && !error && tab === "groups" && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {standings.map((g) => (
                <GroupTable key={g.name} group={g} onTeamOpen={setSelectedTeamId} />
              ))}
            </div>
            <div className="md:max-w-md">
              <ThirdPlaceTable rows={thirdPlace} onTeamOpen={setSelectedTeamId} />
            </div>
          </div>
        )}

        {!loading && !error && tab === "bracket" && (
          <Suspense fallback={<LazyFallback />}>
            <Bracket matches={matches.filter((m) => m.type !== "group")} />
          </Suspense>
        )}

        {!loading && !error && tab === "stadiums" && (
          <Suspense fallback={<LazyFallback />}>
            <StadiumsView stadiums={stadiumList} matches={matches} stadiumNames={stadiums} />
          </Suspense>
        )}

        {!loading && !error && tab === "teams" && (
          <Suspense fallback={<LazyFallback />}>
            <TeamsView
              teams={[...teams.values()]}
              wiki={wiki}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFav}
              onOpenTeam={setSelectedTeamId}
            />
          </Suspense>
        )}
      </main>

      <BottomNav tab={tab} setTab={setTab} />

      {liveSelectedMatch && (
        <Suspense fallback={null}>
          <MatchDetail
            match={liveSelectedMatch}
            stadium={stadiums.get(liveSelectedMatch.stadiumId)}
            lineup={lineups.get(liveSelectedMatch.id)}
            homeRoster={liveSelectedMatch.homeId ? rosters.get(liveSelectedMatch.homeId) : undefined}
            awayRoster={liveSelectedMatch.awayId ? rosters.get(liveSelectedMatch.awayId) : undefined}
            onClose={() => setSelectedMatch(null)}
            onOpenTeam={(teamId) => {
              setSelectedTeamId(teamId);
            }}
          />
        </Suspense>
      )}

      {selectedTeamId && teams.get(selectedTeamId) && (
        <Suspense fallback={null}>
          <TeamDetail
            team={teams.get(selectedTeamId)!}
            roster={rosters.get(selectedTeamId)}
            wiki={wiki.get(selectedTeamId)}
            standing={standings.flatMap((group) => group.rows).find((row) => row.team.id === selectedTeamId)}
            matches={matches}
            stadiums={stadiums}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFav}
            onClose={() => setSelectedTeamId(null)}
            onOpenMatch={(match) => {
              setSelectedTeamId(null);
              setSelectedMatch(match);
            }}
          />
        </Suspense>
      )}

      {manageOpen && (
        <Suspense fallback={null}>
          <ManageTeamsModal
            teams={teams}
            favorites={favorites}
            onToggle={toggleFav}
            onClear={clearFav}
            onClose={() => setManageOpen(false)}
          />
        </Suspense>
      )}

      {/* Floating controls — language + theme, pinned bottom-right, scroll along.
          Lifted above the mobile BottomNav so they never overlap. */}
      <div className="fixed right-3 top-3 z-40 flex items-center gap-2 sm:bottom-5 sm:right-4 sm:top-auto">
        <button
          onClick={refresh}
          aria-label={t("refresh")}
          title={synced ? `${t("syncedAt")} ${synced}` : t("refresh")}
          className="flex h-9 items-center gap-1.5 rounded-full px-3 transition-transform active:scale-95"
          style={{ background: "var(--bg-elev)", color: "var(--text-muted)", boxShadow: "0 0 0 1px var(--border), 0 10px 28px rgba(0,0,0,.22)" }}
        >
          <RefreshIcon />
          {synced && <span className="tabular-nums text-[11px] font-bold" style={{ color: "var(--text)" }}>{synced}</span>}
        </button>
        <div
          className="flex items-center gap-0.5 rounded-full p-1"
          role="group"
          aria-label={t("langToggle")}
          style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border), 0 10px 28px rgba(0,0,0,.22)" }}
        >
          {(["vi", "en"] as const).map((l) => {
            const active = lang === l;
            return (
              <button
                key={l}
                onClick={() => { if (!active) toggleLang(); }}
                aria-pressed={active}
                className="rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide transition-colors"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-contrast)" : "var(--text-muted)",
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
        <button
          onClick={toggle}
          aria-label={t("themeToggle")}
          className="grid size-9 place-items-center rounded-full transition-transform active:scale-95"
          style={{ background: "var(--bg-elev)", color: "var(--text)", boxShadow: "0 0 0 1px var(--border), 0 10px 28px rgba(0,0,0,.22)" }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <footer className="mx-auto max-w-6xl px-4 pb-24 text-[11px] sm:pb-10" style={{ color: "var(--text)" }}>
        {t("footerData")} · {lang === "vi" ? `Giờ hiển thị theo múi giờ của bạn (${TZ_LABEL})` : `Times shown in your time zone (${TZ_LABEL})`} · {t("footerRules")}
      </footer>
    </div>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const { t } = useI18n();
  const items: { key: Tab; labelKey: DictKey; shortKey: DictKey }[] = [
    { key: "schedule", labelKey: "tabSchedule", shortKey: "navScheduleShort" },
    { key: "groups", labelKey: "tabStandings", shortKey: "navStandingsShort" },
    { key: "bracket", labelKey: "tabBracket", shortKey: "navBracketShort" },
    { key: "stadiums", labelKey: "tabStadiums", shortKey: "navStadiumsShort" },
    { key: "teams", labelKey: "tabTeams", shortKey: "navTeamsShort" },
  ];

  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 rounded-[26px] p-1.5 shadow-2xl sm:hidden"
      aria-label={t("mainNav")}
      style={{ background: "color-mix(in srgb, var(--bg-elev) 90%, transparent)", backdropFilter: "blur(16px)", boxShadow: "0 0 0 1px var(--border), 0 18px 50px rgba(0,0,0,.28)" }}
    >
      <div className="grid grid-cols-5 gap-0.5">
        {items.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className="relative rounded-[20px] px-1 py-2 text-[11px] font-extrabold leading-none tracking-tight transition-colors"
              aria-label={t(item.labelKey)}
              aria-current={active ? "page" : undefined}
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent-contrast)" : "var(--text-muted)",
              }}
            >
              <span className="block truncate">{t(item.shortKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function LazyFallback() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="size-7 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: "var(--accent)", opacity: 0.6 }} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[116px] rounded-[var(--radius-card)] animate-pulse-soft"
          style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] p-5"
      style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
    >
      <p className="font-semibold">{t("errorTitle")}</p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{message}</p>
      <button
        onClick={onRetry}
        className="rounded-full px-4 py-1.5 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      >
        {t("retry")}
      </button>
    </div>
  );
}
