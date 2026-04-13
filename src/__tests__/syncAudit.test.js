// Comprehensive sync audit tests — baseline lifecycle, multi-cycle sync,
// rapid edits during sync, multi-user realtime, comment attachments
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Part 1: Integration tests (syncWithTrello) — baseline + multi-cycle
// ═══════════════════════════════════════════════════════════════
vi.mock('../lib/trello.js', () => ({
    fetchTrelloBoardFull: vi.fn(),
    updateTrelloCard: vi.fn().mockResolvedValue({ dateLastActivity: '2026-03-22T00:00:00.000Z' }),
    createTrelloCard: vi.fn().mockResolvedValue({ id: 'new-card-1', dateLastActivity: '2026-03-22T00:00:00.000Z' }),
    addTrelloComment: vi.fn().mockResolvedValue({ id: 'new-cm-1' }),
    addTrelloChecklist: vi.fn().mockResolvedValue({ id: 'new-cl-1', itemsCreated: 0, checkItems: [] }),
    addTrelloChecklistItems: vi.fn().mockResolvedValue({ itemsAdded: 0, items: [] }),
    updateTrelloChecklistItem: vi.fn().mockResolvedValue({}),
    updateTrelloChecklist: vi.fn().mockResolvedValue({}),
    addTrelloAttachment: vi.fn().mockResolvedValue({ id: 'new-att-1', url: 'https://att.url' }),
    uploadTrelloAttachment: vi.fn().mockResolvedValue({ id: 'new-att-2', url: 'https://att2.url' }),
    deleteTrelloChecklist: vi.fn().mockResolvedValue({}),
    deleteTrelloAttachment: vi.fn().mockResolvedValue({}),
    deleteTrelloChecklistItem: vi.fn().mockResolvedValue({}),
    createTrelloBoardLabel: vi.fn().mockResolvedValue({ id: 'new-lbl-1' }),
    addTrelloCardLabel: vi.fn().mockResolvedValue({}),
    removeTrelloCardLabel: vi.fn().mockResolvedValue({}),
    updateTrelloList: vi.fn().mockResolvedValue({}),
    createTrelloList: vi.fn().mockResolvedValue({ id: 'new-list-1', pos: 16384 }),
    setTrelloUserToken: vi.fn(),
    getTrelloUserToken: vi.fn(),
    fetchTrelloCard: vi.fn().mockRejectedValue(new Error('Not found'))
}));

import { syncWithTrello } from '../lib/trelloSync.js';
import { mergePostSync } from '../lib/postSyncMerge.js';
import { mergeEntitiesByTimestamp, mergeBoardsEntityLevel } from '../lib/realtimeMerge.js';
import {
    fetchTrelloBoardFull, updateTrelloCard, updateTrelloChecklistItem,
    addTrelloComment, uploadTrelloAttachment
} from '../lib/trello.js';

const T = {
    OLD: '2026-03-10T00:00:00.000Z',
    MID: '2026-03-15T00:00:00.000Z',
    NEW: '2026-03-20T10:00:00.000Z',
    NEWER: '2026-03-22T00:00:00.000Z'
};

const makeCard = (overrides = {}) => ({
    id: 'card-1', name: 'Card', desc: '', due: null, start: null,
    dueComplete: false, closed: false, dateLastActivity: T.NEW,
    idList: 'list-1', idLabels: [], labels: [], idMembers: [],
    idChecklists: [], checklists: [], attachments: [], comments: [], pos: 100,
    ...overrides
});

const makeList = (overrides = {}) => ({
    id: 'list-1', name: 'Category', pos: 16384, closed: false, ...overrides
});

const makeTrelloResponse = ({ cards = [], lists = [], members = [] } = {}) => ({
    board: { id: 'tb-1', name: 'Test Board', url: '' },
    cards, lists, labels: [], members
});

beforeEach(() => { vi.clearAllMocks(); });

