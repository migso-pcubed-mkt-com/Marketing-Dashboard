import { describe, it, expect } from 'vitest';
import { restoreSnapshot } from '../hooks/useUndoRedo.js';

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
});
