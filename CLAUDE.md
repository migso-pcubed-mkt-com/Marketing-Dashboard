# CLAUDE.md — Marketing Dashboard

> Memory file for Claude Code. Loaded automatically at session start.
> Last updated: 2026-03-31 (fix dueComplete, card delete unlink, post-sync auto-save persistence)

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
- **Vitest** for unit tests (43 tests across 4 files)
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
├── components/
│   ├── ErrorBoundary.jsx # Error boundary wrapper for views
│   ├── MentionInput.jsx  # @mention autocomplete for comments (contentEditable + dropdown)
│   └── OnboardingOverlay.jsx # First-run tour (4 steps, localStorage)
├── __tests__/           # Vitest unit tests (migration, mapping, sync, markdown)
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
npm test          # Run Vitest tests (43 tests)
npm run test:watch # Watch mode
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
| Attachments | Supabase Storage | Bucket: `attachments`. Falls back to base64 data URLs if Storage unavailable. `uploadAttachment()` / `deleteAttachment()` in `storage.js` |

**Load order**: Supabase → GitHub → localStorage. `localStorage` is backup only — never primary.

**Offline mode**: `navigator.onLine` detection — saves to localStorage only + yellow banner. Auto-resync on reconnect.

**Required Supabase migration**: `ALTER TABLE app_data ADD COLUMN IF NOT EXISTS board_data JSONB;`

---

## State Management

Central state in `App.jsx`:
- `boardData` — full v2 envelope; `currentBoardId` — active board
- `categories`, `actions`, `tasks` — derived via `useMemo` from active board
- Single `boardDataRef` (replaces old `categoriesRef`/`actionsRef`/`tasksRef`)

`AppContext` (`useApp()`) exposes: `boards`, `currentBoardId`, `currentBoard`, `categories`, `actions`, `tasks`, `filters`, `setFilters`, `isReadOnly`, `allCountries`, `trelloUser`, board CRUD handlers, Trello sync handlers.

Props still drilled for view-specific handlers (`onUpdateTask`, `onOpenTask`, etc.).

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
- **App → Trello (card-as-action groups)**: `handleDeleteTaskGroup` deletes all checklist items + the checklist itself via `deleteTrelloChecklistItem()` + `deleteTrelloChecklist()`.
- **Trello → App**: During sync, tasks/actions whose `trelloCardId` points to a missing/deleted card are marked `status: 'paused'`. Archived cards (`closed: true`) are similarly paused with `trelloArchived: true`. Archived cards are NOT re-imported as new entities.

**Helper functions** in `trello.js`: `archiveTrelloList(listId)`, `archiveTrelloCard(cardId)` — both wrap `updateXxx(id, { closed: 'true' })`.

### Card movement sync (card-as-task)

When a card is moved between lists on Trello, `mergeCardIntoTask()` detects the list change via `listToCatId` and updates `actionId` to the default action of the new category. Prevents ping-pong between Trello and local category assignment.

### Category name sync (card-as-task)

Category names are synced bidirectionally in both modes. Push: local rename → Trello list renamed. Pull: Trello list renamed → local category renamed. Uses timestamp-based "last write wins" like all other fields.

### Sync robustness

- **Sync lock**: module-level `syncInProgress` flag + 15s auto-timeout in `trelloSync.js`. Exported via `isSyncInProgress()` — auto-save defers while sync is running.
- **Offline guard**: `handleTrelloSync` skips if `!navigator.onLine` — prevents snapshot restore from overwriting offline edits.
- **Drag guard**: `isUserInteractingRef` blocks auto-save during Kanban/Timeline drag (passed to KanbanView + TimelineView).
- **Pre-sync snapshot**: board saved to `localStorage('trello_sync_snapshot')` before each sync; auto-restored on failure (24h validity)
- **Retry**: `trelloFetch` retries 3× on 429/502–504/network errors/timeouts — backoff 1s, 2s, 4s. 8s AbortController timeout per request.
- **Post-sync**: `validateBoardIntegrity()` checks orphan refs + duplicate IDs + auto-repairs (removes orphans, deduplicates, creates missing default actions). Light Supabase fetch 4s after sync to recover ignored Realtime events.
- **Realtime guard during sync**: Realtime handler checks `isSyncInProgress()` — prevents Realtime events from overwriting freshly synced data.