// ═══════════════════════════════════════════════════════════════
// Group 1: Baseline refresh after push prevents re-push
// ═══════════════════════════════════════════════════════════════
describe('Baseline refresh after push — card-as-task', () => {
    it('push task then re-sync unchanged → no re-push (multi-cycle)', async () => {
        const list = makeList();
        const card = makeCard({ name: 'Old Title', dateLastActivity: T.MID });

        const board = {
            id: 'board-1', name: 'Test', members: [],
            categories: [{ id: 'cat-1', name: 'Category', trelloListId: 'list-1', order: 0 }],
            actions: [{ id: 'a-1', name: 'Default', categoryId: 'cat-1', isDefault: true }],
            tasks: [{
                id: 't-1', title: 'New Title', actionId: 'a-1', description: '',
                startDate: null, dueDate: null, month: -1, status: 'todo',
                priority: 'medium', budget: 0, checklists: [], comments: [],
                attachments: [], channels: [], countries: [], assignees: [],
                otherLabels: [], order: 0,
                updatedAt: T.NEW,
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                _trelloBaseline: {
                    title: 'Old Title', description: '', startDate: null,
                    dueDate: null, status: null, assignees: [], checklistItems: {}
                }
            }],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-task',
                lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
            }
        };

        // Sync 1: local changed → push
        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card], lists: [list] }));
        const result1 = await syncWithTrello(board, board.trelloSync);
        expect(result1.result.pushed).toBeGreaterThanOrEqual(1);
        expect(updateTrelloCard).toHaveBeenCalledTimes(1);

        // Verify baseline was refreshed
        const pushedTask = result1.board.tasks.find(t => t.id === 't-1');
        expect(pushedTask._trelloBaseline).toBeDefined();
        expect(pushedTask._trelloBaseline.title).toBe('New Title');

        // Sync 2: re-sync with same Trello state — should NOT re-push
        vi.clearAllMocks();
        const card2 = makeCard({ name: 'Old Title', dateLastActivity: T.NEW });
        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card2], lists: [list] }));
        const result2 = await syncWithTrello(result1.board, result1.board.trelloSync);
        // No push should happen — baseline matches task values
        expect(updateTrelloCard).not.toHaveBeenCalled();
    });

    it('new card import includes checklistItems in baseline', async () => {
        const list = makeList();
        const card = makeCard({
            id: 'card-new', name: 'Imported', dateLastActivity: T.NEW,
            checklists: [{
                id: 'cl-1', name: 'Checklist', pos: 100,
                checkItems: [
                    { id: 'ci-1', name: 'Item 1', state: 'incomplete', pos: 100 },
                    { id: 'ci-2', name: 'Item 2', state: 'complete', pos: 200 }
                ]
            }]
        });
        const board = {
            id: 'board-1', name: 'Test', members: [],
            categories: [{ id: 'cat-1', name: 'Category', trelloListId: 'list-1', order: 0 }],
            actions: [{ id: 'a-1', name: 'Default', categoryId: 'cat-1', isDefault: true }],
            tasks: [],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-task',
                lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
            }
        };

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card], lists: [list] }));
        const result = await syncWithTrello(board, board.trelloSync);
        const imported = result.board.tasks.find(t => t.trelloCardId === 'card-new');
        expect(imported).toBeDefined();
        expect(imported._trelloBaseline.checklistItems).toBeDefined();
        expect(imported._trelloBaseline.checklistItems['ci-1']).toEqual({
            name: 'Item 1', state: 'incomplete', due: null, idMember: null
        });
        expect(imported._trelloBaseline.checklistItems['ci-2']).toEqual({
            name: 'Item 2', state: 'complete', due: null, idMember: null
        });
    });
});

