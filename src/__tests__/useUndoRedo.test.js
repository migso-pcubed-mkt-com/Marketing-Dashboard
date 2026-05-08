import { describe, it, expect } from 'vitest';
import {
    restoreSnapshot,
    makeHistoryStore,
    applyPush,
    applyUndo,
    applyRedo,
    applyJumpTo
} from '../hooks/useUndoRedo.js';

/**
 * restoreSnapshot is the bridge between the client-side history buffer and
 * Trello's last-write-wins sync. A raw JSON snapshot carries stale updatedAt
 * values, which LWW would see as older than trelloLastModified and pull from
 * Trello — wiping the undo. We rewrite those timestamps on changed entities
 * and queue deletions for entities that no longer exist locally but still
 * live on Trello.
 */

const baseBoard = {
    id: 'b1',
    name: 'Board',
    categories: [{ id: 'cat1', name: 'Cat', order: 0, updatedAt: '2026-04-01T00:00:00.000Z' }],
    actions: [{ id: 'act1', name: 'Action', categoryId: 'cat1', isDefault: true, order: 0, updatedAt: '2026-04-01T00:00:00.000Z' }],
    tasks: [{
        id: 'task1', actionId: 'act1', title: 'Task', status: 'todo',
        startDate: '2026-04-01', dueDate: '2026-04-10',
        order: 0, updatedAt: '2026-04-01T00:00:00.000Z',
        trelloCardId: 'card-abc'
    }],
    trelloSync: { trelloBoardId: 'trello-b1', syncMode: 'card-as-task' }
};

const envelope = (board) => ({ version: 2, currentBoardId: board.id, boards: [board] });