### Sync boundaries (by design)

- `budget`, `priority` are local-only fields (no Trello equivalent). Preserved via `...existingTask` spread during merge.
- Task `order` is independent of Trello card `pos` (Kanban reorder is local). Checklist/item positions sync bidirectionally (push when local wins, pull when Trello wins via `isPushWinner` flag in `pushTaskExtrasToTrello`).
- `channels`, `countries`, `otherLabels` are synced bidirectionally via label mappings. `mergeTrelloExtrasIntoTask` re-pulls labels after push (union merge). `mergeCardIntoTask` preserves local-only channels/countries (those without a Trello label mapping) via union merge with mapped values. Action labels are pushed via `pushActionLabelsToTrello()` in card-as-action mode.
- `createCard` supports `start`, `pos`, `idMembers`, `dueComplete` for full field creation.
- **Action→Task tag inheritance**: `handleUpdateAction` propagates tag/country changes to linked tasks via batch update. Uses union merge: `(new action tags) ∪ (task-specific tags not from old action)`.

---

## Known Pitfalls

### Checklist position sync direction
`pushTaskExtrasToTrello(task, card, isPushWinner)` — positions are only pushed to Trello when `isPushWinner=true` (local won last-write-wins). When `isPushWinner=false`, local checklists/items are reordered to match Trello positions. Do NOT remove the `isPushWinner` parameter or always push positions — this causes Trello reorder to be overwritten. `mergeTrelloExtrasIntoTask` must also capture `order` from Trello `pos` on both checklist and item objects, and sort arrays by `order` — without this, the position pull from `pushTaskExtrasToTrello` gets overwritten.

### card-as-action: checklist/item position sync
`mergeCheckItemIntoTask` computes a **composite order**: `checklist.pos * 65536 + item.pos`. This is critical because when checklists are reordered on Trello, only `checklist.pos` changes — individual `item.pos` values stay the same. Without the composite, checklist reorder is ignored and groups revert on next pull. Do NOT use plain `item.pos` for order — it only encodes position within a single checklist, not across checklists. `mergeCheckItemIntoTask` also updates `trelloChecklistId` and `trelloChecklistName` from the item's actual parent checklist — this ensures items moved between checklists on Trello are reflected in the correct group locally. Do NOT update these fields in push paths (local wins) — that would overwrite the user's local move intent (trelloChecklistName change) needed by the cross-checklist move detection. The position push block in `syncWithTrelloCardAsAction` is guarded by `actionHadLocalOrderChange` — only pushes positions when `orderUpdatedAt > trelloLastModified` on at least one task. Do NOT use `actionHadLocalPush` (content push) for this guard — it overwrites Trello reorders when only content was locally changed. When local wins content (push) but no explicit reorder happened, composite order is still pulled from Trello (`orderWasLocallyChanged` check). After the position push completes, `trelloLastModified` must be updated on all affected tasks AND the action — otherwise `card.dateLastActivity` (updated by the position API calls) appears newer than `task.trelloLastModified`, causing a false "Trello changed" detection on next sync that overwrites local `order` with renormalized Trello positions (feedback loop). `handleBatchUpdateTasks` sets `orderUpdatedAt` when `order` changes — this timestamp drives the position push guard.

### card-as-action: cross-checklist task move
When moving a task between groups in ActionDetailModal, `trelloChecklistName` changes but `trelloChecklistId` stays pointing to the source checklist. The sync detects this mismatch (item's actual checklist on Trello differs from `trelloChecklistName`'s target checklist) and moves the item via `updateTrelloChecklistItem(cardId, itemId, { idChecklist: targetClId })`. Do NOT rely on the checklist name push to handle this — it would incorrectly rename the source checklist. The checklist name push only renames when ALL tasks with the same `trelloChecklistId` agree on the name (uses a `Set` of names, renames only when `size === 1`).

### card-as-action: Trello checklist deletion → local task removal
When an entire checklist is deleted on Trello, tasks whose `trelloChecklistId` no longer exists in `card.checklists` AND whose `trelloCardId` matches the card are removed locally (set to `null`, then filtered). Individual item deletions (checklist still exists but item is gone) still mark `trelloItemDeleted: true`. The `trelloCardId` check prevents removing tasks that were moved between actions (where the checklist "not found" is due to card mismatch, not deletion).

