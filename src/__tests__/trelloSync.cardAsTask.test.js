// Integration tests for syncWithTrello in card-as-task mode
// All Trello API calls are mocked — no real network
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the trello.js module BEFORE importing trelloSync
vi.mock('../lib/trello.js', () => ({
    fetchTrelloBoardFull: vi.fn(),
    updateTrelloCard: vi.fn().mockResolvedValue({}),
    createTrelloCard: vi.fn().mockResolvedValue({ id: 'new-card-1', dateLastActivity: '2026-03-22T00:00:00.000Z' }),
    addTrelloComment: vi.fn().mockResolvedValue({ id: 'new-cm-1' }),
    addTrelloChecklist: vi.fn().mockResolvedValue({ id: 'new-cl-1', itemsCreated: 0 }),
    addTrelloChecklistItems: vi.fn().mockResolvedValue({ itemsAdded: 0 }),
    updateTrelloChecklistItem: vi.fn().mockResolvedValue({}),
    updateTrelloChecklist: vi.fn().mockResolvedValue({}),
    addTrelloAttachment: vi.fn().mockResolvedValue({ id: 'new-att-1' }),
    uploadTrelloAttachment: vi.fn().mockResolvedValue({ id: 'new-att-2' }),
    deleteTrelloChecklist: vi.fn().mockResolvedValue({}),
    deleteTrelloAttachment: vi.fn().mockResolvedValue({}),
    deleteTrelloChecklistItem: vi.fn().mockResolvedValue({}),
    createTrelloBoardLabel: vi.fn().mockResolvedValue({ id: 'new-lbl-1' }),
    addTrelloCardLabel: vi.fn().mockResolvedValue({}),
    removeTrelloCardLabel: vi.fn().mockResolvedValue({}),
    updateTrelloList: vi.fn().mockResolvedValue({}),
    createTrelloList: vi.fn().mockResolvedValue({ id: 'new-list-1', pos: 16384 }),
    setTrelloUserToken: vi.fn(),
    getTrelloUserToken: vi.fn()
}));

import { syncWithTrello, isSyncInProgress } from '../lib/trelloSync.js';
import { fetchTrelloBoardFull, updateTrelloCard, createTrelloCard, createTrelloList, updateTrelloList } from '../lib/trello.js';

// ── Helpers ──
const T = {
    // Timestamps for last-write-wins scenarios
    OLD: '2026-03-10T00:00:00.000Z',
    MID: '2026-03-15T00:00:00.000Z',
    NEW: '2026-03-20T10:00:00.000Z',
    NEWER: '2026-03-22T00:00:00.000Z'
};

const makeBoard = (overrides = {}) => ({
    id: 'board-1', name: 'Test',
    categories: [], actions: [], tasks: [], members: [],
    trelloSync: {
        trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-task',
        lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
    },
    ...overrides
});

const makeCard = (overrides = {}) => ({
    id: 'card-1', name: 'Card', desc: '', due: null, start: null,
    dueComplete: false, closed: false, dateLastActivity: T.NEW,
    idList: 'list-1', idLabels: [], labels: [], idMembers: [],
    idChecklists: [], checklists: [], attachments: [], comments: [], pos: 100,
    ...overrides
});

const makeList = (overrides = {}) => ({
    id: 'list-1', name: 'List', pos: 16384, closed: false, ...overrides
});

