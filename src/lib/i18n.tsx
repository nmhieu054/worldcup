import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "vi" | "en";

/** Flat UI dictionary. Keys are stable identifiers; values carry both locales.
 *  Team names are NOT here — they come from API data and stay untranslated. */
type Entry = { vi: string; en: string };

const DICT = {
  // --- header / nav ---
  themeToggle: { vi: "Đổi giao diện sáng tối", en: "Toggle light/dark theme" },
  langToggle: { vi: "Đổi ngôn ngữ", en: "Switch language" },
  mainNav: { vi: "Điều hướng chính", en: "Main navigation" },
  tabSchedule: { vi: "Lịch đấu", en: "Schedule" },
  tabStandings: { vi: "Bảng xếp hạng", en: "Standings" },
  tabBracket: { vi: "Sơ đồ", en: "Bracket" },
  tabStadiums: { vi: "Sân vận động", en: "Stadiums" },
  tabTeams: { vi: "Đội tuyển", en: "Teams" },
  navScheduleShort: { vi: "Lịch", en: "Schedule" },
  navStandingsShort: { vi: "BXH", en: "Table" },
  navBracketShort: { vi: "Knockout", en: "Knockout" },
  navStadiumsShort: { vi: "Sân", en: "Venues" },
  navTeamsShort: { vi: "Đội", en: "Teams" },
  refresh: { vi: "Làm mới dữ liệu", en: "Refresh data" },
  refreshShort: { vi: "Làm mới", en: "Refresh" },
  syncedAt: { vi: "Đồng bộ", en: "Synced" },

  // --- hero ---
  heroBadge: { vi: "11/6 - 19/7/2026 · Mỹ · Canada · Mexico", en: "Jun 11 - Jul 19, 2026 · USA · Canada · Mexico" },
  heroTitle: { vi: "Lịch thi đấu World Cup 2026", en: "World Cup 2026 Schedule" },
  heroSub: {
    vi: "48 đội, 12 bảng, 104 trận. Bảng xếp hạng và sơ đồ knockout tự cập nhật theo tỉ số trực tiếp.",
    en: "48 teams, 12 groups, 104 matches. Standings and the knockout bracket update live with the scores.",
  },
  nextUp: { vi: "Trận sắp diễn ra", en: "Upcoming matches" },

  // --- schedule controls ---
  scheduleViewLabel: { vi: "Cách xem lịch", en: "Schedule view" },
  allMatches: { vi: "Tất cả trận đấu", en: "All matches" },
  byDate: { vi: "Lịch theo ngày", en: "By date" },
  favoritesLabel: { vi: "Xem yêu thích", en: "Favorites" },
  favMatches: { vi: "Trận", en: "Matches" },
  favTeams: { vi: "Đội", en: "Teams" },
  pickDate: { vi: "Chọn ngày", en: "Pick a date" },
  allDates: { vi: "Tất cả các ngày", en: "All dates" },
  tapPickCalendar: { vi: "Bấm để chọn ngày trên lịch", en: "Tap to pick a date" },
  showAllDates: { vi: "Xem tất cả các ngày", en: "Show all dates" },
  viewTable: { vi: "Bảng", en: "Table" },
  viewGrid: { vi: "Lưới", en: "Grid" },
  downloadIcsTitle: { vi: "Tải toàn bộ lịch đang lọc vào ứng dụng lịch", en: "Download the filtered schedule to your calendar" },
  downloadIcs: { vi: "Tải lịch thi đấu (.ics)", en: "Download schedule (.ics)" },
  dateTbdLong: { vi: "Chưa xác định lịch", en: "Date TBD" },
  dateTbdShort: { vi: "Chưa lịch", en: "TBD" },
  closeCalendar: { vi: "Đóng lịch", en: "Close calendar" },

  // --- loading / error ---
  loading: { vi: "Đang tải dữ liệu giải đấu…", en: "Loading tournament data…" },
  errorTitle: { vi: "Không tải được dữ liệu", en: "Couldn't load data" },
  retry: { vi: "Thử lại", en: "Retry" },
  noMatchesDay: { vi: "Không có trận đấu nào trong hôm nay hoặc ngày được chọn.", en: "No matches today or on the selected date." },

  // --- footer ---
  footerData: { vi: "Dữ liệu từ ESPN", en: "Data from ESPN" },
  footerRules: {
    vi: "BXH tự tính theo luật FIFA (điểm, hiệu số, bàn thắng, đối đầu).",
    en: "Standings computed by FIFA rules (points, goal difference, goals for, head-to-head).",
  },

  // --- countdown ---
  nextMatch: { vi: "Trận kế tiếp", en: "Next match" },
  nextSavedMatch: { vi: "Trận yêu thích kế tiếp", en: "Next saved match" },
  unitDays: { vi: "ngày", en: "days" },
  unitHours: { vi: "giờ", en: "hrs" },
  unitMins: { vi: "phút", en: "min" },
  unitSecs: { vi: "giây", en: "sec" },
  livePrefix: { vi: "Đang đá · ", en: "Live · " },

  // --- match card / detail ---
  fullTime: { vi: "Kết thúc", en: "Full time" },
  noDateYet: { vi: "Chưa có lịch", en: "No date yet" },
  removeSavedMatch: { vi: "Bỏ trận yêu thích", en: "Remove saved match" },
  saveMatch: { vi: "Lưu trận yêu thích", en: "Save match" },
  matchInfo: { vi: "Thông tin trận đấu", en: "Match details" },
  dragHint: { vi: "Kéo →", en: "Drag →" },
  noTies: { vi: "Chưa có cặp đấu.", en: "No fixtures yet." },
  matchesWord: { vi: "trận", en: "matches" },  closeMatch: { vi: "Đóng thông tin trận", en: "Close match details" },
  noGoals: { vi: "Không có bàn thắng", en: "No goals" },
  lineupsBench: { vi: "Đội hình ra sân & dự bị", en: "Lineups & bench" },
  lineupsHint: {
    vi: "Sẽ tự hiện khi nguồn dữ liệu công bố lineup trước trận.",
    en: "Appears automatically when the data source publishes lineups before kickoff.",
  },
  starting: { vi: "Đội hình xuất phát", en: "Starting XI" },
  bench: { vi: "Dự bị", en: "Bench" },
  noBench: { vi: "Chưa có danh sách dự bị.", en: "No bench list yet." },
  updatedAt: { vi: "Cập nhật", en: "Updated" },
  lineupEmptyPrefix: { vi: "Đội hình ", en: "The " },
  lineupEmptySuffix: { vi: " chưa công bố. Khi có dữ liệu, danh sách đá chính và dự bị sẽ hiện ở đây.", en: " lineup hasn't been announced. The starting XI and bench will appear here once available." },
  squadFallbackPrefix: { vi: "Chưa có đội hình ra sân. Hiện danh sách ", en: "No starting lineup yet. Showing the " },
  squadFallbackSuffix: { vi: " cầu thủ đăng ký từ ESPN.", en: " registered players from ESPN." },
  registered: { vi: "Cầu thủ đăng ký", en: "Registered players" },
  formation: { vi: "Sơ đồ", en: "Formation" },

  // positions
  posGK: { vi: "Thủ môn", en: "Goalkeepers" },
  posDF: { vi: "Hậu vệ", en: "Defenders" },
  posMF: { vi: "Tiền vệ", en: "Midfielders" },
  posFW: { vi: "Tiền đạo", en: "Forwards" },

  // --- schedule table headers ---
  thId: { vi: "ID", en: "ID" },
  thDate: { vi: "Ngày", en: "Date" },
  thTime: { vi: "Giờ", en: "Time" },
  thRound: { vi: "Vòng đấu", en: "Round" },
  thHome: { vi: "Đội 1", en: "Home" },
  thScore: { vi: "Tỉ số", en: "Score" },
  thAway: { vi: "Đội 2", en: "Away" },
  thFav: { vi: "Yêu thích", en: "Save" },
  viewThisDate: { vi: "Xem lịch theo ngày này", en: "View this date" },

  // --- calendar ---
  prevMonth: { vi: "Tháng trước", en: "Previous month" },
  nextMonth: { vi: "Tháng sau", en: "Next month" },
  matchDayLegend: { vi: "Có trận đấu diễn ra", en: "Match day" },

  // --- manage teams / search ---
  close: { vi: "Đóng", en: "Close" },
  searchTeamsCode: { vi: "Tìm đội theo tên hoặc mã", en: "Search teams by name or code" },
  searchTeamOrGroup: { vi: "Tìm đội hoặc bảng…", en: "Search team or group…" },
  manageTeams: { vi: "Quản lý đội theo dõi", en: "Manage followed teams" },
  teamsWord: { vi: "đội", en: "teams" },
  clearAll: { vi: "Bỏ hết", en: "Clear all" },
  noTeamsFound: { vi: "Không tìm thấy đội nào.", en: "No teams found." },

  // --- favorites view ---
  resultWon: { vi: "Thắng", en: "Won" },
  resultDraw: { vi: "Hòa", en: "Draw" },
  resultLost: { vi: "Thua", en: "Lost" },
  unfollow: { vi: "Bỏ theo dõi", en: "Unfollow" },
  follow: { vi: "Theo dõi đội", en: "Follow team" },
  lastMatch: { vi: "Trận gần nhất", en: "Last match" },
  noFixtures: { vi: "Chưa có lịch thi đấu.", en: "No fixtures yet." },
  noFollowTitle: { vi: "Chưa theo dõi đội nào", en: "No teams followed yet" },
  noFollowHint: {
    vi: "Chọn các đội anh quan tâm để theo dõi nhanh lịch và kết quả của riêng họ.",
    en: "Pick the teams you care about to quickly follow their schedule and results.",
  },
  pickTeamsToFollow: { vi: "+ Chọn đội theo dõi", en: "+ Pick teams to follow" },
  manageTeamsShort: { vi: "Quản lý đội", en: "Manage teams" },
  following: { vi: "Đang theo dõi", en: "Following" },
  setFavorite: { vi: "Đặt làm đội yêu thích", en: "Set as favorite" },

  // --- group / third-place tables ---
  top2Advance: { vi: "2 đội đầu đi tiếp", en: "Top 2 advance" },
  top8Advance: { vi: "8 đội đầu đi tiếp", en: "Top 8 advance" },
  colTeam: { vi: "Đội", en: "Team" },
  colGroup: { vi: "Bảng", en: "Group" },
  thirdPlaceTitle: { vi: "Xếp hạng đội hạng 3", en: "Third-placed teams" },
  thirdPlaceEmpty: { vi: "Cập nhật sau khi vòng bảng kết thúc.", en: "Updates after the group stage." },
  colP: { vi: "Tr", en: "P" },
  colW: { vi: "T", en: "W" },
  colD: { vi: "H", en: "D" },
  colL: { vi: "B", en: "L" },
  colGD: { vi: "HS", en: "GD" },
  colPts: { vi: "Đ", en: "Pts" },

  // --- team detail ---
  tabOverview: { vi: "Tổng quan & Wiki", en: "Overview & Wiki" },
  tabSquad: { vi: "Đội hình tuyển thủ", en: "Squad" },
  tabFixtures: { vi: "Lịch đấu giải đấu", en: "Tournament fixtures" },
  fifaRank: { vi: "Hạng FIFA", en: "FIFA rank" },
  confederation: { vi: "Liên đoàn", en: "Confederation" },
  groupRank: { vi: "Hạng bảng", en: "Group rank" },
  pointsGd: { vi: "Điểm / Hiệu số", en: "Points / GD" },
  teamStatsHint: {
    vi: "Thứ hạng và thành tích chi tiết sẽ cập nhật từ dữ liệu hệ thống khi giải khởi tranh.",
    en: "Detailed standings and stats will update from system data once the tournament begins.",
  },
  coach: { vi: "HLV", en: "Coach" },

  // --- team detail extras ---
  back: { vi: "Quay lại", en: "Back" },
  countryCode: { vi: "Mã quốc gia", en: "Country code" },
  headCoach: { vi: "Huấn luyện viên trưởng", en: "Head coach" },
  currentCoach: { vi: "HLV trưởng đương nhiệm", en: "Current head coach" },
  notUpdated: { vi: "Chưa cập nhật.", en: "Not yet available." },
  teamStats: { vi: "Thông số đội tuyển", en: "Team stats" },
  ptsWord: { vi: "điểm", en: "pts" },
  teamOverview: { vi: "Tổng quan về đội bóng", en: "Team overview" },
  noOverview: { vi: "Chưa có mô tả cho đội này.", en: "No description for this team yet." },
  readMoreWiki: { vi: "Đọc thêm trên Wikipedia", en: "Read more on Wikipedia" },
  wcTitleHistory: { vi: "Lịch sử vô địch World Cup", en: "World Cup title history" },
  timesChampion: { vi: "lần vô địch", en: "titles" },
  neverChampion: { vi: "Chưa từng vô địch World Cup.", en: "Never won the World Cup." },
  playerList: { vi: "Danh sách cầu thủ", en: "Player list" },
  espnSource: { vi: "Nguồn ESPN public API.", en: "Source: ESPN public API." },
  playersWord: { vi: "cầu thủ", en: "players" },
  noRoster: { vi: "Chưa có roster cho đội này.", en: "No roster for this team yet." },
  tournamentFixtures: { vi: "Lịch đấu tại giải", en: "Tournament fixtures" },
  noTeamFixtures: { vi: "Chưa có lịch đấu cho đội này.", en: "No fixtures for this team yet." },

  // --- stadiums ---
  seatingMap: { vi: "Sơ đồ chỗ ngồi minh hoạ", en: "Illustrative seating map" },
  tier: { vi: "Tầng", en: "Tier" },
  seatsWord: { vi: "chỗ", en: "seats" },
  localTime: { vi: "Giờ địa phương", en: "Local time" },
  seatingChart: { vi: "Sơ đồ chỗ ngồi", en: "Seating chart" },
  seatingDisclaimer: { vi: "Sơ đồ minh hoạ theo sức chứa, không phải bản đồ ghế chính thức.", en: "Illustrative layout based on capacity, not an official seat map." },
  matchesHere: { vi: "Các trận tổ chức tại đây", en: "Matches played here" },
  noMatchesStadium: { vi: "Không có trận.", en: "No matches." },
  capacity: { vi: "Sức chứa", en: "Capacity" },
  matchesAt: { vi: "trận tại sân", en: "matches here" },

  // --- teams view ---
  exploreTeams: { vi: "Khám phá {n} quốc gia tham dự", en: "Explore {n} qualified nations" },
  teamsSubtitle: { vi: "FIFA World Cup 2026 · Hồ sơ, lịch sử và đội hình từng đội tuyển.", en: "FIFA World Cup 2026 · Profiles, history and squads for every team." },
  searchTeamsLabel: { vi: "Tìm đội tuyển", en: "Search teams" },
  viewProfile: { vi: "Xem hồ sơ", en: "View profile" },
  sortAZ: { vi: "A→Z", en: "A→Z" },
} satisfies Record<string, Entry>;