### Mention regex must support Unicode accented characters
`SimpleMarkdown` inline regex and `MentionInput` detection use `[\w\u00C0-\u024F]` instead of `\w` — `\w` is ASCII-only and truncates accented names (e.g., `@Fabien Carrié` → `@Fabien Carri` + orphaned `é`). Do NOT replace with plain `\w`.

### Supabase Realtime infinite loop
`isReceivingRealtimeRef` flag — set `true` when handling Realtime event; auto-save skips if true; resets after 2s. Realtime merge uses `{ ...localSync, ...(incomingSync || {}) }` — local trelloSync as base, incoming on top. Always preserves local `syncMode` when incoming doesn't have one.

### Trello polling interval must use ref, not direct callback
The polling `useEffect` must NOT include `handleTrelloSync` in its deps. `handleTrelloSync` depends on `currentBoard` + `trelloSyncStatus`, which change on every save/sync cycle. Including it resets the interval timer on every change → auto-sync never fires. Use `handleTrelloSyncRef` (ref always pointing to latest callback) + `setInterval(() => handleTrelloSyncRef.current(), intervalMs)`.

### listToCatId must be cleaned after category removal
After removing categories whose Trello lists are archived/deleted, `listToCatId` entries for those categories must be deleted. Otherwise cards on those lists map to non-existent categories during the same sync cycle.

### Stale closures in save functions
`boardDataRef` updated synchronously before each save. Do not capture state directly in save callbacks.

### TimelineView — TDZ (Temporal Dead Zone)
`colWidth` must be declared **before** any `useCallback` that references it. Same for `getTaskPosition`, `calculateSwimLanes`, `dateToPixel`, `pixelToDate`. Current order in `TimelineView.jsx`: `colWidth` (~line 29) → `getCenterDate` → `scrollToDate` → helpers → handlers.

### GitHub SHA conflicts
Always fetch latest SHA before PUT. Auto-resolve on 409/sha-mismatch: re-fetch then retry.

### UTF-8 on GitHub API
Explicitly encode/decode UTF-8 in `api/github.js` load and save functions.

### KanbanView filter/search for action cards (card-as-action)
In category view when `allDefault=false` (card-as-action mode), `ActionCard` receives `filteredTasks` (not raw `tasks`) so task counts reflect active filters. Actions with zero matching tasks are hidden when any filter is active. Search also matches action names. `filters` and `actionFilters` are in the `columns` useMemo deps.

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

### mergeCardIntoTask must set updatedAt and recalculate month
When Trello wins last-write-wins, `mergeCardIntoTask` must set `updatedAt: card.dateLastActivity` and recalculate `month` from the new `dueDate`. Without this, next sync may incorrectly re-evaluate conflict direction, and Kanban month columns show stale data.

### All CRUD handlers must set updatedAt
`handleAddTask`, `handleAddAction`, `handleReorderTask` (cross-column) must set `updatedAt` — Trello sync uses `updatedAt > trelloLastModified` for conflict detection. Missing `updatedAt` causes local changes to be overwritten by Trello.

### card-as-action: Trello checklist item/checklist deletion removes tasks
When a Trello checklist item or entire checklist is deleted, the local task is set to `null` and filtered out. The null guard at line 1596 (`!task ||`) prevents crashes when multiple actions are processed in the same sync cycle. Do NOT remove this guard — without it, a null task from one action's processing crashes the next action's loop.

### card-as-action: pushActionLabelsToTrello for action label sync
Action labels (tags/channels, countries, otherLabels) are pushed to Trello via `pushActionLabelsToTrello()`. Do NOT rely on `pushActionExtrasToTrello()` for labels — that function only handles comments and attachments.

### card-as-action: pushActionExtrasToTrello must use merged action, not original
`pushActionExtrasToTrello(updatedActions[i], card)` must receive the **merged** action (`updatedActions[i]`), NOT the original `action` variable. The function mutates comments/attachments in-place. Do NOT spread `...action` over `updatedActions[i]` after extras push — this overwrites merged tags/countries/otherLabels (from Trello pull) with stale local values, causing `pushActionLabelsToTrello` to re-add labels that were removed on Trello.