const makeTrelloResponse = ({ cards = [], lists = [], members = [] } = {}) => ({
    board: { id: 'tb-1', name: 'Test Board', url: '' },
    cards, lists, labels: [], members
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('syncWithTrello — card-as-task', () => {

    // ════════════════════════════════════════════════════════
    // Sync lock
    // ════════════════════════════════════════════════════════
    it('returns skipped result if sync is already in progress', async () => {
        // Simulate a long-running sync
        fetchTrelloBoardFull.mockImplementation(() => new Promise(resolve => {
            setTimeout(() => resolve(makeTrelloResponse()), 100);
        }));
        const board = makeBoard({ categories: [], actions: [], tasks: [] });
        const mappingConfig = { labelMappings: {} };

        // Start first sync (will be pending)
        const first = syncWithTrello(board, mappingConfig);
        // Start second sync immediately — should skip
        const second = await syncWithTrello(board, mappingConfig);
        expect(second.result.skipped).toBe(true);

        await first; // Clean up
    });

    // ════════════════════════════════════════════════════════
    // Last-write-wins: Trello changed only → pull
    // ════════════════════════════════════════════════════════
    it('pulls task changes when only Trello changed', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Old Title', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // Local NOT modified since last sync
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'New Title', desc: 'Updated',
                dateLastActivity: T.NEW // Trello changed AFTER trelloLastModified
            })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.updated).toBeGreaterThanOrEqual(1);
        expect(synced.tasks[0].title).toBe('New Title');
        expect(synced.tasks[0].description).toBe('Updated');
        expect(updateTrelloCard).not.toHaveBeenCalled(); // No push
    });

    // ════════════════════════════════════════════════════════
    // Last-write-wins: Local changed only → push
    // ════════════════════════════════════════════════════════
    it('pushes task changes when only local changed', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Local Change', actionId: 'a1', status: 'inprogress',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Local modified AFTER last sync
                dueDate: '2026-04-15', startDate: '2026-04-01', month: 3,
                description: 'desc', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Old Name',
                dateLastActivity: T.MID // Trello NOT changed since last sync
            })]
        }));

        const { result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.pushed).toBeGreaterThanOrEqual(1);
        expect(updateTrelloCard).toHaveBeenCalledWith('card-1', expect.objectContaining({
            name: 'Local Change'
        }));
    });

    // ════════════════════════════════════════════════════════
    // Last-write-wins: Both changed, local wins
    // ════════════════════════════════════════════════════════
    it('pushes when both changed and local is newer', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Local Wins', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.OLD,
                updatedAt: T.NEWER, // Local is newest
                dueDate: '2026-04-15', startDate: '2026-04-01', month: 3,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Trello Change',
                dateLastActivity: T.NEW // Also changed, but older than local
            })]
        }));

        const { result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.pushed).toBeGreaterThanOrEqual(1);
        expect(updateTrelloCard).toHaveBeenCalledWith('card-1', expect.objectContaining({
            name: 'Local Wins'
        }));
    });

    // ════════════════════════════════════════════════════════
    // Last-write-wins: Both changed, Trello wins
    // ════════════════════════════════════════════════════════
    it('pulls when both changed and Trello is newer', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Local Old', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.OLD,
                updatedAt: T.MID, // Local changed but older
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Trello Wins',
                dateLastActivity: T.NEWER // Trello is newest
            })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.updated).toBeGreaterThanOrEqual(1);
        expect(synced.tasks[0].title).toBe('Trello Wins');
        expect(updateTrelloCard).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // Card deleted on Trello → task paused
    // ════════════════════════════════════════════════════════
    it('pauses task when Trello card is deleted', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Will Pause', actionId: 'a1', status: 'inprogress',
                trelloCardId: 'card-deleted',
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [] // Card is gone
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks[0].status).toBe('paused');
        expect(result.updated).toBeGreaterThanOrEqual(1);
    });

    // ════════════════════════════════════════════════════════
    // Card archived on Trello → task paused + trelloArchived
    // ════════════════════════════════════════════════════════
    it('pauses task and sets trelloArchived when card is archived', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Archived', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1',
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', closed: true, dateLastActivity: T.NEW })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks[0].status).toBe('paused');
        expect(synced.tasks[0].trelloArchived).toBe(true);
    });

    // ════════════════════════════════════════════════════════
    // Card unarchived on Trello → task restored
    // ════════════════════════════════════════════════════════
    it('restores task when previously archived card is unarchived', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Was Archived', actionId: 'a1',
                status: 'paused', trelloArchived: true,
                trelloCardId: 'card-1',
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', closed: false, dateLastActivity: T.NEW })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks[0].trelloArchived).toBe(false);
        expect(synced.tasks[0].status).toBe('todo'); // Restored from paused
    });

    // ════════════════════════════════════════════════════════
    // Archived cards NOT re-imported as new tasks
    // ════════════════════════════════════════════════════════
    it('does not import archived cards as new tasks', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-archived', closed: true })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks).toHaveLength(0);
    });

    // ════════════════════════════════════════════════════════
    // New Trello card → new task created
    // ════════════════════════════════════════════════════════
    it('creates task from new Trello card', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-new', name: 'New from Trello', desc: 'Created on Trello',
                due: '2026-05-01T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
                idMembers: ['m1'], dueComplete: false
            })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.created).toBeGreaterThanOrEqual(1);
        expect(synced.tasks).toHaveLength(1);
        expect(synced.tasks[0].title).toBe('New from Trello');
        expect(synced.tasks[0].description).toBe('Created on Trello');
        expect(synced.tasks[0].dueDate).toBe('2026-05-01');
        expect(synced.tasks[0].startDate).toBe('2026-04-01');
        expect(synced.tasks[0].trelloCardId).toBe('card-new');
        expect(synced.tasks[0].assignees).toEqual(['m1']);
        expect(synced.tasks[0].actionId).toBe('a1');
    });

    it('new card with checklists, comments, attachments', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-full', name: 'Full Card',
                checklists: [{
                    id: 'tcl-1', name: 'QA', pos: 100,
                    checkItems: [{ id: 'tci-1', name: 'Test', state: 'complete', pos: 1 }]
                }],
                comments: [{ id: 'tcm-1', data: { text: 'LGTM' }, date: '2026-03-20', memberCreator: { fullName: 'Alice' } }],
                attachments: [{ id: 'tatt-1', name: 'spec.pdf', url: 'https://spec', mimeType: 'application/pdf', date: '2026-03-20' }]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks[0];
        expect(task.checklists).toHaveLength(1);
        expect(task.checklists[0].name).toBe('QA');
        expect(task.checklists[0].items[0].done).toBe(true);
        expect(task.comments).toHaveLength(1);
        expect(task.comments[0].text).toBe('LGTM');
        expect(task.attachments).toHaveLength(1);
        expect(task.attachments[0].name).toBe('spec.pdf');
    });

    // ════════════════════════════════════════════════════════
    // Dedup guard on card import
    // ════════════════════════════════════════════════════════
    it('does not create duplicate tasks for same card ID', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Existing', actionId: 'a1',
                trelloCardId: 'card-1', trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0, status: 'todo'
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', dateLastActivity: T.NEW })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Should update existing, not create new
        expect(synced.tasks).toHaveLength(1);
    });

    // ════════════════════════════════════════════════════════
    // New local task → pushed to Trello
    // ════════════════════════════════════════════════════════
    it('pushes new local task as new Trello card', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't-local', title: 'Created Locally', actionId: 'a1', status: 'todo',
                trelloCardId: null, // No Trello link
                dueDate: '2026-04-15', startDate: '2026-04-01', month: 3,
                description: 'Local desc', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: ['m1'], otherLabels: [], order: 0,
                createdAt: T.NEW, updatedAt: T.NEW
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: []
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.pushed).toBeGreaterThanOrEqual(1);
        expect(createTrelloCard).toHaveBeenCalledWith('list-1', expect.objectContaining({
            name: 'Created Locally', desc: 'Local desc'
        }));
        expect(synced.tasks[0].trelloCardId).toBe('new-card-1');
    });

    // ════════════════════════════════════════════════════════
    // readOnly → no pushes
    // ════════════════════════════════════════════════════════
    it('does not push in readOnly mode', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Changed', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Local changed
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', dateLastActivity: T.MID })]
        }));

        await syncWithTrello(board, { labelMappings: {} }, { readOnly: true });

        expect(updateTrelloCard).not.toHaveBeenCalled();
        expect(createTrelloCard).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // List archived → category + tasks removed
    // ════════════════════════════════════════════════════════
    it('removes category and its tasks when Trello list is archived', async () => {
        const board = makeBoard({
            categories: [
                { id: 'c1', trelloListId: 'list-1', name: 'Active' },
                { id: 'c-gone', trelloListId: 'list-gone', name: 'Archived Cat' }
            ],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true },
                { id: 'a-gone', categoryId: 'c-gone', isDefault: true }
            ],
            tasks: [
                { id: 't1', title: 'Stays', actionId: 'a1', trelloCardId: 'card-1', trelloLastModified: T.MID, updatedAt: T.OLD, status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 },
                { id: 't-gone', title: 'Gone', actionId: 'a-gone', trelloCardId: 'card-2', trelloLastModified: T.MID, updatedAt: T.OLD, status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 }
            ]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList({ id: 'list-1', name: 'Active' })], // list-gone is absent
            cards: [makeCard({ id: 'card-1', dateLastActivity: T.NEW })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.categories.some(c => c.id === 'c-gone')).toBe(false);
        expect(synced.tasks.some(t => t.id === 't-gone')).toBe(false);
        expect(synced.tasks.some(t => t.id === 't1')).toBe(true);
    });

    // ════════════════════════════════════════════════════════
    // New Trello list → new category + default action
    // ════════════════════════════════════════════════════════
    it('creates category and default action from new Trello list', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [
                makeList({ id: 'list-1', name: 'Existing' }),
                makeList({ id: 'list-new', name: 'New List', pos: 32768 })
            ],
            cards: []
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.created).toBeGreaterThanOrEqual(1);
        const newCat = synced.categories.find(c => c.trelloListId === 'list-new');
        expect(newCat).toBeDefined();
        expect(newCat.name).toBe('New List');
        // Should have a default action for the new category
        const newAction = synced.actions.find(a => a.categoryId === newCat.id && a.isDefault);
        expect(newAction).toBeDefined();
    });

    // ════════════════════════════════════════════════════════
    // New local category → pushed as Trello list
    // ════════════════════════════════════════════════════════
    it('pushes new local category as Trello list', async () => {
        const board = makeBoard({
            categories: [
                { id: 'c1', trelloListId: 'list-1' },
                { id: 'c-local', name: 'Local Cat' } // No trelloListId
            ],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true }
            ],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList({ id: 'list-1' })],
            cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(createTrelloList).toHaveBeenCalled();
        const localCat = synced.categories.find(c => c.id === 'c-local');
        expect(localCat.trelloListId).toBe('new-list-1');
    });

    // ════════════════════════════════════════════════════════
    // List name sync: Trello renamed → local updated (pull)
    // ════════════════════════════════════════════════════════
    it('pulls list name change from Trello', async () => {
        const board = makeBoard({
            categories: [{
                id: 'c1', trelloListId: 'list-1', name: 'Old Name',
                updatedAt: T.OLD, trelloLastModified: T.MID
            }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList({ id: 'list-1', name: 'Renamed on Trello' })],
            cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.categories[0].name).toBe('Renamed on Trello');
    });

    // ════════════════════════════════════════════════════════
    // List name sync: local renamed → pushed to Trello
    // ════════════════════════════════════════════════════════
    it('pushes local category name change to Trello list', async () => {
        const board = makeBoard({
            categories: [{
                id: 'c1', trelloListId: 'list-1', name: 'Local Rename',
                updatedAt: T.NEW, trelloLastModified: T.MID // Locally modified
            }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList({ id: 'list-1', name: 'Old Name' })],
            cards: []
        }));

        await syncWithTrello(board, { labelMappings: {} });

        expect(updateTrelloList).toHaveBeenCalledWith('list-1', expect.objectContaining({
            name: 'Local Rename'
        }));
    });

    // ════════════════════════════════════════════════════════
    // Card movement between lists → task changes category
    // ════════════════════════════════════════════════════════
    it('moves task to new category when card moves to different list', async () => {
        const board = makeBoard({
            categories: [
                { id: 'c1', trelloListId: 'list-1' },
                { id: 'c2', trelloListId: 'list-2' }
            ],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true },
                { id: 'a2', categoryId: 'c2', isDefault: true }
            ],
            tasks: [{
                id: 't1', title: 'Moving Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // Not locally modified
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [
                makeList({ id: 'list-1' }),
                makeList({ id: 'list-2', pos: 32768 })
            ],
            cards: [makeCard({
                id: 'card-1', idList: 'list-2', // Moved to list-2!
                dateLastActivity: T.NEW
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks[0].actionId).toBe('a2'); // Now in category 2's action
    });

    // ════════════════════════════════════════════════════════
    // Members sync
    // ════════════════════════════════════════════════════════
    it('updates board members from Trello', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [], members: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()], cards: [],
            members: [
                { id: 'm1', fullName: 'Alice', username: 'alice', avatarUrl: 'https://av' },
                { id: 'm2', fullName: 'Bob', username: 'bob', avatarUrl: null }
            ]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.members).toHaveLength(2);
        expect(synced.members[0].fullName).toBe('Alice');
        expect(synced.members[0].avatarUrl).toContain('/50.png');
        expect(synced.members[1].avatarUrl).toBeNull();
    });

    // ════════════════════════════════════════════════════════
    // Post-sync integrity check
    // ════════════════════════════════════════════════════════
    it('runs integrity check after sync and repairs orphans', async () => {
        // Create a board where sync will produce an orphan
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't-orphan', title: 'Orphan', actionId: 'a-gone', // References non-existent action
                trelloCardId: null, status: 'todo',
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                updatedAt: T.OLD
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()], cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Orphan task should be repaired away by validateBoardIntegrity
        expect(synced.tasks.some(t => t.id === 't-orphan')).toBe(false);
    });

    // ════════════════════════════════════════════════════════
    // Label mapping on new cards
    // ════════════════════════════════════════════════════════
    it('maps labels on new Trello cards to channels and countries', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' },
                'lbl-fr': { type: 'country', countryId: 'france' },
                'lbl-tag': { type: 'other', labelName: 'Urgent', labelColor: '#ef4444' }
            }
        };
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-labeled', name: 'Labeled Card',
                idLabels: ['lbl-social', 'lbl-fr', 'lbl-tag']
            })]
        }));

        const { board: synced } = await syncWithTrello(board, mappingConfig);

        const task = synced.tasks[0];
        expect(task.channels).toContain('social');
        expect(task.countries).toContain('france');
        expect(task.otherLabels.some(l => l.name === 'Urgent')).toBe(true);
    });

    // ════════════════════════════════════════════════════════
    // lastSyncAt updated
    // ════════════════════════════════════════════════════════
    it('updates lastSyncAt after sync', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()], cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(new Date(synced.trelloSync.lastSyncAt).getTime()).toBeGreaterThan(new Date(T.OLD).getTime());
    });

    // ════════════════════════════════════════════════════════
    // Board without trelloBoardId → error
    // ════════════════════════════════════════════════════════
    it('throws when board has no trelloBoardId', async () => {
        const board = { ...makeBoard(), trelloSync: {} };
        await expect(syncWithTrello(board, {})).rejects.toThrow('not linked');
    });
});
