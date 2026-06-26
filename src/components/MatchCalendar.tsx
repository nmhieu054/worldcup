import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";

const WEEKDAYS = {
  vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dayKey(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function parseKey(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return { y, m: m - 1, d };
}

/**
 * Month-grid date picker. Only days that actually host matches are selectable;
 * every match day gets a dot marker. Navigation is clamped to the tournament span.
 */
export function MatchCalendar({
  matchDays,
  counts,
  selected,
  todayKey,
  onSelect,
}: {
  matchDays: Set<string>;
  counts: Map<string, number>;
  selected: string;
  todayKey: string;
  onSelect: (key: string) => void;
}) {
  const { lang, t } = useI18n();
  const sorted = useMemo(() => [...matchDays].sort(), [matchDays]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const anchor = selected || first || todayKey;
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? parseKey(anchor) : { y: new Date().getFullYear(), m: 0, d: 1 };

  const [cursor, setCursor] = useState({ y: initial.y, m: initial.m });

  // Follow the selection into its month when it changes from outside.
  useEffect(() => {
    if (selected && /^\d{4}-\d{2}-\d{2}$/.test(selected)) {
      const p = parseKey(selected);
      setCursor({ y: p.y, m: p.m });
    }
  }, [selected]);

  const minIndex = first ? Number(first.slice(0, 4)) * 12 + (Number(first.slice(5, 7)) - 1) : -Infinity;
  const maxIndex = last ? Number(last.slice(0, 4)) * 12 + (Number(last.slice(5, 7)) - 1) : Infinity;
  const monthIndex = cursor.y * 12 + cursor.m;

  const cells = useMemo(() => {
    const firstDow = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [cursor]);

  const step = (dir: number) => {
    const idx = monthIndex + dir;
    if (idx < minIndex || idx > maxIndex) return;
    setCursor({ y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 });
  };

  return (
    <div
      className="rounded-[var(--radius-card)] p-2.5"
      style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={monthIndex <= minIndex}
          aria-label={t("prevMonth")}
          className="grid size-7 place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-30"
          style={{ background: "var(--bg-sunken)", color: "var(--text-muted)", boxShadow: "0 0 0 1px var(--border)" }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="text-[13px] font-extrabold capitalize" style={{ color: "var(--text)" }}>
          {new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-GB", { month: "long", year: "numeric" }).format(new Date(cursor.y, cursor.m, 1))}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={monthIndex >= maxIndex}
          aria-label={t("nextMonth")}
          className="grid size-7 place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-30"
          style={{ background: "var(--bg-sunken)", color: "var(--text-muted)", boxShadow: "0 0 0 1px var(--border)" }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEKDAYS[lang].map((w) => (
          <span key={w} className="text-center text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />;
          const key = dayKey(cursor.y, cursor.m, d);
          const has = matchDays.has(key);
          const isSel = key === selected;
          const isToday = key === todayKey;
          const n = counts.get(key) ?? 0;
          return (
            <button
              key={key}
              type="button"
              disabled={!has}
              onClick={() => has && onSelect(key)}
              title={has ? `${n} ${t("matchesWord")}` : undefined}
              aria-current={isSel ? "date" : undefined}
              className="relative grid h-8 place-items-center rounded-[9px] text-[12px] font-bold transition-colors disabled:cursor-default"
              style={{
                background: isSel ? "var(--accent)" : has ? "var(--bg-sunken)" : "transparent",
                color: isSel ? "var(--accent-contrast)" : has ? "var(--text)" : "var(--text-muted)",
                opacity: has ? 1 : 0.4,
                boxShadow: !isSel && isToday ? "inset 0 0 0 1.5px var(--accent)" : undefined,
              }}
            >
              {d}
              {has && (
                <span
                  className="absolute bottom-0.5 size-1 rounded-full"
                  style={{ background: isSel ? "var(--accent-contrast)" : "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          {t("matchDayLegend")}
        </span>
        <span className="font-semibold">World Cup 2026</span>
      </div>
    </div>
  );
}