### Label sync is independent of content LWW (both modes)
When both sides changed and local wins content, labels must still be pulled from Trello if the user didn't explicitly change labels locally. Detection: compare `action.tags`/`task.channels` with `_inheritChannels` (baseline from last sync). If identical → user didn't change labels → merge labels from Trello card. Applies to card-as-action (actions) and card-as-task (tasks). After `pushTaskLabelsToTrello`/`pushActionLabelsToTrello`, preserve pushed labels through `mergeTrelloExtrasIntoTask` — that function unions stale `card.idLabels`.

### Selective push with _trelloBaseline (both modes)
`_trelloBaseline` stores last-synced Trello values (name, description, dates, status, assignees) on each entity. When both sides changed and local wins, only locally-changed fields (differing from baseline) are pushed. Non-pushed fields are merged from Trello. This prevents overwriting Trello changes to fields the user didn't touch. Helper functions: `buildSelectiveActionUpdate`, `buildSelectiveTaskUpdate`, `buildSelectiveCheckItemUpdate` in trelloSync.js. Without baseline, falls back to full push.

### Dedup guard on card import
`syncWithTrelloCardAsTask` checks `updatedTasks.some(t => t.trelloCardId === card.id)` before importing new cards. Prevents duplicate tasks if sync runs twice in quick succession.

### Default action deletion guard
`handleDeleteAction` blocks deletion of `isDefault: true` actions in card-as-task mode. Without this, all tasks in the category become orphaned and Kanban breaks.

### validateBoardIntegrity trelloCardId dedup: card-as-task ONLY
`validateBoardIntegrity()` deduplicates `trelloCardId` in card-as-task mode only. In card-as-action mode, multiple tasks legitimately share the same `trelloCardId` (checklist items on one card). Do NOT apply `trelloCardId` dedup in card-as-action mode — it deletes all but one task per action.

### validateBoardIntegrity auto-repairs
`validateBoardIntegrity()` now removes orphaned tasks/actions, deduplicates `trelloCardId`/`trelloCheckItemId`, and creates missing default actions. Returns `{ board: repairedBoard }` — callers must use `integrity.board`.

### card-as-action: task move between actions
When a task's `actionId` changes in card-as-action mode, the sync detects the `trelloCardId` mismatch, deletes the old checklist item, and clears IDs so the task is recreated under the new action's card. Do NOT skip this move detection — without it, moved tasks become zombies.

### card-as-action: action move between categories
`handleReorderAction` sets `updatedAt` on cross-category moves. The sync pushes `idList` via `mapActionToTrelloCardUpdate`. Without `updatedAt`, the timestamp comparison fails and the move is never pushed.

### Label mapping persistence across sync cycles
`pushActionLabelsToTrello` and `pushTaskLabelsToTrello` may create new Trello labels (when a channel/other tag has no existing mapping). These mutations on `mappingConfig.labelMappings` MUST be persisted to `syncedBoard.trelloSync.labelMappings` at the end of each sync. Without this, new mappings are lost on the next sync cycle and `mergeCardIntoAction`/`mergeCardIntoTask` can't map the label back → tags disappear.

### `_inheritChannels` baseline must be updated after label push
After `pushActionLabelsToTrello`/`pushTaskLabelsToTrello`, update `_inheritChannels`/`_inheritCountries`/`_inheritOtherLabels` to match the pushed values. Without this, `labelsChangedLocally` permanently reports `true` (baseline never matches current tags), breaking label change detection on subsequent syncs.

### card-as-action: trelloLastModified must be set AFTER all push operations
`trelloLastModified` is set AFTER `pushActionExtrasToTrello` and `pushActionLabelsToTrello` (at the end of the push block), not during the content push path. The push API calls update `card.dateLastActivity` on Trello. If `trelloLastModified` were set before, the next sync sees `dateLastActivity > trelloLastModified` → false `trelloCardModified` → pulls stale labels (ghost tag). Also, the "neither changed" path preserves local labels instead of merging from Trello, preventing ghost tags from stale Trello cache.

### List push must dedup by name (both modes)
When creating Trello lists for new local categories, check if an active Trello list with the same name already exists. If so, link to it instead of calling `createTrelloList`. Without this, creating a category locally that matches an existing Trello list creates a duplicate. Both card-as-task and card-as-action modes.

