# CLAUDE.md — Marketing Dashboard

> Memory file for Claude Code. Loaded automatically at session start.
> Last updated: 2026-03-21

---

## File Maintenance Rules

### Role of each file

| File | Purpose | Update strategy |
|---|---|---|
| **CLAUDE.md** | Current state of the project — architecture, patterns, conventions, active pitfalls | **Replace in place** — never append, always reflect reality |
| **DECISIONS.md** | Why things changed — historical trace for context | **Append only** — newest row at top, never edit existing rows |

### When to update (after every commit that touches any of the following)

| Trigger | Update CLAUDE.md | Update DECISIONS.md |
|---|---|---|
| New component or file with non-obvious role | Add to Key Files section | No |
| New view, feature, or major UI pattern | Add/update relevant section | Add one row |
| Architecture change (storage, state, data model) | Update the affected section | Add one row |
| Bug fix that reveals a structural pitfall | Add to Known Pitfalls | Add one row |
| Decision to remove or forbid something | Add a "Do NOT" rule | Add one row |
| Config, env var, or deploy change | Update Deployment/Config section | No (unless architectural) |
| Roadmap item completed | Mark ✅ in Roadmap | No |
| Anything that would cause a future Claude session to make the wrong assumption | Update the relevant section | Add one row |

### How to update CLAUDE.md

- **Replace** outdated content — do not append old + new side by side.
- Update the `Last updated` date at the top.
- Keep total file under ~220 lines. If a section grows too large, summarize and move detail to DECISIONS.md.
- Never add historical narrative ("we used to do X, now we do Y") — only describe current state.
- Self-explanatory file names, trivial implementation details, and one-off fixes do not belong here.
- **"Do NOT" rules are the highest-value content** — always preserve them, they prevent regressions across sessions.

### How to update DECISIONS.md

- Insert new rows at the **top** of the table, never at the bottom.
- Format: `| YYYY-MM-DD | Action verb + what changed | Why, one sentence max |`
- If a decision supersedes a previous one, note it: `(supersedes YYYY-MM-DD)`.
- Do not duplicate info already self-evident from CLAUDE.md current state — DECISIONS.md explains *why*, not *what*.

---

## Project Overview

Marketing Project Tracker for MIGSO-PCUBED. Single-page React app managing **Categories → Actions → Tasks** with Kanban, Timeline, Calendar, and Dashboard views.

- **Repo**: `migso-pcubed-mkt-com/Marketing-Dashboard` (GitHub)
- **Deploy**: Vercel — auto-deploy on push to `main`
- **Version**: V4.0 (post-Vite migration)
- **Current branch**: update before each session if relevant

---

## Architecture

### Stack

- **React 18** + **Vite 5** (ES Modules, no CDN/Babel/UMD)
- **Tailwind CSS 3** via PostCSS (not CDN)
- **Supabase JS SDK** (`@supabase/supabase-js`)
- No TypeScript, no ESLint

### Key Files

```
src/
├── App.jsx              # Central state (~624 lines)
├── config.js            # CONFIG, DEFAULT_*, Supabase/GitHub config — NAMED exports only
├── context.js           # AppContext + useApp()
├── lib/
│   ├── storage.js       # Supabase + GitHub + localStorage (load/save/snapshots)
│   ├── trello.js        # Trello API client (calls /api/trello proxy)
│   ├── trelloMapping.js # Trello ↔ Dashboard entity conversion
│   ├── trelloSync.js    # Bidirectional sync engine
│   └── migration.js     # v1→v2 data migration
├── hooks/
│   └── useTouchDrag.js  # Reusable touch DnD hook (long-press 300ms, elementFromPoint)
api/
├── github.js            # Serverless: GitHub API proxy (keeps GITHUB_TOKEN server-side)
└── trello.js            # Serverless: Trello API proxy (keeps TRELLO_API_KEY server-side)
```

### Commands

```bash
npm run dev       # Vite dev server — port 5173, proxies /api → localhost:3000
npm run build     # Production build → dist/
```

---

## Data Model

### Entity hierarchy (per board)

```
Category → Action → Task
```

- **Categories**: top-level grouping
- **Actions**: belong to a category, represent a marketing initiative
- **Tasks**: belong to an action, actual work items (dates, status, owner, checklists)

### Multi-board v2 envelope

```json
{
  "version": 2,
  "currentBoardId": "board-default",
  "boards": [{ "id": "...", "name": "...", "categories": [], "actions": [], "tasks": [] }]
}
```

Migration from v1 (flat) → v2 is automatic via `src/lib/migration.js`.

### Config constants (`src/config.js`)

