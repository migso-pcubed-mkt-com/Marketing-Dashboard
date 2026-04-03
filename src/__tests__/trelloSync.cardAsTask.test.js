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
import {
    fetchTrelloBoardFull, updateTrelloCard, createTrelloCard, createTrelloList, updateTrelloList,
    updateTrelloChecklist, updateTrelloChecklistItem, addTrelloCardLabel, removeTrelloCardLabel,
    deleteTrelloChecklist, createTrelloBoardLabel
} from '../lib/trello.js';

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

        // Task should be completely removed from the board
        expect(synced.tasks).toHaveLength(0);
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

    // ════════════════════════════════════════════════════════
    // Gap 1: "Neither changed" extras merge (PULL)
    // When both timestamps are equal, extras should still sync
    // ════════════════════════════════════════════════════════
    it('merges extras even when neither side has timestamp changes', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // Not modified locally
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Task',
                dateLastActivity: T.MID, // Same as trelloLastModified → neither changed
                checklists: [{
                    id: 'tcl-1', name: 'Review', pos: 100,
                    checkItems: [{ id: 'tci-1', name: 'Step 1', state: 'incomplete', pos: 1 }]
                }],
                comments: [{ id: 'tcm-1', data: { text: 'New comment' }, date: '2026-03-14', memberCreator: { fullName: 'Alice' } }],
                attachments: [{ id: 'tatt-1', name: 'doc.pdf', url: 'https://doc', mimeType: 'application/pdf', date: '2026-03-14' }]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks[0];
        expect(task.checklists).toHaveLength(1);
        expect(task.checklists[0].name).toBe('Review');
        expect(task.comments).toHaveLength(1);
        expect(task.comments[0].text).toBe('New comment');
        expect(task.attachments).toHaveLength(1);
        expect(task.attachments[0].name).toBe('doc.pdf');
        // Should NOT push to Trello (neither side changed)
        expect(updateTrelloCard).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // Gap 3a: Position pull — Trello wins → local checklists
    // reordered to match Trello positions (PULL)
    // ════════════════════════════════════════════════════════
    it('reorders local checklists to match Trello positions when Trello wins', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // Not locally modified → Trello wins
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                checklists: [
                    { id: 'cl-a', name: 'A', trelloChecklistId: 'tcl-a', items: [
                        { id: 'i1', text: 'First', done: false, trelloCheckItemId: 'tci-1' },
                        { id: 'i2', text: 'Second', done: false, trelloCheckItemId: 'tci-2' }
                    ]},
                    { id: 'cl-b', name: 'B', trelloChecklistId: 'tcl-b', items: [] }
                ]
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.NEW, // Trello changed
                checklists: [
                    { id: 'tcl-b', name: 'B', pos: 100, checkItems: [] }, // B first now
                    { id: 'tcl-a', name: 'A', pos: 200, checkItems: [
                        { id: 'tci-2', name: 'Second', state: 'incomplete', pos: 100 }, // tci-2 first
                        { id: 'tci-1', name: 'First', state: 'incomplete', pos: 200 }
                    ]}
                ]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks[0];
        // Checklists reordered: B before A
        expect(task.checklists[0].trelloChecklistId).toBe('tcl-b');
        expect(task.checklists[1].trelloChecklistId).toBe('tcl-a');
        // Items within A reordered: tci-2 before tci-1
        expect(task.checklists[1].items[0].trelloCheckItemId).toBe('tci-2');
        expect(task.checklists[1].items[1].trelloCheckItemId).toBe('tci-1');
        // Should NOT push positions to Trello (Trello won)
        expect(updateTrelloChecklist).not.toHaveBeenCalled();
        expect(updateTrelloChecklistItem).not.toHaveBeenCalledWith(
            expect.anything(), expect.anything(), expect.objectContaining({ pos: expect.anything() })
        );
    });

    // ════════════════════════════════════════════════════════
    // Gap 3b: Position push — local wins → push positions
    // to Trello (PUSH)
    // ════════════════════════════════════════════════════════
    it('pushes checklist positions to Trello when local wins', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Locally modified → local wins
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                checklists: [
                    { id: 'cl-a', name: 'A', trelloChecklistId: 'tcl-a', items: [
                        { id: 'i1', text: 'Item', done: false, trelloCheckItemId: 'tci-1' }
                    ]}
                ]
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.MID, // Not changed
                checklists: [{
                    id: 'tcl-a', name: 'A', pos: 99999, // Wrong position — needs push
                    checkItems: [{ id: 'tci-1', name: 'Item', state: 'incomplete', pos: 99999 }]
                }]
            })]
        }));

        await syncWithTrello(board, { labelMappings: {} });

        // Should push positions (local wins, isPushWinner=true)
        expect(updateTrelloChecklist).toHaveBeenCalledWith('tcl-a', expect.objectContaining({ pos: expect.any(Number) }));
        expect(updateTrelloChecklistItem).toHaveBeenCalledWith('card-1', 'tci-1', expect.objectContaining({ pos: expect.any(Number) }));
    });

    // ════════════════════════════════════════════════════════
    // Gap 5: listToCatId cleanup after archived list removal (PULL)
    // Cards on removed list should not map to deleted category
    // ════════════════════════════════════════════════════════
    it('cleans listToCatId so cards on archived lists do not corrupt data', async () => {
        // Category c-del linked to list-del; a card still references list-del
        const board = makeBoard({
            categories: [
                { id: 'c1', trelloListId: 'list-1' },
                { id: 'c-del', trelloListId: 'list-del', name: 'Will Be Removed' }
            ],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true },
                { id: 'a-del', categoryId: 'c-del', isDefault: true }
            ],
            tasks: [
                { id: 't1', title: 'Stays', actionId: 'a1', trelloCardId: 'card-1', trelloLastModified: T.MID, updatedAt: T.OLD, status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 }
            ]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList({ id: 'list-1' })], // list-del is gone (archived)
            cards: [
                makeCard({ id: 'card-1', idList: 'list-1', dateLastActivity: T.NEW }),
                // Straggler card that still references the archived list
                makeCard({ id: 'card-stray', idList: 'list-del', name: 'Stray Card', dateLastActivity: T.NEW })
            ]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Category c-del should be removed
        expect(synced.categories.some(c => c.id === 'c-del')).toBe(false);
        // Stray card on archived list should NOT create a task under deleted category
        const strayTask = synced.tasks.find(t => t.trelloCardId === 'card-stray');
        if (strayTask) {
            // If imported, it must NOT reference the deleted category's action
            expect(strayTask.actionId).not.toBe('a-del');
        }
    });

    // ════════════════════════════════════════════════════════
    // Gap 9: Label push — local channels/countries pushed to
    // Trello via addLabelToCard (PUSH)
    // ════════════════════════════════════════════════════════
    it('pushes local channel and country labels to Trello card', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Labeled', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Locally modified → push
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: ['social'], countries: ['france'],
                assignees: [], otherLabels: [], order: 0
            }]
        });
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' },
                'lbl-fr': { type: 'country', countryId: 'france' }
            }
        };
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.MID, // Not changed
                idLabels: [] // No labels yet
            })]
        }));

        await syncWithTrello(board, mappingConfig);

        // Labels should be added to the Trello card
        expect(addTrelloCardLabel).toHaveBeenCalledWith('card-1', 'lbl-social');
        expect(addTrelloCardLabel).toHaveBeenCalledWith('card-1', 'lbl-fr');
    });

    // ════════════════════════════════════════════════════════
    // PUSH gap: Local task category change → card list move
    // ════════════════════════════════════════════════════════
    it('pushes idList when local task moves to different category', async () => {
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
                id: 't1', title: 'Moved Locally', actionId: 'a2', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Locally modified (moved to a2/c2)
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
                id: 'card-1', idList: 'list-1', // Still on list-1 on Trello
                dateLastActivity: T.MID // Not changed
            })]
        }));

        await syncWithTrello(board, { labelMappings: {} });

        // Should push the list move
        expect(updateTrelloCard).toHaveBeenCalledWith('card-1', expect.objectContaining({
            idList: 'list-2'
        }));
    });

    // ════════════════════════════════════════════════════════
    // H4: Multi-cycle idempotence — sync twice without changes
    // Second sync must produce no updates/pushes
    // ════════════════════════════════════════════════════════
    it('is idempotent: re-sync without changes produces no updates', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Stable', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        const trelloResponse = makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', dateLastActivity: T.NEW })]
        });
        fetchTrelloBoardFull.mockResolvedValue(trelloResponse);

        // Sync 1: pulls Trello changes
        const { board: after1 } = await syncWithTrello(board, { labelMappings: {} });
        expect(after1.tasks[0].title).toBe('Card'); // Pulled from Trello

        // Reset mocks and sync again — Trello unchanged, board now matches
        vi.clearAllMocks();
        fetchTrelloBoardFull.mockResolvedValue(trelloResponse);

        const { result: result2 } = await syncWithTrello(after1, { labelMappings: {} });

        // No updates, no pushes on second sync
        expect(result2.updated).toBe(0);
        expect(result2.pushed).toBe(0);
        expect(result2.created).toBe(0);
        expect(updateTrelloCard).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // M1: Push failure recovery — updateTrelloCard throws
    // Task should not be corrupted, errors should be counted
    // ════════════════════════════════════════════════════════
    it('counts errors and preserves task when push fails', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Will Fail Push', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Local changed → push attempt
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        // Make push fail
        updateTrelloCard.mockRejectedValue(new Error('Network error'));
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', dateLastActivity: T.MID })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        // Error should be counted
        expect(result.errors).toBeGreaterThanOrEqual(1);
        expect(result.errorDetails.length).toBeGreaterThanOrEqual(1);
        expect(result.errorDetails[0].error).toContain('Network error');
        // Task should still exist and not be corrupted
        expect(synced.tasks[0].title).toBe('Will Fail Push');
        expect(synced.tasks[0].trelloCardId).toBe('card-1');
    });

    // ════════════════════════════════════════════════════════
    // M3: Card moved to different list + fields changed
    // simultaneously on Trello — both should be pulled
    // ════════════════════════════════════════════════════════
    it('pulls both list move and field changes when card moved and modified', async () => {
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
                id: 't1', title: 'Old Title', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // Not locally modified
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: 'Old desc', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [
                makeList({ id: 'list-1' }),
                makeList({ id: 'list-2', pos: 32768 })
            ],
            cards: [makeCard({
                id: 'card-1',
                idList: 'list-2', // Moved to different list
                name: 'New Title', // And renamed
                desc: 'New desc', // And description changed
                dateLastActivity: T.NEW
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Both move and field changes should be pulled
        expect(synced.tasks[0].actionId).toBe('a2'); // Moved to category 2
        expect(synced.tasks[0].title).toBe('New Title'); // Title updated
        expect(synced.tasks[0].description).toBe('New desc'); // Description updated
    });

    // ════════════════════════════════════════════════════════
    // M4: "Neither changed" path — checklists should be
    // reordered exactly once (not double-applied)
    // ════════════════════════════════════════════════════════
    it('applies checklist reorder exactly once in neither-changed path', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // Neither changed (MID > OLD but MID = MID)
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                checklists: [
                    { id: 'cl-1', name: 'First', trelloChecklistId: 'tcl-1', items: [
                        { id: 'i1', text: 'A', done: false, trelloCheckItemId: 'tci-1' },
                        { id: 'i2', text: 'B', done: false, trelloCheckItemId: 'tci-2' }
                    ]},
                    { id: 'cl-2', name: 'Second', trelloChecklistId: 'tcl-2', items: [] }
                ]
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1',
                dateLastActivity: T.MID, // Same as trelloLastModified → neither changed
                checklists: [
                    { id: 'tcl-2', name: 'Second', pos: 100, checkItems: [] }, // Second first
                    { id: 'tcl-1', name: 'First', pos: 200, checkItems: [
                        { id: 'tci-2', name: 'B', state: 'incomplete', pos: 100 }, // B first
                        { id: 'tci-1', name: 'A', state: 'incomplete', pos: 200 }
                    ]}
                ]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks[0];
        // Checklists should be correctly reordered (Second before First)
        expect(task.checklists[0].trelloChecklistId).toBe('tcl-2');
        expect(task.checklists[1].trelloChecklistId).toBe('tcl-1');
        // Items within First should be reordered (B before A)
        expect(task.checklists[1].items[0].trelloCheckItemId).toBe('tci-2');
        expect(task.checklists[1].items[1].trelloCheckItemId).toBe('tci-1');
        // Should NOT push anything (neither changed)
        expect(updateTrelloCard).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // M6: Position update fails midway — one succeeds, one
    // fails in Promise.all. State should remain usable.
    // ════════════════════════════════════════════════════════
    it('handles partial position push failure gracefully', async () => {
        let callCount = 0;
        updateTrelloChecklistItem.mockImplementation(() => {
            callCount++;
            if (callCount === 2) return Promise.reject(new Error('pos update failed'));
            return Promise.resolve({});
        });

        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Local wins → push
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                checklists: [{
                    id: 'cl-1', name: 'CL', trelloChecklistId: 'tcl-1', items: [
                        { id: 'i1', text: 'A', done: false, trelloCheckItemId: 'tci-1' },
                        { id: 'i2', text: 'B', done: false, trelloCheckItemId: 'tci-2' }
                    ]
                }]
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.MID,
                checklists: [{
                    id: 'tcl-1', name: 'CL', pos: 100,
                    checkItems: [
                        { id: 'tci-1', name: 'A', state: 'incomplete', pos: 99999 },
                        { id: 'tci-2', name: 'B', state: 'incomplete', pos: 88888 }
                    ]
                }]
            })]
        }));

        // Should not throw — errors caught per-item
        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Task should still exist and be valid
        expect(synced.tasks[0].title).toBe('Task');
        expect(synced.tasks[0].trelloCardId).toBe('card-1');
    });

    // ════════════════════════════════════════════════════════
    // BUG FIX: Label removal on Trello must not reappear after sync
    // ════════════════════════════════════════════════════════
    it('removes task channels/countries when Trello labels are removed (label removal sync)', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // Not locally modified → Trello wins
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: ['social'], countries: ['france'],
                otherLabels: [{ name: 'Urgent', color: '#ef4444' }],
                assignees: [], order: 0
            }]
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
                id: 'card-1', name: 'Task', dateLastActivity: T.NEW,
                idLabels: [] // All labels removed on Trello
            })]
        }));

        const { board: synced } = await syncWithTrello(board, mappingConfig);

        const task = synced.tasks[0];
        // Labels should be removed locally
        expect(task.channels).toEqual([]);
        expect(task.countries).toEqual([]);
        expect(task.otherLabels).toEqual([]);
        // Labels should NOT be re-pushed to Trello
        expect(addTrelloCardLabel).not.toHaveBeenCalled();
    });

    it('pulls Trello label removal when local wins content (both changed, labels unchanged locally)', async () => {
        // Reset mock (a prior test sets mockRejectedValue)
        updateTrelloCard.mockResolvedValue({});
        // Scenario: user edits task title locally, someone removes labels on Trello
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' },
                'lbl-fr': { type: 'country', countryId: 'france' },
                'lbl-tag': { type: 'other', labelName: 'Urgent', labelColor: '#ef4444' }
            }
        };
        const board = makeBoard({
            categories: [{ id: 'c1', name: 'Cat1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', name: 'Default', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Title Edited Locally', actionId: 'a1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEWER, // Local wins content (NEWER > NEW)
                status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: ['social'], countries: ['france'],
                otherLabels: [{ name: 'Urgent', color: '#ef4444' }],
                // _inherit* matches current — labels NOT changed locally
                _inheritChannels: ['social'], _inheritCountries: ['france'],
                _inheritOtherLabels: [{ name: 'Urgent', color: '#ef4444' }],
                assignees: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Old Title',
                dateLastActivity: T.NEW, // Trello changed (NEW > MID) but local is newer (NEWER > NEW)
                idLabels: [], // Labels removed on Trello
                checklists: []
            })]
        }));

        const { board: synced } = await syncWithTrello(board, mappingConfig);

        const task = synced.tasks[0];
        // Content should be pushed (local wins) — title stays local
        expect(task.title).toBe('Title Edited Locally');
        expect(updateTrelloCard).toHaveBeenCalled();
        // But labels should be pulled from Trello (user didn't change labels)
        expect(task.channels).toEqual([]);
        expect(task.countries).toEqual([]);
        expect(task.otherLabels).toEqual([]);
        // Labels should NOT be re-added to Trello
        expect(addTrelloCardLabel).not.toHaveBeenCalled();
    });

    it('pushes local labels when user actively changed them in card-as-task (both changed)', async () => {
        // Reset mock (a prior test sets mockRejectedValue)
        updateTrelloCard.mockResolvedValue({});
        // Scenario: user changed channels from social→email, someone also changed card on Trello
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' },
                'lbl-email': { type: 'channel', channelId: 'email' },
                'lbl-fr': { type: 'country', countryId: 'france' }
            }
        };
        const board = makeBoard({
            categories: [{ id: 'c1', name: 'Cat1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', name: 'Default', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEWER, // Local wins
                status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: ['email'], countries: [],
                otherLabels: [],
                // _inherit* differs from current — labels WERE changed locally
                _inheritChannels: ['social'], _inheritCountries: ['france'],
                _inheritOtherLabels: [],
                assignees: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Task',
                dateLastActivity: T.NEW, // Trello changed but local is newer
                idLabels: ['lbl-social', 'lbl-fr'], // Still has old labels
                checklists: []
            })]
        }));

        const { board: synced } = await syncWithTrello(board, mappingConfig);

        const task = synced.tasks[0];
        // Local labels should be pushed (user actively changed them)
        expect(task.channels).toEqual(['email']);
        // Should add the new label and remove old ones
        expect(addTrelloCardLabel).toHaveBeenCalledWith('card-1', 'lbl-email');
        expect(removeTrelloCardLabel).toHaveBeenCalledWith('card-1', 'lbl-social');
        expect(removeTrelloCardLabel).toHaveBeenCalledWith('card-1', 'lbl-fr');
    });

    // ════════════════════════════════════════════════════════
    // Selective push: only push locally-changed fields
    // ════════════════════════════════════════════════════════

    it('preserves Trello assignee change when local only changed description (both changed)', async () => {
        updateTrelloCard.mockResolvedValue({});
        // Scenario: user changed description locally, someone changed assignees on Trello
        // Expected: push description only, pull Trello's assignees
        const board = makeBoard({
            categories: [{ id: 'c1', name: 'Cat1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', name: 'Default', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEWER, // local wins
                status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: 'Updated description',
                checklists: [], comments: [], attachments: [],
                channels: [], countries: [], otherLabels: [],
                assignees: ['member-1'], order: 0,
                _trelloBaseline: {
                    title: 'Task',
                    description: 'Old description',
                    startDate: '2026-03-01',
                    dueDate: '2026-03-31',
                    status: null,
                    assignees: ['member-1']
                }
            }]
        });

        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Task',
                desc: 'Old description', start: '2026-03-01', due: '2026-03-31T00:00:00.000Z',
                dueComplete: false, idMembers: ['member-2'], // Trello changed assignee
                dateLastActivity: T.NEW, // Trello also changed
                checklists: []
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks[0];
        // Description should be local (pushed)
        expect(task.description).toBe('Updated description');
        // Assignees should be pulled from Trello (user didn't change them)
        expect(task.assignees).toEqual(['member-2']);
        // updateTrelloCard should push desc but NOT assignees
        const pushCall = updateTrelloCard.mock.calls.find(c => c[0] === 'card-1');
        expect(pushCall).toBeTruthy();
        expect(pushCall[1].desc).toBe('Updated description');
        expect(pushCall[1]).not.toHaveProperty('idMembers');
    });

    // ════════════════════════════════════════════════════════
    // Preserve Trello-only checklists/attachments on push
    // ════════════════════════════════════════════════════════

    it('preserves Trello-only checklist when both sides changed and local wins', async () => {
        updateTrelloCard.mockResolvedValue({});
        // Scenario: task has 1 local checklist, someone added a new checklist on Trello
        // Both sides changed, local wins → push should NOT delete the Trello-only checklist
        const board = makeBoard({
            categories: [{ id: 'c1', name: 'Cat1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', name: 'Default', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task Edited', actionId: 'a1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEWER, // local wins
                status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', channels: [], countries: [], otherLabels: [],
                assignees: [], order: 0,
                checklists: [{
                    id: 'cl-local-1', name: 'Existing CL', trelloChecklistId: 'cl-1',
                    items: [{ id: 'cli-1', text: 'Item 1', done: false, trelloCheckItemId: 'ci-1' }]
                }],
                comments: [], attachments: []
            }]
        });

        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Old Title',
                dateLastActivity: T.NEW, // Trello also changed (NEW > MID)
                checklists: [
                    { id: 'cl-1', name: 'Existing CL', pos: 100, checkItems: [
                        { id: 'ci-1', name: 'Item 1', state: 'incomplete', pos: 100 }
                    ]},
                    { id: 'cl-new', name: 'New Trello CL', pos: 200, checkItems: [
                        { id: 'ci-new', name: 'New Item', state: 'incomplete', pos: 100 }
                    ]}
                ]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks[0];
        // The Trello-only checklist should NOT have been deleted
        expect(deleteTrelloChecklist).not.toHaveBeenCalled();
        // The new checklist should be merged into the local task
        expect(task.checklists).toHaveLength(2);
        const newCl = task.checklists.find(cl => cl.trelloChecklistId === 'cl-new');
        expect(newCl).toBeTruthy();
        expect(newCl.name).toBe('New Trello CL');
        expect(newCl.items).toHaveLength(1);
        expect(newCl.items[0].text).toBe('New Item');
    });

    // ════════════════════════════════════════════════════════
    // Label mapping persistence
    // ════════════════════════════════════════════════════════

    it('persists new label mappings created during pushTaskLabelsToTrello', async () => {
        // Task has a channel tag with no existing label mapping
        createTrelloBoardLabel.mockResolvedValueOnce({ id: 'lbl-new-channel' });
        const board = makeBoard({
            categories: [{ id: 'cat-1', name: 'Cat', trelloListId: 'list-1' }],
            actions: [{ id: 'act-1', name: 'Action', categoryId: 'cat-1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'act-1',
                trelloCardId: 'card-1', trelloLastModified: T.OLD,
                updatedAt: T.NEW, // locally modified → push path
                channels: ['social'], countries: [], otherLabels: [],
                _inheritChannels: [], _inheritCountries: [], _inheritOtherLabels: [],
                status: 'inprogress'
            }]
        });

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', name: 'Task', dateLastActivity: T.OLD, idLabels: [] })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // The newly created label mapping should be persisted
        expect(synced.trelloSync.labelMappings['lbl-new-channel']).toBeDefined();
        expect(synced.trelloSync.labelMappings['lbl-new-channel'].type).toBe('channel');
        expect(synced.trelloSync.labelMappings['lbl-new-channel'].channelId).toBe('social');
    });

    it('updates _inheritChannels after successful local task push', async () => {
        const board = makeBoard({
            categories: [{ id: 'cat-1', name: 'Cat', trelloListId: 'list-1' }],
            actions: [{ id: 'act-1', name: 'Action', categoryId: 'cat-1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'act-1',
                trelloCardId: 'card-1', trelloLastModified: T.OLD,
                updatedAt: T.NEW,
                channels: ['social'], countries: [], otherLabels: [],
                _inheritChannels: [], _inheritCountries: [], _inheritOtherLabels: [],
                status: 'inprogress'
            }],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-task',
                lastSyncAt: T.OLD, pollIntervalMs: 120000,
                labelMappings: { 'lbl-social': { type: 'channel', channelId: 'social' } }
            }
        });

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', name: 'Task', dateLastActivity: T.OLD, idLabels: ['lbl-social'] })]
        }));

        const { board: synced } = await syncWithTrello(board, {
            labelMappings: { 'lbl-social': { type: 'channel', channelId: 'social' } }
        });

        const task = synced.tasks.find(t => t.id === 't1');
        expect(task._inheritChannels).toEqual(['social']);
    });

    it('sets _inherit* fields on new tasks imported from Trello', async () => {
        // New card on Trello with a channel label — task should get _inheritChannels
        const board = makeBoard({
            categories: [{ id: 'cat-1', name: 'Cat', trelloListId: 'list-1' }],
            actions: [{ id: 'act-1', name: 'Action', categoryId: 'cat-1', isDefault: true }],
            tasks: [],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-task',
                lastSyncAt: T.OLD, pollIntervalMs: 120000,
                labelMappings: { 'lbl-social': { type: 'channel', channelId: 'social' } }
            }
        });

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-new', name: 'New Card', dateLastActivity: T.NEW, idLabels: ['lbl-social'] })]
        }));

        const { board: synced } = await syncWithTrello(board, {
            labelMappings: { 'lbl-social': { type: 'channel', channelId: 'social' } }
        });

        const task = synced.tasks.find(t => t.trelloCardId === 'card-new');
        expect(task).toBeTruthy();
        expect(task.channels).toContain('social');
        expect(task._inheritChannels).toEqual(['social']);
    });

    it('sets _inherit* fields after pushing new local task to Trello', async () => {
        const board = makeBoard({
            categories: [{ id: 'cat-1', name: 'Cat', trelloListId: 'list-1' }],
            actions: [{ id: 'act-1', name: 'Action', categoryId: 'cat-1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Local Task', actionId: 'act-1',
                // No trelloCardId — new local task
                channels: ['social'], countries: [], otherLabels: [],
                status: 'inprogress', startDate: '2026-03-01', dueDate: '2026-03-15'
            }],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-task',
                lastSyncAt: T.OLD, pollIntervalMs: 120000,
                labelMappings: { 'lbl-social': { type: 'channel', channelId: 'social' } }
            }
        });

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({
            lists: [makeList()],
            cards: []
        }));

        const { board: synced } = await syncWithTrello(board, {
            labelMappings: { 'lbl-social': { type: 'channel', channelId: 'social' } }
        });

        const task = synced.tasks.find(t => t.id === 't1');
        expect(task.trelloCardId).toBeTruthy();
        expect(task._inheritChannels).toEqual(['social']);
    });

    // ════════════════════════════════════════════════════════
    // Selective field update (buildSelectiveTaskUpdate)
    // ════════════════════════════════════════════════════════
    it('pushes only locally-changed fields when both sides changed (selective push)', async () => {
        updateTrelloCard.mockResolvedValue({});
        const board = makeBoard({
            categories: [{ id: 'c1', name: 'Cat', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'New Title', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEWER, // local wins (NEWER > NEW)
                dueDate: '2026-03-15', startDate: '2026-03-01', month: 2,
                description: 'Desc', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                _trelloBaseline: {
                    title: 'Old', description: 'Desc',
                    startDate: '2026-03-01', dueDate: '2026-03-15',
                    status: null, assignees: []
                }
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Old',
                desc: 'Desc', start: '2026-03-01', due: '2026-03-15T00:00:00.000Z',
                dateLastActivity: T.NEW // Trello also changed (NEW > MID)
            })]
        }));

        await syncWithTrello(board, { labelMappings: {} });

        const pushCall = updateTrelloCard.mock.calls.find(c => c[0] === 'card-1');
        expect(pushCall).toBeTruthy();
        const updateObj = pushCall[1];
        expect(updateObj.name).toBe('New Title');
        expect(updateObj.idList).toBe('list-1');
        // Fields that did NOT change locally should NOT be in the update
        expect(updateObj).not.toHaveProperty('desc');
        expect(updateObj).not.toHaveProperty('start');
        expect(updateObj).not.toHaveProperty('due');
        expect(updateObj).not.toHaveProperty('dueComplete');
    });

    // ════════════════════════════════════════════════════════
    // List name dedup on push (card-as-task)
    // ════════════════════════════════════════════════════════
    it('links to existing Trello list by name instead of creating duplicate (card-as-task)', async () => {
        const board = makeBoard({
            categories: [
                { id: 'c1', trelloListId: 'list-1' },
                { id: 'c-local', name: 'Marketing' } // No trelloListId
            ],
            actions: [
                { id: 'a1', categoryId: 'c1', isDefault: true }
            ],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [
                makeList({ id: 'list-1' }),
                makeList({ id: 'list-mkt', name: 'Marketing', pos: 32768 }) // Existing list with same name
            ],
            cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const localCat = synced.categories.find(c => c.id === 'c-local');
        expect(localCat).toBeTruthy();
        // Should be linked to the existing list, not a new one
        expect(localCat.trelloListId).toBe('list-mkt');
        // createTrelloList should NOT have been called
        expect(createTrelloList).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // Ghost tag prevention in neither-changed path
    // ════════════════════════════════════════════════════════
    it('neither-changed path does not remove local labels via union merge', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: ['social'], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' }
            }
        };
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Task',
                dateLastActivity: T.MID, // Same as trelloLastModified → neither changed
                idLabels: [] // Label removed on Trello but dateLastActivity unchanged
            })]
        }));

        const { board: synced } = await syncWithTrello(board, mappingConfig);

        const task = synced.tasks[0];
        // Neither-changed path preserves local labels
        expect(task.channels).toContain('social');
    });

    // ════════════════════════════════════════════════════════
    // Selective push merges non-pushed fields from Trello
    // ════════════════════════════════════════════════════════
    it('selective push merges non-pushed fields from Trello when both changed', async () => {
        updateTrelloCard.mockResolvedValue({});
        const board = makeBoard({
            categories: [{ id: 'c1', name: 'Cat', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Local Title', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEWER, // local wins (NEWER > NEW)
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: 'Old Desc', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                _trelloBaseline: {
                    title: 'Old Title', description: 'Old Desc',
                    startDate: '2026-03-01', dueDate: '2026-03-31',
                    status: null, assignees: []
                }
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Old Title',
                desc: 'Trello Changed Desc', // Trello changed description
                start: '2026-03-01', due: '2026-03-31T00:00:00.000Z',
                dateLastActivity: T.NEW // Trello also changed (NEW > MID)
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks[0];
        // Title should be the local value (pushed)
        expect(task.title).toBe('Local Title');
        // Description should be merged from Trello (not pushed locally)
        expect(task.description).toBe('Trello Changed Desc');
    });

    // ════════════════════════════════════════════════════════
    // Read-only mode still pulls changes
    // ════════════════════════════════════════════════════════
    it('pulls Trello changes in readOnly mode', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Old Title', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Updated by Trello',
                dateLastActivity: T.NEW // Trello changed
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} }, { readOnly: true });

        // Should pull the name change
        expect(synced.tasks[0].title).toBe('Updated by Trello');
        // Should NOT push anything
        expect(updateTrelloCard).not.toHaveBeenCalled();
        expect(createTrelloCard).not.toHaveBeenCalled();
        expect(createTrelloList).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // Edge case 1: Duplicate Trello checklist names
    // ════════════════════════════════════════════════════════
    it('handles duplicate Trello checklist names without data loss', async () => {
        updateTrelloCard.mockResolvedValue({});
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Local wins → push path exercises pushTaskExtrasToTrello
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                checklists: [{
                    id: 'cl-local', name: 'Checklist', trelloChecklistId: 'cl-1',
                    items: [{ id: 'i1', text: 'Item A', done: false, trelloCheckItemId: 'tci-a' }]
                }]
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.MID,
                checklists: [
                    { id: 'cl-1', name: 'Checklist', pos: 100, checkItems: [
                        { id: 'tci-a', name: 'Item A', state: 'incomplete', pos: 100 }
                    ]},
                    { id: 'cl-2', name: 'Checklist', pos: 200, checkItems: [
                        { id: 'tci-b', name: 'Item B', state: 'complete', pos: 100 }
                    ]}
                ]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Sync completes without error, task still has its checklist
        const task = synced.tasks[0];
        expect(task.trelloCardId).toBe('card-1');
        const linkedCl = task.checklists.find(cl => cl.trelloChecklistId === 'cl-1');
        expect(linkedCl).toBeTruthy();
        expect(linkedCl.items.length).toBeGreaterThanOrEqual(1);
    });

    // ════════════════════════════════════════════════════════
    // Edge case 2: card-as-action metadata on card-as-task board
    // ════════════════════════════════════════════════════════
    it('skips task with trelloChecklistName in card-as-task mode (data guard)', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't-corrupted', title: 'Corrupted Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1',
                trelloChecklistName: 'Group', // card-as-action metadata — should be skipped
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', name: 'Card on Trello', dateLastActivity: T.NEW })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        // Task should not have been updated (title stays the same)
        const task = synced.tasks.find(t => t.id === 't-corrupted');
        expect(task).toBeTruthy();
        expect(task.title).toBe('Corrupted Task'); // Not pulled from Trello
        // Card should not be pushed either
        expect(updateTrelloCard).not.toHaveBeenCalledWith('card-1', expect.anything());
    });

    // ════════════════════════════════════════════════════════
    // Edge case 3: New card on unknown list
    // ════════════════════════════════════════════════════════
    it('skips new Trello card on unknown list without crash', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [
                makeList({ id: 'list-1' }),
                makeList({ id: 'list-2', name: 'Unknown List' })
            ],
            cards: [makeCard({
                id: 'card-unknown', name: 'Card on Unknown List',
                idList: 'list-2', // list-2 is NOT mapped to any category
                dateLastActivity: T.NEW
            })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        // No task created from the card on the unknown list
        const unknownTask = synced.tasks.find(t => t.trelloCardId === 'card-unknown');
        expect(unknownTask).toBeUndefined();
        // No errors
        expect(result.errors).toBe(0);
    });

    // ════════════════════════════════════════════════════════
    // Edge case 4: New Trello card imported via default action
    // ════════════════════════════════════════════════════════
    it('imports new Trello card when default action exists for category', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList({ id: 'list-1' })],
            cards: [makeCard({
                id: 'card-new-import', name: 'Brand New Card',
                idList: 'list-1', dateLastActivity: T.NEW,
                due: '2026-06-01T00:00:00.000Z'
            })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.created).toBeGreaterThanOrEqual(1);
        const newTask = synced.tasks.find(t => t.trelloCardId === 'card-new-import');
        expect(newTask).toBeTruthy();
        expect(newTask.title).toBe('Brand New Card');
        expect(newTask.actionId).toBe('a1'); // Matched to default action
        expect(newTask.trelloCardId).toBe('card-new-import');
    });

    // ════════════════════════════════════════════════════════
    // Edge case 5: Orphaned trelloCheckItemId in checklist
    // ════════════════════════════════════════════════════════
    it('handles orphaned trelloCheckItemId without crash', async () => {
        updateTrelloCard.mockResolvedValue({});
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Local wins → push path
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0,
                checklists: [{
                    id: 'cl-local', name: 'QA', trelloChecklistId: 'tcl-1',
                    items: [
                        { id: 'i1', text: 'Valid Item', done: false, trelloCheckItemId: 'tci-valid' },
                        { id: 'i2', text: 'Orphan Item', done: true, trelloCheckItemId: 'orphan-id' }
                    ]
                }]
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.MID,
                checklists: [{
                    id: 'tcl-1', name: 'QA', pos: 100,
                    checkItems: [
                        // Only tci-valid exists; orphan-id is gone
                        { id: 'tci-valid', name: 'Valid Item', state: 'incomplete', pos: 100 }
                    ]
                }]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Sync completes without error
        const task = synced.tasks[0];
        expect(task.trelloCardId).toBe('card-1');
        // Checklist still has both items locally
        const cl = task.checklists.find(c => c.trelloChecklistId === 'tcl-1');
        expect(cl).toBeTruthy();
        expect(cl.items.length).toBeGreaterThanOrEqual(1);
    });

    // ════════════════════════════════════════════════════════
    // Bug: dueComplete should NOT be sent when status hasn't changed (card-as-task)
    // ════════════════════════════════════════════════════════
    it('does not send dueComplete when only local fields changed (no status change)', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Updated Title', actionId: 'a1', status: 'inprogress',
                trelloCardId: 'card-1',
                trelloLastModified: T.MID, updatedAt: T.NEW,
                _trelloBaseline: { title: 'Old Title', description: '', startDate: null, dueDate: null, status: 'inprogress', assignees: [] },
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', dateLastActivity: T.MID })]
        }));

        await syncWithTrello(board, { labelMappings: {} });

        expect(updateTrelloCard).toHaveBeenCalled();
        const updateArgs = updateTrelloCard.mock.calls[0][1];
        // dueComplete should NOT be in the update since status didn't change
        expect(updateArgs).not.toHaveProperty('dueComplete');
    });

    // ════════════════════════════════════════════════════════
    // Bug: permanent card deletion should unlink task from Trello
    // ════════════════════════════════════════════════════════
    it('unlinks task from Trello when card is permanently deleted (after archive)', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{
                id: 't1', title: 'Was Archived', actionId: 'a1', status: 'paused',
                trelloCardId: 'card-gone', trelloArchived: true,
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [] // Card permanently deleted
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Task should be completely removed from the board
        expect(synced.tasks).toHaveLength(0);
    });
});
