# CLAUDE.md - Marketing Dashboard

> Memory file for Claude Code. Read automatically at the start of each session.
> Last updated: 2026-03-07

## Maintenance Rule

**Before every commit, check if CLAUDE.md needs updating** — new architectural decisions, new patterns, resolved bugs worth documenting, or roadmap changes. If yes, update this file and include it in the commit.

## Project Overview

Marketing Project Tracker for MIGSO-PCUBED marketing team. A single-page React application that manages marketing **Categories**, **Actions**, and **Tasks** with multiple views (Kanban, Timeline, Dashboard/KPIs).

- **Owner**: migso-pcubed-mkt-com (GitHub org — previously FbnCrr, migrated)
- **Repo**: Marketing-Dashboard
- **Live URL**: Deployed on Vercel (auto-deploy on push to `main`)
- **Current version**: V4.0 (post-Vite migration)

## Architecture

### Vite + React Modular SPA

Migrated from a monolithic `index.html` (~3800 lines) to a proper Vite build system (Phase 0, completed March 2026).

- **React 18** via npm (`react`, `react-dom`)
- **Vite 5** as build tool + dev server
- **Tailwind CSS 3** via PostCSS (not CDN)
- **Supabase JS SDK** via npm (`@supabase/supabase-js`)
- ES Modules throughout — no Babel standalone, no CDN for React

> **Dark mode removed in V3.0** — Do NOT re-introduce `darkMode` state or `dark:` Tailwind classes.

### Commands

```bash
npm run dev       # Vite dev server (port 5173, proxy /api to localhost:3000)
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

### Project Structure

```
Marketing-Dashboard/
├── index.html                      # Minimal Vite entry point
├── package.json                    # Dependencies (react, vite, tailwind, supabase)
├── vite.config.js                  # Vite config (react plugin, /api proxy)
├── tailwind.config.js              # Tailwind config
├── postcss.config.js               # PostCSS (tailwind + autoprefixer)
├── vercel.json                     # Vercel: buildCommand + outputDirectory + functions
├── api/
│   └── github.js                   # Serverless function (GitHub API proxy)
├── src/
│   ├── main.jsx                    # React entry point (createRoot)
│   ├── App.jsx                     # Central state management (~624 lines)
│   ├── config.js                   # CONFIG, DEFAULT_ACTIONS, DEFAULT_TASKS, Supabase/GitHub config
│   ├── context.js                  # AppContext + useApp()
│   ├── styles/
│   │   └── index.css               # Tailwind directives + custom CSS
│   ├── components/
│   │   ├── Header.jsx              # Navigation tabs (kanban/timeline/dashboard)
│   │   ├── KanbanView.jsx          # Kanban with 5 view modes
│   │   ├── TimelineView.jsx        # Gantt timeline (~1317 lines)
│   │   ├── DashboardView.jsx       # KPIs and charts
│   │   ├── FilterSidebar.jsx       # Filter panel
│   │   ├── TaskCard.jsx            # Task card component
│   │   ├── ActionCard.jsx          # Action card component
│   │   ├── TaskDetailModal.jsx     # Task detail/edit modal
│   │   ├── ActionDetailModal.jsx   # Action detail/edit modal
│   │   ├── NewTaskModal.jsx        # Create task modal
│   │   ├── NewActionModal.jsx      # Create action modal
│   │   ├── CategoriesManagementModal.jsx
│   │   ├── Icons.jsx               # SVG icon library
│   │   ├── IconSelect.jsx          # Icon picker
│   │   ├── ChannelTags.jsx         # Channel tag badges
│   │   └── CountryTags.jsx         # Country tag badges
│   └── lib/
│       └── storage.js              # Supabase + GitHub + localStorage (load/save)
├── data.json                       # Persisted app data (GitHub backend)
├── design-system-v11.css           # Legacy CSS (reference only)
├── marketing-tracker-v11.html      # Legacy monolith (backup)
├── supabase-setup.sql              # Supabase schema
├── SETUP_GITHUB.md                 # GitHub token setup guide
└── VERCEL_SETUP.md                 # Vercel deployment guide
```

### Data Model

Three entity types stored as JSON arrays:
- **Categories** — top-level grouping (e.g., "Brand Awareness", "Consideration", "Conversion")
- **Actions** — belong to a category, represent a marketing initiative
- **Tasks** — belong to an action, the actual work items with dates, status, owner

Config constants in `src/config.js`:
- CONFIG.CATEGORIES: 3 | CONFIG.STATUSES: 6 | CONFIG.CHANNELS: 13
- CONFIG.COUNTRIES: 16 (including South East Asia and Global)
- CONFIG.PRIORITIES: 3 (low, medium, high)

### Storage Backend (triple fallback)

1. **Primary: Supabase** — Real-time sync via Supabase Realtime
   - Table: `app_data` (id TEXT PK, categories JSONB, actions JSONB, tasks JSONB, updated_at TIMESTAMPTZ)
   - Schema defined in `supabase-setup.sql`
   - Realtime subscription for live cross-device sync
   - RLS enabled with permissive anonymous policy (single-user mode)
   - Auto-save debounce: 1s

2. **Secondary: GitHub API** via Vercel serverless function
   - `api/github.js` — proxy that keeps GITHUB_TOKEN server-side
   - Reads/writes `data.json` on the `main` branch via GitHub Contents API
   - Auto-save debounce: 2s

3. **Fallback: localStorage** — key `marketing_tracker_backup`

### State Management

All state lives in `App.jsx` via `useState` hooks. Props drilled to child components. `AppContext` exists (`src/context.js` with `useApp()` hook) but is not yet used for main state — currently empty value `{}`.

## Development Conventions

### Language
- **UI**: English (translated from French in commit a987fee)
- **Code comments**: English
- **Documentation files**: French or English (mixed, legacy)

### Code Style
- Modular React components in `src/components/`, one component per file
- React functional components with hooks (useState, useEffect, useCallback, useMemo, useRef)
- **Named exports** in `config.js` — use `import { CONFIG } from '../config.js'` (NOT default import)
- ES Modules throughout — no CommonJS, no CDN/UMD
- Inline styles + Tailwind classes + CSS custom properties (design tokens in `:root`)
- No TypeScript, no ESLint

### CSS Design System (V11)
- CSS custom properties defined in `:root` (colors, spacing, radii, shadows)
- Class prefix: `v11-` for design system components
- Font: DM Sans (body) + JetBrains Mono (monospace)
- Primary accent: `#6366f1` (indigo)

