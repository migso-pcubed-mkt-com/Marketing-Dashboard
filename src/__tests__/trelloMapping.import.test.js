// Comprehensive tests for import/creation mapping functions in trelloMapping.js
// Covers: mapTrelloCardToAction, mapTrelloCheckItemToTask, buildImportData, buildImportDataCardAsAction, trelloColorToGradient
import { describe, it, expect } from 'vitest';
import {
    mapTrelloCardToAction,
    mapTrelloCheckItemToTask,
    buildImportData,
    buildImportDataCardAsAction,
    trelloColorToGradient
} from '../lib/trelloMapping.js';

// ════════════════════════════════════════════════════════════
// trelloColorToGradient
// ════════════════════════════════════════════════════════════
describe('trelloColorToGradient', () => {
    it('maps known colors to gradients', () => {
        expect(trelloColorToGradient('green')).toContain('green');
        expect(trelloColorToGradient('blue')).toContain('blue');
    });

    it('falls back to black (indigo) for unknown colors', () => {
        expect(trelloColorToGradient('neon')).toContain('indigo');
        expect(trelloColorToGradient(null)).toContain('indigo');
    });
});

// ════════════════════════════════════════════════════════════
// mapTrelloCardToAction — Trello card → new action (card-as-action mode)
// ════════════════════════════════════════════════════════════
describe('mapTrelloCardToAction', () => {
    const baseCard = {
        id: 'card-1', name: 'Sprint Planning', desc: 'Plan the sprint',
        due: '2026-04-30T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
        dueComplete: false, closed: false,
        dateLastActivity: '2026-03-20T10:00:00.000Z',
        idList: 'list-1', idLabels: [], labels: [],
        idMembers: ['m1', 'm2'], idChecklists: [],
        checklists: [], attachments: [], comments: []
    };

    it('maps card name to action name', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result.name).toBe('Sprint Planning');
    });

    it('maps card desc to description', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result.description).toBe('Plan the sprint');
    });

    it('maps dates', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result.dueDate).toBe('2026-04-30');
        expect(result.startDate).toBe('2026-04-01');
    });

    it('sets null dates when card has none', () => {
        const card = { ...baseCard, due: null, start: null };
        const result = mapTrelloCardToAction(card, 'cat-1', {});
        expect(result.dueDate).toBeNull();
        expect(result.startDate).toBeNull();
    });

    it('maps members to assignees', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result.assignees).toEqual(['m1', 'm2']);
    });

    it('sets categoryId', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-42', {});
        expect(result.categoryId).toBe('cat-42');
    });

    it('generates id with act- prefix', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result.id).toMatch(/^act-/);
    });

    it('sets trelloCardId and trelloLastModified', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result.trelloCardId).toBe('card-1');
        expect(result.trelloLastModified).toBe('2026-03-20T10:00:00.000Z');
    });

    it('sets default budget and priority', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result.budget).toBe(0);
        expect(result.priority).toBe('medium');
    });

    // ── Label mapping ──
    it('maps channel labels to tags', () => {
        const mappingConfig = { labelMappings: { 'lbl-1': { type: 'channel', channelId: 'social' } } };
        const card = { ...baseCard, idLabels: ['lbl-1'] };
        const result = mapTrelloCardToAction(card, 'cat-1', mappingConfig);
        expect(result.tags).toContain('social');
        expect(result._inheritChannels).toContain('social');
    });

    it('maps country labels', () => {
        const mappingConfig = { labelMappings: { 'lbl-fr': { type: 'country', countryId: 'france' } } };
        const card = { ...baseCard, idLabels: ['lbl-fr'] };
        const result = mapTrelloCardToAction(card, 'cat-1', mappingConfig);
        expect(result.countries).toContain('france');
        expect(result._inheritCountries).toContain('france');
    });

    it('maps other labels', () => {
        const mappingConfig = { labelMappings: { 'lbl-x': { type: 'other', labelName: 'X', labelColor: '#333' } } };
        const card = { ...baseCard, idLabels: ['lbl-x'] };
        const result = mapTrelloCardToAction(card, 'cat-1', mappingConfig);
        expect(result.otherLabels).toHaveLength(1);
        expect(result._inheritOtherLabels).toHaveLength(1);
    });

    // ── Comments ──
    it('maps card comments', () => {
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-1', data: { text: 'Hello' }, date: '2026-03-20', memberCreator: { fullName: 'Alice', username: 'alice' } }
            ]
        };
        const result = mapTrelloCardToAction(card, 'cat-1', {});
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].text).toBe('Hello');
        expect(result.comments[0].author).toBe('Alice');
        expect(result.comments[0].trelloCommentId).toBe('tcm-1');
    });

    it('falls back to username when fullName is missing', () => {
        const card = {
            ...baseCard,
            comments: [{ id: 'c1', data: { text: 'Hi' }, date: '', memberCreator: { username: 'bob' } }]
        };
        const result = mapTrelloCardToAction(card, 'cat-1', {});
        expect(result.comments[0].author).toBe('bob');
    });

    // ── Attachments ──
    it('maps card attachments', () => {
        const card = {
            ...baseCard,
            attachments: [{ id: 'tatt-1', name: 'doc.pdf', url: 'https://att.url', mimeType: 'application/pdf', date: '2026-03-20' }]
        };
        const result = mapTrelloCardToAction(card, 'cat-1', {});
        expect(result.attachments).toHaveLength(1);
        expect(result.attachments[0].trelloAttachmentId).toBe('tatt-1');
        expect(result.attachments[0].url).toBe('https://att.url');
    });

    // ── _inherit fields ──
    it('sets _inheritAssignees from idMembers', () => {
        const result = mapTrelloCardToAction(baseCard, 'cat-1', {});
        expect(result._inheritAssignees).toEqual(['m1', 'm2']);
    });
});


