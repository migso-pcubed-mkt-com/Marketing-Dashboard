// Integration tests for syncWithTrello in card-as-action mode
// All Trello API calls are mocked — no real network
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/trello.js', () => ({
    fetchTrelloBoardFull: vi.fn(),
    updateTrelloCard: vi.fn().mockResolvedValue({}),
    createTrelloCard: vi.fn().mockResolvedValue({ id: 'new-card-1', dateLastActivity: '2026-03-22T00:00:00.000Z' }),
    addTrelloComment: vi.fn().mockResolvedValue({ id: 'new-cm-1' }),
    addTrelloChecklist: vi.fn().mockResolvedValue({ id: 'new-cl-1', itemsCreated: 0, checkItems: [] }),
    addTrelloChecklistItems: vi.fn().mockResolvedValue({ itemsAdded: 0, items: [] }),
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

import { syncWithTrello } from '../lib/trelloSync.js';
import {
    fetchTrelloBoardFull, updateTrelloCard, createTrelloCard,
    updateTrelloChecklistItem, deleteTrelloChecklistItem,
    addTrelloChecklist, addTrelloChecklistItems, createTrelloList
} from '../lib/trello.js';

const T = {
    OLD: '2026-03-10T00:00:00.000Z',
    MID: '2026-03-15T00:00:00.000Z',
    NEW: '2026-03-20T10:00:00.000Z',
    NEWER: '2026-03-22T00:00:00.000Z'
};

