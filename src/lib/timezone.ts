// WC26 venues span 5 North-American time zones. The upstream API only gives
// the *venue-local* wall-clock time, so to show Vietnam time correctly we map
// each stadium to its IANA zone, resolve the true UTC instant, then format in
// Asia/Ho_Chi_Minh.

export const STADIUM_TZ: Record<string, string> = {
  "1": "America/Mexico_City", // Mexico City
  "2": "America/Mexico_City", // Guadalajara
  "3": "America/Monterrey", // Monterrey
  "4": "America/Chicago", // Dallas (Arlington TX)
  "5": "America/Chicago", // Houston
  "6": "America/Chicago", // Kansas City
  "7": "America/New_York", // Atlanta
  "8": "America/New_York", // Miami
  "9": "America/New_York", // Boston
  "10": "America/New_York", // Philadelphia
  "11": "America/New_York", // New York / New Jersey
  "12": "America/Toronto", // Toronto
  "13": "America/Vancouver", // Vancouver
  "14": "America/Los_Angeles", // Seattle
  "15": "America/Los_Angeles", // San Francisco Bay
  "16": "America/Los_Angeles", // Los Angeles
};

export const VN_TZ = "Asia/Ho_Chi_Minh";

/** The visitor's own time zone (e.g. "Europe/London", "America/New_York").
 *  Falls back to Vietnam when the browser can't resolve one. All on-screen
 *  times are formatted in this zone so each visitor sees local kickoff times. */
export const USER_TZ =
  (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || VN_TZ;

/** Short label for the active zone, e.g. "GMT+7". Used in "giờ ..." captions. */
export const TZ_LABEL = (() => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: USER_TZ,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "giờ địa phương";
  } catch {
    return "giờ địa phương";
  }
})();

/** Convert venue wall-clock components + IANA zone into the true UTC instant. */
export function zonedWallClockToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tz: string
): Date {
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(asIfUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hh = get("hour");
  if (hh === 24) hh = 0;
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hh, get("minute"), get("second"));
  const offset = localAsUtc - asIfUtc;
  return new Date(asIfUtc - offset);
}

// Kickoff formatters — rendered in the visitor's own time zone (USER_TZ).
export const VN_DATETIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: USER_TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const VN_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: USER_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const VN_DAY_LONG = new Intl.DateTimeFormat("vi-VN", {
  timeZone: USER_TZ,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Day bucket key in the visitor's zone (YYYY-MM-DD) so the schedule groups by
 *  the user's local day, not Vietnam's. */
export function vnDayKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA gives YYYY-MM-DD
}
