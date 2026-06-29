import { describe, it, expect } from 'vitest';
import { mergeEntitiesByTimestamp, mergeBoardsEntityLevel, mergeBoardsEntityLevelWithMeta } from '../lib/realtimeMerge.js';

const T = {
    OLD: '2026-04-01T10:00:00.000Z',
    MID: '2026-04-01T12:00:00.000Z',
    NEW: '2026-04-01T14:00:00.000Z',
};

// ─── mergeEntitiesByTimestamp ───

describe('mergeEntitiesByTimestamp', () => {
    it('keeps newer local entity when both exist', () => {
        const local = [{ id: 't1', title: 'Local edit', updatedAt: T.NEW }];
        const incoming = [{ id: 't1', title: 'Incoming', updatedAt: T.OLD }];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Local edit');
    });

    it('keeps newer incoming entity when both exist', () => {
        const local = [{ id: 't1', title: 'Old local', updatedAt: T.OLD }];
        const incoming = [{ id: 't1', title: 'Fresh from server', updatedAt: T.NEW }];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Fresh from server');
    });

    it('preserves entities only in incoming (new from another user)', () => {
        const local = [{ id: 't1', title: 'Mine', updatedAt: T.MID }];
        const incoming = [
            { id: 't1', title: 'Mine', updatedAt: T.MID },
            { id: 't2', title: 'Created by Bob', updatedAt: T.NEW }
        ];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(2);
        expect(result.find(e => e.id === 't2').title).toBe('Created by Bob');
    });

    it('preserves entities only in local (created locally, not yet synced)', () => {
        const local = [
            { id: 't1', title: 'Synced', updatedAt: T.MID },
            { id: 't3', title: 'Just created', updatedAt: T.NEW }
        ];
        const incoming = [{ id: 't1', title: 'Synced', updatedAt: T.MID }];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(2);
        expect(result.find(e => e.id === 't3').title).toBe('Just created');
    });

    it('concurrent edits to different entities — both preserved', () => {
        // User A edited t1, User B edited t2
        const local = [
            { id: 't1', title: 'A edited this', updatedAt: T.NEW },
            { id: 't2', title: 'Original', updatedAt: T.OLD }
        ];
        const incoming = [
            { id: 't1', title: 'Original', updatedAt: T.OLD },
            { id: 't2', title: 'B edited this', updatedAt: T.NEW }
        ];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(2);
        expect(result.find(e => e.id === 't1').title).toBe('A edited this');
        expect(result.find(e => e.id === 't2').title).toBe('B edited this');
    });

    it('handles entities without updatedAt — incoming wins', () => {
        const local = [{ id: 't1', title: 'No timestamp' }];
        const incoming = [{ id: 't1', title: 'Also no timestamp' }];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(1);
        // Both have time 0, so incoming wins (not strictly greater)
        expect(result[0].title).toBe('Also no timestamp');
    });

    it('handles empty arrays', () => {
        expect(mergeEntitiesByTimestamp([], [])).toEqual([]);
        expect(mergeEntitiesByTimestamp([], [{ id: 't1' }])).toEqual([{ id: 't1' }]);
        expect(mergeEntitiesByTimestamp([{ id: 't1' }], [])).toEqual([{ id: 't1' }]);
    });

    it('handles undefined arrays', () => {
        expect(mergeEntitiesByTimestamp(undefined, undefined)).toEqual([]);
        expect(mergeEntitiesByTimestamp(undefined, [{ id: 't1' }])).toEqual([{ id: 't1' }]);
    });

    it('preserves incoming order for shared entities', () => {
        const local = [
            { id: 't2', title: 'Two', updatedAt: T.OLD },
            { id: 't1', title: 'One', updatedAt: T.OLD }
        ];
        const incoming = [
            { id: 't1', title: 'One', updatedAt: T.MID },
            { id: 't2', title: 'Two', updatedAt: T.MID }
        ];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result[0].id).toBe('t1');
        expect(result[1].id).toBe('t2');
    });

    it('same timestamp — incoming wins (server is authoritative)', () => {
        const local = [{ id: 't1', title: 'Local version', updatedAt: T.MID }];
        const incoming = [{ id: 't1', title: 'Server version', updatedAt: T.MID }];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result[0].title).toBe('Server version');
    });
});

// ─── mergeBoardsEntityLevel ───