// ════════════════════════════════════════════════════════════
// mapTrelloCheckItemToTask — checklist item → new task (card-as-action)
// ════════════════════════════════════════════════════════════
describe('mapTrelloCheckItemToTask', () => {
    const baseCard = {
        id: 'card-1', dateLastActivity: '2026-03-20T10:00:00.000Z',
        due: '2026-04-30T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
        idLabels: [], idMembers: ['m1']
    };

    const baseItem = {
        id: 'tci-1', name: 'Write tests', state: 'incomplete', pos: 16384,
        due: null, idMember: null
    };

    it('maps item name to title', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.title).toBe('Write tests');
    });

    it('generates id with task- prefix', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.id).toMatch(/^task-/);
    });

    it('sets actionId', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-42', baseCard, 'cl-1', 'Tasks', {});
        expect(result.actionId).toBe('act-42');
    });

    it('maps incomplete state to todo', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.status).toBe('todo');
    });

    it('maps complete state to completed', () => {
        const item = { ...baseItem, state: 'complete' };
        const result = mapTrelloCheckItemToTask(item, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.status).toBe('completed');
    });

    // ── Dates ──
    it('uses item due when available', () => {
        const item = { ...baseItem, due: '2026-05-15T00:00:00.000Z' };
        const result = mapTrelloCheckItemToTask(item, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.dueDate).toBe('2026-05-15');
        expect(result.month).toBe(4); // May
    });

    it('falls back to card due when item has no due', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.dueDate).toBe('2026-04-30');
    });

    it('uses card start as startDate', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.startDate).toBe('2026-04-01');
    });

    it('computes startDate from dueDate when card has no start', () => {
        const card = { ...baseCard, start: null };
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', card, 'cl-1', 'Tasks', {});
        expect(result.startDate).toBe('2026-04-01'); // 1st of due month
    });

    // ── Assignees ──
    it('uses item idMember as assignee', () => {
        const item = { ...baseItem, idMember: 'm2' };
        const result = mapTrelloCheckItemToTask(item, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.assignees).toEqual(['m2']);
    });

    it('inherits card members when item has no idMember', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.assignees).toEqual(['m1']);
    });

    // ── Order ──
    it('maps item pos to order', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.order).toBe(16384);
    });

    // ── Trello IDs ──
    it('sets all trello IDs', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-99', 'Dev Tasks', {});
        expect(result.trelloCardId).toBe('card-1');
        expect(result.trelloCheckItemId).toBe('tci-1');
        expect(result.trelloChecklistId).toBe('cl-99');
        expect(result.trelloChecklistName).toBe('Dev Tasks');
        expect(result.trelloLastModified).toBe('2026-03-20T10:00:00.000Z');
    });

    // ── Label inheritance from card ──
    it('inherits channel labels from card', () => {
        const mappingConfig = { labelMappings: { 'lbl-s': { type: 'channel', channelId: 'social' } } };
        const card = { ...baseCard, idLabels: ['lbl-s'] };
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', card, 'cl-1', 'Tasks', mappingConfig);
        expect(result.channels).toContain('social');
    });

    it('inherits country labels from card', () => {
        const mappingConfig = { labelMappings: { 'lbl-fr': { type: 'country', countryId: 'france' } } };
        const card = { ...baseCard, idLabels: ['lbl-fr'] };
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', card, 'cl-1', 'Tasks', mappingConfig);
        expect(result.countries).toContain('france');
    });

    it('inherits other labels from card', () => {
        const mappingConfig = { labelMappings: { 'lbl-x': { type: 'other', labelName: 'X', labelColor: '#333' } } };
        const card = { ...baseCard, idLabels: ['lbl-x'] };
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', card, 'cl-1', 'Tasks', mappingConfig);
        expect(result.otherLabels).toHaveLength(1);
    });

    // ── Defaults ──
    it('sets default priority, budget, empty arrays', () => {
        const result = mapTrelloCheckItemToTask(baseItem, 'act-1', baseCard, 'cl-1', 'Tasks', {});
        expect(result.priority).toBe('medium');
        expect(result.budget).toBe(0);
        expect(result.checklists).toEqual([]);
        expect(result.comments).toEqual([]);
        expect(result.attachments).toEqual([]);
        expect(result.description).toBe('');
    });
});