- `CONFIG.STATUSES`: 6 | `CONFIG.CHANNELS`: 13 | `CONFIG.PRIORITIES`: 3
- `CONFIG.COUNTRIES`: 16 — Global/World **first**, then Europe, America, Asia, Oceania

---

## Storage (triple fallback)

| Layer | Tech | Notes |
|---|---|---|
| Primary | Supabase | Real-time via Supabase Realtime. Table: `app_data`, column `board_data` (JSONB). Auto-save debounce: 1s |
| Secondary | GitHub API | `data.json` on `main` via `api/github.js` proxy. Auto-save debounce: 2s |
| Fallback | localStorage | Key: `marketing_tracker_backup`. Snapshot ring buffer: 3 rotating keys `mkt_snapshot_0/1/2`, 48h TTL |

**Load order**: Supabase → GitHub → localStorage. `localStorage` is backup only — never primary.

**Offline mode**: `navigator.onLine` detection — saves to localStorage only + yellow banner. Auto-resync on reconnect.

**Required Supabase migration**: `ALTER TABLE app_data ADD COLUMN IF NOT EXISTS board_data JSONB;`

---

## State Management

Central state in `App.jsx`:
- `boardData` — full v2 envelope; `currentBoardId` — active board
- `categories`, `actions`, `tasks` — derived via `useMemo` from active board
- Single `boardDataRef` (replaces old `categoriesRef`/`actionsRef`/`tasksRef`)

`AppContext` (`useApp()`) exposes: `boards`, `currentBoardId`, `currentBoard`, `onSwitchBoard`, `onCreateBoard`, `onRenameBoard`, `onDeleteBoard`, `onDuplicateBoard`.

Props still drilled for view-specific data.

---

## Code Conventions

- **Named exports** in `config.js`: `import { CONFIG } from '../config.js'` — NOT default import
- **ID generation**: always `crypto.randomUUID()` via `genId(prefix)`. Do NOT use `Date.now() + Math.random()`
- **UI language**: English. Code comments: English.
- CSS: `v11-` prefix for design system components. Design tokens in `:root`. DM Sans (body) + JetBrains Mono (mono). Accent: `#6366f1`.
- `@import url(...)` must precede `@tailwind` directives in `src/styles/index.css`

### ❌ Do NOT

- Re-introduce `darkMode` state or `dark:` Tailwind classes (removed in V3.0)
- Use CDN or UMD imports for React/Vite — ES Modules only
- Trigger auto-save during drag/resize (`isDragging`/`isResizing` flags must block saves)
- Use `Date.now() + Math.random()` for IDs
- Default-import from `config.js`
- Map Trello labels to "Action" in card-as-task mode (creates mixed `isDefault` conflict in Kanban)
- Allow action creation UI in card-as-task mode (no "New Action" button, no inline "Create a new action" in modals)
- Use `startDate` for month/quarter column assignment in Kanban — `getTaskMonth` uses `dueDate||startDate` (dueDate first)

---

## Trello Integration

- **Proxy**: `api/trello.js` keeps `TRELLO_API_KEY` + `TRELLO_TOKEN` server-side
- **Import wizard**: `TrelloImportModal.jsx` — boards → label mapping → preview → import
- **Sync**: bidirectional, "last write wins" (`dateLastActivity` vs `trelloLastModified`), polling every 1–10 min
- **Auth**: Trello OAuth via popup (`callback_method=postMessage`) — no return_url needed
- **Archived cards**: fetched with `filter=all`; `card.closed` → `trelloArchived=true` + `status='paused'`

### Sync modes (per board: `trelloSync.syncMode`)

| Mode | Cards map to | Checklist items map to |
|---|---|---|
| `card-as-task` (default) | Tasks | — |
| `card-as-action` | Actions | Tasks |

**Guard**: never delete Trello checklists from a task that has no local checklists (`localChecklistIds.size === 0`).

**card-as-task mode**: No action mapping allowed — labels map to channel/country/other only. All actions per category are `isDefault: true`, tasks shown directly under categories in Kanban. Mixing default + non-default actions in one category breaks the Kanban `allDefault` check. New categories auto-create a default action (`handleAddCategory` in App.jsx). List sync is bidirectional: new local categories → Trello lists, new Trello lists → local categories with default actions.

### Deletion sync (bidirectional)

**Lists ↔ Categories:**
- **App → Trello**: `handleDeleteCategory` archives the linked Trello list via `archiveTrelloList()` (PUT `closed: true`). Guest/read-only users skip the archive call. Also cleans up orphaned tasks.
- **Trello → App**: During sync, categories whose `trelloListId` points to an archived/deleted list are removed along with their actions and tasks. Both sync modes.