describe('mergeBoardsEntityLevel', () => {
    const makeBoard = (id, tasks, actions = [], categories = [], extra = {}) => ({
        version: 2,
        currentBoardId: id,
        boards: [{
            id,
            name: 'Test Board',
            categories,
            actions,
            tasks,
            ...extra,
        }]
    });

    it('merges tasks at entity level — concurrent edits preserved', () => {
        const local = makeBoard('b1', [
            { id: 't1', title: 'A edited', updatedAt: T.NEW },
            { id: 't2', title: 'Original', updatedAt: T.OLD }
        ]);
        const incoming = makeBoard('b1', [
            { id: 't1', title: 'Original', updatedAt: T.OLD },
            { id: 't2', title: 'B edited', updatedAt: T.NEW }
        ]);
        const result = mergeBoardsEntityLevel(local, incoming);
        const tasks = result.boards[0].tasks;
        expect(tasks).toHaveLength(2);
        expect(tasks.find(t => t.id === 't1').title).toBe('A edited');
        expect(tasks.find(t => t.id === 't2').title).toBe('B edited');
    });

    it('merges actions at entity level', () => {
        const local = makeBoard('b1', [], [
            { id: 'a1', name: 'Local action', updatedAt: T.NEW }
        ]);
        const incoming = makeBoard('b1', [], [
            { id: 'a1', name: 'Old action', updatedAt: T.OLD },
            { id: 'a2', name: 'New from server', updatedAt: T.MID }
        ]);
        const result = mergeBoardsEntityLevel(local, incoming);
        const actions = result.boards[0].actions;
        expect(actions).toHaveLength(2);
        expect(actions.find(a => a.id === 'a1').name).toBe('Local action');
        expect(actions.find(a => a.id === 'a2').name).toBe('New from server');
    });

    it('merges categories at entity level', () => {
        const local = makeBoard('b1', [], [], [
            { id: 'c1', name: 'Renamed locally', updatedAt: T.NEW }
        ]);
        const incoming = makeBoard('b1', [], [], [
            { id: 'c1', name: 'Old name', updatedAt: T.OLD }
        ]);
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards[0].categories[0].name).toBe('Renamed locally');
    });

    it('preserves local trelloSync config when incoming is missing fields', () => {
        const local = makeBoard('b1', [], [], [], {
            trelloSync: { syncMode: 'card-as-action', trelloBoardId: 'tb1', labelMappings: { l1: 'chan' } }
        });
        const incoming = makeBoard('b1', [], [], [], {
            trelloSync: { lastSyncAt: '2026-04-01T10:00:00.000Z' }
        });
        const result = mergeBoardsEntityLevel(local, incoming);
        const sync = result.boards[0].trelloSync;
        expect(sync.syncMode).toBe('card-as-action');
        expect(sync.trelloBoardId).toBe('tb1');
        expect(sync.labelMappings).toEqual({ l1: 'chan' });
        expect(sync.lastSyncAt).toBe('2026-04-01T10:00:00.000Z');
    });

    it('preserves local members when incoming has none', () => {
        const local = makeBoard('b1', [], [], [], {
            members: [{ id: 'm1', name: 'Alice' }]
        });
        const incoming = makeBoard('b1', [], [], [], {});
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards[0].members).toEqual([{ id: 'm1', name: 'Alice' }]);
    });

    it('keeps local-only boards (not in incoming)', () => {
        const local = {
            version: 2,
            boards: [
                { id: 'b1', name: 'Board 1', categories: [], actions: [], tasks: [] },
                { id: 'b2', name: 'Local only board', categories: [], actions: [], tasks: [] }
            ]
        };
        const incoming = {
            version: 2,
            boards: [
                { id: 'b1', name: 'Board 1', categories: [], actions: [], tasks: [] }
            ]
        };
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards).toHaveLength(2);
        expect(result.boards.find(b => b.id === 'b2')).toBeTruthy();
    });

    it('adds incoming-only boards', () => {
        const local = {
            version: 2,
            boards: [{ id: 'b1', name: 'Board 1', categories: [], actions: [], tasks: [] }]
        };
        const incoming = {
            version: 2,
            boards: [
                { id: 'b1', name: 'Board 1', categories: [], actions: [], tasks: [] },
                { id: 'b3', name: 'From server', categories: [], actions: [], tasks: [] }
            ]
        };
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards).toHaveLength(2);
        expect(result.boards.find(b => b.id === 'b3')).toBeTruthy();
    });

    it('handles null/undefined inputs gracefully', () => {
        const data = makeBoard('b1', [{ id: 't1', title: 'Task' }]);
        expect(mergeBoardsEntityLevel(null, data)).toEqual(data);
        expect(mergeBoardsEntityLevel(data, null)).toEqual(data);
        expect(mergeBoardsEntityLevel({ version: 2 }, data)).toEqual(data);
    });

    it('full concurrent scenario: 3 users editing different tasks', () => {
        // User A edited t1, User B edited t2, User C created t4
        const local = makeBoard('b1', [
            { id: 't1', title: 'A: updated title', updatedAt: T.NEW },
            { id: 't2', title: 'Original t2', updatedAt: T.OLD },
            { id: 't3', title: 'Unchanged', updatedAt: T.OLD }
        ]);
        // Incoming has B's edit to t2 and C's new t4
        const incoming = makeBoard('b1', [
            { id: 't1', title: 'Original t1', updatedAt: T.OLD },
            { id: 't2', title: 'B: changed status', status: 'completed', updatedAt: T.NEW },
            { id: 't3', title: 'Unchanged', updatedAt: T.OLD },
            { id: 't4', title: 'C: brand new task', updatedAt: T.MID }
        ]);
        const result = mergeBoardsEntityLevel(local, incoming);
        const tasks = result.boards[0].tasks;
        expect(tasks).toHaveLength(4);
        expect(tasks.find(t => t.id === 't1').title).toBe('A: updated title');
        expect(tasks.find(t => t.id === 't2').title).toBe('B: changed status');
        expect(tasks.find(t => t.id === 't2').status).toBe('completed');
        expect(tasks.find(t => t.id === 't3').title).toBe('Unchanged');
        expect(tasks.find(t => t.id === 't4').title).toBe('C: brand new task');
    });
});

