import { useEffect, useState } from "react";
import type { Match, Stadium } from "../lib/types";
import { MatchCard } from "./MatchCard";
import { useI18n, type DictKey, type Lang } from "../lib/i18n";

type TFn = (key: DictKey) => string;
const NUM_LOCALE: Record<Lang, string> = { vi: "vi-VN", en: "en-US" };

const TZ_LABEL: Record<string, string> = {
  "America/Mexico_City": "UTC-6",
  "America/Monterrey": "UTC-6",
  "America/Chicago": "UTC-5",
  "America/New_York": "UTC-4",
  "America/Toronto": "UTC-4",
  "America/Vancouver": "UTC-7",
  "America/Los_Angeles": "UTC-7",
};

const FLAG: Record<string, string> = {
  "United States": "https://flagcdn.com/w40/us.png",
  Canada: "https://flagcdn.com/w40/ca.png",
  Mexico: "https://flagcdn.com/w40/mx.png",
};

/** Local photo per stadium id (real photos pulled from Wikimedia). */
function stadiumImg(id: string) {
  return `assets/stadiums/${id}.webp`;
}

/** Schematic seating bowl — tiers scale with capacity. Illustrative, not a
 *  real seat map (no open data source per venue). */
function SeatingBowl({ capacity, t }: { capacity: number; t: TFn }) {
  // 2 tiers under ~45k, 3 under ~70k, 4 above.
  const tiers = capacity >= 70000 ? 4 : capacity >= 45000 ? 3 : 2;
  const rings = Array.from({ length: tiers });
  const cx = 200;
  const cy = 120;

  return (
    <svg viewBox="0 0 400 240" className="w-full" role="img" aria-label={t("seatingMap")}>
      {/* stand rings, outer → inner */}
      {rings.map((_, i) => {
        const t = i / tiers;
        const rx = 180 - t * 120;
        const ry = 96 - t * 64;
        const shade = 0.16 + i * (0.5 / tiers);
        return (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity={shade}
            strokeWidth={(180 - t * 120 - (180 - ((i + 1) / tiers) * 120)) || 14}
          />
        );
      })}
      {/* pitch */}
      <rect x={cx - 52} y={cy - 30} width={104} height={60} rx={6} fill="var(--accent)" fillOpacity={0.22} stroke="var(--accent)" strokeOpacity={0.7} />
      <line x1={cx} y1={cy - 30} x2={cx} y2={cy + 30} stroke="var(--accent)" strokeOpacity={0.7} />
      <circle cx={cx} cy={cy} r={9} fill="none" stroke="var(--accent)" strokeOpacity={0.7} />
      {/* tier labels */}
      {rings.map((_, i) => (
        <text
          key={i}
          x={cx}
          y={cy - 96 + i * (64 / tiers) + 10}
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill="var(--text-muted)"
        >
          {`${t("tier")} ${i + 1}`}
        </text>
      ))}
    </svg>
  );
}

function StadiumCard({ s, onOpen, t, lang }: { s: Stadium; onOpen: () => void; t: TFn; lang: Lang }) {
  const [imgOk, setImgOk] = useState(true);

  return (
    <button
      onClick={onOpen}
      className="group relative flex min-h-[150px] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-4 text-left transition-transform duration-200 active:scale-[0.99]"
      style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}
    >
      {imgOk && (
        <>
          <img
            src={stadiumImg(s.id)}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(8,12,10,0.15) 0%, rgba(8,12,10,0.55) 55%, rgba(8,12,10,0.9) 100%)" }}
          />
        </>
      )}

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-tight" style={{ color: imgOk ? "#fff" : "var(--text)" }}>
              {s.name}
            </h3>
            <p className="mt-0.5 truncate text-[12px]" style={{ color: imgOk ? "rgba(255,255,255,0.8)" : "var(--text-muted)" }}>
              {s.realName !== s.name ? s.realName : s.region}
            </p>
          </div>
          <img src={FLAG[s.country]} alt={s.country} className="mt-0.5 size-5 shrink-0 rounded-[3px] object-cover" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.4)" }} />
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px]" style={{ color: imgOk ? "rgba(255,255,255,0.85)" : "var(--text-muted)" }}>
          <span className="font-medium">{s.city}</span>
          <span
            className="rounded-full px-2 py-0.5 font-semibold"
            style={{ background: imgOk ? "rgba(255,255,255,0.18)" : "var(--bg-sunken)", backdropFilter: imgOk ? "blur(4px)" : undefined }}
          >
            {s.capacity.toLocaleString(NUM_LOCALE[lang])} {t("seatsWord")} · {s.matchCount} {t("matchesWord")}
          </span>
        </div>
      </div>
    </button>
  );
}

