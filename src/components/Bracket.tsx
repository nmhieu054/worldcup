import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { KNOCKOUT_ORDER, type KnockoutType, type Match } from "../lib/types";
import { VN_DATETIME } from "../lib/timezone";
import { useI18n, knockoutLabel, matchSideLabel, type Lang } from "../lib/i18n";

function Slot({
  name,
  flag,
  code,
  score,
  win,
  decided,
}: {
  name: string;
  flag?: string;
  code?: string;
  score: number | null;
  win: boolean;
  decided: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ opacity: decided ? 1 : 0.92 }}>
      {flag ? (
        <img src={flag} alt={code} loading="lazy" className="size-5 rounded-[4px] object-cover" style={{ boxShadow: "0 0 0 1px var(--border)" }} />
      ) : (
        <span className="size-5 rounded-[4px]" style={{ background: "var(--bg-sunken)" }} />
      )}
      <span className="flex-1 truncate text-[12px]" style={{ fontWeight: win ? 700 : 500, color: flag ? "var(--text)" : "var(--text-muted)" }}>
        {name}
      </span>
      {score !== null && (
        <span className="tabular-nums text-[13px] font-bold" style={{ color: win ? "var(--accent)" : "var(--text)" }}>
          {score}
        </span>
      )}
    </div>
  );
}

function TieCard({ match, title, fullWidth, cardRef, lang }: { match: Match; title?: string; fullWidth?: boolean; cardRef?: (el: HTMLDivElement | null) => void; lang: Lang }) {
  const decided = !!(match.homeTeam && match.awayTeam);
  const homeWin = match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
  const awayWin = match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;
  const live = match.status === "live";
  return (
    <div className={fullWidth ? "w-full" : "w-[212px] shrink-0"}>
      {title && (
        <p className="mb-1.5">
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
          >
            {title}
          </span>
        </p>
      )}
      <div
        ref={cardRef}
        className="overflow-hidden rounded-[12px]"
        style={{ background: "var(--bg-elev-solid)", boxShadow: live ? "0 0 0 1.5px var(--accent)" : "0 0 0 1px var(--border)" }}
      >
        <Slot name={matchSideLabel(match, "home", lang)} flag={match.homeTeam?.flag} code={match.homeTeam?.code} score={match.homeScore} win={homeWin} decided={decided} />
        <div style={{ borderTop: "1px solid var(--border)" }} />
        <Slot name={matchSideLabel(match, "away", lang)} flag={match.awayTeam?.flag} code={match.awayTeam?.code} score={match.awayScore} win={awayWin} decided={decided} />
        <div className="flex items-center justify-between gap-2 px-2.5 py-1 text-[9.5px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
          <span>{match.kickoff ? VN_DATETIME.format(match.kickoff) : "TBD"}</span>
          {live && <span className="font-extrabold" style={{ color: "var(--accent)" }}>LIVE</span>}
        </div>
      </div>
    </div>
  );
}

type Round = { type: KnockoutType; label: string; ties: Match[] };

/** Title shown above each box: "Bán kết 1", "Chung kết"… */
function tieTitle(round: Round, i: number) {
  return round.ties.length === 1 ? round.label : `${round.label} ${i + 1}`;
}