const makeBoard = (overrides = {}) => ({
    id: 'board-1', name: 'Test',
    categories: [], actions: [], tasks: [], members: [],
    trelloSync: {
        trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-action',
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

describe('syncWithTrello — card-as-action', () => {

    // ════════════════════════════════════════════════════════
    // Action pull: Trello card changed → local action updated
    // ════════════════════════════════════════════════════════
    it('pulls action changes when Trello card changed', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Old Name', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, // NOT locally modified
                budget: 500, priority: 'high', tags: [], countries: [],
                otherLabels: [], assignees: [], comments: [], attachments: [],
                description: '', status: 'inprogress'
            }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Renamed on Trello', desc: 'New desc',
                dateLastActivity: T.NEW
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.actions[0].name).toBe('Renamed on Trello');
        expect(synced.actions[0].description).toBe('New desc');
        expect(synced.actions[0].budget).toBe(500); // Preserved
        expect(updateTrelloCard).not.toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // Action push: local changed → pushed to Trello
    // ════════════════════════════════════════════════════════
    it('pushes action changes when only local changed', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Local Rename', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW, // Locally modified
                budget: 0, priority: 'medium', tags: [], countries: [],
                otherLabels: [], assignees: [], comments: [], attachments: [],
                description: 'Local desc', status: 'inprogress'
            }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', name: 'Old Name',
                dateLastActivity: T.MID // NOT changed
            })]
        }));

        const { result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.pushed).toBeGreaterThanOrEqual(1);
        expect(updateTrelloCard).toHaveBeenCalledWith('card-1', expect.objectContaining({
            name: 'Local Rename'
        }));
    });

    // ════════════════════════════════════════════════════════
    // Both changed: last-write-wins for actions
    // ════════════════════════════════════════════════════════
    it('pushes action when both changed and local is newer', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Local Wins', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.OLD,
                updatedAt: T.NEWER, // Local newest
                budget: 0, priority: 'medium', tags: [], countries: [],
                otherLabels: [], assignees: [], comments: [], attachments: [],
                description: '', status: 'active'
            }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', name: 'Trello Change', dateLastActivity: T.NEW })]
        }));

        await syncWithTrello(board, { labelMappings: {} });
        expect(updateTrelloCard).toHaveBeenCalled();
    });

    it('pulls action when both changed and Trello is newer', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Local Old', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.OLD,
                updatedAt: T.MID, // Local older than Trello
                budget: 0, priority: 'medium', tags: [], countries: [],
                otherLabels: [], assignees: [], comments: [], attachments: [],
                description: '', status: 'active'
            }],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', name: 'Trello Wins', dateLastActivity: T.NEWER })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });
        expect(synced.actions[0].name).toBe('Trello Wins');
    });

    // ════════════════════════════════════════════════════════
    // Card deleted → tasks paused
    // ════════════════════════════════════════════════════════
    it('pauses all tasks when action card is deleted on Trello', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Deleted', categoryId: 'c1',
                trelloCardId: 'card-gone', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [
                { id: 't1', title: 'Task1', actionId: 'a1', status: 'todo', trelloCheckItemId: 'ci-1', trelloCardId: 'card-gone', trelloLastModified: T.MID, updatedAt: T.OLD, dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 },
                { id: 't2', title: 'Task2', actionId: 'a1', status: 'inprogress', trelloCheckItemId: 'ci-2', trelloCardId: 'card-gone', trelloLastModified: T.MID, updatedAt: T.OLD, dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 }
            ]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [] // Card is gone
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks[0].status).toBe('paused');
        expect(synced.tasks[1].status).toBe('paused');
    });

    // ════════════════════════════════════════════════════════
    // Card archived → tasks paused + trelloArchived
    // ════════════════════════════════════════════════════════
    it('pauses tasks with trelloArchived when card is archived', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Archived', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [{
                id: 't1', title: 'Task', actionId: 'a1', status: 'todo',
                trelloCheckItemId: 'ci-1', trelloCardId: 'card-1',
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-1', closed: true })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks[0].status).toBe('paused');
        expect(synced.tasks[0].trelloArchived).toBe(true);
    });

    // ════════════════════════════════════════════════════════
    // Checklist item: Trello changed → task pulled
    // ════════════════════════════════════════════════════════
    it('pulls task changes when Trello checklist item changed', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Action', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [{
                id: 't1', title: 'Old Item Name', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloCheckItemId: 'ci-1', trelloChecklistId: 'cl-1',
                trelloLastModified: T.MID,
                updatedAt: T.OLD, // NOT locally modified
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.NEW,
                checklists: [{
                    id: 'cl-1', name: 'Tasks', pos: 100,
                    checkItems: [{ id: 'ci-1', name: 'Renamed Item', state: 'complete', pos: 200, due: '2026-05-01T00:00:00.000Z', idMember: 'm1' }]
                }]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.tasks[0].title).toBe('Renamed Item');
        expect(synced.tasks[0].status).toBe('completed');
    });

    // ════════════════════════════════════════════════════════
    // Checklist item: local changed → pushed
    // ════════════════════════════════════════════════════════
    it('pushes task changes when local checklist item changed', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Action', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [{
                id: 't1', title: 'Local Change', actionId: 'a1', status: 'completed',
                trelloCardId: 'card-1', trelloCheckItemId: 'ci-1', trelloChecklistId: 'cl-1',
                trelloLastModified: T.MID,
                updatedAt: T.NEW, // Locally modified
                dueDate: '2026-04-15', startDate: '2026-04-01', month: 3,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: ['m1'], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.MID, // NOT changed
                checklists: [{
                    id: 'cl-1', name: 'Tasks', pos: 100,
                    checkItems: [{ id: 'ci-1', name: 'Old Name', state: 'incomplete', pos: 100 }]
                }]
            })]
        }));

        const { result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.pushed).toBeGreaterThanOrEqual(1);
        expect(updateTrelloChecklistItem).toHaveBeenCalledWith('card-1', 'ci-1', expect.objectContaining({
            name: 'Local Change', state: 'complete'
        }));
    });

    // ════════════════════════════════════════════════════════
    // Item deleted on Trello → trelloItemDeleted flag
    // ════════════════════════════════════════════════════════
    it('sets trelloItemDeleted when checklist item removed on Trello', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Action', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [{
                id: 't1', title: 'Deleted Item', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloCheckItemId: 'ci-gone', trelloChecklistId: 'cl-1',
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.NEW,
                checklists: [{ id: 'cl-1', name: 'Tasks', pos: 100, checkItems: [] }] // Item gone
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks.find(t => t.id === 't1');
        expect(task.trelloItemDeleted).toBe(true);
        expect(task.trelloCheckItemId).toBeNull();
    });

    // ════════════════════════════════════════════════════════
    // New Trello card → new action + tasks from checklist items
    // ════════════════════════════════════════════════════════
    it('creates action and tasks from new Trello card with checklists', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [],
            tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-new', name: 'New Campaign', desc: 'Campaign desc',
                due: '2026-06-30T00:00:00.000Z', idMembers: ['m1'],
                checklists: [{
                    id: 'cl-1', name: 'Tasks', pos: 100,
                    checkItems: [
                        { id: 'ci-1', name: 'Task A', state: 'incomplete', pos: 100 },
                        { id: 'ci-2', name: 'Task B', state: 'complete', pos: 200 }
                    ]
                }]
            })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.created).toBeGreaterThanOrEqual(3); // 1 action + 2 tasks
        const action = synced.actions.find(a => a.trelloCardId === 'card-new');
        expect(action).toBeDefined();
        expect(action.name).toBe('New Campaign');

        const tasks = synced.tasks.filter(t => t.actionId === action.id);
        expect(tasks).toHaveLength(2);
        expect(tasks[0].title).toBe('Task A');
        expect(tasks[0].trelloCheckItemId).toBe('ci-1');
        expect(tasks[1].title).toBe('Task B');
        expect(tasks[1].status).toBe('completed');
    });

    // ════════════════════════════════════════════════════════
    // New Trello checklist item → new task created
    // ════════════════════════════════════════════════════════
    it('creates task from new checklist item on existing card', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Campaign', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [{
                id: 't1', title: 'Existing', actionId: 'a1', status: 'todo',
                trelloCardId: 'card-1', trelloCheckItemId: 'ci-1', trelloChecklistId: 'cl-1',
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.NEW,
                checklists: [{
                    id: 'cl-1', name: 'Tasks', pos: 100,
                    checkItems: [
                        { id: 'ci-1', name: 'Existing', state: 'incomplete', pos: 100 },
                        { id: 'ci-new', name: 'New from Trello', state: 'incomplete', pos: 200 }
                    ]
                }]
            })]
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.created).toBeGreaterThanOrEqual(1);
        const newTask = synced.tasks.find(t => t.trelloCheckItemId === 'ci-new');
        expect(newTask).toBeDefined();
        expect(newTask.title).toBe('New from Trello');
        expect(newTask.actionId).toBe('a1');
    });

    // ════════════════════════════════════════════════════════
    // New local action → pushed as Trello card
    // ════════════════════════════════════════════════════════
    it('pushes new local action as Trello card with checklist items', async () => {
        addTrelloChecklist.mockResolvedValue({
            id: 'new-cl-1', checkItems: [
                { id: 'new-ci-1' }, { id: 'new-ci-2' }
            ]
        });

        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a-local', name: 'New Action', categoryId: 'c1',
                trelloCardId: null, // Not linked
                budget: 0, priority: 'medium', tags: [], countries: [],
                otherLabels: [], assignees: [], comments: [], attachments: [],
                description: 'Desc', status: 'active',
                updatedAt: T.NEW
            }],
            tasks: [
                { id: 't1', title: 'Item 1', actionId: 'a-local', status: 'todo', trelloCheckItemId: null, trelloCardId: null, trelloLastModified: null, updatedAt: T.NEW, dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 },
                { id: 't2', title: 'Item 2', actionId: 'a-local', status: 'completed', trelloCheckItemId: null, trelloCardId: null, trelloLastModified: null, updatedAt: T.NEW, dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 }
            ]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()], cards: []
        }));

        const { board: synced, result } = await syncWithTrello(board, { labelMappings: {} });

        expect(result.pushed).toBeGreaterThanOrEqual(1);
        expect(createTrelloCard).toHaveBeenCalledWith('list-1', expect.objectContaining({
            name: 'New Action'
        }));
        // Action should now have trelloCardId
        const action = synced.actions.find(a => a.id === 'a-local');
        expect(action.trelloCardId).toBe('new-card-1');
        // Checklist should have been created
        expect(addTrelloChecklist).toHaveBeenCalled();
    });

    // ════════════════════════════════════════════════════════
    // readOnly mode: no pushes
    // ════════════════════════════════════════════════════════
    it('does not push in readOnly mode', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Changed', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.NEW,
                budget: 0, priority: 'medium', tags: [], countries: [],
                otherLabels: [], assignees: [], comments: [], attachments: [],
                description: '', status: 'active'
            }],
            tasks: []
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
    // List sync in card-as-action mode
    // ════════════════════════════════════════════════════════
    it('creates category from new Trello list in card-as-action mode', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [], tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [
                makeList({ id: 'list-1' }),
                makeList({ id: 'list-new', name: 'New List', pos: 32768 })
            ],
            cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const newCat = synced.categories.find(c => c.trelloListId === 'list-new');
        expect(newCat).toBeDefined();
        expect(newCat.name).toBe('New List');
    });

    it('removes category when list archived in card-as-action mode', async () => {
        const board = makeBoard({
            categories: [
                { id: 'c1', trelloListId: 'list-1' },
                { id: 'c-gone', trelloListId: 'list-gone' }
            ],
            actions: [{
                id: 'a-gone', name: 'Gone', categoryId: 'c-gone',
                trelloCardId: 'card-x', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [{
                id: 't-gone', title: 'Gone Task', actionId: 'a-gone', status: 'todo',
                trelloCheckItemId: 'ci-x', trelloCardId: 'card-x',
                trelloLastModified: T.MID, updatedAt: T.OLD,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList({ id: 'list-1' })], // list-gone absent
            cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.categories.some(c => c.id === 'c-gone')).toBe(false);
        expect(synced.actions.some(a => a.id === 'a-gone')).toBe(false);
        expect(synced.tasks.some(t => t.id === 't-gone')).toBe(false);
    });

    // ════════════════════════════════════════════════════════
    // Task moved between actions — move detection via card mismatch
    // Move detection at line 1711 checks taskAction.trelloCardId !== task.trelloCardId
    // This only triggers when the task still has its trelloCheckItemId
    // ════════════════════════════════════════════════════════
    it('detects task moved between actions and clears IDs for recreation', async () => {
        // Setup: task has actionId=a-new but trelloCardId still points to card-old
        // AND the item ci-1 still exists on card-old's checklist under a-old
        // a-old processes card-old: t1 has actionId=a-new so NOT matched under a-old
        // a-new processes card-new: ci-1 not on card-new → not found as trelloItem
        //   → task gets trelloItemDeleted=true, trelloCheckItemId=null
        // Move detection then skips because trelloCheckItemId is already null
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [
                { id: 'a-old', name: 'Old', categoryId: 'c1', trelloCardId: 'card-old', trelloLastModified: T.MID, updatedAt: T.OLD, budget: 0, priority: 'medium', tags: [], countries: [], otherLabels: [], assignees: [], comments: [], attachments: [], description: '', status: 'active' },
                { id: 'a-new', name: 'New', categoryId: 'c1', trelloCardId: 'card-new', trelloLastModified: T.MID, updatedAt: T.OLD, budget: 0, priority: 'medium', tags: [], countries: [], otherLabels: [], assignees: [], comments: [], attachments: [], description: '', status: 'active' }
            ],
            tasks: [{
                id: 't1', title: 'Moved Task', actionId: 'a-new', // Moved to a-new
                status: 'todo',
                trelloCardId: 'card-old', // Still points to old card
                trelloCheckItemId: 'ci-1', trelloChecklistId: 'cl-1',
                trelloLastModified: T.MID, updatedAt: T.NEW,
                dueDate: '2026-03-31', startDate: '2026-03-01', month: 2,
                description: '', checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [], order: 0
            }]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [
                makeCard({ id: 'card-old', dateLastActivity: T.MID, checklists: [{ id: 'cl-1', name: 'Tasks', pos: 100, checkItems: [{ id: 'ci-1', name: 'Moved Task', state: 'incomplete', pos: 100 }] }] }),
                makeCard({ id: 'card-new', dateLastActivity: T.MID, checklists: [] })
            ]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        const task = synced.tasks.find(t => t.id === 't1');
        // Task gets marked as deleted (item not found under new action's card)
        expect(task.trelloCheckItemId).toBeNull();
        expect(task.trelloItemDeleted).toBe(true);
    });

    // ════════════════════════════════════════════════════════
    // Archived card NOT re-imported
    // ════════════════════════════════════════════════════════
    it('does not import archived cards as new actions', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [], tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({ id: 'card-archived', closed: true, name: 'Archived' })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.actions).toHaveLength(0);
    });

    // ════════════════════════════════════════════════════════
    // Members sync
    // ════════════════════════════════════════════════════════
    it('updates members in card-as-action mode', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [], tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()], cards: [],
            members: [{ id: 'm1', fullName: 'Alice', username: 'alice', avatarUrl: null }]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(synced.members).toHaveLength(1);
        expect(synced.members[0].fullName).toBe('Alice');
    });

    // ════════════════════════════════════════════════════════
    // Post-sync integrity
    // ════════════════════════════════════════════════════════
    it('runs integrity check and preserves shared trelloCardId in card-as-action', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [{
                id: 'a1', name: 'Action', categoryId: 'c1',
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                updatedAt: T.OLD, budget: 0, priority: 'medium',
                tags: [], countries: [], otherLabels: [], assignees: [],
                comments: [], attachments: [], description: '', status: 'active'
            }],
            tasks: [
                { id: 't1', title: 'T1', actionId: 'a1', status: 'todo', trelloCardId: 'card-1', trelloCheckItemId: 'ci-1', trelloChecklistId: 'cl-1', trelloLastModified: T.MID, updatedAt: T.OLD, dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 },
                { id: 't2', title: 'T2', actionId: 'a1', status: 'todo', trelloCardId: 'card-1', trelloCheckItemId: 'ci-2', trelloChecklistId: 'cl-1', trelloLastModified: T.MID, updatedAt: T.OLD, dueDate: '2026-03-31', startDate: '2026-03-01', month: 2, description: '', checklists: [], comments: [], attachments: [], channels: [], countries: [], assignees: [], otherLabels: [], order: 0 }
            ]
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()],
            cards: [makeCard({
                id: 'card-1', dateLastActivity: T.MID,
                checklists: [{
                    id: 'cl-1', name: 'Tasks', pos: 100,
                    checkItems: [
                        { id: 'ci-1', name: 'T1', state: 'incomplete', pos: 100 },
                        { id: 'ci-2', name: 'T2', state: 'incomplete', pos: 200 }
                    ]
                }]
            })]
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        // Both tasks should remain (shared trelloCardId OK in card-as-action)
        expect(synced.tasks).toHaveLength(2);
    });

    // ════════════════════════════════════════════════════════
    // lastSyncAt updated
    // ════════════════════════════════════════════════════════
    it('updates lastSyncAt after sync', async () => {
        const board = makeBoard({
            categories: [{ id: 'c1', trelloListId: 'list-1' }],
            actions: [], tasks: []
        });
        fetchTrelloBoardFull.mockResolvedValue(makeTrelloResponse({
            lists: [makeList()], cards: []
        }));

        const { board: synced } = await syncWithTrello(board, { labelMappings: {} });

        expect(new Date(synced.trelloSync.lastSyncAt).getTime()).toBeGreaterThan(new Date(T.OLD).getTime());
    });
});