// ════════════════════════════════════════════════════════════
// buildImportData — full import from Trello (card-as-task mode)
// ════════════════════════════════════════════════════════════
describe('buildImportData', () => {
    const makeTrelloData = () => ({
        board: { id: 'tb-1', name: 'Marketing', url: 'https://trello.com/b/test' },
        lists: [
            { id: 'l-1', name: 'Backlog', pos: 10000 },
            { id: 'l-2', name: 'In Progress', pos: 20000 }
        ],
        labels: [
            { id: 'lbl-sprint', name: 'Sprint 1', color: 'green' }
        ],
        cards: [
            {
                id: 'c-1', name: 'Task A', desc: 'Description A',
                due: '2026-04-15T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
                dueComplete: false, closed: false,
                dateLastActivity: '2026-03-20T00:00:00.000Z',
                idList: 'l-1', idLabels: ['lbl-sprint'],
                labels: [], idMembers: ['m1'],
                idChecklists: [], checklists: [],
                attachments: [], comments: [], pos: 100
            },
            {
                id: 'c-2', name: 'Task B', desc: '',
                due: null, start: null,
                dueComplete: true, closed: false,
                dateLastActivity: '2026-03-21T00:00:00.000Z',
                idList: 'l-2', idLabels: [],
                labels: [], idMembers: [],
                idChecklists: [], checklists: [],
                attachments: [], comments: [], pos: 200
            }
        ],
        members: [{ id: 'm1', fullName: 'Alice', username: 'alice', avatarUrl: 'https://avatar' }]
    });

    const mappingConfig = {
        labelMappings: {
            'lbl-sprint': { type: 'action', categoryId: 'will-be-overwritten' }
        }
    };

    it('creates categories from Trello lists', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        expect(result.categories).toHaveLength(2);
        expect(result.categories[0].name).toBe('Backlog');
        expect(result.categories[0].trelloListId).toBe('l-1');
        expect(result.categories[1].name).toBe('In Progress');
        expect(result.categories[1].trelloListId).toBe('l-2');
    });

    it('sorts categories by list pos', () => {
        const data = makeTrelloData();
        data.lists = [
            { id: 'l-2', name: 'B', pos: 20000 },
            { id: 'l-1', name: 'A', pos: 10000 }
        ];
        const result = buildImportData(data, mappingConfig);
        expect(result.categories[0].name).toBe('A');
        expect(result.categories[1].name).toBe('B');
    });

    it('creates actions from action-mapped labels', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        const actionLabel = result.actions.find(a => a.trelloLabelId === 'lbl-sprint');
        expect(actionLabel).toBeDefined();
        expect(actionLabel.name).toBe('Sprint 1');
    });

    it('creates default "General" action per category', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        const defaults = result.actions.filter(a => a.isDefault);
        expect(defaults).toHaveLength(2); // One per category
        expect(defaults[0].name).toContain('General');
    });

    it('creates tasks from cards', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        expect(result.tasks).toHaveLength(2);
        expect(result.tasks[0].title).toBe('Task A');
        expect(result.tasks[0].trelloCardId).toBe('c-1');
        expect(result.tasks[1].title).toBe('Task B');
    });

    it('assigns task to action-mapped label action when available', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        const taskA = result.tasks.find(t => t.title === 'Task A');
        const sprintAction = result.actions.find(a => a.trelloLabelId === 'lbl-sprint');
        expect(taskA.actionId).toBe(sprintAction.id);
    });

    it('assigns task to default action when no label mapping', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        const taskB = result.tasks.find(t => t.title === 'Task B');
        const defaultAction = result.actions.find(a => a.isDefault);
        expect(taskB.actionId).toBeDefined();
    });

    it('maps completed task status from dueComplete', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        const taskB = result.tasks.find(t => t.title === 'Task B');
        expect(taskB.status).toBe('completed');
    });

    it('maps members', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        expect(result.members).toHaveLength(1);
        expect(result.members[0].fullName).toBe('Alice');
        expect(result.members[0].avatarUrl).toContain('/50.png');
    });

    it('sets trelloSync metadata', () => {
        const result = buildImportData(makeTrelloData(), mappingConfig);
        expect(result.trelloSync.trelloBoardId).toBe('tb-1');
        expect(result.trelloSync.syncMode).toBe('card-as-task');
        expect(result.trelloSync.syncEnabled).toBe(true);
        expect(result.trelloSync.labelMappings).toBe(mappingConfig.labelMappings);
    });

    it('imports checklists from cards', () => {
        const data = makeTrelloData();
        data.cards[0].checklists = [{
            id: 'tcl-1', name: 'QA', pos: 100,
            checkItems: [
                { id: 'tci-1', name: 'Test 1', state: 'complete', pos: 100 },
                { id: 'tci-2', name: 'Test 2', state: 'incomplete', pos: 200 }
            ]
        }];
        const result = buildImportData(data, mappingConfig);
        const taskA = result.tasks.find(t => t.title === 'Task A');
        expect(taskA.checklists).toHaveLength(1);
        expect(taskA.checklists[0].name).toBe('QA');
        expect(taskA.checklists[0].items).toHaveLength(2);
        expect(taskA.checklists[0].items[0].done).toBe(true);
        expect(taskA.checklists[0].items[0].trelloCheckItemId).toBe('tci-1');
    });

    it('imports attachments from cards', () => {
        const data = makeTrelloData();
        data.cards[0].attachments = [{ id: 'att-1', name: 'f.pdf', url: 'u', mimeType: 'application/pdf', date: '2026-03-20' }];
        const result = buildImportData(data, mappingConfig);
        const taskA = result.tasks.find(t => t.title === 'Task A');
        expect(taskA.attachments).toHaveLength(1);
        expect(taskA.attachments[0].trelloAttachmentId).toBe('att-1');
    });

    it('imports comments from cards', () => {
        const data = makeTrelloData();
        data.cards[0].comments = [{ id: 'tcm-1', data: { text: 'Hi' }, date: '2026-03-20', memberCreator: { fullName: 'Alice' } }];
        const result = buildImportData(data, mappingConfig);
        const taskA = result.tasks.find(t => t.title === 'Task A');
        expect(taskA.comments).toHaveLength(1);
        expect(taskA.comments[0].trelloCommentId).toBe('tcm-1');
    });

    it('maps channel labels on cards to task channels', () => {
        const config = {
            labelMappings: {
                'lbl-sprint': { type: 'action' },
                'lbl-social': { type: 'channel', channelId: 'social' }
            }
        };
        const data = makeTrelloData();
        data.cards[0].idLabels = ['lbl-sprint', 'lbl-social'];
        const result = buildImportData(data, config);
        const taskA = result.tasks.find(t => t.title === 'Task A');
        expect(taskA.channels).toContain('social');
    });
});