**Cards ↔ Tasks (card-as-task) / Actions (card-as-action):**
- **App → Trello**: `handleDeleteTask` archives the linked Trello card via `archiveTrelloCard()`. `handleDeleteAction` does the same in card-as-action mode. Guest/read-only users skip the archive call.
- **App → Trello (card-as-action tasks)**: `handleDeleteTask` deletes the linked Trello checklist item via `deleteTrelloChecklistItem()`.
- **Trello → App**: During sync, tasks/actions whose `trelloCardId` points to a missing/deleted card are marked `status: 'paused'`. Archived cards (`closed: true`) are similarly paused with `trelloArchived: true`. Archived cards are NOT re-imported as new entities.

**Helper functions** in `trello.js`: `archiveTrelloList(listId)`, `archiveTrelloCard(cardId)` — both wrap `updateXxx(id, { closed: 'true' })`.

### Sync robustness

- **Sync lock**: module-level `syncInProgress` flag + 60s auto-timeout in `trelloSync.js`
- **Pre-sync snapshot**: board saved to `localStorage('trello_sync_snapshot')` before each sync; auto-restored on failure (24h validity)
- **Retry**: `trelloFetch` retries 3× on 429/502–504/network errors — backoff 1s, 2s, 4s
- **Post-sync**: `validateBoardIntegrity()` checks orphan refs + duplicate IDs. Light Supabase fetch 4s after sync to recover ignored Realtime events.

---

## Known Pitfalls

### Supabase Realtime infinite loop
`isReceivingRealtimeRef` flag — set `true` when handling Realtime event; auto-save skips if true; resets after 2s. Realtime merge uses `{ ...localSync, ...(incomingSync || {}) }` — local trelloSync as base, incoming on top. Always preserves local `syncMode` when incoming doesn't have one.

### Stale closures in save functions
`boardDataRef` updated synchronously before each save. Do not capture state directly in save callbacks.

### TimelineView — TDZ (Temporal Dead Zone)
`colWidth` must be declared **before** any `useCallback` that references it. Same for `getTaskPosition`, `calculateSwimLanes`, `dateToPixel`, `pixelToDate`. Current order in `TimelineView.jsx`: `colWidth` (~line 29) → `getCenterDate` → `scrollToDate` → helpers → handlers.

### GitHub SHA conflicts
Always fetch latest SHA before PUT. Auto-resolve on 409/sha-mismatch: re-fetch then retry.

### UTF-8 on GitHub API
Explicitly encode/decode UTF-8 in `api/github.js` load and save functions.

### Kanban month/quarter/country view reorder
Uses inline batch reorder in `KanbanView` via `onBatchUpdateTasks` — not `App.jsx`'s `handleReorderTask`. `getTaskMonth()` is defined at component level (NOT inside `getColumns()`) so it's accessible from the inline handler. **Cross-column drags** (dragIdx < 0) use a single `onUpdateTask` call instead of batch — the dragged task is not in the target column's items array, so batch reorder would corrupt order.

### Board duplication strips Trello metadata
`handleDuplicateBoard` removes all Trello sync fields (`trelloSync`, `trelloBoardId`, `trelloCardId`, `trelloListId`, etc.) from the cloned board. Without this, both copies would sync to the same Trello board.

### Batch updates for reorder operations
Any reorder that affects multiple tasks (kanban cards, action modal groups/tasks) must use `handleBatchUpdateTasks` — a single atomic `setTasks` call. Do NOT use N separate `onUpdateTask` calls in a loop (causes React state batching to lose intermediate updates).

### Category column reorder + Trello sync
`handleColumnDrop` in KanbanView updates both `catOrder` (localStorage) AND each category's `order` field via `onUpdateCategory`. The `order` field + `updatedAt` timestamp are used by Trello sync to push positions.

### Kanban column drag vs card drag
`onDragStart` inside `.kanban-cards` calls `e.stopPropagation()` — prevents column drag when dragging a card.

---

## Authentication

- `AuthGate.jsx` — shown before app loads
- Two modes: Trello OAuth login OR guest password (`GUEST_PASSWORD` env var via `api/auth.js`)
- Trello token → `localStorage('trello_user_token')` | Guest → `sessionStorage('guest_auth')` (expires on tab close)
- `robots.txt` + `<meta noindex>` block search engine crawling
- **Guest + Trello board**: read-only mode (no pushes to Trello)

---

## Roadmap

- ✅ Phase 0 — Vite migration
- ✅ Phase 1 — Multi-board
- ✅ Phase 2 — Trello integration
- ✅ Phase 3 — Auth + UI improvements
- 🔲 Phase 4 — File attachments (`attachments: []` field exists, no upload UI yet)