describe('restoreSnapshot', () => {
    it('bumps updatedAt on tasks whose sync fields differ between current and snapshot', () => {
        // Current state: dueDate was extended to April 30.
        const current = envelope({
            ...baseBoard,
            tasks: [{ ...baseBoard.tasks[0], dueDate: '2026-04-30', updatedAt: '2026-04-15T00:00:00.000Z' }]
        });
        // Snapshot: the pre-change state (April 10).
        const snapshot = envelope(baseBoard);

        const restored = restoreSnapshot(current, snapshot);
        const restoredTask = restored.boards[0].tasks[0];
        expect(restoredTask.dueDate).toBe('2026-04-10');
        // updatedAt must be fresh (well after the original 2026-04-01) so LWW picks the local value.
        expect(new Date(restoredTask.updatedAt).getTime()).toBeGreaterThan(new Date('2026-04-15T00:00:00.000Z').getTime());
    });

    it('does not bump updatedAt when entity content is identical', () => {
        const current = envelope(baseBoard);
        const snapshot = envelope(baseBoard);

        const restored = restoreSnapshot(current, snapshot);
        expect(restored.boards[0].tasks[0].updatedAt).toBe(baseBoard.tasks[0].updatedAt);
    });

    it('sets orderUpdatedAt when order differs', () => {
        const current = envelope({
            ...baseBoard,
            tasks: [{ ...baseBoard.tasks[0], order: 5, updatedAt: '2026-04-15T00:00:00.000Z' }]
        });
        const snapshot = envelope(baseBoard);

        const restored = restoreSnapshot(current, snapshot);
        expect(restored.boards[0].tasks[0].orderUpdatedAt).toBeDefined();
    });

    it('queues a pending Trello card archive when a task with trelloCardId is missing from the snapshot', () => {
        // Current: task still present (user created it after snapshot).
        const current = envelope({
            ...baseBoard,
            tasks: [
                ...baseBoard.tasks,
                { id: 'task2', actionId: 'act1', title: 'New Task', status: 'todo', order: 1, trelloCardId: 'card-xyz', updatedAt: '2026-04-20T00:00:00.000Z' }
            ]
        });
        // Snapshot: only the original task exists.
        const snapshot = envelope(baseBoard);

        const restored = restoreSnapshot(current, snapshot);
        const pending = restored.boards[0].trelloSync?._pendingUndoDeletes;
        expect(pending).toBeDefined();
        expect(pending.length).toBe(1);
        expect(pending[0].cards).toContain('card-xyz');
    });

    it('queues a pending checklist-item delete for card-as-action tasks', () => {
        const caTask = {
            id: 'tskCA', actionId: 'act1', title: 'CA Task', status: 'todo', order: 0,
            trelloCardId: 'card-ca', trelloChecklistId: 'cl-1', trelloCheckItemId: 'item-1',
            updatedAt: '2026-04-20T00:00:00.000Z'
        };
        const current = envelope({ ...baseBoard, tasks: [...baseBoard.tasks, caTask] });
        const snapshot = envelope(baseBoard);

        const restored = restoreSnapshot(current, snapshot);
        const pending = restored.boards[0].trelloSync?._pendingUndoDeletes;
        expect(pending[0].checkItems).toEqual([{ checklistId: 'cl-1', itemId: 'item-1' }]);
        expect(pending[0].cards).toEqual([]);
    });

    it('queues a pending list archive when a category with trelloListId disappears from the snapshot', () => {
        const extraCat = { id: 'cat2', name: 'Cat 2', order: 1, trelloListId: 'list-2', updatedAt: '2026-04-20T00:00:00.000Z' };
        const current = envelope({ ...baseBoard, categories: [...baseBoard.categories, extraCat] });
        const snapshot = envelope(baseBoard);

        const restored = restoreSnapshot(current, snapshot);
        const pending = restored.boards[0].trelloSync?._pendingUndoDeletes;
        expect(pending[0].lists).toContain('list-2');
    });

    it('is a no-op when board id is new in the snapshot (cannot diff)', () => {
        const current = envelope(baseBoard);
        const snapshot = envelope({ ...baseBoard, id: 'b-new' });
        const restored = restoreSnapshot(current, snapshot);
        // Restored board is returned as-is (no updatedAt rewrite because there's no current counterpart).
        expect(restored.boards[0].id).toBe('b-new');
        expect(restored.boards[0].tasks[0].updatedAt).toBe(baseBoard.tasks[0].updatedAt);
    });

    it('strips _trelloBaseline and _inherit* label baselines on tasks that diverged from current', () => {
        // Scenario: snapshot was taken before the user's edit. Between snapshot and
        // now, the user edited the task AND synced to Trello, so _trelloBaseline
        // carries the POST-edit values. Undoing should not just revert fields —
        // it must also clear the post-edit baseline so the next sync pushes the
        // restored (pre-edit) values instead of seeing a "no diff" and doing nothing.
        const snapshotTask = {
            ...baseBoard.tasks[0],
            title: 'Old title',
            channels: ['social'],
            _trelloBaseline: { title: 'Old title', description: '' },
            _inheritChannels: ['social']
        };
        const currentTask = {
            ...snapshotTask,
            title: 'New title',
            channels: ['social', 'email'],
            _trelloBaseline: { title: 'New title', description: '' },
            _inheritChannels: ['social', 'email'],
            updatedAt: '2026-04-20T00:00:00.000Z'
        };
        const current = envelope({ ...baseBoard, tasks: [currentTask] });
        const snapshot = envelope({ ...baseBoard, tasks: [snapshotTask] });

        const restored = restoreSnapshot(current, snapshot);
        const restoredTask = restored.boards[0].tasks[0];
        expect(restoredTask.title).toBe('Old title');
        expect(restoredTask._trelloBaseline).toBeUndefined();
        expect(restoredTask._inheritChannels).toBeUndefined();
    });

    it('strips baselines on actions that diverged from current', () => {
        const snapshotAction = {
            ...baseBoard.actions[0],
            name: 'Old name',
            _trelloBaseline: { name: 'Old name' },
            _inheritChannels: ['social']
        };
        const currentAction = {
            ...snapshotAction,
            name: 'New name',
            _trelloBaseline: { name: 'New name' },
            _inheritChannels: ['social', 'email'],
            updatedAt: '2026-04-20T00:00:00.000Z'
        };
        const current = envelope({ ...baseBoard, actions: [currentAction] });
        const snapshot = envelope({ ...baseBoard, actions: [snapshotAction] });

        const restored = restoreSnapshot(current, snapshot);
        const restoredAction = restored.boards[0].actions[0];
        expect(restoredAction.name).toBe('Old name');
        expect(restoredAction._trelloBaseline).toBeUndefined();
        expect(restoredAction._inheritChannels).toBeUndefined();
    });
});

// ─────────────────────────────────────────────
// History store algorithm — undo/redo offsets, redo stack, coalescing.
// These are the v4 fixes that turn the bug where an undo skipped two actions
// and a redo couldn't bring the user back into a working two-direction
// time-travel.
// ─────────────────────────────────────────────

describe('applyPush', () => {
    it('records each new action and points index at the latest entry', () => {
        const s = makeHistoryStore();
        applyPush(s, '"S0"', 'A1', { coalesceMs: 0, now: 1000 });
        applyPush(s, '"S1"', 'A2', { coalesceMs: 0, now: 2000 });
        expect(s.history).toHaveLength(2);
        expect(s.index).toBe(1);
        expect(s.history[0].json).toBe('"S0"');
        expect(s.history[1].label).toBe('A2');
    });

    it('coalesces consecutive pushes that share a label within coalesceMs', () => {
        const s = makeHistoryStore();
        applyPush(s, '"S0"', 'A1', { coalesceMs: 400, now: 1000 });
        applyPush(s, '"S0bis"', 'A1', { coalesceMs: 400, now: 1100 });
        expect(s.history).toHaveLength(1);
        expect(s.history[0].json).toBe('"S0"'); // first snapshot kept
        expect(s.history[0].timestamp).toBe(1100); // timestamp bumped
    });

    it('does NOT coalesce when the label differs', () => {
        const s = makeHistoryStore();
        applyPush(s, '"S0"', 'schedule', { coalesceMs: 400, now: 1000 });
        applyPush(s, '"S1"', 'description', { coalesceMs: 400, now: 1100 });
        expect(s.history).toHaveLength(2);
        expect(s.history[0].label).toBe('schedule');
        expect(s.history[1].label).toBe('description');
    });

    it('clears the redo stack on any new action (forward branch becomes invalid)', () => {
        const s = makeHistoryStore();
        s.redoStack = [{ json: '"R0"', label: 'redo' }, { json: '"R1"', label: 'redo' }];
        applyPush(s, '"S0"', 'A1', { coalesceMs: 0, now: 1000 });
        expect(s.redoStack).toHaveLength(0);
    });
});

