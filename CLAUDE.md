# CLAUDE.md - Marketing Dashboard

> Memory file for Claude Code. Read automatically at the start of each session.
> Last updated: 2026-03-06

## Maintenance Rule

**Before every commit, check if CLAUDE.md needs updating** — new architectural decisions, new patterns, resolved bugs worth documenting, or roadmap changes. If yes, update this file and include it in the commit.

## Project Overview

Marketing Project Tracker for MIGSO-PCUBED marketing team. A single-page React application that manages marketing **Categories**, **Actions**, and **Tasks** with multiple views (Table, Kanban, Timeline).

- **Owner**: migso-pcubed-mkt-com (GitHub org — previously FbnCrr, migrated)
- **Repo**: Marketing-Dashboard
- **Live URL**: Deployed on Vercel (auto-deploy on push to `main`)
- **Current version**: V3.4

## Architecture

### Monolith SPA — Single `index.html` (~3800 lines)

The entire frontend lives in one `index.html` file:
- **React 18** loaded via CDN (UMD builds, no build step)
- **Babel standalone** for JSX transpilation in-browser
- **Tailwind CSS** via CDN
- **Supabase JS SDK** via CDN for real-time data sync
- All React components are defined inline in a `<script type="text/babel">` block:
`Header`, `FilterBar`, `KanbanView`, `TimelineView`, `DashboardView`, `TaskCard`, `ActionCard`, `TaskDetailModal`, `ActionDetailModal`, `NewTaskModal`, `NewActionModal`, `CategoriesManagementModal`, `ChannelTags`, `CountryTags`, `FilterPanel`, `App`

> **Dark mode removed in V3.0** — The app was originally dark/light togglable. During the V11 design system migration, dark mode was fully removed. Do NOT re-introduce `darkMode` state or `dark:` Tailwind classes.

There is **no build system** (no webpack, no vite, no npm). Everything runs directly in the browser.

### Data Model

Three entity types stored as JSON arrays:
- **Categories** — top-level grouping (e.g., "Digital Marketing", "Events")
- **Actions** — belong to a category, represent a marketing initiative
- **Tasks** — belong to an action, the actual work items with dates, status, owner

### Storage Backend (dual, with fallback)

1. **Primary: Supabase** — Real-time sync via Supabase Realtime
   - Table: `app_data` (id TEXT PK, categories JSONB, actions JSONB, tasks JSONB, updated_at TIMESTAMPTZ)
   - Schema defined in `supabase-setup.sql`
   - Realtime subscription for live cross-device sync
   - RLS enabled with permissive anonymous policy (single-user mode)

2. **Fallback: GitHub API** via Vercel serverless function
   - `api/github.js` — proxy that keeps GITHUB_TOKEN server-side
   - Reads/writes `data.json` on the `main` branch via GitHub Contents API
   - Env var: `GITHUB_TOKEN` (configured in Vercel)

Auto-save triggers ~2s after last edit. The app detects Supabase availability and falls back to GitHub if unavailable.

### Key Files

```
index.html              — Entire frontend SPA (React + CSS + logic)
design-system-v11.css   — Additional CSS design system (imported by index.html)
data.json               — Persisted app data (GitHub storage backend)
api/github.js           — Vercel serverless function (GitHub API proxy)
supabase-setup.sql      — Database schema for Supabase backend
vercel.json             — Vercel config (serverless function settings)
SETUP_GITHUB.md         — GitHub token setup guide
VERCEL_SETUP.md         — Vercel deployment guide
```

## Development Conventions

### Language
- **UI**: English (translated from French in commit a987fee)
- **Code comments**: English
- **Documentation files**: French or English (mixed, legacy)

### Code Style
- All frontend code in a single `index.html` — do NOT split into multiple files
- React functional components with hooks (useState, useEffect, useCallback, useMemo, useRef)
- Inline styles + Tailwind classes + CSS custom properties (design tokens in `:root`)
- No TypeScript, no ESLint — keep it simple, no toolchain

### CSS Design System (V11)
- CSS custom properties defined in `:root` (colors, spacing, radii, shadows)
- Class prefix: `v11-` for design system components
- Font: DM Sans (body) + JetBrains Mono (monospace)
- Primary accent: `#6366f1` (indigo)

### Views
- **Table view** — Hierarchical table (Categories > Actions > Tasks)
- **Kanban view** — Cards grouped by status columns
- **Timeline view** — Gantt-like horizontal bars with drag/resize
  - Swim lanes with collision detection
  - Drag-and-drop with ghost preview
  - Resize handles on both ends
  - **Year navigation** — `timelineYear` state shared in App, nav buttons to switch years; all timeline computations use this shared year (not hardcoded)
  - Touch + mouse support (mobile/tablet compatible)

## Known Patterns & Pitfalls

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

### CSS Design System V11
- Design system defined in `design-system-v11.css` (imported by `index.html`)
- **Class prefix**: `v11-` for design system components
- **Do NOT use Tailwind utility classes for layout/color on components that have a `v11-` class** — the semantic class takes priority
- Inline `style={{}}` props for dynamic colors (e.g. category colors) are acceptable and intentional

### localStorage as Backup Only
- `localStorage` is a **backup only**, not a primary storage layer
- Load order: Supabase → GitHub → localStorage
- Write order: Supabase (primary) + localStorage (parallel fallback)
- GitHub polling every 15s was replaced by Supabase Realtime — do not re-add polling if Supabase is active

## Roadmap (planned, not yet implemented)

These features have been discussed and planned but not yet built:

1. **File attachments** — `attachments: []` field already exists on tasks, but no upload UI yet. Plan: base64 encoding, stored in Supabase
2. **Trello integration** — Import Trello cards + bidirectional sync. Requires a new Vercel serverless function for the Trello API
3. **Multi-board** — Currently single board. Plan: add board selector UI backed by Supabase, architecture supports it
4. **Multi-user auth** — Auth via Supabase Auth (email) + RLS per user. Trello OAuth also considered
5. **Vite migration** — The monolithic `index.html` may eventually migrate to a proper Vite + module build. Not a priority until multi-user auth is needed

## Deployment

### Vercel
- Auto-deploys on push to `main`
- Serverless functions in `api/` directory
- Environment variable: `GITHUB_TOKEN` (required for GitHub backend)
- Config: `vercel.json` — 1024MB memory, 10s max duration for functions
- **Note**: Vercel creates one deployment per push — cancel queued deployments from the Vercel dashboard if they pile up; only the "Ready (Current)" deployment matters

### Supabase
- External service — credentials configured in index.html
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` set in the frontend code
- Table: `app_data` — schema in `supabase-setup.sql`
- The `anon` key is **intentionally public** — it's designed for client-side use; RLS policies enforce access control

## Git Workflow

- **Main branch**: `main` — production, auto-deployed
- **Feature branches**: `claude/fix-vercel-github-api-btzPi` (current working branch)
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