export type DictKey = keyof typeof DICT;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: DictKey) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

function initialLang(): Lang {
  const stored = sessionStorage.getItem("wc26_lang");
  return stored === "en" || stored === "vi" ? stored : "vi";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    sessionStorage.setItem("wc26_lang", lang);
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const toggle = () => setLangState((l) => (l === "vi" ? "en" : "vi"));
  const t = (key: DictKey) => DICT[key]?.[lang] ?? key;

  return <Ctx.Provider value={{ lang, setLang, toggle, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within LangProvider");
  return ctx;
}

// ---- Dynamic label helpers (knockout rounds + group placeholders) ----

import type { KnockoutType, Match } from "./types";

/** Side label (home/away) for a match in the active language. Resolved team
 *  names come from API data and are identical across languages; only the
 *  placeholders ("Group A winner", "Winner Quarter-final 1") differ. */
export function matchSideLabel(match: Match, side: "home" | "away", lang: Lang): string {
  if (side === "home") return lang === "en" ? match.homeLabelEn : match.homeLabel;
  return lang === "en" ? match.awayLabelEn : match.awayLabel;
}

export const KNOCKOUT_I18N: Record<KnockoutType, Entry> = {
  r32: { vi: "Vòng 1/16", en: "Round of 32" },
  r16: { vi: "Vòng 1/8", en: "Round of 16" },
  qf: { vi: "Tứ kết", en: "Quarter-finals" },
  sf: { vi: "Bán kết", en: "Semi-finals" },
  third: { vi: "Tranh hạng 3", en: "Third place" },
  final: { vi: "Chung kết", en: "Final" },
};

export function knockoutLabel(type: KnockoutType, lang: Lang): string {
  return KNOCKOUT_I18N[type]?.[lang] ?? type;
}

/** Round label for a match in the active language (group or knockout). */
export function roundLabelI18n(
  type: KnockoutType | "group",
  group: string,
  lang: Lang
): string {
  if (type === "group") {
    const g = group?.toUpperCase() ?? "";
    return lang === "vi" ? `Vòng bảng ${g}`.trim() : `Group ${g}`.trim();
  }
  return knockoutLabel(type, lang);
}