// ════════════════════════════════════════════════════════════
// buildImportDataCardAsAction — full import (card-as-action mode)
// ════════════════════════════════════════════════════════════
describe('buildImportDataCardAsAction', () => {
    const makeTrelloData = () => ({
        board: { id: 'tb-1', name: 'Projects', url: 'https://trello.com/b/test' },
        lists: [
            { id: 'l-1', name: 'Active', pos: 10000 }
        ],
        labels: [
            { id: 'lbl-soc', name: 'Social Media', color: 'blue' }
        ],
        cards: [
            {
                id: 'c-1', name: 'Campaign Q2', desc: 'Q2 campaign',
                due: '2026-06-30T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
                dueComplete: false, closed: false,
                dateLastActivity: '2026-03-20T00:00:00.000Z',
                idList: 'l-1', idLabels: ['lbl-soc'],
                labels: [], idMembers: ['m1'],
                idChecklists: ['tcl-1'],
                checklists: [{
                    id: 'tcl-1', name: 'Tasks', pos: 100,
                    checkItems: [
                        { id: 'tci-1', name: 'Design banner', state: 'complete', pos: 100, due: null, idMember: null },
                        { id: 'tci-2', name: 'Write copy', state: 'incomplete', pos: 200, due: '2026-05-01T00:00:00.000Z', idMember: 'm2' }
                    ]
                }],
                attachments: [{ id: 'att-1', name: 'brief.pdf', url: 'https://brief', mimeType: 'application/pdf', date: '2026-03-20' }],
                comments: [{ id: 'tcm-1', data: { text: 'Approved' }, date: '2026-03-20', memberCreator: { fullName: 'Boss' } }],
                pos: 100
            },
            {
                id: 'c-archived', name: 'Old Campaign', desc: '',
                due: null, start: null, dueComplete: false, closed: true,
                dateLastActivity: '2026-01-01T00:00:00.000Z',
                idList: 'l-1', idLabels: [], labels: [], idMembers: [],
                idChecklists: [], checklists: [], attachments: [], comments: [], pos: 50
            }
        ],
        members: [
            { id: 'm1', fullName: 'Alice', username: 'alice', avatarUrl: null },
            { id: 'm2', fullName: 'Bob', username: 'bob', avatarUrl: 'https://av' }
        ]
    });

    const mappingConfig = {
        labelMappings: {
            'lbl-soc': { type: 'channel', channelId: 'social' }
        }
    };

    it('creates categories from lists', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].name).toBe('Active');
        expect(result.categories[0].trelloListId).toBe('l-1');
    });

    it('creates actions from cards (not labels)', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        // Only non-archived cards become actions
        const nonArchivedActions = result.actions;
        expect(nonArchivedActions).toHaveLength(1);
        expect(nonArchivedActions[0].name).toBe('Campaign Q2');
        expect(nonArchivedActions[0].trelloCardId).toBe('c-1');
    });

    it('skips archived cards', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.actions.some(a => a.name === 'Old Campaign')).toBe(false);
    });

    it('creates tasks from checklist items', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.tasks).toHaveLength(2);
        expect(result.tasks[0].title).toBe('Design banner');
        expect(result.tasks[0].status).toBe('completed');
        expect(result.tasks[1].title).toBe('Write copy');
        expect(result.tasks[1].status).toBe('todo');
    });

    it('sets trello IDs on tasks', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.tasks[0].trelloCardId).toBe('c-1');
        expect(result.tasks[0].trelloCheckItemId).toBe('tci-1');
        expect(result.tasks[0].trelloChecklistId).toBe('tcl-1');
        expect(result.tasks[0].trelloChecklistName).toBe('Tasks');
    });

    it('task actionId matches parent action', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        const action = result.actions[0];
        expect(result.tasks[0].actionId).toBe(action.id);
        expect(result.tasks[1].actionId).toBe(action.id);
    });

    it('inherits channel labels to action tags', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.actions[0].tags).toContain('social');
        expect(result.actions[0]._inheritChannels).toContain('social');
    });

    it('inherits channel labels to tasks', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.tasks[0].channels).toContain('social');
    });

    it('maps action attachments', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.actions[0].attachments).toHaveLength(1);
        expect(result.actions[0].attachments[0].trelloAttachmentId).toBe('att-1');
    });

    it('maps action comments', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.actions[0].comments).toHaveLength(1);
        expect(result.actions[0].comments[0].text).toBe('Approved');
    });

    it('task inherits item-specific due date', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.tasks[1].dueDate).toBe('2026-05-01');
    });

    it('task inherits item-specific assignee', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.tasks[1].assignees).toEqual(['m2']);
    });

    it('task inherits card members when no item assignee', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.tasks[0].assignees).toEqual(['m1']);
    });

    it('maps members', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.members).toHaveLength(2);
        expect(result.members[1].avatarUrl).toContain('/50.png');
    });

    it('sets trelloSync metadata with card-as-action mode', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        expect(result.trelloSync.syncMode).toBe('card-as-action');
        expect(result.trelloSync.trelloBoardId).toBe('tb-1');
    });

    it('sorts cards by pos', () => {
        const data = makeTrelloData();
        // Add a non-archived card with lower pos
        data.cards.push({
            id: 'c-first', name: 'First Card', desc: '', due: null, start: null,
            dueComplete: false, closed: false,
            dateLastActivity: '2026-03-20T00:00:00.000Z',
            idList: 'l-1', idLabels: [], labels: [], idMembers: [],
            idChecklists: [], checklists: [], attachments: [], comments: [], pos: 1
        });
        const result = buildImportDataCardAsAction(data, mappingConfig);
        expect(result.actions[0].name).toBe('First Card'); // pos=1 comes first
    });

    it('sorts checklist items by pos', () => {
        const result = buildImportDataCardAsAction(makeTrelloData(), mappingConfig);
        // tci-1 pos=100 before tci-2 pos=200
        expect(result.tasks[0].trelloCheckItemId).toBe('tci-1');
        expect(result.tasks[1].trelloCheckItemId).toBe('tci-2');
    });
});
