# ⚽ World Cup 2026 — Lineup Tracker

Live at **[worldcup.meowbiter.me](https://worldcup.meowbiter.me)**

A real-time FIFA World Cup 2026 lineup tracker built with React + TypeScript + Vite. Shows match schedules, confirmed lineups, group tables, bracket, and team details — data synced from ESPN and other sources.

## Features

- **Match Calendar** — full WC26 fixture list with kickoff times (localized)
- **Lineups** — confirmed starting XIs per match
- **Group Tables** — live standings with points, GD, H2H
- **Bracket** — knockout stage progression
- **Team Details** — rosters, player info, match history
- **Refresh Schedule** — auto-refresh every 60s during active matches
- **iCal Export** — add matches to your calendar
- **PWA** — installable, offline-capable

## Tech Stack

- **React 19** + **TypeScript 6**
- **Vite 8** + **Tailwind CSS 4**
- **Motion** (Framer Motion v12) — animations
- **Phosphor Icons**
- **Noto Sans** variable font
- Data sync scripts in Node.js / Python

## Development

```bash
npm install
npm run dev       # Vite dev server
npm run build     # build with live data sync
npm run preview   # preview production build
```

## Data Sync Scripts

| Script | What it does |
|--------|-------------|
| `scripts/sync.mjs` | Master sync — runs all data fetchers |
| `scripts/sync-espn.mjs` | Fetches fixtures, standings, lineups from ESPN |
| `scripts/sync-rosters.mjs` | Player rosters per team |
| `scripts/sync-lineups.mjs` | Match lineup details |
| `scripts/sync-wiki.mjs` | Wikipedia data for teams/stadiums |
| `scripts/sync-fifa-rank.mjs` | FIFA world rankings |
| `scripts/build-with-live-data.mjs` | Sync + Vite build in one step |

## Deploy

The site is statically built and served via Cloudflare Tunnel. The `dist/` folder is the publish root — `npm run build` syncs live data and produces the output in one pass.

## License

MIT
