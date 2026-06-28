import { useRef, useCallback, useState } from 'react';

const MAX_HISTORY = 60;
const DEFAULT_COALESCE_MS = 400;

// Fields that cross the Trello sync boundary. When restoring a snapshot
// (undo/redo/jumpTo), any entity whose values for these fields differ from
// the *current* live state is flagged as "locally changed now" by bumping
// updatedAt — that way the next Trello sync runs last-write-wins with the
// restored values winning and pushes them back to Trello. Without this,
// undo would silently lose the push because the snapshot's updatedAt
// predates trelloLastModified and LWW would pull from Trello instead.
const SYNC_FIELDS_TASK = ['title','description','startDate','dueDate','status','priority','budget','month','channels','countries','otherLabels','order','assignees','trelloChecklistName','trelloChecklistId','checklist','checklists','swimLane','actionId'];
const SYNC_FIELDS_ACTION = ['name','description','startDate','dueDate','budget','priority','tags','channels','countries','otherLabels','status','order','categoryId','assignees'];
const SYNC_FIELDS_CATEGORY = ['name','color','order'];

const mapById = (arr) => {
    const m = new Map();
    (arr || []).forEach(x => { if (x?.id) m.set(x.id, x); });
    return m;
};

const entityChanged = (current, snapshot, fields) => {
    for (const f of fields) {
        if (JSON.stringify(current?.[f]) !== JSON.stringify(snapshot?.[f])) return true;
    }
    return false;
};

const orderChanged = (current, snapshot) =>
    JSON.stringify(current?.order) !== JSON.stringify(snapshot?.order);

// Build a new boardData where restored entities have fresh updatedAt and
// where deleted-by-undo entities that still live on Trello are queued in
// board.trelloSync._pendingUndoDeletes so the next sync can archive them.
export function restoreSnapshot(current, snapshot) {
    if (!current || !snapshot || !Array.isArray(snapshot.boards)) return snapshot;
    const now = new Date().toISOString();
    const currentBoardsById = new Map((current.boards || []).map(b => [b.id, b]));

    const newBoards = snapshot.boards.map(sBoard => {
        const cBoard = currentBoardsById.get(sBoard.id);
        if (!cBoard) return sBoard;

        const pendingCards = [];
        const pendingLists = [];
        const pendingCheckItems = [];

        // Helper — when a restored entity diverges from current state we must
        // force the next Trello sync to push the restored values. Just bumping
        // updatedAt is NOT enough: trelloSync.buildSelective*Update compares the
        // entity against `_trelloBaseline` and only pushes fields that differ.
        // The snapshot carries the pre-edit baseline, so the diff against the
        // restored (also pre-edit) values looks empty → nothing gets pushed →
        // Trello keeps the post-edit state and the undo silently reverts on the
        // next sync. Stripping the baselines forces a full push (the "no
        // baseline → full update" fallback in trelloSync.js) and makes the
        // label-change detection (`_inheritChannels` etc.) fire correctly.
        const stripBaselines = (entity) => {
            const out = { ...entity, updatedAt: now };
            delete out._trelloBaseline;
            delete out._inheritChannels;
            delete out._inheritCountries;
            delete out._inheritOtherLabels;
            return out;
        };

        // Categories — bump on content change, record lost trelloListId for archival.
        const cCatsById = mapById(cBoard.categories);
        const sCatsById = mapById(sBoard.categories);
        const newCategories = (sBoard.categories || []).map(sCat => {
            const cCat = cCatsById.get(sCat.id);
            if (!cCat) return { ...sCat, updatedAt: now };
            if (entityChanged(cCat, sCat, SYNC_FIELDS_CATEGORY)) return { ...sCat, updatedAt: now };
            return sCat;
        });
        for (const cCat of (cBoard.categories || [])) {
            if (!sCatsById.has(cCat.id) && cCat.trelloListId) pendingLists.push(cCat.trelloListId);
        }

        // Actions
        const cActsById = mapById(cBoard.actions);
        const sActsById = mapById(sBoard.actions);
        const newActions = (sBoard.actions || []).map(sAct => {
            const cAct = cActsById.get(sAct.id);
            if (!cAct) return stripBaselines(sAct);
            if (entityChanged(cAct, sAct, SYNC_FIELDS_ACTION)) {
                const out = stripBaselines(sAct);
                if (orderChanged(cAct, sAct)) out.orderUpdatedAt = now;
                return out;
            }
            return sAct;
        });
        for (const cAct of (cBoard.actions || [])) {
            if (!sActsById.has(cAct.id) && cAct.trelloCardId) pendingCards.push(cAct.trelloCardId);
        }

        // Tasks
        const cTasksById = mapById(cBoard.tasks);
        const sTasksById = mapById(sBoard.tasks);
        const newTasks = (sBoard.tasks || []).map(sTask => {
            const cTask = cTasksById.get(sTask.id);
            if (!cTask) return stripBaselines(sTask);
            if (entityChanged(cTask, sTask, SYNC_FIELDS_TASK)) {
                const out = stripBaselines(sTask);
                if (orderChanged(cTask, sTask)) out.orderUpdatedAt = now;
                return out;
            }
            return sTask;
        });
        for (const cTask of (cBoard.tasks || [])) {
            if (sTasksById.has(cTask.id)) continue;
            // card-as-action tasks are checklist items → delete the item; card-as-task tasks → archive the card.
            if (cTask.trelloCheckItemId && cTask.trelloChecklistId) {
                pendingCheckItems.push({ checklistId: cTask.trelloChecklistId, itemId: cTask.trelloCheckItemId });
            } else if (cTask.trelloCardId) {
                pendingCards.push(cTask.trelloCardId);
            }
        }

        const hasPending = pendingCards.length || pendingLists.length || pendingCheckItems.length;
        let nextBoard = {
            ...sBoard,
            categories: newCategories,
            actions: newActions,
            tasks: newTasks
        };
        if (hasPending) {
            const prev = sBoard.trelloSync?._pendingUndoDeletes || [];
            nextBoard = {
                ...nextBoard,
                trelloSync: {
                    ...(sBoard.trelloSync || {}),
                    _pendingUndoDeletes: [
                        ...prev,
                        { cards: pendingCards, lists: pendingLists, checkItems: pendingCheckItems, at: Date.now() }
                    ]
                }
            };
        }
        return nextBoard;
    });

    return { ...snapshot, boards: newBoards };
}