function DesktopBracket({ rounds, lang }: { rounds: Round[]; lang: Lang }) {
  const { t } = useI18n();
  const dragHint = t("dragHint");
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [lines, setLines] = useState<string[]>([]);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [edges, setEdges] = useState({ left: false, right: false });
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  const updateEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  // Draw connectors from the measured position of each box.
  const recompute = useCallback(() => {
    const root = content.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    setDims({ w: root.scrollWidth, h: root.scrollHeight });
    const paths: string[] = [];
    for (let ri = 0; ri < rounds.length - 1; ri++) {
      const next = rounds[ri + 1];
      for (let j = 0; j < next.ties.length; j++) {
        const target = cards.current.get(`${ri + 1}-${j}`);
        const top = cards.current.get(`${ri}-${j * 2}`);
        const bot = cards.current.get(`${ri}-${j * 2 + 1}`);
        if (!target || !top || !bot) continue;
        const tr = target.getBoundingClientRect();
        const tx = tr.left - base.left;
        const ty = tr.top - base.top + tr.height / 2;
        for (const feeder of [top, bot]) {
          const fr = feeder.getBoundingClientRect();
          const fx = fr.right - base.left;
          const fy = fr.top - base.top + fr.height / 2;
          const midX = (fx + tx) / 2;
          paths.push(`M ${fx} ${fy} H ${midX} V ${ty} H ${tx}`);
        }
      }
    }
    setLines(paths);
  }, [rounds]);

  useLayoutEffect(() => {
    recompute();
    updateEdges();
  }, [recompute, updateEdges]);

  useEffect(() => {
    const root = content.current;
    if (!root) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(root);
    const onResize = () => {
      recompute();
      updateEdges();
    };
    window.addEventListener("resize", onResize);
    const t = setTimeout(recompute, 120); // after webfont swap
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [recompute, updateEdges]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scroller.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = scroller.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-10 transition-opacity" style={{ background: "linear-gradient(90deg, var(--bg), transparent)", opacity: edges.left ? 1 : 0 }} aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 transition-opacity" style={{ background: "linear-gradient(270deg, var(--bg), transparent)", opacity: edges.right ? 1 : 0 }} aria-hidden />
      {edges.right && (
        <span className="pointer-events-none absolute right-2 top-2 z-30 rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-contrast)" }} aria-hidden>
          {dragHint}
        </span>
      )}

      <div
        ref={scroller}
        onScroll={updateEdges}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="overflow-x-auto pb-3"
        style={{ cursor: "grab", scrollbarWidth: "thin", touchAction: "pan-x" }}
      >
        <div ref={content} className="relative flex gap-12" style={{ minWidth: "max-content" }}>
          {/* connector layer */}
          <svg className="pointer-events-none absolute inset-0 z-0" width={dims.w} height={dims.h} fill="none" aria-hidden>
            {lines.map((d, i) => (
              <path key={i} d={d} stroke="var(--text-muted)" strokeWidth={2} strokeOpacity={0.55} strokeLinejoin="round" />
            ))}
          </svg>

          {rounds.map((round, ri) => (
            <section key={round.type} className="relative z-10 flex flex-col">
              <div className="flex flex-1 flex-col">
                {round.ties.map((t, i) => (
                  <div key={t.id} className="flex flex-1 flex-col justify-center">
                    <TieCard
                      match={t}
                      title={tieTitle(round, i)}
                      lang={lang}
                      cardRef={(el) => {
                        if (el) cards.current.set(`${ri}-${i}`, el);
                        else cards.current.delete(`${ri}-${i}`);
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileBracket({ rounds, third, lang }: { rounds: Round[]; third?: Match; lang: Lang }) {
  const { t } = useI18n();
  const tabs: { key: string; label: string; ties: Match[] }[] = [
    ...rounds.map((r) => ({ key: r.type, label: r.label, ties: r.ties })),
    ...(third ? [{ key: "third", label: knockoutLabel("third", lang), ties: [third] }] : []),
  ];

  const defaultKey = tabs.find((t) => t.ties.some((m) => m.status !== "finished"))?.key ?? tabs[0]?.key ?? "";
  const [active, setActive] = useState(defaultKey);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
            style={{
              background: active === t.key ? "var(--accent)" : "var(--bg-elev-solid)",
              color: active === t.key ? "var(--accent-contrast)" : "var(--text)",
              boxShadow: active === t.key ? "0 0 0 1.5px var(--accent)" : "0 0 0 1px var(--border)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {current && current.ties.length > 0 ? (
        <div className="grid gap-3">
          {current.ties.map((m, i) => (
            <TieCard
              key={m.id}
              match={m}
              lang={lang}
              title={current.ties.length > 1 ? `${current.label} ${i + 1}` : current.label}
              fullWidth
            />
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("noTies")}</p>
      )}
    </div>
  );
}

export function Bracket({ matches }: { matches: Match[] }) {
  const { lang } = useI18n();
  const rounds: Round[] = KNOCKOUT_ORDER.filter((r) => r !== "third")
    .map((type) => ({ type, label: knockoutLabel(type, lang), ties: matches.filter((m) => m.type === type) }))
    .filter((r) => r.ties.length > 0);
  const third = matches.find((m) => m.type === "third");

  return (
    <>
      <div className="sm:hidden">
        <MobileBracket rounds={rounds} third={third} lang={lang} />
      </div>

      <div className="hidden sm:block">
        <div className="space-y-4">
          <DesktopBracket rounds={rounds} lang={lang} />
          {third && (
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide" style={{ background: "var(--accent)", color: "var(--accent-contrast)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
                {knockoutLabel("third", lang)}
              </span>
              <TieCard match={third} title={knockoutLabel("third", lang)} lang={lang} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