// ─── mergeBoardsEntityLevelWithMeta — conflict reporting ───

describe('mergeBoardsEntityLevelWithMeta', () => {
    const makeBoard = (id, tasks, actions = [], categories = []) => ({
        version: 2, currentBoardId: id,
        boards: [{ id, name: 'Test Board', categories, actions, tasks }],
    });

    it('reports a conflict when a teammate edit (incoming) discards a different local version', () => {
        const local = makeBoard('b1', [{ id: 't1', title: 'My local title', updatedAt: T.OLD }]);
        const incoming = makeBoard('b1', [{ id: 't1', title: 'Teammate title', updatedAt: T.NEW }]);
        const { merged, conflicts } = mergeBoardsEntityLevelWithMeta(local, incoming);
        expect(merged.boards[0].tasks[0].title).toBe('Teammate title');
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({ id: 't1', type: 'task', name: 'Teammate title' });
    });

    it('does NOT report a conflict when the local edit wins (local newer)', () => {
        const local = makeBoard('b1', [{ id: 't1', title: 'My newer title', updatedAt: T.NEW }]);
        const incoming = makeBoard('b1', [{ id: 't1', title: 'Stale title', updatedAt: T.OLD }]);
        const { conflicts } = mergeBoardsEntityLevelWithMeta(local, incoming);
        expect(conflicts).toHaveLength(0);
    });

    it('does NOT report a conflict for an identical-content incoming echo (only updatedAt differs)', () => {
        const local = makeBoard('b1', [{ id: 't1', title: 'Same', status: 'todo', updatedAt: T.OLD }]);
        const incoming = makeBoard('b1', [{ id: 't1', title: 'Same', status: 'todo', updatedAt: T.NEW }]);
        const { conflicts } = mergeBoardsEntityLevelWithMeta(local, incoming);
        expect(conflicts).toHaveLength(0);
    });

    it('does NOT report a conflict for a brand-new incoming entity (no local version discarded)', () => {
        const local = makeBoard('b1', []);
        const incoming = makeBoard('b1', [{ id: 't9', title: 'New from teammate', updatedAt: T.NEW }]);
        const { conflicts } = mergeBoardsEntityLevelWithMeta(local, incoming);
        expect(conflicts).toHaveLength(0);
    });

    it('reports conflicts across categories, actions, and tasks with the right names', () => {
        const local = makeBoard('b1',
            [{ id: 't1', title: 'task local', updatedAt: T.OLD }],
            [{ id: 'a1', name: 'action local', updatedAt: T.OLD }],
            [{ id: 'c1', name: 'cat local', updatedAt: T.OLD }],
        );
        const incoming = makeBoard('b1',
            [{ id: 't1', title: 'task remote', updatedAt: T.NEW }],
            [{ id: 'a1', name: 'action remote', updatedAt: T.NEW }],
            [{ id: 'c1', name: 'cat remote', updatedAt: T.NEW }],
        );
        const { conflicts } = mergeBoardsEntityLevelWithMeta(local, incoming);
        expect(conflicts.map(c => c.type).sort()).toEqual(['action', 'category', 'task']);
        expect(conflicts.find(c => c.type === 'task').name).toBe('task remote');
        expect(conflicts.find(c => c.type === 'action').name).toBe('action remote');
    });

    it('mergeBoardsEntityLevel still returns just the board (back-compat)', () => {
        const local = makeBoard('b1', [{ id: 't1', title: 'x', updatedAt: T.OLD }]);
        const incoming = makeBoard('b1', [{ id: 't1', title: 'y', updatedAt: T.NEW }]);
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards[0].tasks[0].title).toBe('y');
        expect(result.conflicts).toBeUndefined();
    });
});
