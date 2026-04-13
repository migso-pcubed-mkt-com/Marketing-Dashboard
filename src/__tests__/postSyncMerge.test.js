// Tests for post-sync merge logic — ensures local edits during sync are preserved
import { describe, it, expect } from 'vitest';
import { mergePostSync } from '../lib/postSyncMerge.js';

const T = {
    OLD: '2026-03-10T00:00:00.000Z',
    MID: '2026-03-15T00:00:00.000Z',
    NEW: '2026-03-20T10:00:00.000Z',
    NEWER: '2026-03-22T00:00:00.000Z'
};

describe('mergePostSync', () => {

    // ════════════════════════════════════════════
    // B1: New categories created during sync must survive
    // ════════════════════════════════════════════
    it('preserves categories created locally during sync', () => {
        const preSyncCategoryIds = new Set(['cat-1']);
        const preSyncTaskIds = new Set(['t-1']);
        const preSyncActionIds = new Set(['a-1']);
        const preSyncTaskMap = new Map([['t-1', T.OLD]]);
        const preSyncActionMap = new Map([['a-1', T.OLD]]);

        const syncedBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Existing' }],
            actions: [{ id: 'a-1', name: 'Action1', categoryId: 'cat-1', updatedAt: T.MID }],
            tasks: [{ id: 't-1', title: 'Task1', actionId: 'a-1', updatedAt: T.MID }]
        };

        const liveBoard = {
            id: 'board-1',
            categories: [
                { id: 'cat-1', name: 'Existing' },
                { id: 'cat-new', name: 'Brand New Category', createdAt: T.NEW }
            ],
            actions: [
                { id: 'a-1', name: 'Action1', categoryId: 'cat-1', updatedAt: T.OLD },
                { id: 'a-new', name: 'New Default', categoryId: 'cat-new', isDefault: true, updatedAt: T.NEW }
            ],
            tasks: [{ id: 't-1', title: 'Task1', actionId: 'a-1', updatedAt: T.OLD }]
        };

        const result = mergePostSync({
            syncedBoard, liveBoard,
            preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
            preSyncTaskMap, preSyncActionMap
        });

        // New category must survive
        expect(result.categories.find(c => c.id === 'cat-new')).toBeTruthy();
        expect(result.categories).toHaveLength(2);
        // New default action for the new category must survive
        expect(result.actions.find(a => a.id === 'a-new')).toBeTruthy();
    });

    // ════════════════════════════════════════════
    // B2: Deleted tasks must NOT reappear
    // ════════════════════════════════════════════
    it('does not resurrect tasks deleted locally during sync', () => {
        const preSyncTaskIds = new Set(['t-1', 't-2']);
        const preSyncActionIds = new Set(['a-1']);
        const preSyncCategoryIds = new Set(['cat-1']);
        const preSyncTaskMap = new Map([['t-1', T.OLD], ['t-2', T.OLD]]);
        const preSyncActionMap = new Map([['a-1', T.OLD]]);

        const syncedBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.MID }],
            // Sync still contains t-2 because it started before deletion
            tasks: [
                { id: 't-1', title: 'Keep', actionId: 'a-1', updatedAt: T.MID },
                { id: 't-2', title: 'Deleted', actionId: 'a-1', updatedAt: T.MID }
            ]
        };

        const liveBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.OLD }],
            // User deleted t-2 during sync — it's gone from live state
            tasks: [
                { id: 't-1', title: 'Keep', actionId: 'a-1', updatedAt: T.OLD }
            ]
        };

        const result = mergePostSync({
            syncedBoard, liveBoard,
            preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
            preSyncTaskMap, preSyncActionMap
        });

        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].id).toBe('t-1');
        // t-2 must NOT reappear
        expect(result.tasks.find(t => t.id === 't-2')).toBeUndefined();
    });

    // ════════════════════════════════════════════
    // B2b: Deleted actions must NOT reappear
    // ════════════════════════════════════════════
    it('does not resurrect actions deleted locally during sync', () => {
        const preSyncTaskIds = new Set([]);
        const preSyncActionIds = new Set(['a-1', 'a-2']);
        const preSyncCategoryIds = new Set(['cat-1']);
        const preSyncTaskMap = new Map();
        const preSyncActionMap = new Map([['a-1', T.OLD], ['a-2', T.OLD]]);

        const syncedBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [
                { id: 'a-1', name: 'Keep', categoryId: 'cat-1', updatedAt: T.MID },
                { id: 'a-2', name: 'Deleted', categoryId: 'cat-1', updatedAt: T.MID }
            ],
            tasks: []
        };

        const liveBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [{ id: 'a-1', name: 'Keep', categoryId: 'cat-1', updatedAt: T.OLD }],
            tasks: []
        };

        const result = mergePostSync({
            syncedBoard, liveBoard,
            preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
            preSyncTaskMap, preSyncActionMap
        });

        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].id).toBe('a-1');
    });

    // ════════════════════════════════════════════
    // B3: Comments/edits made during sync preserved
    // ════════════════════════════════════════════
    it('preserves task edits (comments, etc.) made during sync', () => {
        const preSyncTaskIds = new Set(['t-1']);
        const preSyncActionIds = new Set(['a-1']);
        const preSyncCategoryIds = new Set(['cat-1']);
        const preSyncTaskMap = new Map([['t-1', T.OLD]]);
        const preSyncActionMap = new Map([['a-1', T.OLD]]);

        const syncedBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.MID }],
            tasks: [{
                id: 't-1', title: 'Task', actionId: 'a-1', updatedAt: T.MID,
                comments: [],
                trelloCardId: 'card-1', trelloLastModified: T.MID
            }]
        };

        const liveBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.OLD }],
            tasks: [{
                id: 't-1', title: 'Task', actionId: 'a-1',
                updatedAt: T.NEW, // Edited during sync (newer than pre-sync)
                comments: [{ id: 'cm-1', text: 'New comment', date: T.NEW }]
            }]
        };

        const result = mergePostSync({
            syncedBoard, liveBoard,
            preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
            preSyncTaskMap, preSyncActionMap
        });

        const task = result.tasks.find(t => t.id === 't-1');
        // Live version should be kept (it was edited during sync)
        expect(task.comments).toHaveLength(1);
        expect(task.comments[0].text).toBe('New comment');
        // But Trello IDs from sync should be merged in
        expect(task.trelloCardId).toBe('card-1');
        expect(task.trelloLastModified).toBe(T.MID);
    });

    // ════════════════════════════════════════════
    // B1b: Deleted categories must NOT reappear
    // ════════════════════════════════════════════
    it('does not resurrect categories deleted locally during sync', () => {
        const preSyncCategoryIds = new Set(['cat-1', 'cat-2']);
        const preSyncTaskIds = new Set([]);
        const preSyncActionIds = new Set(['a-1', 'a-2']);
        const preSyncTaskMap = new Map();
        const preSyncActionMap = new Map([['a-1', T.OLD], ['a-2', T.OLD]]);

        const syncedBoard = {
            id: 'board-1',
            categories: [
                { id: 'cat-1', name: 'Keep' },
                { id: 'cat-2', name: 'Deleted' }
            ],
            actions: [
                { id: 'a-1', name: 'Act1', categoryId: 'cat-1', updatedAt: T.MID },
                { id: 'a-2', name: 'Act2', categoryId: 'cat-2', updatedAt: T.MID }
            ],
            tasks: []
        };

        const liveBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Keep' }],
            actions: [{ id: 'a-1', name: 'Act1', categoryId: 'cat-1', updatedAt: T.OLD }],
            tasks: []
        };

        const result = mergePostSync({
            syncedBoard, liveBoard,
            preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
            preSyncTaskMap, preSyncActionMap
        });

        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].id).toBe('cat-1');
        // Actions of deleted category should also be gone
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].id).toBe('a-1');
    });

    // ════════════════════════════════════════════
    // Tasks created by sync (from Trello) must be kept
    // ════════════════════════════════════════════
    it('keeps new tasks imported from Trello during sync', () => {
        const preSyncTaskIds = new Set(['t-1']);
        const preSyncActionIds = new Set(['a-1']);
        const preSyncCategoryIds = new Set(['cat-1']);
        const preSyncTaskMap = new Map([['t-1', T.OLD]]);
        const preSyncActionMap = new Map([['a-1', T.OLD]]);

        const syncedBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.MID }],
            tasks: [
                { id: 't-1', title: 'Existing', actionId: 'a-1', updatedAt: T.MID },
                { id: 't-new', title: 'From Trello', actionId: 'a-1', updatedAt: T.MID, trelloCardId: 'card-new' }
            ]
        };

        const liveBoard = {
            id: 'board-1',
            categories: [{ id: 'cat-1', name: 'Cat' }],
            actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.OLD }],
            tasks: [{ id: 't-1', title: 'Existing', actionId: 'a-1', updatedAt: T.OLD }]
        };

        const result = mergePostSync({
            syncedBoard, liveBoard,
            preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
            preSyncTaskMap, preSyncActionMap
        });

        expect(result.tasks).toHaveLength(2);
        expect(result.tasks.find(t => t.id === 't-new')).toBeTruthy();
    });
});
