import { KNOCKOUT_LABEL, type Match } from "./types";

/** Human round label: "Vòng bảng A" or knockout round name. */
export function roundLabel(match: Match): string {
  if (match.type === "group") return `Vòng bảng ${match.group?.toUpperCase() ?? ""}`.trim();
  return KNOCKOUT_LABEL[match.type] ?? "Vòng đấu";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ. */
function icsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape text per RFC 5545 (commas, semicolons, backslashes, newlines). */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold long lines to 75 octets per RFC 5545 (simple char-based approximation). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

/** Build an .ics calendar string for the given matches (kickoff known only). */
export function buildIcs(matches: Match[], stadiums: Map<string, string>): string {
  const now = icsUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//meowbiter//WC26//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Lịch thi đấu World Cup 2026",
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];

  for (const m of matches) {
    if (!m.kickoff) continue;
    const start = m.kickoff;
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // assume 2h
    const home = m.homeTeam?.name ?? m.homeLabel;
    const away = m.awayTeam?.name ?? m.awayLabel;
    const title = `${home} vs ${away}`;
    const venue = stadiums.get(m.stadiumId) ?? "";
    const desc = `${roundLabel(m)}${venue ? ` · ${venue}` : ""}`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:wc26-${m.id}@meowbiter`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsUtc(start)}`,
      `DTEND:${icsUtc(end)}`,
      fold(`SUMMARY:${esc(title)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      venue ? fold(`LOCATION:${esc(venue)}`) : "",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

/** Trigger a client-side download of the .ics file. */
export function downloadIcs(matches: Match[], stadiums: Map<string, string>, filename = "wc26-lich-thi-dau.ics") {
  const blob = new Blob([buildIcs(matches, stadiums)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
