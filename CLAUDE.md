# CLAUDE.md - Marketing Dashboard

> Memory file for Claude Code. Read automatically at the start of each session.
> Last updated: 2026-03-05

## Project Overview

Marketing Project Tracker for MIGSO-PCUBED marketing team. A single-page React application that manages marketing **Categories**, **Actions**, and **Tasks** with multiple views (Table, Kanban, Timeline).

- **Owner**: migso-pcubed-mkt-com
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
- All React components are defined inline in a `<script type="text/babel">` block

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

## Known Patterns & Pitfalls

### Timeline Drag & Drop
Complex system with multiple solved issues:
- Swim lane assignment uses sort-by-date + frozen lane order during resize
- Ghost preview element follows cursor with `position: fixed`
- Drop preview line shows destination with opacity
- `body.task-dragging` class disables pointer events on non-dragged bars
- Lane freezing prevents jumps during resize operations

### Supabase Realtime Loop Prevention
- Auto-save and Realtime subscription can create infinite loops
- Solution: skip saving when change originated from Realtime (use a flag/ref)

### Race Conditions
- Rapid edits can cause state reversion — debounce saves
- SHA conflicts on GitHub backend — always use latest SHA for PUT

## Deployment

### Vercel
- Auto-deploys on push to `main`
- Serverless functions in `api/` directory
- Environment variable: `GITHUB_TOKEN` (required for GitHub backend)
- Config: `vercel.json` — 1024MB memory, 10s max duration for functions

### Supabase
- External service — credentials configured in index.html
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` set in the frontend code

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
