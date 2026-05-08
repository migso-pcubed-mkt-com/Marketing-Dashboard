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
const SYNC_FIELDS_TASK = ['title','description','startDate','dueDate','status','priority','budget','month','channels','countries','otherLabels','order','assignees','trelloChecklistName','trelloChecklistId','checklist','swimLane','actionId'];
const SYNC_FIELDS_ACTION = ['name','description','budget','priority','tags','channels','countries','otherLabels','status','order','categoryId','assignees'];
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

// ─────────────────────────────────────────────
// Pure history-store helpers — exported for unit tests. The React hook below
// wraps these in refs + setState, but the algorithm is identical.
// store shape: { history: [{ json, label, timestamp }], index, redoStack: [{ json, label }] }
// ─────────────────────────────────────────────

export const makeHistoryStore = () => ({ history: [], index: -1, redoStack: [] });

export function applyPush(store, json, label = '', { coalesceMs = DEFAULT_COALESCE_MS, now = Date.now() } = {}) {
    // Any fresh action invalidates redo.
    if (store.redoStack.length > 0) store.redoStack = [];

    const last = store.history[store.history.length - 1];
    if (
        coalesceMs > 0 && last && label && last.label === label &&
        now - last.timestamp < coalesceMs &&
        store.index === store.history.length - 1
    ) {
        last.timestamp = now;
        return { coalesced: true };
    }
    store.history.push({ json, label, timestamp: now });
    if (store.history.length > MAX_HISTORY) {
        store.history = store.history.slice(store.history.length - MAX_HISTORY);
    }
    store.index = store.history.length - 1;
    return { coalesced: false };
}

export function applyUndo(store, currentJson) {
    if (store.index < 0) return null;
    const entry = store.history[store.index];
    store.redoStack.push({ json: currentJson, label: entry.label });
    store.index -= 1;
    return entry; // { json, label, timestamp }
}

export function applyRedo(store) {
    if (store.redoStack.length === 0) return null;
    const entry = store.redoStack.pop();
    store.index += 1;
    return entry; // { json, label }
}

export function applyJumpTo(store, targetIndex) {
    if (targetIndex < 0 || targetIndex >= store.history.length) return null;
    if (targetIndex === store.index) return null;
    store.redoStack = [];
    store.index = targetIndex;
    return store.history[targetIndex];
}

export default function useUndoRedo(setBoardData, boardDataRef) {
    // history holds pre-mutation snapshots. After N actions, indexRef points
    // to the most recently pushed snapshot (= state BEFORE the last action,
    // which equals the state AFTER the previous action). The current live
    // state is NOT in history — it sits "above" indexRef.
    //
    // To support redo, undo captures the live state (boardDataRef.current)
    // into redoStackRef before applying the restore. Redo pops from that
    // stack to bring the user back forward. Any new pushState (= a fresh
    // user action) clears redoStackRef because the redo branch is no longer
    // reachable.
    const historyRef = useRef([]);
    const indexRef = useRef(-1);
    const redoStackRef = useRef([]); // stack of { json, label } for redo
    const isUndoRedoRef = useRef(false);
    const suspendedRef = useRef(false);
    // Timestamp (ms) of the most recent undo/redo/jumpTo. App.jsx uses this to
    // gate Realtime merges and the pre-save conflict fetch for a short window
    // so an incoming echo of the pre-undo state can't silently revert the UI.
    const recentUndoRef = useRef(0);

    const [, forceUpdate] = useState(0);

    const canUndo = indexRef.current >= 0;
    const canRedo = redoStackRef.current.length > 0;

    // pushState(boardData, label, { coalesceMs })
    // label: describes the user-visible change (e.g. "Task 'Foo' updated")
    // coalesceMs: if the previous entry shares the same label and was pushed within
    //   this window, skip the new push to keep the pre-change snapshot intact.
    //   Used for continuous actions like Timeline resize/drag so a single entry is
    //   kept per gesture.
    // The hook keeps the history store split across refs (history, index, redo
    // stack) so each piece can be inspected independently in DevTools. The
    // applyPush / applyUndo / applyRedo / applyJumpTo helpers mutate a
    // synthetic store object that mirrors those refs, then we sync back. Same
    // algorithm, fully testable.
    const buildStore = () => ({
        history: historyRef.current,
        index: indexRef.current,
        redoStack: redoStackRef.current
    });
    const syncStore = (store) => {
        historyRef.current = store.history;
        indexRef.current = store.index;
        redoStackRef.current = store.redoStack;
    };

    const pushState = useCallback((boardData, label = '', options = {}) => {
        if (isUndoRedoRef.current) return;
        if (suspendedRef.current) return;
        if (!boardData) return;

        let json;
        try { json = JSON.stringify(boardData); }
        catch (e) { console.warn('useUndoRedo: failed to serialize state, skipping snapshot', e); return; }

        const coalesceMs = Number.isFinite(options.coalesceMs) ? options.coalesceMs : DEFAULT_COALESCE_MS;
        const store = buildStore();
        applyPush(store, json, label, { coalesceMs });
        syncStore(store);
        forceUpdate(n => n + 1);
    }, []);

    const applyRestore = useCallback((restored) => {
        isUndoRedoRef.current = true;
        recentUndoRef.current = Date.now();
        setBoardData(current => restoreSnapshot(current, restored));
        setTimeout(() => { isUndoRedoRef.current = false; }, 0);
    }, [setBoardData]);

    const undo = useCallback(() => {
        // Capture the live (post-action) board state into the redo stack BEFORE
        // restoring — that's the only place we have access to it.
        let currentJson = '';
        try { currentJson = JSON.stringify(boardDataRef?.current || null); }
        catch (e) { console.warn('useUndoRedo: failed to serialize current state for redo', e); return null; }

        const store = buildStore();
        const entry = applyUndo(store, currentJson);
        if (!entry) return null;
        syncStore(store);

        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse undo state', e); return null; }

        applyRestore(restored);
        forceUpdate(n => n + 1);
        return entry.label;
    }, [applyRestore, boardDataRef]);

    const redo = useCallback(() => {
        const store = buildStore();
        const entry = applyRedo(store);
        if (!entry) return null;
        syncStore(store);

        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse redo state', e); return null; }

        applyRestore(restored);
        forceUpdate(n => n + 1);
        return entry.label;
    }, [applyRestore]);

    const jumpTo = useCallback((targetIndex) => {
        const store = buildStore();
        const entry = applyJumpTo(store, targetIndex);
        if (!entry) return null;
        syncStore(store);

        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse jump state', e); return null; }

        applyRestore(restored);
        forceUpdate(n => n + 1);
        return entry.label;
    }, [applyRestore]);

    const clear = useCallback(() => {
        historyRef.current = [];
        redoStackRef.current = [];
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