### Views
- **Kanban view** — Cards with 5 grouping modes: month, quarter, category, action, **country**
  - Country mode shows ALL 16 countries as columns + "Unassigned" column
  - Drag between country columns replaces the country (not adds)
- **Timeline view** — Gantt-like horizontal bars with drag/resize
  - Swim lanes with collision detection
  - Drag-and-drop with ghost preview
  - Resize handles on both ends
  - **Year navigation** — `timelineYear` state shared in App, nav buttons to switch years
  - Touch + mouse support (mobile/tablet compatible)
- **Dashboard view** — KPIs and charts (replaced Table view)

## Known Patterns & Pitfalls

### TimelineView — Critical Declaration Order (TDZ)
- `colWidth` must be declared **BEFORE** any `useCallback` that references it in its dependency array
- React evaluates `useCallback` dependency arrays during render — if a `const` is declared after the `useCallback`, it triggers a Temporal Dead Zone (TDZ) error
- Current correct order in TimelineView.jsx: `colWidth` (line ~29) → `getCenterDate` → `scrollToDate` → helper functions → handlers
- Same principle applies to `getTaskPosition`, `calculateSwimLanes`, `dateToPixel`, `pixelToDate` — all must be declared before handlers that use them

### Timeline Drag & Drop
Complex system with multiple solved issues:
- Swim lane assignment uses sort-by-date + frozen lane order during resize
- Ghost preview element follows cursor with `position: fixed`
- Drop preview line shows destination with opacity
- `body.task-dragging` class disables pointer events on non-dragged bars
- Lane freezing prevents jumps during resize operations
- Shared `dateToPixel` / `pixelToDate` utilities used across all timeline handlers — do not inline these

### Supabase Realtime Loop Prevention
- Auto-save and Realtime subscription can create infinite loops
- Solution: skip saving when change originated from Realtime (use a flag/ref)
- Specifically: `isReceivingRealtimeRef` — set to `true` when handling a Realtime event, auto-save checks this flag and skips if true, resets after 2s via `setTimeout`

### Race Conditions & Stale Closures
- Rapid edits can cause state reversion — debounce saves (2s)
- SHA conflicts on GitHub backend — always use latest SHA for PUT
- **Stale closure bug (resolved)**: `saveToSupabase()` / `saveToGitHub()` used to capture stale state. Fixed by using refs (`categoriesRef`, `actionsRef`, `tasksRef`) that are updated synchronously before each save call
- **Do not trigger auto-save during drag/resize** — intermediate state must not be persisted; disable auto-save while `isDragging` or `isResizing` flags are true