export default function useUndoRedo(setBoardData, getCurrentState) {
    const historyRef = useRef([]);
    const indexRef = useRef(-1);
    const isUndoRedoRef = useRef(false);
    const suspendedRef = useRef(false);
    // Timestamp (ms) of the most recent undo/redo/jumpTo. App.jsx uses this to
    // gate Realtime merges and the pre-save conflict fetch for a short window
    // so an incoming echo of the pre-undo state can't silently revert the UI.
    const recentUndoRef = useRef(0);

    const [, forceUpdate] = useState(0);

    // Keep the latest current-state getter in a ref so materializeTip can be a stable
    // useCallback (and thus a clean dependency of undo/jumpTo) without re-subscribing
    // the keyboard effect / context value on every render.
    const getCurrentStateRef = useRef(getCurrentState);
    getCurrentStateRef.current = getCurrentState;

    // pushState records the PRE-change state before each edit, so the latest (live)
    // state is never in the buffer until we capture it. "At the tip" (index === last
    // entry) therefore means there may be an un-recorded live edit ahead — undo must be
    // available there too. Without this, a single edit could not be undone and the first
    // undo after several edits skipped one step.
    const atTip = historyRef.current.length > 0 && indexRef.current === historyRef.current.length - 1;
    const canUndo = indexRef.current > 0 || atTip;
    const canRedo = indexRef.current < historyRef.current.length - 1;

    // Capture the live (post-last-edit) state as a new history entry the first time the
    // user steps back from the tip. pushState only stores pre-change snapshots, so the
    // live state would otherwise be lost — making undo overshoot by one and redo unable
    // to return to the latest edit. Idempotent: no-op if the tip already equals live.
    const materializeTip = useCallback(() => {
        const getter = getCurrentStateRef.current;
        if (!getter) return;
        if (indexRef.current !== historyRef.current.length - 1) return; // not at the tip
        let cur;
        try { cur = getter(); } catch { return; }
        if (!cur) return;
        let json;
        try { json = JSON.stringify(cur); } catch { return; }
        const tip = historyRef.current[indexRef.current];
        if (tip && tip.json === json) return; // live already captured — nothing to do
        historyRef.current.push({ json, label: tip ? tip.label : '', timestamp: Date.now() });
        indexRef.current = historyRef.current.length - 1;
    }, []);

    // pushState(boardData, label, { coalesceMs })
    // label: describes the user-visible change (e.g. "Task 'Foo' updated")
    // coalesceMs: if the previous entry shares the same label and was pushed within
    //   this window, skip the new push to keep the pre-change snapshot intact.
    //   Used for continuous actions like Timeline resize/drag so a single entry is
    //   kept per gesture.
    const pushState = useCallback((boardData, label = '', options = {}) => {
        if (isUndoRedoRef.current) return;
        if (suspendedRef.current) return;
        if (!boardData) return;

        let json;
        try { json = JSON.stringify(boardData); }
        catch (e) { console.warn('useUndoRedo: failed to serialize state, skipping snapshot', e); return; }

        if (indexRef.current < historyRef.current.length - 1) {
            historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
        }

        const coalesceMs = Number.isFinite(options.coalesceMs) ? options.coalesceMs : DEFAULT_COALESCE_MS;
        const last = historyRef.current[historyRef.current.length - 1];
        if (
            coalesceMs > 0 &&
            last &&
            label &&
            last.label === label &&
            Date.now() - last.timestamp < coalesceMs &&
            indexRef.current === historyRef.current.length - 1
        ) {
            // Keep the earlier (pre-change) snapshot, just bump timestamp so
            // subsequent pushes within the window continue to coalesce.
            last.timestamp = Date.now();
            forceUpdate(n => n + 1);
            return;
        }

        historyRef.current.push({ json, label, timestamp: Date.now() });

        if (historyRef.current.length > MAX_HISTORY) {
            historyRef.current = historyRef.current.slice(historyRef.current.length - MAX_HISTORY);
        }

        indexRef.current = historyRef.current.length - 1;
        forceUpdate(n => n + 1);
    }, []);

    const applyRestore = useCallback((restored) => {
        isUndoRedoRef.current = true;
        recentUndoRef.current = Date.now();
        setBoardData(current => restoreSnapshot(current, restored));
        setTimeout(() => { isUndoRedoRef.current = false; }, 0);
    }, [setBoardData]);

    const undo = useCallback(() => {
        // Capture the live state as the tip so this undo lands on the immediately
        // previous state (not skipping one) and redo can return to the latest edit.
        materializeTip();
        if (indexRef.current <= 0) return null;

        indexRef.current -= 1;
        const entry = historyRef.current[indexRef.current];
        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse undo state', e); return null; }

        applyRestore(restored);
        forceUpdate(n => n + 1);
        return entry.label;
    }, [applyRestore, materializeTip]);

    const redo = useCallback(() => {
        // redo moves forward through already-recorded entries; no tip materialization.
        if (indexRef.current >= historyRef.current.length - 1) return null;

        indexRef.current += 1;
        const entry = historyRef.current[indexRef.current];
        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse redo state', e); return null; }

        applyRestore(restored);
        forceUpdate(n => n + 1);
        return entry.label;
    }, [applyRestore]);

    const jumpTo = useCallback((targetIndex) => {
        // Materialize the live tip first so a jump backward from the tip can be
        // redone/jumped forward to the latest edit (same rationale as undo).
        materializeTip();
        if (targetIndex < 0 || targetIndex >= historyRef.current.length) return null;
        if (targetIndex === indexRef.current) return null;

        const entry = historyRef.current[targetIndex];
        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse jump state', e); return null; }

        indexRef.current = targetIndex;
        applyRestore(restored);
        forceUpdate(n => n + 1);
        return entry.label;
    }, [applyRestore, materializeTip]);

    const clear = useCallback(() => {
        historyRef.current = [];
        indexRef.current = -1;
        forceUpdate(n => n + 1);
    }, []);

    const suspend = useCallback(() => { suspendedRef.current = true; }, []);
    const resume = useCallback(() => { suspendedRef.current = false; }, []);

    const getHistory = useCallback(() => (
        historyRef.current.map((entry, idx) => ({
            index: idx,
            label: entry.label,
            timestamp: entry.timestamp,
            isCurrent: idx === indexRef.current
        }))
    ), []);

    return {
        pushState, undo, redo, jumpTo, clear,
        canUndo, canRedo,
        isUndoRedoRef,
        recentUndoRef,
        suspend, resume,
        getHistory,
        currentIndex: indexRef.current
    };
}
