# DECISIONS.md — Marketing Dashboard

> Append-only decisions log. Newest entries at top.
> Do NOT duplicate content already present in CLAUDE.md current state.
> Format: one row per decision — date | decision | context (one sentence max).

---

## Maintenance Rules (for Claude Code)

- **Append only** — never edit or delete existing rows.
- **Newest first** — insert new rows at the top of the table.
- **One row per decision** — if multiple small decisions were made in one session, group them as one row with a compound decision label if needed.
- **Decision column** = what changed (action verb: "Add", "Fix", "Replace", "Remove", etc.).
- **Context column** = why, in one sentence. No narrative, no bullet lists.
- If a decision **supersedes** a previous one, note it: `(supersedes 2026-02-XX)`.
- Do not add rows for trivial implementation details — only decisions that affect architecture, patterns, cross-cutting concerns, or recurring bugs.

---

## Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-03-31 | Add save fallback cascading (Supabase → GitHub → localStorage) + validateBoardIntegrity on Realtime incoming data + localStorage quota guard | Supabase outage silently lost data; corrupted Realtime data propagated across clients; localStorage quota errors failed silently |
| 2026-03-30 | Fix card-as-action: pause action (not just tasks) when Trello card is deleted/archived; add unarchive restore logic | Action stayed `status: 'active'` when its card was deleted/archived on Trello — only tasks were paused |
| 2026-03-30 | Fix ghost tag: move `trelloLastModified` after all push operations + preserve local labels in "neither changed" path | Push API calls update `dateLastActivity` on Trello; setting `trelloLastModified` before caused false `trelloCardModified` on next sync, pulling stale labels |
| 2026-03-30 | Fix duplicate list: dedup by name before `createTrelloList` + use `activeListsCA` in pull phase (both modes) | Creating a local category matching an existing Trello list created a duplicate; pull phase iterated all lists including archived |
| 2026-03-27 | Fix label mapping persistence: save `mappingConfig.labelMappings` to `syncedBoard.trelloSync.labelMappings` + update `_inherit*` baseline after push | New labels created by pushActionLabelsToTrello/pushTaskLabelsToTrello were lost across sync cycles, causing tags to disappear after subsequent modifications |
| 2026-03-26 | Fix card-as-action: `mergeCheckItemIntoTask` now syncs `trelloChecklistId`/`trelloChecklistName` from Trello parent checklist on pull | Items moved between checklists on Trello kept stale group membership locally; only update in pull paths to avoid overwriting local move intent |
| 2026-03-26 | Fix card-as-action: remove tasks when Trello checklist item/checklist is deleted; add null guard at line 1596 for multi-action sync | Item deletion set `trelloItemDeleted` flag but never removed the task; checklist deletion set task to null but crashed on next action's loop accessing `null.actionId` |
| 2026-03-25 | Add selective push with `_trelloBaseline` for all content fields in both modes | Full push overwrote Trello changes to fields the user didn't touch (e.g., changing name locally overwrote Trello's date change); now only locally-modified fields are pushed, non-pushed fields are merged from Trello |
| 2026-03-25 | Extend label sync decoupling to card-as-task mode with `_inherit*` fields + label guard | Same label re-addition bug as card-as-action also affected card-as-task; also fix `mergeTrelloExtrasIntoTask` union merge overwriting pushed labels |
| 2026-03-25 | Fix card-as-action label sync: decouple label sync from content LWW — use `_inheritChannels`/`_inheritCountries`/`_inheritOtherLabels` baseline to detect local label changes; pull Trello labels when user only changed content (supersedes 2026-03-24) | When both sides changed and local won content, stale labels were re-pushed to Trello because `{ ...action }` preserved old tags; now labels from Trello are merged when user didn't explicitly change labels |
| 2026-03-24 | Fix card-as-action label removal sync: pass merged action (not original) to `pushActionExtrasToTrello`, remove `...action` spread that overwrote pulled labels | Removing a label on Trello was reverted by sync because extras push spread the original action (with old tags) over the merged action, then label push re-added them |
| 2026-03-23 | Fix card-as-action sync: position push guard uses `orderUpdatedAt` (not `actionHadLocalPush`), add cross-checklist item move via `idChecklist`, remove tasks when entire checklist deleted on Trello | Content-only push was overwriting Trello reorders; moving tasks between groups created duplicate checklists; checklist deletion on Trello left zombie tasks locally |
| 2026-03-23 | Add task/group deletion in ActionDetailModal (card-as-action): `handleDeleteTaskGroup` handler + delete buttons with confirmation popups | Tasks and task groups had no delete UI in the action modal — users could only delete the entire action |
| 2026-03-23 | Fix card-as-action checklist reorder sync: use composite order (`checklist.pos * 65536 + item.pos`) in `mergeCheckItemIntoTask` | Plain `item.pos` ignored checklist-level position changes — reordering checklists on Trello had no effect on task group order, and App→Trello reorders reverted on next pull |
| 2026-03-22 | Fix Trello polling interval reset: use ref pattern for handleTrelloSync in polling useEffect; clean listToCatId after category removal; add updatedAt to mergeCardIntoAction | Polling useEffect depended on handleTrelloSync callback which changed on every board/status update — interval timer reset constantly so auto-sync never fired; stale listToCatId entries caused cards to map to removed categories |
| 2026-03-22 | Fix card-as-action position push feedback loop: update trelloLastModified on tasks/action after position push | Position push updated card.dateLastActivity on Trello without updating local trelloLastModified, causing next sync to falsely detect Trello changes and overwrite local order values — groups jumped randomly |
| 2026-03-22 | Fix card-as-task checklist/item position pull in mergeTrelloExtrasIntoTask (add order field + sort by Trello pos); fix KanbanView filter/search for card-as-action mode (filter actions by matching tasks, pass filteredTasks to ActionCard) | mergeTrelloExtrasIntoTask was overwriting position sort by not capturing order from Trello pos; ActionCard received unfiltered tasks and action cards were never filtered out when no tasks matched search/filter criteria |
| 2026-03-22 | Fix mention regex to support Unicode accented chars (markdown.jsx + MentionInput.jsx); fix card-as-action checklist/item position pull + push guard (trelloMapping.js + trelloSync.js) | `\w` regex truncated accented member names in rendered mentions; `mergeCheckItemIntoTask` didn't pull `order` from `item.pos`, and position push always ran even when Trello won — overwriting Trello reorders |
| 2026-03-22 | Fix regression: skip trelloCardId dedup in card-as-action mode in validateBoardIntegrity, remove duplicate header search bar (keep FilterSidebar search only) | Previous commit's auto-repair dedup deleted all but one task per action in card-as-action mode because multiple tasks legitimately share the same trelloCardId (checklist items on one card); header search was redundant with FilterSidebar search |
| 2026-03-22 | Fresh-eyes sync audit v2: add isSyncInProgress() to Realtime gate, auto-repair in validateBoardIntegrity, default action deletion guard, card-as-action task/action move sync, updatedAt on auto-created default actions | 4-agent parallel audit found Realtime could overwrite sync results (missing gate check), orphaned data was logged but never repaired, default actions could be deleted breaking Kanban, and entity moves in card-as-action mode were never pushed to Trello |
| 2026-03-22 | Exhaustive sync audit fix: add updatedAt/month to mergeCardIntoTask, preserve unmapped local channels/countries, add updatedAt to handleAddTask/handleAddAction/handleReorderTask, add pushActionLabelsToTrello for card-as-action, add trelloItemDeleted flag, add dedup guard on card import | After multiple rounds of sync fixes, systematic audit revealed 9 remaining bugs: missing timestamps broke last-write-wins, month not recalculated on pull, local-only channels lost on merge, action labels never pushed in card-as-action mode, deleted checklist items re-created as duplicates, race condition on double-sync created duplicate tasks |
| 2026-03-22 | Fix checklist/item position sync (isPushWinner flag), fix missing channels in mergeCardIntoTask, add label re-pull in mergeTrelloExtrasIntoTask, add @mention autocomplete in comments, add Action→Task tag inheritance, add Trello icon in board title header | Checklist reorders on Trello were overwritten by local push; channels from Trello labels were never pulled; after push, Trello-added labels were lost; users couldn't tag teammates in comments; action tag updates didn't propagate to linked tasks; Trello-synced boards had no visual indicator in header |
| 2026-03-22 | Tier 3 audit: 43 Vitest tests, quick-add inline Kanban, Context expansion (categories/actions/tasks/filters), responsive mobile CSS, Supabase Storage attachments with base64 fallback, 8s AbortController timeout on trelloFetch | Tests prevent regressions, quick-add reduces friction, Context reduces 26+ props drilling, mobile UX was unusable, inline base64 bloated JSON, Trello requests hung indefinitely |
| 2026-03-22 | Tier 2 audit: ErrorBoundary, HTML escaping in markdownToHtml, persistent sync indicator, global search, "My tasks" filter, LATE badges, onboarding overlay, field-by-field Realtime merge, Realtime connection monitoring | Audit revealed XSS via innerHTML, no error recovery, ephemeral save feedback, no onboarding, shallow Realtime merge losing fields, no connection monitoring |
| 2026-03-22 | Tier 1 audit quick wins: memoize KanbanView getColumns/filteredTasks, reduce sync lock 60s→15s, env vars for Supabase, CSP headers, DnD cursor affordance, goOnline 2s delay | Comprehensive audit revealed perf waste (recalc every render), stale lock exceeding Vercel timeout, hardcoded credentials, missing security headers, invisible drag capability, and Realtime race on reconnect |
| 2026-03-21 | Comprehensive sync audit: fix card list-move detection, category name sync (card-as-task), createCard missing fields, offline guard, drag guard for Kanban, auto-save sync lock | Card moves between Trello lists left tasks in wrong category; category names never synced in card-as-task; new cards created without start/pos/members; offline sync could overwrite local edits; Kanban drag didn't block auto-save; auto-save could write mid-sync data |
| 2026-03-21 | Add bidirectional deletion sync for tasks/actions: archive Trello cards on local delete, delete checklist items on task delete (card-as-action) | Tasks/actions deleted locally left orphaned cards on Trello that were re-imported on next sync; archiving (not hard delete) keeps reversibility |
| 2026-03-21 | Add missing syncMode to card-as-task import, add bidirectional list deletion sync, fix Realtime merge to preserve all trelloSync fields | syncMode was never set causing "New action" button to show, list deletion was one-way only, Realtime merge could lose trelloSync fields when incoming was undefined |
| 2026-03-20 | Fix card-as-task "New Action" bug, add touch DnD to all draggable components, CSS responsive mobile | allDefault now handles empty categories in card-as-task mode, useTouchDrag hook + inline touch on ActionCard/CalendarView/ActionDetailModal/TaskDetailModal/KanbanView columns, modals responsive at 480px, touch targets 44px on coarse pointer |
| 2026-03-20 | Strip Trello metadata on board duplication, fix showArchived reset on board switch, fix Kanban cross-column card drag disappearance, add delete confirmations on task/action/category | Duplicated Trello boards no longer sync to same source, filters fully reset on switch, cross-column drag now uses single onUpdateTask instead of broken batch reorder, accidental deletes prevented |
| 2026-03-20 | Full audit: replace all Date.now() IDs with crypto.randomUUID(), fix handleBatchUpdateTasks date priority, add missing timestamps/gradient to inline entity creation, hide Action section in NewTaskModal for card-as-task | 30+ ID collisions risk eliminated, batch reorder month mismatch fixed, inline-created entities now sync-ready with timestamps, Action UI fully hidden in card-as-task mode |
| 2026-03-20 | Audit fix: protect statuses from Trello overwrite, sync startDate, auto-sync after save, robust Realtime guard, add gradient/timestamps to new categories, hide Action dropdown in card-as-task | Comprehensive sync audit — TRELLO_PROTECTED_STATUSES prevents status reversal, post-save debounced sync replaces manual clicks, syncRealtimeGuardRef ties guard to save cycle, missing fields on new Trello categories caused visual bugs |
| 2026-03-20 | Fix month/quarter column assignment to use dueDate first, add list sync to card-as-task, auto-create default actions, hide all action creation UI, fix checklist reorder DnD | Multiple card-as-task bugs: month used startDate, new lists didn't sync, new categories had no default action, inline "Create action" was still visible, checklist drag events bubbled incorrectly |
| 2026-03-20 | Fix "Add" button in category view to create task (not action) for card-as-task boards + hide "New Action" in header | Creating actions in card-as-task mode breaks `allDefault` invariant — "Add" now opens NewTaskModal with default action pre-filled |
| 2026-03-20 | Remove "Action" label mapping option for card-as-task sync mode | Mixing default + non-default actions in one category breaks Kanban `allDefault` check — users wanting action-level organization should use card-as-action mode instead |
| 2026-03-20 | Fix Kanban card drag for directTasks category view + add Trello icon in board selector | card-as-task boards showed TaskCards but drop handler only checked `actionId`; inline batch reorder excluded category view |
| 2026-03-20 | Move getTaskMonth out of getColumns() to component scope | Root cause of persistent month/quarter reorder failure — function was unreachable from inline handler, causing silent ReferenceError |
| 2026-03-20 | Add handleBatchUpdateTasks for all multi-task reorder operations | N separate onUpdateTask calls caused React state batching to lose intermediate order updates |
| 2026-03-20 | Category column reorder now updates category.order field | Column drag only saved to localStorage, Trello sync couldn't detect position changes |
| 2026-03-20 | Add dedup guard in card-as-action checklist item pull | Tasks that lost trelloCheckItemId were recreated as duplicates on next sync |
| 2026-03-18 | crypto.randomUUID for all entity IDs | Eliminates ID collision risk from `Date.now()+Math.random()` |
| 2026-03-18 | CORS restriction via ALLOWED_ORIGIN | Replace wildcard `*` with env var on `api/trello.js` and `api/github.js` |
| 2026-03-18 | Remove sendBeacon dead code | `/api/save-beacon` endpoint never existed — localStorage sync is sufficient |
| 2026-03-18 | Offline mode with yellow banner | `navigator.onLine` detection; saves to localStorage only when offline, auto-resync on reconnect |
| 2026-03-18 | Snapshot ring buffer (3 slots) | Rotating snapshots `mkt_snapshot_0/1/2` on auto-save, 48h TTL, restorable via `restoreSnapshot(index)` |
| 2026-03-18 | Post-sync Supabase refresh (4s) | Light load after Trello sync recovers Realtime events ignored during sync lock |
| 2026-03-18 | Post-sync integrity check | `validateBoardIntegrity()` after every sync — orphan refs, duplicate IDs, missing syncMode |
| 2026-03-18 | Detailed sync error tracking | `result.errorDetails [{name, op, error}]` shows failed item names in notification |
| 2026-03-18 | Trello retry with exponential backoff | `trelloFetch` retries 3× on 429/502–504/network errors; backoff 1s, 2s, 4s |
| 2026-03-18 | Pre-sync snapshot (24h validity) | Save board to `localStorage('trello_sync_snapshot')` before sync; auto-restore on failure |
| 2026-03-18 | Sync lock with 60s auto-timeout | Prevents permanent sync blockage when Trello API hangs |
| 2026-03-18 | Checklist deletion guard | Only delete Trello checklists when `localChecklistIds.size > 0` — prevents wiping card-as-action data |
| 2026-03-18 | Card-as-action task guard | Skip tasks with `trelloCheckItemId`/`trelloChecklistName` in card-as-task path — prevents data corruption if syncMode lost |
| 2026-03-18 | Sync merge-by-ID for comments/checklists | Match by Trello ID (not name) — preserves local-only items, avoids duplicates |
| 2026-03-18 | Card-as-Action sync mode | Per-board `trelloSync.syncMode`: `card-as-task` (default) or `card-as-action` (Cards→Actions, ChecklistItems→Tasks) |
| 2026-03-18 | Realtime syncMode protection | Merge incoming Realtime data preserving local `trelloSync.syncMode` if incoming is missing it |
| 2026-03-18 | Checklist position sync via `pos` | Checklist and item order synced with Trello `pos` field; `Promise.all` for parallel updates |
| 2026-03-18 | Member picker via ReactDOM.createPortal | Escapes modal stacking context — prevents picker clipping |
| 2026-03-18 | Comment deduplication before push | Check text match before pushing to Trello — prevents duplicate comments |
| 2026-03-18 | OAuth via postMessage | Replace `callback_method=fragment` — no return_url whitelist needed |
| 2026-03-18 | Guest read-only on Trello boards | Full read-only mode for guest users visiting Trello-linked board |
| 2026-03-18 | Auth gate (AuthGate.jsx) | Trello OAuth login or guest password; guest uses sessionStorage (expires on tab close) |
| 2026-03-18 | Enhanced Markdown (SimpleMarkdown) | Headings, blockquotes, fenced code blocks, ordered lists, strikethrough, hr — no innerHTML |
| 2026-03-18 | WYSIWYG contentEditable descriptions | Replace textarea with contentEditable + markdown conversion in TaskDetailModal/comments |
| 2026-03-18 | Unified task creation modal | All entry points (Kanban/Timeline/Calendar/header) use `NewTaskModal` with `initialValues` prop |
| 2026-03-18 | beforeunload save flush | Flush pending auto-save debounce on tab close; synchronous localStorage save as guaranteed fallback |
| 2026-03-18 | Trello archived cards support | `filter=all` fetch; `card.closed` → `trelloArchived=true` + `status='paused'`; "Show archived" filter toggle |
| 2026-03-18 | Named checklists (task.checklists) | Replace flat `task.checklist`; named groups with per-checklist progress; `normalizeTaskChecklists()` migration |
| 2026-03-18 | Trello OAuth login per-user token | `X-Trello-Token` header sent per-user; server prefers it over env `TRELLO_TOKEN` |
| 2026-03-18 | Label remap after import | `TrelloImportModal` supports `mappingOnly` mode; "Re-configure Labels" in BoardSettingsModal |
| 2026-03-18 | Trello sync polling lifecycle | Managed in App.jsx via `trelloSyncIntervalRef`; starts/stops on board change or settings change |
| 2026-03-18 | Trello integration (Phase 2) | `api/trello.js` serverless proxy, import wizard, bidirectional sync, last-write-wins |
| 2026-03-18 | robots.txt + noindex meta | Block search engine crawling of the app |
| 2026-03-18 | Calendar +N more expands row | "+N more" expands week row in month view (click again to collapse) — no new task creation |
| 2026-03-18 | Calendar hover add button | ClickUp-style "+" hover button (bottom-left of day cell) replaces click-on-day task creation |
| 2026-03-18 | Calendar bar color system | All bars use category color gradient — consistent across single-day and multi-day tasks |
| 2026-03-18 | Calendar view added | Month/week modes, shared `computeWeekBars()`, drag-to-reschedule, ClickUp-inspired |
| 2026-03-18 | Draggable Kanban columns | Category and country views; order persisted to localStorage; `stopPropagation` separates card vs column drag |
| 2026-03-18 | Multi-board v2 format (Phase 1) | Boards array in data envelope; BoardSelector; BoardSettingsModal; `board_data` JSONB column in Supabase |
| 2026-03-18 | Inline category/action creation | NewActionModal creates categories inline; NewTaskModal creates actions inline |
| 2026-03-18 | Kanban "By Country" view | 5th grouping mode; all 16 countries as columns + "Unassigned"; drag replaces country (not appends) |
| 2026-03-18 | Vite migration (Phase 0) | Monolith `index.html` (~3800 lines) → Vite 5 + modular React components in `src/` |
| 2026-03-18 | CLAUDE.md created | Persistent memory file across Claude Code sessions |
| 2026-03-18 | isReceivingRealtimeRef flag | Prevent infinite loop between Supabase Realtime and auto-save |
| 2026-03-18 | Refs for save closures | Fix stale closure in save callbacks; `boardDataRef` updated synchronously before each save |
| 2026-03-18 | GitHub org migration | Moved `FbnCrr/Dashboard-marketing` → `migso-pcubed-mkt-com/Marketing-Dashboard` |
| 2026-03-18 | Dark mode removed (V3.0) | V11 design system migration — single-theme CSS only. Do NOT re-add `dark:` classes. |
| 2026-03-18 | Timeline swim lane freezing | Prevent visual jumps during drag/resize — freeze lane order during operations |
| 2026-02-28 | UI translated to English | International team accessibility |
| 2026-02-28 | Vercel serverless for GitHub proxy | Keep GITHUB_TOKEN server-side |
| 2026-02-28 | GitHub API as fallback storage | Original storage layer kept for resilience alongside Supabase |
| 2026-02-28 | Supabase as primary storage | Real-time sync needed for multi-device use |
| 2026-02-28 | Single index.html architecture (superseded 2026-03 Vite) | Initial simplicity choice — no build step, CDN deps. Superseded by Vite migration. |