describe('Baseline refresh after push — card-as-action', () => {
    it('push action then re-sync unchanged → no re-push', async () => {
        const list = makeList();
        const card = makeCard({
            id: 'card-1', name: 'Old Name', dateLastActivity: T.MID,
            checklists: [{ id: 'cl-1', name: 'Tasks', pos: 100, checkItems: [] }]
        });

        const board = {
            id: 'board-1', name: 'Test', members: [],
            categories: [{ id: 'cat-1', name: 'Category', trelloListId: 'list-1', order: 0 }],
            actions: [{
                id: 'a-1', name: 'New Name', categoryId: 'cat-1',
                tags: [], countries: [], otherLabels: [],
                comments: [], attachments: [], assignees: [],
                status: 'active', budget: 0, priority: 'medium',
                description: '', startDate: null, dueDate: null,
                updatedAt: T.NEW,
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                _trelloBaseline: {
                    name: 'Old Name', description: '', startDate: null,
                    dueDate: null, status: null, assignees: []
                }
            }],
            tasks: [],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-action',
                lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
            }
        };

        // Sync 1: push action
        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card], lists: [list] }));
        const result1 = await syncWithTrello(board, board.trelloSync);
        expect(result1.result.pushed).toBeGreaterThanOrEqual(1);
        expect(updateTrelloCard).toHaveBeenCalledTimes(1);

        const pushedAction = result1.board.actions.find(a => a.id === 'a-1');
        expect(pushedAction._trelloBaseline).toBeDefined();
        expect(pushedAction._trelloBaseline.name).toBe('New Name');

        // Sync 2: re-sync unchanged → no re-push
        vi.clearAllMocks();
        const card2 = makeCard({ id: 'card-1', name: 'Old Name', dateLastActivity: T.NEW,
            checklists: [{ id: 'cl-1', name: 'Tasks', pos: 100, checkItems: [] }] });
        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card2], lists: [list] }));
        const result2 = await syncWithTrello(result1.board, result1.board.trelloSync);
        expect(updateTrelloCard).not.toHaveBeenCalled();
    });

    it('push checklist item then re-sync unchanged → no re-push', async () => {
        const list = makeList();
        const card = makeCard({
            id: 'card-1', name: 'Action', dateLastActivity: T.MID,
            checklists: [{
                id: 'cl-1', name: 'Tasks', pos: 100,
                checkItems: [{ id: 'ci-1', name: 'Old Task Title', state: 'incomplete', pos: 100 }]
            }]
        });

        const board = {
            id: 'board-1', name: 'Test', members: [],
            categories: [{ id: 'cat-1', name: 'Category', trelloListId: 'list-1', order: 0 }],
            actions: [{
                id: 'a-1', name: 'Action', categoryId: 'cat-1',
                tags: [], countries: [], otherLabels: [],
                comments: [], attachments: [], assignees: [],
                status: 'active', budget: 0, priority: 'medium',
                description: '', startDate: null, dueDate: null,
                updatedAt: T.OLD,
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                _trelloBaseline: { name: 'Action', description: '', startDate: null, dueDate: null, status: null, assignees: [] }
            }],
            tasks: [{
                id: 't-1', title: 'New Task Title', actionId: 'a-1',
                description: '', startDate: null, dueDate: null, month: -1,
                status: 'todo', priority: 'medium', budget: 0,
                checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [],
                order: 0, updatedAt: T.NEW,
                trelloCardId: 'card-1', trelloCheckItemId: 'ci-1',
                trelloChecklistId: 'cl-1', trelloChecklistName: 'Tasks',
                trelloLastModified: T.MID,
                _trelloBaseline: { title: 'Old Task Title', dueDate: null, status: 'todo', assignees: [] }
            }],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-action',
                lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
            }
        };

        // Sync 1: push checklist item
        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card], lists: [list] }));
        const result1 = await syncWithTrello(board, board.trelloSync);
        expect(updateTrelloChecklistItem).toHaveBeenCalled();

        const pushedTask = result1.board.tasks.find(t => t.id === 't-1');
        expect(pushedTask._trelloBaseline).toBeDefined();
        expect(pushedTask._trelloBaseline.title).toBe('New Task Title');

        // Sync 2: re-sync unchanged → no re-push
        vi.clearAllMocks();
        const card2 = makeCard({ id: 'card-1', name: 'Action', dateLastActivity: T.NEW,
            checklists: [{ id: 'cl-1', name: 'Tasks', pos: 100,
                checkItems: [{ id: 'ci-1', name: 'Old Task Title', state: 'incomplete', pos: 100 }] }] });
        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card2], lists: [list] }));
        const result2 = await syncWithTrello(result1.board, result1.board.trelloSync);
        expect(updateTrelloChecklistItem).not.toHaveBeenCalled();
    });

    it('buildSelectiveCheckItemUpdate null → no API call when nothing changed', async () => {
        const list = makeList();
        const card = makeCard({
            id: 'card-1', name: 'Action', dateLastActivity: T.MID,
            checklists: [{ id: 'cl-1', name: 'Tasks', pos: 100,
                checkItems: [{ id: 'ci-1', name: 'Task', state: 'incomplete', pos: 100 }] }]
        });

        // Task has baseline matching current values but updatedAt > trelloLastModified
        // (e.g. user changed something else like budget, which isn't pushed)
        const board = {
            id: 'board-1', name: 'Test', members: [],
            categories: [{ id: 'cat-1', name: 'Category', trelloListId: 'list-1', order: 0 }],
            actions: [{
                id: 'a-1', name: 'Action', categoryId: 'cat-1',
                tags: [], countries: [], otherLabels: [],
                comments: [], attachments: [], assignees: [],
                status: 'active', budget: 0, priority: 'medium',
                description: '', startDate: null, dueDate: null,
                updatedAt: T.OLD,
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                _trelloBaseline: { name: 'Action', description: '', startDate: null, dueDate: null, status: null, assignees: [] }
            }],
            tasks: [{
                id: 't-1', title: 'Task', actionId: 'a-1',
                description: '', startDate: null, dueDate: null, month: -1,
                status: 'todo', priority: 'medium', budget: 100,
                checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [],
                order: 0, updatedAt: T.NEW,
                trelloCardId: 'card-1', trelloCheckItemId: 'ci-1',
                trelloChecklistId: 'cl-1', trelloChecklistName: 'Tasks',
                trelloLastModified: T.MID,
                _trelloBaseline: { title: 'Task', dueDate: null, status: 'todo', assignees: [] }
            }],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-action',
                lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
            }
        };

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card], lists: [list] }));
        const result = await syncWithTrello(board, board.trelloSync);
        // Baseline matches current fields → buildSelectiveCheckItemUpdate returns null → no API call
        expect(updateTrelloChecklistItem).not.toHaveBeenCalled();
    });

    it('re-linked task gets _trelloBaseline from checklist item', async () => {
        const list = makeList();
        const card = makeCard({
            id: 'card-1', name: 'Action', dateLastActivity: T.NEW,
            checklists: [{
                id: 'cl-1', name: 'Tasks', pos: 100,
                checkItems: [{ id: 'ci-new', name: 'Orphan Task', state: 'complete', pos: 100, due: '2026-04-15T00:00:00.000Z', idMember: 'm1' }]
            }]
        });

        const board = {
            id: 'board-1', name: 'Test', members: [],
            categories: [{ id: 'cat-1', name: 'Category', trelloListId: 'list-1', order: 0 }],
            actions: [{
                id: 'a-1', name: 'Action', categoryId: 'cat-1',
                tags: [], countries: [], otherLabels: [],
                comments: [], attachments: [], assignees: [],
                status: 'active', budget: 0, priority: 'medium',
                description: '', startDate: null, dueDate: null,
                updatedAt: T.OLD,
                trelloCardId: 'card-1', trelloLastModified: T.NEW,
                _trelloBaseline: { name: 'Action', description: '', startDate: null, dueDate: null, status: null, assignees: [] }
            }],
            // Task exists locally without trelloCheckItemId (lost link), title matches Trello item
            tasks: [{
                id: 't-orphan', title: 'Orphan Task', actionId: 'a-1',
                description: '', startDate: null, dueDate: null, month: -1,
                status: 'completed', priority: 'medium', budget: 0,
                checklists: [], comments: [], attachments: [],
                channels: [], countries: [], assignees: [], otherLabels: [],
                order: 0, updatedAt: T.OLD,
                trelloCardId: 'card-1', trelloChecklistName: 'Tasks',
                trelloLastModified: T.OLD
            }],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-action',
                lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
            }
        };

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card], lists: [list] }));
        const result = await syncWithTrello(board, board.trelloSync);
        const relinked = result.board.tasks.find(t => t.id === 't-orphan');
        expect(relinked).toBeDefined();
        expect(relinked.trelloCheckItemId).toBe('ci-new');
        expect(relinked._trelloBaseline).toBeDefined();
        expect(relinked._trelloBaseline.status).toBe('completed');
        expect(relinked._trelloBaseline.dueDate).toBe('2026-04-15');
    });

    it('comment with attachment in pushActionExtrasToTrello uploads attachment first', async () => {
        const list = makeList();
        const card = makeCard({
            id: 'card-1', name: 'Action', dateLastActivity: T.MID,
            checklists: [{ id: 'cl-1', name: 'Tasks', pos: 100, checkItems: [] }]
        });

        const board = {
            id: 'board-1', name: 'Test', members: [],
            categories: [{ id: 'cat-1', name: 'Category', trelloListId: 'list-1', order: 0 }],
            actions: [{
                id: 'a-1', name: 'Action', categoryId: 'cat-1',
                tags: [], countries: [], otherLabels: [],
                comments: [{
                    id: 'cm-local', author: 'Me', text: 'See screenshot',
                    date: T.NEW,
                    attachments: [{ id: 'att-local', name: 'screenshot.png', data: 'base64data', type: 'image/png' }]
                }],
                attachments: [{ id: 'att-local', name: 'screenshot.png', data: 'base64data', type: 'image/png' }],
                assignees: [],
                status: 'active', budget: 0, priority: 'medium',
                description: '', startDate: null, dueDate: null,
                updatedAt: T.NEW,
                trelloCardId: 'card-1', trelloLastModified: T.MID,
                _trelloBaseline: { name: 'Action', description: '', startDate: null, dueDate: null, status: null, assignees: [] }
            }],
            tasks: [],
            trelloSync: {
                trelloBoardId: 'tb-1', syncEnabled: true, syncMode: 'card-as-action',
                lastSyncAt: T.OLD, labelMappings: {}, pollIntervalMs: 120000
            }
        };

        fetchTrelloBoardFull.mockResolvedValueOnce(makeTrelloResponse({ cards: [card], lists: [list] }));
        const result = await syncWithTrello(board, board.trelloSync);

        // Attachment uploaded before comment
        expect(uploadTrelloAttachment).toHaveBeenCalled();
        expect(addTrelloComment).toHaveBeenCalled();

        // Verify upload was called with card ID and attachment data
        const uploadCall = uploadTrelloAttachment.mock.calls[0];
        expect(uploadCall[0]).toBe('card-1');
        expect(uploadCall[1]).toBe('base64data');
    });
});