### GitHub API — SHA Conflicts (resolved)
- Error 422 `sha wasn't supplied` or `does not match` means the local SHA is stale
- Solution: always fetch the latest SHA from GitHub before a PUT; implement automatic conflict resolution (re-fetch on 409 / sha-mismatch errors)

### UTF-8 Encoding (resolved)
- French characters (accents, œ, etc.) were corrupted when saving/loading via GitHub API
- Solution: explicitly encode/decode as UTF-8 in both the load and save functions in `api/github.js`

### CSS / PostCSS
- `@import url(...)` statements **must** precede `@tailwind` directives in `src/styles/index.css` (PostCSS requirement)
- Design system CSS custom properties defined in `:root` (colors, spacing, radii, shadows)
- Class prefix: `v11-` for design system components
- Inline `style={{}}` props for dynamic colors (e.g. category colors) are acceptable and intentional

### Kanban Country View
- Reorder between cards in country view uses local reorder logic in KanbanView (not App.jsx's `handleReorderTask`)
- `handleReorderTask` in App.jsx groups by month/status — doesn't support country grouping
- Country drag replaces the task's country array (not appends)

### localStorage as Backup Only
- `localStorage` is a **backup only**, not a primary storage layer
- Load order: Supabase → GitHub → localStorage
- Write order: Supabase (primary) + localStorage (parallel fallback)
- GitHub polling every 15s was replaced by Supabase Realtime — do not re-add polling if Supabase is active

## Roadmap

1. ~~**Vite migration**~~ — ✅ DONE (Phase 0). Monolith `index.html` → Vite + modular React
2. **Multi-board** — 🔜 NEXT (Phase 1). Add board selector, multiple independent dashboards. Plan written.
3. **Trello integration** — Phase 2. Import Trello cards + bidirectional sync via `api/trello.js`
4. **Multi-user auth** — Phase 3. Auth via Trello OAuth + RLS per user
5. **File attachments** — `attachments: []` field exists on tasks, but no upload UI yet

## Deployment

### Vercel
- Auto-deploys on push to `main`
- **Build**: `npm run build` → output in `dist/` (configured in `vercel.json`)
- Serverless functions in `api/` directory
- Environment variable: `GITHUB_TOKEN` (required for GitHub backend)
- Config: `vercel.json` — `buildCommand: "npm run build"`, `outputDirectory: "dist"`, 1024MB memory, 10s max duration for functions

### Supabase
- External service — credentials configured in `src/config.js`
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` set in the frontend code
- Table: `app_data` — schema in `supabase-setup.sql`
- The `anon` key is **intentionally public** — it's designed for client-side use; RLS policies enforce access control

## Git Workflow

- **Main branch**: `main` — production, auto-deployed
- **Feature branches**: `claude/multi-board-trello-setup-FSIH8` (current working branch)
- Commits are descriptive, in English, prefixed with action (Fix, Add, Improve, etc.)

## Decisions Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-02 | Single index.html architecture | Simplicity, no build step, CDN-loaded deps |
| 2026-02 | Supabase as primary storage | Real-time sync needed for multi-device |
| 2026-02 | GitHub API as fallback storage | Original storage, kept for resilience |
| 2026-02 | Vercel serverless for GitHub proxy | Keep GITHUB_TOKEN server-side |
| 2026-02 | UI translated to English | International team accessibility |
| 2026-03 | Timeline swim lane freezing | Prevent visual jumps during drag/resize |
| 2026-03 | Dark mode removed (V3.0) | V11 design system migration — cleaner single-theme CSS |
| 2026-03 | GitHub org migration | Moved from FbnCrr/Dashboard-marketing → migso-pcubed-mkt-com/Marketing-Dashboard |
| 2026-03 | Refs for save closures | Stale closure bug fix — categoriesRef/actionsRef/tasksRef updated before each save |
| 2026-03 | isReceivingRealtimeRef flag | Prevent infinite loop between Supabase Realtime and auto-save |
| 2026-03 | CLAUDE.md created | Persistent memory across Claude Code sessions |
| 2026-03 | Vite migration (Phase 0) | Monolith index.html → Vite + modular React components |
| 2026-03 | Kanban "By Country" view | 5th view mode, all 16 countries as columns |
| 2026-03 | South East Asia + Global | Fixed SEA country tag, added Global/World country |
| 2026-03 | Named exports in config.js | `import { CONFIG } from` — no default export |
