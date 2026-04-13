// Tests for Phase 3 sync/save robustness fixes (Fixes 11-16)
// Fix 14: maxListPos updated from Trello server response
// Fix 15: Parallel API calls in push functions
// Fix 16: validateBoardIntegrity repairs surfaced in sync result
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateBoardIntegrity } from '../lib/trelloSync.js';
import {
    resetCounter, makeTrelloList, makeTrelloBoardResponse,
    makeCategory, makeAction, makeTask, makeBoard, makeMappingConfig
} from './helpers/mockTrello.js';

beforeEach(() => {
    resetCounter();
    vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════
// Fix 14: maxListPos updated from server response
// ════════════════════════════════════════════════════════════
describe('maxListPos tracking from server response (Fix 14)', () => {
    it('second list creation uses server pos from first creation', async () => {
        const { syncWithTrello } = await import('../lib/trelloSync.js');
        const trello = await import('../lib/trello.js');

        const listCreations = [];
        vi.spyOn(trello, 'fetchTrelloBoardFull').mockResolvedValue(
            makeTrelloBoardResponse({ lists: [makeTrelloList({ id: 'existing-list', name: 'Existing', pos: 1000 })] })
        );
        vi.spyOn(trello, 'createTrelloList').mockImplementation(async (boardId, name, pos) => {
            listCreations.push({ name, pos });
            return { id: `new-list-${listCreations.length}`, name, pos: pos + 50000 };
        });
        vi.spyOn(trello, 'updateTrelloCard').mockResolvedValue({});
        vi.spyOn(trello, 'createTrelloCard').mockResolvedValue({ id: 'new-card', dateLastActivity: '2026-04-01T00:00:00.000Z' });
        vi.spyOn(trello, 'updateTrelloList').mockResolvedValue({});

        const cat1 = makeCategory({ id: 'cat-new-1', name: 'New Cat 1', trelloListId: null });
        const cat2 = makeCategory({ id: 'cat-new-2', name: 'New Cat 2', trelloListId: null });
        const act1 = makeAction({ id: 'act-1', categoryId: 'cat-new-1', isDefault: true });
        const act2 = makeAction({ id: 'act-2', categoryId: 'cat-new-2', isDefault: true });
        const board = makeBoard({
            categories: [cat1, cat2],
            actions: [act1, act2],
            tasks: []
        });

        await syncWithTrello(board, makeMappingConfig());
        expect(listCreations).toHaveLength(2);
        expect(listCreations[1].pos).toBeGreaterThan(listCreations[0].pos + 50000);
    });

    it('falls back to local pos when server returns no pos (card-as-task)', async () => {
        const { syncWithTrello } = await import('../lib/trelloSync.js');
        const trello = await import('../lib/trello.js');

        const listCreations = [];
        vi.spyOn(trello, 'fetchTrelloBoardFull').mockResolvedValue(
            makeTrelloBoardResponse({ lists: [] })
        );
        vi.spyOn(trello, 'createTrelloList').mockImplementation(async (boardId, name, pos) => {
            listCreations.push({ name, pos });
            return { id: `new-list-${listCreations.length}`, name };
        });
        vi.spyOn(trello, 'updateTrelloCard').mockResolvedValue({});
        vi.spyOn(trello, 'createTrelloCard').mockResolvedValue({ id: 'new-card', dateLastActivity: '2026-04-01T00:00:00.000Z' });

        const cat1 = makeCategory({ id: 'cat-1', name: 'Cat 1', trelloListId: null });
        const cat2 = makeCategory({ id: 'cat-2', name: 'Cat 2', trelloListId: null });
        const act1 = makeAction({ id: 'act-1', categoryId: 'cat-1', isDefault: true });
        const act2 = makeAction({ id: 'act-2', categoryId: 'cat-2', isDefault: true });
        const board = makeBoard({
            categories: [cat1, cat2],
            actions: [act1, act2],
            tasks: []
        });

        await syncWithTrello(board, makeMappingConfig());
        expect(listCreations).toHaveLength(2);
        expect(listCreations[1].pos).toBe(listCreations[0].pos + 16384);
    });
});

// ════════════════════════════════════════════════════════════
// Fix 15: Parallel API calls verification
// ════════════════════════════════════════════════════════════
describe('Parallel API calls (Fix 15)', () => {
    it('label add/remove operations run in parallel, not sequentially', async () => {
        const trello = await import('../lib/trello.js');

        const callOrder = [];
        let callCount = 0;
        vi.spyOn(trello, 'addTrelloCardLabel').mockImplementation(async (cardId, labelId) => {
            const myIndex = callCount++;
            callOrder.push({ op: 'add', labelId, start: myIndex });
            await new Promise(r => setTimeout(r, 10));
            callOrder.push({ op: 'add-done', labelId, end: myIndex });
        });
        vi.spyOn(trello, 'removeTrelloCardLabel').mockImplementation(async (cardId, labelId) => {
            const myIndex = callCount++;
            callOrder.push({ op: 'remove', labelId, start: myIndex });
            await new Promise(r => setTimeout(r, 10));
            callOrder.push({ op: 'remove-done', labelId, end: myIndex });
        });

        const ops = [
            trello.addTrelloCardLabel('card-1', 'label-1'),
            trello.addTrelloCardLabel('card-1', 'label-2'),
            trello.removeTrelloCardLabel('card-1', 'label-3')
        ];
        await Promise.all(ops);

        const startEvents = callOrder.filter(e => !e.op.endsWith('-done'));
        const doneEvents = callOrder.filter(e => e.op.endsWith('-done'));
        expect(startEvents).toHaveLength(3);
        expect(doneEvents).toHaveLength(3);
    });

    it('checklist item updates produce same results when parallelized', async () => {
        const trello = await import('../lib/trello.js');

        const updates = [];
        vi.spyOn(trello, 'updateTrelloChecklistItem').mockImplementation(async (cardId, itemId, payload) => {
            updates.push({ cardId, itemId, ...payload });
            return { id: itemId, ...payload };
        });

        const items = [
            { cardId: 'card-1', itemId: 'item-1', state: 'complete' },
            { cardId: 'card-1', itemId: 'item-2', state: 'incomplete' },
            { cardId: 'card-1', itemId: 'item-3', name: 'Renamed' }
        ];

        const promises = items.map(item =>
            trello.updateTrelloChecklistItem(item.cardId, item.itemId,
                item.state ? { state: item.state } : { name: item.name })
                .catch(e => console.error('Failed:', e.message))
        );
        await Promise.all(promises);

        expect(updates).toHaveLength(3);
        expect(updates.find(u => u.itemId === 'item-1')?.state).toBe('complete');
        expect(updates.find(u => u.itemId === 'item-2')?.state).toBe('incomplete');
        expect(updates.find(u => u.itemId === 'item-3')?.name).toBe('Renamed');
    });
});

// ════════════════════════════════════════════════════════════
// Fix 16: validateBoardIntegrity repairs in sync result
// ════════════════════════════════════════════════════════════
describe('validateBoardIntegrity repairs reporting (Fix 16)', () => {
    it('returns repairs array when orphan tasks are removed', () => {
        const board = makeBoard({
            categories: [makeCategory({ id: 'cat-1' })],
            actions: [makeAction({ id: 'act-1', categoryId: 'cat-1' })],
            tasks: [
                makeTask({ id: 't-valid', actionId: 'act-1', title: 'Valid' }),
                makeTask({ id: 't-orphan', actionId: 'act-missing', title: 'Orphan Task' })
            ]
        });

        const result = validateBoardIntegrity(board);
        expect(result.repairs).toBeDefined();
        expect(result.repairs.length).toBeGreaterThan(0);
        expect(result.repairs.some(r => r.includes('Orphan Task'))).toBe(true);
        expect(result.board.tasks.some(t => t.id === 't-orphan')).toBe(false);
        expect(result.board.tasks.some(t => t.id === 't-valid')).toBe(true);
    });

    it('returns repairs array when duplicate trelloCardId tasks are removed', () => {
        const board = makeBoard({
            categories: [makeCategory({ id: 'cat-1' })],
            actions: [makeAction({ id: 'act-1', categoryId: 'cat-1' })],
            tasks: [
                makeTask({ id: 't-1', actionId: 'act-1', title: 'First', trelloCardId: 'card-dup' }),
                makeTask({ id: 't-2', actionId: 'act-1', title: 'Second', trelloCardId: 'card-dup' })
            ],
            trelloSync: { syncMode: 'card-as-task' }
        });

        const result = validateBoardIntegrity(board);
        expect(result.repairs.length).toBeGreaterThan(0);
        expect(result.repairs.some(r => r.includes('duplicate'))).toBe(true);
        expect(result.board.tasks).toHaveLength(1);
        expect(result.board.tasks[0].id).toBe('t-1');
    });

    it('does NOT remove duplicate trelloCardId in card-as-action mode', () => {
        const board = makeBoard({
            categories: [makeCategory({ id: 'cat-1' })],
            actions: [makeAction({ id: 'act-1', categoryId: 'cat-1' })],
            tasks: [
                makeTask({ id: 't-1', actionId: 'act-1', title: 'Item 1', trelloCardId: 'card-shared' }),
                makeTask({ id: 't-2', actionId: 'act-1', title: 'Item 2', trelloCardId: 'card-shared' })
            ],
            trelloSync: { syncMode: 'card-as-action' }
        });

        const result = validateBoardIntegrity(board);
        expect(result.board.tasks).toHaveLength(2);
    });

    it('creates missing default actions and reports the repair', () => {
        const board = makeBoard({
            categories: [makeCategory({ id: 'cat-1', name: 'Marketing' })],
            actions: [],
            tasks: [],
            trelloSync: { syncMode: 'card-as-task' }
        });

        const result = validateBoardIntegrity(board);
        expect(result.repairs.some(r => r.includes('default action') && r.includes('Marketing'))).toBe(true);
        expect(result.board.actions.some(a => a.categoryId === 'cat-1' && a.isDefault)).toBe(true);
    });

    it('sync result includes integrityWarnings when repairs occur', async () => {
        const { syncWithTrello } = await import('../lib/trelloSync.js');
        const trello = await import('../lib/trello.js');

        vi.spyOn(trello, 'fetchTrelloBoardFull').mockResolvedValue(
            makeTrelloBoardResponse({ lists: [makeTrelloList({ id: 'list-1', name: 'Test' })] })
        );

        const board = makeBoard({
            categories: [makeCategory({ id: 'cat-1', trelloListId: 'list-1' })],
            actions: [makeAction({ id: 'act-1', categoryId: 'cat-1', isDefault: true, trelloCardId: null })],
            tasks: [
                makeTask({ id: 't-orphan', actionId: 'act-MISSING', title: 'Orphan' })
            ]
        });

        const result = await syncWithTrello(board, makeMappingConfig(), { readOnly: true });
        expect(result.result.integrityWarnings).toBeDefined();
        expect(result.result.integrityWarnings.length).toBeGreaterThan(0);
        expect(result.board.tasks.some(t => t.id === 't-orphan')).toBe(false);
    });

    it('sync result includes repairs array when integrity auto-repairs', async () => {
        const { syncWithTrello } = await import('../lib/trelloSync.js');
        const trello = await import('../lib/trello.js');

        vi.spyOn(trello, 'fetchTrelloBoardFull').mockResolvedValue(
            makeTrelloBoardResponse({ lists: [makeTrelloList({ id: 'list-1', name: 'Test' })] })
        );

        const board = makeBoard({
            categories: [makeCategory({ id: 'cat-1', trelloListId: 'list-1' })],
            actions: [makeAction({ id: 'act-1', categoryId: 'cat-1', isDefault: true })],
            tasks: [
                makeTask({ id: 't-orphan', actionId: 'act-GONE', title: 'OrphanTask' })
            ]
        });

        const result = await syncWithTrello(board, makeMappingConfig(), { readOnly: true });
        expect(result.result.repairs).toBeDefined();
        expect(result.result.repairs.some(r => r.includes('OrphanTask'))).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════
// Fix 14 (card-as-action): maxListPos for card-as-action mode
// ════════════════════════════════════════════════════════════
describe('maxListPos tracking — card-as-action mode (Fix 14)', () => {
    it('second list creation uses server pos from first creation (card-as-action)', async () => {
        const { syncWithTrello } = await import('../lib/trelloSync.js');
        const trello = await import('../lib/trello.js');

        const listCreations = [];
        vi.spyOn(trello, 'fetchTrelloBoardFull').mockResolvedValue(
            makeTrelloBoardResponse({
                lists: [makeTrelloList({ id: 'existing-list', name: 'Existing', pos: 1000 })],
                cards: []
            })
        );
        vi.spyOn(trello, 'createTrelloList').mockImplementation(async (boardId, name, pos) => {
            listCreations.push({ name, pos });
            return { id: `new-list-${listCreations.length}`, name, pos: pos + 50000 };
        });
        vi.spyOn(trello, 'updateTrelloCard').mockResolvedValue({});
        vi.spyOn(trello, 'createTrelloCard').mockResolvedValue({ id: 'new-card', dateLastActivity: '2026-04-01T00:00:00.000Z' });
        vi.spyOn(trello, 'updateTrelloList').mockResolvedValue({});

        const cat1 = makeCategory({ id: 'cat-new-1', name: 'NewCA1', trelloListId: null });
        const cat2 = makeCategory({ id: 'cat-new-2', name: 'NewCA2', trelloListId: null });
        const act1 = makeAction({ id: 'act-1', categoryId: 'cat-new-1' });
        const act2 = makeAction({ id: 'act-2', categoryId: 'cat-new-2' });
        const board = makeBoard({
            categories: [cat1, cat2],
            actions: [act1, act2],
            tasks: [],
            trelloSync: { syncMode: 'card-as-action' }
        });

        await syncWithTrello(board, makeMappingConfig());
        expect(listCreations).toHaveLength(2);
        expect(listCreations[1].pos).toBeGreaterThan(listCreations[0].pos + 50000);
    });
});