function Detail({
  s,
  matches,
  stadiums,
  onClose,
  t,
  lang,
}: {
  s: Stadium;
  matches: Match[];
  stadiums: Map<string, string>;
  onClose: () => void;
  t: TFn;
  lang: Lang;
}) {
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-[20px] sm:rounded-[20px]"
        style={{ background: "var(--bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* hero header with stadium photo fadeout */}
        <div className="relative">
          {imgOk && (
            <>
              <img
                src={stadiumImg(s.id)}
                alt={s.name}
                onError={() => setImgOk(false)}
                className="h-44 w-full object-cover sm:h-52"
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(8,12,10,0.1) 0%, rgba(8,12,10,0.4) 50%, var(--bg) 100%)" }}
              />
            </>
          )}

          <button
            onClick={onClose}
            aria-label={t("close")}
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-lg font-bold transition-transform active:scale-90"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff", backdropFilter: "blur(6px)" }}
          >
            ×
          </button>

          <div className={`px-5 ${imgOk ? "absolute inset-x-0 bottom-0 pb-3" : "pt-5"}`}>
            <h2 className="text-xl font-extrabold leading-tight" style={{ color: imgOk ? "#fff" : "var(--text)" }}>
              {s.name}
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: imgOk ? "rgba(255,255,255,0.85)" : "var(--text-muted)" }}>
              {s.realName !== s.name ? `${s.realName} · ` : ""}{s.city}, {s.country}
            </p>
          </div>
        </div>

        <div className="px-5 pt-4">
          <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <Chip>{s.capacity.toLocaleString(NUM_LOCALE[lang])} {t("seatsWord")}</Chip>
            <Chip>{s.matchCount} {t("matchesWord")}</Chip>
            <Chip>{t("localTime")} {TZ_LABEL[s.timezone] ?? ""}</Chip>
            <Chip>{s.region}</Chip>
          </div>
        </div>

        {/* seating schematic */}
        <div className="px-5 pt-5">
          <h3 className="mb-2 text-[13px] font-bold" style={{ color: "var(--text-muted)" }}>
            {t("seatingChart")}
          </h3>
          <div className="rounded-[14px] p-3" style={{ background: "var(--bg-elev)", boxShadow: "0 0 0 1px var(--border)" }}>
            <SeatingBowl capacity={s.capacity} t={t} />
            <p className="mt-1 text-center text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              {t("seatingDisclaimer")}
            </p>
          </div>
        </div>

        <div className="p-5">
          <h3 className="mb-3 text-[13px] font-bold" style={{ color: "var(--text-muted)" }}>
            {t("matchesHere")}
          </h3>
          {matches.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("noMatchesStadium")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} stadium={stadiums.get(m.stadiumId)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--bg-sunken)" }}>
      {children}
    </span>
  );
}

export function StadiumsView({
  stadiums,
  matches,
  stadiumNames,
}: {
  stadiums: Stadium[];
  matches: Match[];
  stadiumNames: Map<string, string>;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<Stadium | null>(null);
  const openMatches = open ? matches.filter((m) => m.stadiumId === open.id) : [];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stadiums.map((s) => (
          <StadiumCard key={s.id} s={s} onOpen={() => setOpen(s)} t={t} lang={lang} />
        ))}
      </div>
      {open && (
        <Detail s={open} matches={openMatches} stadiums={stadiumNames} onClose={() => setOpen(null)} t={t} lang={lang} />
      )}
    </>
  );
}
