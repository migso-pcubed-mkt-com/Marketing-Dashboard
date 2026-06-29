// Comprehensive tests for validateBoardIntegrity
// Covers: orphan removal, trelloCardId dedup (card-as-task ONLY), trelloCheckItemId dedup,
//         default action repair, card-as-action dedup skip, syncMode warning, repaired board
import { describe, it, expect } from 'vitest';
import { validateBoardIntegrity } from '../lib/trelloSync.js';

describe('validateBoardIntegrity', () => {
    // ── Valid boards ──
    it('returns valid=true for empty board', () => {
        const result = validateBoardIntegrity({ categories: [], actions: [], tasks: [] });
        expect(result.valid).toBe(true);
        expect(result.warnings).toEqual([]);
        expect(result.repairs).toEqual([]);
    });

    it('returns valid=true for fully consistent board', () => {
        const board = {
            categories: [{ id: 'c1' }, { id: 'c2' }],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true },
                { id: 'a2', categoryId: 'c2', isDefault: true }
            ],
            tasks: [
                { id: 't1', title: 'T1', actionId: 'a1' },
                { id: 't2', title: 'T2', actionId: 'a2' }
            ]
        };
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(true);
    });

    // ── Orphan task removal ──
    it('removes tasks referencing missing actions', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1' }],
            tasks: [
                { id: 't1', title: 'Good', actionId: 'a1' },
                { id: 't2', title: 'Orphan', actionId: 'a-missing' }
            ]
        };
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(false);
        expect(result.board.tasks).toHaveLength(1);
        expect(result.board.tasks[0].id).toBe('t1');
        expect(result.repairs.some(r => r.includes('Orphan'))).toBe(true);
    });

    it('removes multiple orphan tasks', () => {
        const board = {
            categories: [{ id: 'c1', name: 'Cat' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [
                { id: 't1', title: 'Orphan1', actionId: 'a-gone1' },
                { id: 't2', title: 'Orphan2', actionId: 'a-gone2' }
            ]
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.tasks).toHaveLength(0);
        expect(result.repairs).toHaveLength(2);
    });

    it('keeps tasks without actionId (edge case)', () => {
        const board = {
            categories: [], actions: [],
            tasks: [{ id: 't1', title: 'No action', actionId: null }]
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.tasks).toHaveLength(1);
    });

    // ── Orphan action removal ──
    it('removes actions referencing missing categories', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [
                { id: 'a1', categoryId: 'c1', name: 'Good', isDefault: true },
                { id: 'a2', categoryId: 'c-missing', name: 'Orphan' }
            ],
            tasks: []
        };
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(false);
        expect(result.board.actions.filter(a => a.name === 'Orphan')).toHaveLength(0);
        expect(result.repairs.some(r => r.includes('Orphan'))).toBe(true);
    });

    it('removes orphan action but keeps its tasks (no cascade — tasks checked against original action set)', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true },
                { id: 'a-orphan', categoryId: 'c-gone', name: 'Gone' }
            ],
            tasks: [
                { id: 't1', title: 'Stays', actionId: 'a1' },
                { id: 't2', title: 'Also stays', actionId: 'a-orphan' }
            ]
        };
        const result = validateBoardIntegrity(board);
        // a-orphan is removed, but t2 passes orphan check because a-orphan was in original actionIds
        expect(result.board.actions.some(a => a.id === 'a-orphan')).toBe(false);
        expect(result.board.tasks).toHaveLength(2);
    });

    // ── trelloCardId dedup (card-as-task ONLY) ──
    it('deduplicates trelloCardId in card-as-task mode', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [
                { id: 't1', title: 'First', actionId: 'a1', trelloCardId: 'card-dup' },
                { id: 't2', title: 'Duplicate', actionId: 'a1', trelloCardId: 'card-dup' },
                { id: 't3', title: 'Unique', actionId: 'a1', trelloCardId: 'card-other' }
            ]
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.tasks).toHaveLength(2);
        expect(result.board.tasks[0].id).toBe('t1'); // First kept
        expect(result.board.tasks[1].id).toBe('t3');
        expect(result.repairs.some(r => r.includes('duplicate'))).toBe(true);
    });

    it('does NOT deduplicate trelloCardId in card-as-action mode', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1' }],
            tasks: [
                { id: 't1', title: 'Item1', actionId: 'a1', trelloCardId: 'card-shared' },
                { id: 't2', title: 'Item2', actionId: 'a1', trelloCardId: 'card-shared' },
                { id: 't3', title: 'Item3', actionId: 'a1', trelloCardId: 'card-shared' }
            ],
            trelloSync: { syncMode: 'card-as-action' }
        };
        const result = validateBoardIntegrity(board);
        // All 3 tasks should remain — sharing trelloCardId is normal in card-as-action
        expect(result.board.tasks).toHaveLength(3);
    });

    it('deduplicates trelloCardId when no syncMode (defaults to card-as-task)', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [
                { id: 't1', title: 'A', actionId: 'a1', trelloCardId: 'dup' },
                { id: 't2', title: 'B', actionId: 'a1', trelloCardId: 'dup' }
            ]
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.tasks).toHaveLength(1);
    });

    it('skips tasks without trelloCardId in dedup', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [
                { id: 't1', title: 'Local1', actionId: 'a1' },
                { id: 't2', title: 'Local2', actionId: 'a1' }
            ]
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.tasks).toHaveLength(2);
    });

    // ── trelloCheckItemId dedup ──
    it('deduplicates trelloCheckItemId (keeps first)', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1' }],
            tasks: [
                { id: 't1', title: 'First', actionId: 'a1', trelloCheckItemId: 'item-dup' },
                { id: 't2', title: 'Dup', actionId: 'a1', trelloCheckItemId: 'item-dup' },
                { id: 't3', title: 'Other', actionId: 'a1', trelloCheckItemId: 'item-other' }
            ],
            trelloSync: { syncMode: 'card-as-action' }
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.tasks).toHaveLength(2);
        expect(result.board.tasks[0].id).toBe('t1');
        expect(result.board.tasks[1].id).toBe('t3');
    });

    it('trelloCheckItemId dedup applies in card-as-action mode', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1' }],
            tasks: [
                { id: 't1', title: 'A', actionId: 'a1', trelloCardId: 'c1', trelloCheckItemId: 'ci-dup' },
                { id: 't2', title: 'B', actionId: 'a1', trelloCardId: 'c1', trelloCheckItemId: 'ci-dup' }
            ],
            trelloSync: { syncMode: 'card-as-action' }
        };
        const result = validateBoardIntegrity(board);
        // trelloCardId NOT deduped (card-as-action), but trelloCheckItemId IS deduped
        expect(result.board.tasks).toHaveLength(1);
    });

    // ── Default action repair ──
    it('creates missing default actions for categories in card-as-task mode', () => {
        const board = {
            categories: [{ id: 'c1', name: 'Marketing' }, { id: 'c2', name: 'Sales' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        };
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(false);
        const salesDefault = result.board.actions.find(a => a.categoryId === 'c2' && a.isDefault);
        expect(salesDefault).toBeDefined();
        expect(salesDefault.name).toBe('Sales');
        expect(salesDefault.id).toMatch(/^a-/);
        expect(result.repairs.some(r => r.includes('Sales'))).toBe(true);
    });

    it('does not create default actions when they already exist', () => {
        const board = {
            categories: [{ id: 'c1', name: 'Cat' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.actions).toHaveLength(1);
    });

    it('does not create default actions in card-as-action mode', () => {
        const board = {
            categories: [{ id: 'c1', name: 'Cat' }],
            actions: [],
            tasks: [],
            trelloSync: { syncMode: 'card-as-action' }
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.actions).toHaveLength(0);
    });

    it('does NOT inject a phantom default into a non-Trello category that has real actions (M2)', () => {
        const board = {
            categories: [{ id: 'c1', name: 'Marketing' }],
            actions: [{ id: 'a1', name: 'Real action', categoryId: 'c1', isDefault: false }],
            tasks: []
            // no trelloSync → non-Trello board
        };
        const result = validateBoardIntegrity(board);
        expect(result.board.actions).toHaveLength(1);
        expect(result.board.actions.some(a => a.isDefault)).toBe(false);
    });

    it('still creates a placeholder default for an EMPTY non-Trello category', () => {
        const board = { categories: [{ id: 'c1', name: 'Empty' }], actions: [], tasks: [] };
        const result = validateBoardIntegrity(board);
        expect(result.board.actions).toHaveLength(1);
        expect(result.board.actions[0].isDefault).toBe(true);
    });

    it('creates default action with correct fields', () => {
        const board = {
            categories: [{ id: 'c1', name: 'Dev' }],
            actions: [],
            tasks: []
        };
        const result = validateBoardIntegrity(board);
        const created = result.board.actions[0];
        expect(created.categoryId).toBe('c1');
        expect(created.isDefault).toBe(true);
        expect(created.budget).toBe(0);
        expect(created.priority).toBe('medium');
        expect(created.status).toBe('active');
        expect(created.createdAt).toBeDefined();
        expect(created.updatedAt).toBeDefined();
    });

    // ── syncMode warning ──
    it('warns when trelloBoardId exists but no syncMode', () => {
        const board = {
            categories: [], actions: [], tasks: [],
            trelloSync: { trelloBoardId: 'tb-1' }
        };
        const result = validateBoardIntegrity(board);
        expect(result.warnings.some(w => w.includes('syncMode'))).toBe(true);
    });

    it('does not warn about syncMode when no trelloBoardId', () => {
        const board = { categories: [], actions: [], tasks: [], trelloSync: {} };
        const result = validateBoardIntegrity(board);
        expect(result.warnings.filter(w => w.includes('syncMode'))).toHaveLength(0);
    });

    // ── Repaired board returned ──
    it('returns original board when no repairs needed', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{ id: 't1', title: 'T', actionId: 'a1' }]
        };
        const result = validateBoardIntegrity(board);
        expect(result.board).toBe(board); // Same reference — no clone
    });

    it('returns new board object when repairs applied', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1' }],
            tasks: [{ id: 't1', title: 'Orphan', actionId: 'a-gone' }]
        };
        const result = validateBoardIntegrity(board);
        expect(result.board).not.toBe(board); // New object
        expect(result.board.tasks).toHaveLength(0);
    });

    // ── Combined repairs ──
    it('handles multiple repair types simultaneously', () => {
        const board = {
            categories: [{ id: 'c1', name: 'Cat1' }, { id: 'c2', name: 'Cat2' }],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true },
                { id: 'a-orphan', categoryId: 'c-gone', name: 'OrphanAction' }
                // c2 missing default action
            ],
            tasks: [
                { id: 't1', title: 'Good', actionId: 'a1', trelloCardId: 'c-unique' },
                { id: 't2', title: 'Dup', actionId: 'a1', trelloCardId: 'c-unique' }, // dup
                { id: 't3', title: 'OrphanTask', actionId: 'a-missing' } // orphan
            ]
        };
        const result = validateBoardIntegrity(board);
        // a-orphan removed (missing category c-gone)
        expect(result.board.actions.filter(a => a.name === 'OrphanAction')).toHaveLength(0);
        // Default action created for c2
        expect(result.board.actions.some(a => a.categoryId === 'c2' && a.isDefault)).toBe(true);
        // t3 removed (orphan task), t2 removed (dup trelloCardId)
        expect(result.board.tasks).toHaveLength(1);
        expect(result.board.tasks[0].id).toBe('t1');
    });

    // ── Edge cases ──
    it('handles board with no trelloSync field', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        };
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(true);
    });

    it('handles undefined arrays gracefully', () => {
        const board = {};
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(true);
    });
});