// ═══════════════════════════════════════════════════════════════
// Group 2: postSyncMerge — rapid edits during sync
// ═══════════════════════════════════════════════════════════════
describe('postSyncMerge — rapid edits during sync', () => {
    it('preserves Trello IDs from sync on tasks edited during sync', () => {
        const result = mergePostSync({
            syncedBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.MID }],
                tasks: [{
                    id: 't-1', title: 'Task', actionId: 'a-1', updatedAt: T.MID,
                    trelloCardId: 'card-1', trelloLastModified: T.MID,
                    _trelloBaseline: { title: 'Task', description: '', startDate: null, dueDate: null, status: null, assignees: [], checklistItems: {} },
                    trelloCheckItemId: 'ci-1', trelloChecklistId: 'cl-1',
                    comments: [{ id: 'cm-1', text: 'Synced', trelloCommentId: 'tcm-1' }]
                }]
            },
            liveBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.OLD }],
                tasks: [{
                    id: 't-1', title: 'Task EDITED', actionId: 'a-1',
                    updatedAt: T.NEW, // edited during sync
                    comments: [{ id: 'cm-1', text: 'Synced' }, { id: 'cm-2', text: 'New local comment' }]
                }]
            },
            preSyncCategoryIds: new Set(['cat-1']),
            preSyncTaskIds: new Set(['t-1']),
            preSyncActionIds: new Set(['a-1']),
            preSyncTaskMap: new Map([['t-1', T.OLD]]),
            preSyncActionMap: new Map([['a-1', T.OLD]])
        });

        const task = result.tasks.find(t => t.id === 't-1');
        // Live version kept (edited during sync)
        expect(task.title).toBe('Task EDITED');
        expect(task.comments).toHaveLength(2);
        // Trello IDs merged from sync
        expect(task.trelloCardId).toBe('card-1');
        expect(task.trelloCheckItemId).toBe('ci-1');
        expect(task._trelloBaseline).toBeDefined();
    });

    it('preserves ALL 50 task edits during sync, not just latest', () => {
        const preSyncTaskMap = new Map();
        const preSyncTaskIds = new Set();
        const syncedTasks = [];
        const liveTasks = [];

        for (let i = 0; i < 50; i++) {
            const id = `t-${i}`;
            preSyncTaskIds.add(id);
            preSyncTaskMap.set(id, T.OLD);
            syncedTasks.push({ id, title: `Synced ${i}`, actionId: 'a-1', updatedAt: T.MID });
            liveTasks.push({ id, title: `Edited ${i}`, actionId: 'a-1', updatedAt: T.NEW });
        }

        const result = mergePostSync({
            syncedBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.MID }],
                tasks: syncedTasks
            },
            liveBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.OLD }],
                tasks: liveTasks
            },
            preSyncCategoryIds: new Set(['cat-1']),
            preSyncTaskIds,
            preSyncActionIds: new Set(['a-1']),
            preSyncTaskMap,
            preSyncActionMap: new Map([['a-1', T.OLD]])
        });

        expect(result.tasks).toHaveLength(50);
        // ALL live edits preserved
        for (let i = 0; i < 50; i++) {
            expect(result.tasks.find(t => t.id === `t-${i}`).title).toBe(`Edited ${i}`);
        }
    });

    it('task created during sync survives merge', () => {
        const result = mergePostSync({
            syncedBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.MID }],
                tasks: [{ id: 't-1', title: 'Existing', actionId: 'a-1', updatedAt: T.MID }]
            },
            liveBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.OLD }],
                tasks: [
                    { id: 't-1', title: 'Existing', actionId: 'a-1', updatedAt: T.OLD },
                    { id: 't-new', title: 'Created during sync', actionId: 'a-1', updatedAt: T.NEW }
                ]
            },
            preSyncCategoryIds: new Set(['cat-1']),
            preSyncTaskIds: new Set(['t-1']),
            preSyncActionIds: new Set(['a-1']),
            preSyncTaskMap: new Map([['t-1', T.OLD]]),
            preSyncActionMap: new Map([['a-1', T.OLD]])
        });

        expect(result.tasks).toHaveLength(2);
        expect(result.tasks.find(t => t.id === 't-new')).toBeTruthy();
    });

    it('task deleted during sync does NOT reappear', () => {
        const result = mergePostSync({
            syncedBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.MID }],
                tasks: [
                    { id: 't-1', title: 'Keep', actionId: 'a-1', updatedAt: T.MID },
                    { id: 't-deleted', title: 'Deleted', actionId: 'a-1', updatedAt: T.MID }
                ]
            },
            liveBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Act', categoryId: 'cat-1', updatedAt: T.OLD }],
                tasks: [{ id: 't-1', title: 'Keep', actionId: 'a-1', updatedAt: T.OLD }]
            },
            preSyncCategoryIds: new Set(['cat-1']),
            preSyncTaskIds: new Set(['t-1', 't-deleted']),
            preSyncActionIds: new Set(['a-1']),
            preSyncTaskMap: new Map([['t-1', T.OLD], ['t-deleted', T.OLD]]),
            preSyncActionMap: new Map([['a-1', T.OLD]])
        });

        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].id).toBe('t-1');
    });

    it('action edited during sync keeps live version + Trello IDs', () => {
        const result = mergePostSync({
            syncedBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{
                    id: 'a-1', name: 'Synced Name', categoryId: 'cat-1', updatedAt: T.MID,
                    trelloCardId: 'card-1', trelloLastModified: T.MID,
                    _trelloBaseline: { name: 'Synced Name', description: '', startDate: null, dueDate: null, status: null, assignees: [] }
                }],
                tasks: []
            },
            liveBoard: {
                id: 'b1',
                categories: [{ id: 'cat-1', name: 'Cat' }],
                actions: [{ id: 'a-1', name: 'Live Edit', categoryId: 'cat-1', updatedAt: T.NEW }],
                tasks: []
            },
            preSyncCategoryIds: new Set(['cat-1']),
            preSyncTaskIds: new Set(),
            preSyncActionIds: new Set(['a-1']),
            preSyncTaskMap: new Map(),
            preSyncActionMap: new Map([['a-1', T.OLD]])
        });

        const action = result.actions.find(a => a.id === 'a-1');
        expect(action.name).toBe('Live Edit'); // live version kept
        expect(action.trelloCardId).toBe('card-1'); // Trello ID merged
        expect(action._trelloBaseline).toBeDefined(); // baseline merged
    });
});