describe('applyUndo + applyRedo', () => {
    const setup = () => {
        const s = makeHistoryStore();
        // Two actions: A1 produced state S1, A2 produced state S2.
        // Pre-A1 snapshot = S0 (initial empty).
        // Pre-A2 snapshot = S1.
        applyPush(s, '"S0"', 'A1', { coalesceMs: 0, now: 1000 });
        applyPush(s, '"S1"', 'A2', { coalesceMs: 0, now: 2000 });
        return s;
    };

    it('undo from index N restores history[N] (NOT history[N-1] — fixes the v3 off-by-one bug)', () => {
        const s = setup();
        // Current live state when user clicks undo = S2 (post-A2).
        const entry = applyUndo(s, '"S2"');
        expect(entry.json).toBe('"S1"'); // pre-A2 = post-A1 — the right state to revert A2
        expect(s.index).toBe(0); // decremented after restore
        expect(s.redoStack).toHaveLength(1); // S2 captured for redo
        expect(s.redoStack[0].json).toBe('"S2"');
    });

    it('two consecutive undos walk back through history one action at a time', () => {
        const s = setup();
        const e1 = applyUndo(s, '"S2"'); // revert A2
        expect(e1.json).toBe('"S1"');
        const e2 = applyUndo(s, '"S1"'); // revert A1 — current state is now S1
        expect(e2.json).toBe('"S0"');
        expect(s.index).toBe(-1);
        expect(s.redoStack.map(e => e.json)).toEqual(['"S2"', '"S1"']);
    });

    it('returns null when there is nothing left to undo', () => {
        const s = makeHistoryStore();
        expect(applyUndo(s, '"X"')).toBe(null);
        applyPush(s, '"S0"', 'A1', { coalesceMs: 0, now: 1000 });
        applyUndo(s, '"S1"'); // OK
        expect(applyUndo(s, '"S0"')).toBe(null);
    });

    it('redo replays the most recently undone state (LIFO)', () => {
        const s = setup();
        applyUndo(s, '"S2"'); // S2 → redoStack
        const r = applyRedo(s);
        expect(r.json).toBe('"S2"');
        expect(s.index).toBe(1);
        expect(s.redoStack).toHaveLength(0);
    });

    it('multiple undo/redo round-trips return to the exact starting state', () => {
        const s = setup();
        applyUndo(s, '"S2"');
        applyUndo(s, '"S1"');
        applyRedo(s);
        applyRedo(s);
        expect(s.index).toBe(1);
        expect(s.redoStack).toHaveLength(0);
        expect(s.history.map(e => e.json)).toEqual(['"S0"', '"S1"']);
    });

    it('any push after an undo invalidates the redo branch', () => {
        const s = setup();
        applyUndo(s, '"S2"'); // redoStack = [S2]
        applyPush(s, '"S1"', 'A3', { coalesceMs: 0, now: 3000 });
        expect(s.redoStack).toHaveLength(0);
        expect(applyRedo(s)).toBe(null);
    });
});

describe('applyJumpTo', () => {
    it('restores the chosen entry, sets the index, and clears redo', () => {
        const s = makeHistoryStore();
        applyPush(s, '"S0"', 'A1', { coalesceMs: 0, now: 1000 });
        applyPush(s, '"S1"', 'A2', { coalesceMs: 0, now: 2000 });
        applyPush(s, '"S2"', 'A3', { coalesceMs: 0, now: 3000 });
        applyUndo(s, '"S3"'); // redoStack populated
        const entry = applyJumpTo(s, 0);
        expect(entry.json).toBe('"S0"');
        expect(s.index).toBe(0);
        expect(s.redoStack).toHaveLength(0);
    });

    it('rejects out-of-range targets and the current index', () => {
        const s = makeHistoryStore();
        applyPush(s, '"S0"', 'A1', { coalesceMs: 0, now: 1000 });
        expect(applyJumpTo(s, -1)).toBe(null);
        expect(applyJumpTo(s, 5)).toBe(null);
        expect(applyJumpTo(s, 0)).toBe(null); // already there
    });
});