### card-as-action: pull phase must use activeListsCA, not all lists
The pull phase that creates local categories from new Trello lists must iterate `activeListsCA` (active only), not `lists` (all including archived). Otherwise archived/closed lists create ghost categories that are immediately removed by the archive cleanup code.

### card-as-action: action must be paused on card delete/archive
When a Trello card is deleted or archived, the ACTION itself (not just its tasks) must be set to `status: 'paused'`. Card delete: `{ ...action, status: 'paused' }`. Card archive: `{ ...action, status: 'paused', trelloArchived: true }`. Card unarchive: restore action status + clear `trelloArchived`. Uses `let action` (not `const`) so the unarchive block can update the reference for subsequent sync paths.

### Save fallback cascading
`saveData()` tries Supabase first. If Supabase fails and GitHub token is available, falls back to GitHub. If both fail, saves to localStorage only and warns the user. Do NOT remove the fallback chain — without it, a Supabase outage silently loses unsaved data.

### Realtime incoming data must pass validateBoardIntegrity
The Realtime handler calls `validateBoardIntegrity` on each incoming board before merging. This catches corrupted data from other clients (orphan refs, duplicate IDs, missing default actions). Do NOT skip this check — it prevents cascading corruption across clients.

### localStorage quota handling
`saveToLocalStorage` and `saveSnapshot` catch `QuotaExceededError`. On quota exceeded: `saveToLocalStorage` clears all snapshots and retries; `saveSnapshot` clears the oldest snapshot and retries. Do NOT let quota errors silently fail — the backup save is the last resort.

### Realtime must skip when auto-save is pending
The Realtime handler checks `autoSaveTimeoutRef.current` — if a debounced save is pending, it means there are unsaved local changes. Accepting Realtime data would overwrite them. Do NOT remove this guard — the 1-2s debounce window is the highest-risk period for data loss.

### Concurrent tab detection via BroadcastChannel
`BroadcastChannel('mkt_dashboard_tabs')` detects other open tabs. Messages: `tab-open` (announce), `tab-ack` (reply), `tab-close` (leaving). Orange banner warns user of conflict risk. `beforeunload` sends `tab-close`. Do NOT use localStorage-based detection — BroadcastChannel is more reliable and doesn't trigger storage events.

### _saveId echo filter for Realtime
Each auto-save stamps a `_saveId` (UUID) on `boardDataRef.current`. The Realtime handler compares incoming `_saveId` with `lastSaveIdRef.current` — if they match, it's our own echo and is skipped. This replaces reliance on the fixed 3s `justSavedTimestampRef` guard for echo detection. The 3s guard and `syncRealtimeGuardRef` (8s post-sync) are kept as additional safety layers. Do NOT remove any of the three guards — they cover different edge cases (saveId = echo detection, 3s = rapid saves, 8s = post-sync window).

### Post-sync: do NOT set isReceivingRealtimeRef
After Trello sync, use `syncRealtimeGuardRef` (checked by Realtime handler) to block incoming events — do NOT set `isReceivingRealtimeRef.current = true`. That flag blocks auto-save, which prevents synced data from being persisted to Supabase. Without auto-save, sync results (archive/delete/position changes) are lost on page refresh.

### No-conflict local push must use buildSelective*, not map*ToTrelloCardUpdate
The "local only changed" push paths (card-as-task line 847, card-as-action line 1558) must use `buildSelectiveTaskUpdate` / `buildSelectiveActionUpdate` — NOT `mapTaskToTrelloCardUpdate` / `mapActionToTrelloCardUpdate`. The `map*` functions always include `dueComplete` regardless of status change, triggering false "completed this card" activity on Trello.

### Card permanent deletion must unlink, not just pause
When a Trello card is permanently deleted (missing from API response), the local entity must be unlinked (`trelloCardId: undefined, trelloUnlinked: true`) — not just paused. Without unlinking, the "push new tasks" section re-creates a Trello card for the deleted entity. Without `trelloUnlinked`, the entity would be pushed as a new card on next sync.

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
- ✅ Phase 4 — File attachments (Supabase Storage with base64 fallback, drag & drop UI)