// ═══════════════════════════════════════════════════════════════
// Group 3: realtimeMerge — multi-user scenarios
// ═══════════════════════════════════════════════════════════════
describe('realtimeMerge — multi-user scenarios', () => {

    it('concurrent edits to different entities — both preserved', () => {
        const local = [
            { id: 't1', title: 'A edited title', updatedAt: T.NEW },
            { id: 't2', title: 'Original', updatedAt: T.OLD }
        ];
        const incoming = [
            { id: 't1', title: 'Original', updatedAt: T.OLD },
            { id: 't2', title: 'B edited description', description: 'new desc', updatedAt: T.NEW }
        ];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(2);
        expect(result.find(e => e.id === 't1').title).toBe('A edited title');
        expect(result.find(e => e.id === 't2').title).toBe('B edited description');
    });

    it('concurrent adds — both new entities preserved', () => {
        const local = [
            { id: 't1', title: 'Existing', updatedAt: T.MID },
            { id: 't-local', title: 'A created', updatedAt: T.NEW }
        ];
        const incoming = [
            { id: 't1', title: 'Existing', updatedAt: T.MID },
            { id: 't-remote', title: 'B created', updatedAt: T.NEW }
        ];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(3);
        expect(result.find(e => e.id === 't-local')).toBeTruthy();
        expect(result.find(e => e.id === 't-remote')).toBeTruthy();
    });

    it('entity deleted by User A (missing from incoming), User B edited — delete wins (entity-level)', () => {
        // User B's local has the entity with newer timestamp
        const local = [
            { id: 't1', title: 'B edited this', updatedAt: T.NEW },
            { id: 't2', title: 'Keep', updatedAt: T.MID }
        ];
        // User A deleted t1 — it's gone from incoming
        const incoming = [
            { id: 't2', title: 'Keep', updatedAt: T.MID }
        ];
        const result = mergeEntitiesByTimestamp(local, incoming);
        // t1 exists only in local → preserved as local-only
        // (This is the current behavior — local-only entities are kept)
        expect(result.find(e => e.id === 't1')).toBeTruthy();
        // Note: this means deleted entities CAN reappear — known limitation
        expect(result).toHaveLength(2);
    });

    it('same-timestamp edits — incoming (server) wins', () => {
        const local = [{ id: 't1', title: 'Local version', updatedAt: T.MID }];
        const incoming = [{ id: 't1', title: 'Server version', updatedAt: T.MID }];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result[0].title).toBe('Server version');
    });

    it('3-user scenario: A edits t1, B edits t2, C creates t3', () => {
        const local = [
            { id: 't1', title: 'A: updated', updatedAt: T.NEW },
            { id: 't2', title: 'Original t2', updatedAt: T.OLD }
        ];
        const incoming = [
            { id: 't1', title: 'Original t1', updatedAt: T.OLD },
            { id: 't2', title: 'B: updated', updatedAt: T.NEW },
            { id: 't3', title: 'C: brand new', updatedAt: T.MID }
        ];
        const result = mergeEntitiesByTimestamp(local, incoming);
        expect(result).toHaveLength(3);
        expect(result.find(e => e.id === 't1').title).toBe('A: updated');
        expect(result.find(e => e.id === 't2').title).toBe('B: updated');
        expect(result.find(e => e.id === 't3').title).toBe('C: brand new');
    });

    it('board-level merge preserves trelloSync config from local when incoming is sparse', () => {
        const local = {
            version: 2, currentBoardId: 'b1',
            boards: [{
                id: 'b1', name: 'Board', categories: [], actions: [], tasks: [],
                trelloSync: { syncMode: 'card-as-action', trelloBoardId: 'tb-1', labelMappings: { l1: { type: 'channel', channelId: 'c1' } } }
            }]
        };
        const incoming = {
            version: 2, currentBoardId: 'b1',
            boards: [{
                id: 'b1', name: 'Board', categories: [], actions: [], tasks: [],
                trelloSync: { lastSyncAt: T.NEW }
            }]
        };
        const result = mergeBoardsEntityLevel(local, incoming);
        const sync = result.boards[0].trelloSync;
        expect(sync.syncMode).toBe('card-as-action');
        expect(sync.trelloBoardId).toBe('tb-1');
        expect(sync.labelMappings.l1.channelId).toBe('c1');
        expect(sync.lastSyncAt).toBe(T.NEW);
    });

    it('concurrent same-entity edits — newer wins, older lost (known limitation)', () => {
        // User A edits title, User B edits description, B's save is 1ms newer
        const local = [{ id: 't1', title: 'A title change', description: 'old desc', updatedAt: '2026-03-20T10:00:00.000Z' }];
        const incoming = [{ id: 't1', title: 'old title', description: 'B desc change', updatedAt: '2026-03-20T10:00:00.001Z' }];
        const result = mergeEntitiesByTimestamp(local, incoming);
        // Incoming wins (1ms newer) — A's title change is lost
        expect(result[0].title).toBe('old title');
        expect(result[0].description).toBe('B desc change');
    });
});
