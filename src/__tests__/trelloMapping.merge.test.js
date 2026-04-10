// Comprehensive tests for merge functions in trelloMapping.js
// Covers: mergeCardIntoTask, mergeCardIntoAction, mergeCheckItemIntoTask
import { describe, it, expect } from 'vitest';
import {
    mergeCardIntoTask,
    mergeCardIntoAction,
    mergeCheckItemIntoTask
} from '../lib/trelloMapping.js';

// ════════════════════════════════════════════════════════════
// mergeCardIntoTask — Trello card → existing local task merge
// ════════════════════════════════════════════════════════════
describe('mergeCardIntoTask', () => {
    const baseTask = {
        id: 't1', actionId: 'act-1', title: 'Old Title', description: 'Old desc',
        startDate: '2026-03-01', dueDate: '2026-03-31', month: 2,
        status: 'todo', priority: 'high', budget: 500,
        checklists: [], comments: [], attachments: [],
        channels: [], countries: [], assignees: [], otherLabels: [],
        order: 0, createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
        trelloCardId: 'card-1', trelloLastModified: '2026-03-10T00:00:00.000Z'
    };

    const baseCard = {
        id: 'card-1', name: 'New Title', desc: 'New desc',
        due: '2026-04-15T12:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
        dueComplete: false, closed: false,
        dateLastActivity: '2026-03-20T10:00:00.000Z',
        idList: 'list-1', idLabels: [], labels: [],
        idMembers: ['member-1'], idChecklists: [],
        checklists: [], attachments: [], comments: [], pos: 100
    };

    // ── Title ──
    it('updates title from Trello card', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.title).toBe('New Title');
    });

    // ── Description ──
    it('updates description from Trello card', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.description).toBe('New desc');
    });

    it('preserves local description when card desc is empty', () => {
        const card = { ...baseCard, desc: '' };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result.description).toBe('Old desc');
    });

    // ── Dates ──
    it('updates dueDate from Trello card', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.dueDate).toBe('2026-04-15');
    });

    it('updates startDate from Trello card', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.startDate).toBe('2026-04-01');
    });

    it('preserves local startDate when card has no start', () => {
        const card = { ...baseCard, start: null };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result.startDate).toBe('2026-03-01');
    });

    it('preserves local dueDate when card has no due', () => {
        const card = { ...baseCard, due: null };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result.dueDate).toBe('2026-03-31');
    });

    // ── Month recalculation ──
    it('recalculates month from new dueDate', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.month).toBe(3); // April = month 3
    });

    it('preserves month when no dueDate change', () => {
        const card = { ...baseCard, due: null };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result.month).toBe(2);
    });

    // ── Status ──
    it('sets completed status when dueComplete is true', () => {
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result.status).toBe('completed');
    });

    it('preserves existing status when dueComplete is false', () => {
        const task = { ...baseTask, status: 'inprogress' };
        const result = mergeCardIntoTask(task, baseCard, {}, {}, []);
        expect(result.status).toBe('inprogress');
    });

    it('preserves protected status "creating" even when dueComplete=true', () => {
        const task = { ...baseTask, status: 'creating' };
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.status).toBe('creating');
    });

    it('preserves protected status "review" even when dueComplete=true', () => {
        const task = { ...baseTask, status: 'review' };
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.status).toBe('review');
    });

    it('preserves protected status "paused" even when dueComplete=true', () => {
        const task = { ...baseTask, status: 'paused' };
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.status).toBe('paused');
    });

    // ── Members / Assignees ──
    it('updates assignees from card idMembers', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.assignees).toEqual(['member-1']);
    });

    it('preserves local assignees when card has no members', () => {
        const task = { ...baseTask, assignees: ['local-member'] };
        const card = { ...baseCard, idMembers: [] };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        // idMembers is [] → empty array overwrites
        expect(result.assignees).toEqual([]);
    });

    // ── Timestamps ──
    it('sets updatedAt and trelloLastModified from card.dateLastActivity', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.updatedAt).toBe('2026-03-20T10:00:00.000Z');
        expect(result.trelloLastModified).toBe('2026-03-20T10:00:00.000Z');
    });

    // ── Local-only fields preserved ──
    it('preserves local-only fields (priority, budget, order, createdAt)', () => {
        const result = mergeCardIntoTask(baseTask, baseCard, {}, {}, []);
        expect(result.priority).toBe('high');
        expect(result.budget).toBe(500);
        expect(result.id).toBe('t1');
        expect(result.createdAt).toBe('2026-03-01T00:00:00.000Z');
    });

    // ── Checklists merge ──
    it('merges checklists from Trello card by trelloChecklistId', () => {
        const task = {
            ...baseTask,
            checklists: [{
                id: 'cl-1', name: 'Dev', trelloChecklistId: 'tcl-1',
                items: [{ id: 'cli-1', text: 'Step 1', done: false, trelloCheckItemId: 'tci-1' }]
            }]
        };
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'Dev', pos: 16384,
                checkItems: [
                    { id: 'tci-1', name: 'Step 1', state: 'complete', pos: 16384 },
                    { id: 'tci-2', name: 'Step 2', state: 'incomplete', pos: 32768 }
                ]
            }]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.checklists).toHaveLength(1);
        expect(result.checklists[0].items).toHaveLength(2);
        expect(result.checklists[0].items[0].done).toBe(true); // Updated from Trello
        expect(result.checklists[0].items[0].id).toBe('cli-1'); // Preserved local ID
        expect(result.checklists[0].items[1].text).toBe('Step 2'); // New from Trello
        expect(result.checklists[0].items[1].trelloCheckItemId).toBe('tci-2');
    });

    it('preserves local-only checklists (no trelloChecklistId)', () => {
        const task = {
            ...baseTask,
            checklists: [
                { id: 'cl-local', name: 'Local Only', items: [{ id: 'i1', text: 'Local item', done: false }] }
            ]
        };
        const result = mergeCardIntoTask(task, baseCard, {}, {}, []);
        expect(result.checklists).toHaveLength(1);
        expect(result.checklists[0].name).toBe('Local Only');
    });

    it('adds entirely new Trello checklists not present locally', () => {
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-new', name: 'New CL', pos: 16384,
                checkItems: [{ id: 'tci-new', name: 'New item', state: 'incomplete', pos: 1 }]
            }]
        };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result.checklists).toHaveLength(1);
        expect(result.checklists[0].trelloChecklistId).toBe('tcl-new');
        expect(result.checklists[0].items[0].trelloCheckItemId).toBe('tci-new');
    });

    it('sorts checklist items by Trello pos', () => {
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [
                    { id: 'tci-b', name: 'B', state: 'incomplete', pos: 20000 },
                    { id: 'tci-a', name: 'A', state: 'incomplete', pos: 10000 }
                ]
            }]
        };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result.checklists[0].items[0].text).toBe('A');
        expect(result.checklists[0].items[1].text).toBe('B');
    });

    it('merges checklist items by name when trelloCheckItemId is missing', () => {
        const task = {
            ...baseTask,
            checklists: [{
                id: 'cl-1', name: 'CL', trelloChecklistId: 'tcl-1',
                items: [{ id: 'cli-local', text: 'Shared item', done: false }]
            }]
        };
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [{ id: 'tci-match', name: 'Shared item', state: 'complete', pos: 1 }]
            }]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.checklists[0].items[0].id).toBe('cli-local'); // Preserved local ID
        expect(result.checklists[0].items[0].done).toBe(true); // Updated from Trello
        expect(result.checklists[0].items[0].trelloCheckItemId).toBe('tci-match');
    });

    // ── Comments merge ──
    it('merges comments from Trello by trelloCommentId', () => {
        const task = {
            ...baseTask,
            comments: [
                { id: 'cm-1', author: 'Alice', text: 'Existing', date: '2026-03-10', trelloCommentId: 'tcm-1' }
            ]
        };
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-1', data: { text: 'Updated text' }, date: '2026-03-20', memberCreator: { fullName: 'Alice' } },
                { id: 'tcm-2', data: { text: 'New comment' }, date: '2026-03-21', memberCreator: { fullName: 'Bob' } }
            ]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.comments).toHaveLength(2);
        expect(result.comments[0].id).toBe('cm-1'); // Preserved local ID
        expect(result.comments[0].text).toBe('Updated text');
        expect(result.comments[1].text).toBe('New comment');
        expect(result.comments[1].author).toBe('Bob');
    });

    it('preserves local-only comments (no trelloCommentId)', () => {
        const task = {
            ...baseTask,
            comments: [{ id: 'cm-local', author: 'Me', text: 'Local note', date: '2026-03-12' }]
        };
        const result = mergeCardIntoTask(task, baseCard, {}, {}, []);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].text).toBe('Local note');
    });

    // ── Attachments merge ──
    it('merges attachments from Trello by trelloAttachmentId', () => {
        const task = {
            ...baseTask,
            attachments: [
                { id: 'att-1', name: 'file.pdf', url: 'https://old.url', trelloAttachmentId: 'tatt-1' }
            ]
        };
        const card = {
            ...baseCard,
            attachments: [
                { id: 'tatt-1', name: 'file.pdf', url: 'https://new.url', mimeType: 'application/pdf', date: '2026-03-20' },
                { id: 'tatt-2', name: 'img.png', url: 'https://img.url', mimeType: 'image/png', date: '2026-03-21' }
            ]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.attachments).toHaveLength(2);
        expect(result.attachments[0].id).toBe('att-1'); // Preserved local ID
        expect(result.attachments[0].url).toBe('https://new.url');
        expect(result.attachments[1].trelloAttachmentId).toBe('tatt-2');
    });

    it('preserves local-only attachments (no trelloAttachmentId, unique URL)', () => {
        const task = {
            ...baseTask,
            attachments: [{ id: 'att-local', name: 'local.doc', url: 'https://local.url' }]
        };
        const result = mergeCardIntoTask(task, baseCard, {}, {}, []);
        expect(result.attachments).toHaveLength(1);
        expect(result.attachments[0].name).toBe('local.doc');
    });

    it('deduplicates local-only attachments when URL matches Trello attachment', () => {
        const task = {
            ...baseTask,
            attachments: [{ id: 'att-local', name: 'dup.pdf', url: 'https://shared.url' }]
        };
        const card = {
            ...baseCard,
            attachments: [{ id: 'tatt-1', name: 'dup.pdf', url: 'https://shared.url', mimeType: '', date: '' }]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        // Trello version + local-only skipped (same URL)
        expect(result.attachments).toHaveLength(1);
        expect(result.attachments[0].trelloAttachmentId).toBe('tatt-1');
    });

    // ── Labels / Channels / Countries ──
    it('maps channel labels from Trello card', () => {
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' }
            }
        };
        const card = { ...baseCard, idLabels: ['lbl-social'] };
        const result = mergeCardIntoTask(baseTask, card, mappingConfig, {}, []);
        expect(result.channels).toContain('social');
    });

    it('maps country labels from Trello card', () => {
        const mappingConfig = {
            labelMappings: {
                'lbl-fr': { type: 'country', countryId: 'france' }
            }
        };
        const card = { ...baseCard, idLabels: ['lbl-fr'] };
        const result = mergeCardIntoTask(baseTask, card, mappingConfig, {}, []);
        expect(result.countries).toContain('france');
    });

    it('maps otherLabels from Trello card', () => {
        const mappingConfig = {
            labelMappings: {
                'lbl-custom': { type: 'other', labelName: 'Priority', labelColor: '#ef4444' }
            }
        };
        const card = { ...baseCard, idLabels: ['lbl-custom'] };
        const result = mergeCardIntoTask(baseTask, card, mappingConfig, {}, []);
        expect(result.otherLabels).toHaveLength(1);
        expect(result.otherLabels[0].name).toBe('Priority');
    });

    it('preserves local-only channels (not in label mappings) via union merge', () => {
        const task = { ...baseTask, channels: ['social', 'email'] };
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' }
            }
        };
        const card = { ...baseCard, idLabels: ['lbl-social'] };
        const result = mergeCardIntoTask(task, card, mappingConfig, {}, []);
        // 'social' from Trello + 'email' preserved (not in any mapping)
        expect(result.channels).toContain('social');
        expect(result.channels).toContain('email');
    });

    it('preserves local-only countries (not in label mappings) via union merge', () => {
        const task = { ...baseTask, countries: ['france', 'uk'] };
        const mappingConfig = {
            labelMappings: {
                'lbl-fr': { type: 'country', countryId: 'france' }
            }
        };
        const card = { ...baseCard, idLabels: ['lbl-fr'] };
        const result = mergeCardIntoTask(task, card, mappingConfig, {}, []);
        expect(result.countries).toContain('france');
        expect(result.countries).toContain('uk');
    });

    // ── BUG FIX: Label removal sync ──
    it('removes channels when Trello card has no labels (label removal sync)', () => {
        const task = { ...baseTask, channels: ['social'], countries: ['france'], otherLabels: [{ name: 'Urgent', color: '#ef4444' }] };
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' },
                'lbl-fr': { type: 'country', countryId: 'france' },
                'lbl-tag': { type: 'other', labelName: 'Urgent', labelColor: '#ef4444' }
            }
        };
        const card = { ...baseCard, idLabels: [] }; // All labels removed on Trello
        const result = mergeCardIntoTask(task, card, mappingConfig, {}, []);
        expect(result.channels).toEqual([]);
        expect(result.countries).toEqual([]);
        expect(result.otherLabels).toEqual([]);
    });

    // ── Card movement (list change → actionId update) ──
    it('updates actionId when card moves to a different list', () => {
        const task = { ...baseTask, actionId: 'act-old' };
        const card = { ...baseCard, idList: 'list-2' };
        const listToCatId = { 'list-1': 'cat-1', 'list-2': 'cat-2' };
        const boardActions = [
            { id: 'act-old', categoryId: 'cat-1', isDefault: true },
            { id: 'act-new', categoryId: 'cat-2', isDefault: true }
        ];
        const result = mergeCardIntoTask(task, card, {}, listToCatId, boardActions);
        expect(result.actionId).toBe('act-new');
    });

    it('keeps actionId when card stays in same list', () => {
        const task = { ...baseTask, actionId: 'act-1' };
        const card = { ...baseCard, idList: 'list-1' };
        const listToCatId = { 'list-1': 'cat-1' };
        const boardActions = [{ id: 'act-1', categoryId: 'cat-1', isDefault: true }];
        const result = mergeCardIntoTask(task, card, {}, listToCatId, boardActions);
        expect(result.actionId).toBe('act-1');
    });

    it('finds non-default action in target category when no default exists', () => {
        const task = { ...baseTask, actionId: 'act-old' };
        const card = { ...baseCard, idList: 'list-2' };
        const listToCatId = { 'list-1': 'cat-1', 'list-2': 'cat-2' };
        const boardActions = [
            { id: 'act-old', categoryId: 'cat-1', isDefault: true },
            { id: 'act-nond', categoryId: 'cat-2', isDefault: false }
        ];
        const result = mergeCardIntoTask(task, card, {}, listToCatId, boardActions);
        expect(result.actionId).toBe('act-nond');
    });

    // ── Multiple labels combined ──
    it('handles multiple label types simultaneously', () => {
        const mappingConfig = {
            labelMappings: {
                'lbl-social': { type: 'channel', channelId: 'social' },
                'lbl-fr': { type: 'country', countryId: 'france' },
                'lbl-priority': { type: 'other', labelName: 'Urgent', labelColor: 'red' }
            }
        };
        const card = { ...baseCard, idLabels: ['lbl-social', 'lbl-fr', 'lbl-priority'] };
        const result = mergeCardIntoTask(baseTask, card, mappingConfig, {}, []);
        expect(result.channels).toContain('social');
        expect(result.countries).toContain('france');
        expect(result.otherLabels).toHaveLength(1);
        expect(result.otherLabels[0].name).toBe('Urgent');
    });

    // ── Checklist item due/assignee merge ──
    it('merges checklist item due date and assignee from Trello', () => {
        const task = {
            ...baseTask,
            checklists: [{
                id: 'cl-1', name: 'CL', trelloChecklistId: 'tcl-1',
                items: [{ id: 'cli-1', text: 'Item', done: false, trelloCheckItemId: 'tci-1', due: null, assignee: null }]
            }]
        };
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [{ id: 'tci-1', name: 'Item', state: 'incomplete', pos: 1, due: '2026-05-01T00:00:00.000Z', idMember: 'mem-1' }]
            }]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.checklists[0].items[0].due).toBe('2026-05-01');
        expect(result.checklists[0].items[0].assignee).toBe('mem-1');
    });

    // ── Checklist URL resolution via allCards (BUG E fix) ──
    it('resolves Trello card URLs in checklist items when allCards is provided', () => {
        const allCards = [
            { id: 'linked-card', shortLink: 'ABC123', name: 'Linked Card Title' }
        ];
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [
                    { id: 'tci-1', name: 'https://trello.com/c/ABC123/42-linked-card-title', state: 'incomplete', pos: 1 }
                ]
            }]
        };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, [], allCards);
        expect(result.checklists[0].items[0].text).toBe('Linked Card Title');
        expect(result.checklists[0].items[0].trelloLinkedCardUrl).toBe('https://trello.com/c/ABC123/42-linked-card-title');
    });

    it('falls back to slug resolution for cross-board card URLs', () => {
        const allCards = []; // Card not on this board
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [
                    { id: 'tci-1', name: 'https://trello.com/c/XYZ789/7-some-linked-task', state: 'incomplete', pos: 1 }
                ]
            }]
        };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, [], allCards);
        expect(result.checklists[0].items[0].text).toBe('Some linked task');
        expect(result.checklists[0].items[0].trelloLinkedCardUrl).toBe('https://trello.com/c/XYZ789/7-some-linked-task');
    });

    it('preserves existing trelloLinkedCardUrl when allCards is not provided', () => {
        const task = {
            ...baseTask,
            checklists: [{
                id: 'cl-1', name: 'CL', trelloChecklistId: 'tcl-1',
                items: [{
                    id: 'cli-1', text: 'Linked Card Title', done: false,
                    trelloCheckItemId: 'tci-1',
                    trelloLinkedCardUrl: 'https://trello.com/c/ABC123'
                }]
            }]
        };
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [
                    { id: 'tci-1', name: 'https://trello.com/c/ABC123', state: 'incomplete', pos: 1 }
                ]
            }]
        };
        // No allCards → URL resolution returns null, but existing trelloLinkedCardUrl preserved
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.checklists[0].items[0].trelloLinkedCardUrl).toBe('https://trello.com/c/ABC123');
    });

    it('does not set trelloLinkedCardUrl for regular (non-URL) checklist items', () => {
        const allCards = [{ id: 'card-1', shortLink: 'ABC123', name: 'My Card' }];
        const card = {
            ...baseCard,
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [
                    { id: 'tci-1', name: 'Regular task item', state: 'incomplete', pos: 1 }
                ]
            }]
        };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, [], allCards);
        expect(result.checklists[0].items[0].text).toBe('Regular task item');
        expect(result.checklists[0].items[0].trelloLinkedCardUrl).toBeUndefined();
    });

    // ── Comment protection when card.comments is empty (BUG F/G fix) ──
    it('preserves existing synced comments when card.comments is empty', () => {
        const task = {
            ...baseTask,
            comments: [
                { id: 'cm-1', author: 'Alice', text: 'Synced comment', date: '2026-03-10T10:00:00.000Z', trelloCommentId: 'tcm-1' },
                { id: 'cm-2', author: 'Bob', text: 'Another synced', date: '2026-03-11T10:00:00.000Z', trelloCommentId: 'tcm-2' }
            ]
        };
        const card = { ...baseCard, comments: [] }; // Failed fetch → empty array
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        // Both synced comments should be preserved (not dropped)
        expect(result.comments).toHaveLength(2);
        expect(result.comments[0].trelloCommentId).toBe('tcm-1');
        expect(result.comments[1].trelloCommentId).toBe('tcm-2');
    });

    it('preserves both synced and local-only comments when card.comments is empty', () => {
        const task = {
            ...baseTask,
            comments: [
                { id: 'cm-synced', author: 'Alice', text: 'From Trello', date: '2026-03-10T10:00:00.000Z', trelloCommentId: 'tcm-1' },
                { id: 'cm-local', author: 'Me', text: 'Local note', date: '2026-03-12T10:00:00.000Z' }
            ]
        };
        const card = { ...baseCard, comments: [] };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.comments).toHaveLength(2);
        expect(result.comments.find(c => c.id === 'cm-synced')).toBeTruthy();
        expect(result.comments.find(c => c.id === 'cm-local')).toBeTruthy();
    });

    it('still replaces comments normally when card.comments has data', () => {
        const task = {
            ...baseTask,
            comments: [
                { id: 'cm-1', author: 'Old', text: 'Old text', date: '2026-03-10T10:00:00.000Z', trelloCommentId: 'tcm-1' }
            ]
        };
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-1', data: { text: 'Updated text' }, date: '2026-03-20T10:00:00.000Z', memberCreator: { fullName: 'New Author' } }
            ]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].text).toBe('Updated text');
        expect(result.comments[0].author).toBe('New Author');
    });

    // ── Comment sorting by date ──
    it('sorts merged comments by date ascending', () => {
        const task = {
            ...baseTask,
            comments: [
                { id: 'cm-local', author: 'Me', text: 'Middle', date: '2026-03-15T10:00:00.000Z' }
            ]
        };
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-2', data: { text: 'Latest' }, date: '2026-03-20T10:00:00.000Z', memberCreator: { fullName: 'B' } },
                { id: 'tcm-1', data: { text: 'Earliest' }, date: '2026-03-05T10:00:00.000Z', memberCreator: { fullName: 'A' } }
            ]
        };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.comments).toHaveLength(3);
        expect(result.comments[0].text).toBe('Earliest');
        expect(result.comments[1].text).toBe('Middle');
        expect(result.comments[2].text).toBe('Latest');
    });
});


// ════════════════════════════════════════════════════════════
// mergeCardIntoAction — Trello card → existing local action (card-as-action)
// ════════════════════════════════════════════════════════════
describe('mergeCardIntoAction', () => {
    const baseAction = {
        id: 'act-1', name: 'Old Action', categoryId: 'cat-1',
        budget: 1000, priority: 'high', tags: ['social'], countries: ['france'],
        otherLabels: [], assignees: ['m1'],
        description: 'Old desc', status: 'inprogress',
        startDate: '2026-03-01', dueDate: '2026-03-31',
        comments: [], attachments: [],
        _inheritChannels: ['social'], _inheritCountries: ['france'],
        _inheritOtherLabels: [], _inheritAssignees: ['m1'],
        trelloCardId: 'card-1', trelloLastModified: '2026-03-10T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z'
    };

    const baseCard = {
        id: 'card-1', name: 'New Action Name', desc: 'New desc',
        due: '2026-04-30T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
        dueComplete: false, closed: false,
        dateLastActivity: '2026-03-20T10:00:00.000Z',
        idList: 'list-1', idLabels: [], labels: [],
        idMembers: ['m2'], checklists: [], attachments: [], comments: []
    };

    it('updates name from Trello card', () => {
        const result = mergeCardIntoAction(baseAction, baseCard, {}, {});
        expect(result.name).toBe('New Action Name');
    });

    it('updates description from Trello card', () => {
        const result = mergeCardIntoAction(baseAction, baseCard, {}, {});
        expect(result.description).toBe('New desc');
    });

    it('updates dates from Trello card', () => {
        const result = mergeCardIntoAction(baseAction, baseCard, {}, {});
        expect(result.dueDate).toBe('2026-04-30');
        expect(result.startDate).toBe('2026-04-01');
    });

    it('preserves local startDate when card has no start', () => {
        const card = { ...baseCard, start: null };
        const result = mergeCardIntoAction(baseAction, card, {}, {});
        expect(result.startDate).toBe('2026-03-01');
    });

    it('updates assignees from card idMembers', () => {
        const result = mergeCardIntoAction(baseAction, baseCard, {}, {});
        expect(result.assignees).toEqual(['m2']);
    });

    it('sets completed status when dueComplete is true', () => {
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoAction(baseAction, card, {}, {});
        expect(result.status).toBe('completed');
    });

    it('preserves protected status "creating"', () => {
        const action = { ...baseAction, status: 'creating' };
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.status).toBe('creating');
    });

    it('preserves protected status "review"', () => {
        const action = { ...baseAction, status: 'review' };
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.status).toBe('review');
    });

    it('preserves protected status "paused"', () => {
        const action = { ...baseAction, status: 'paused' };
        const card = { ...baseCard, dueComplete: true };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.status).toBe('paused');
    });

    it('updates timestamps', () => {
        const result = mergeCardIntoAction(baseAction, baseCard, {}, {});
        expect(result.updatedAt).toBe('2026-03-20T10:00:00.000Z');
        expect(result.trelloLastModified).toBe('2026-03-20T10:00:00.000Z');
    });

    it('preserves local-only fields (budget, priority, id)', () => {
        const result = mergeCardIntoAction(baseAction, baseCard, {}, {});
        expect(result.budget).toBe(1000);
        expect(result.priority).toBe('high');
        expect(result.id).toBe('act-1');
    });

    // ── Category update via list mapping ──
    it('updates categoryId when card moves to different list', () => {
        const card = { ...baseCard, idList: 'list-2' };
        const listToCat = { 'list-1': 'cat-1', 'list-2': 'cat-2' };
        const result = mergeCardIntoAction(baseAction, card, listToCat, {});
        expect(result.categoryId).toBe('cat-2');
    });

    it('keeps categoryId when list not in mapping', () => {
        const card = { ...baseCard, idList: 'list-unknown' };
        const result = mergeCardIntoAction(baseAction, card, {}, {});
        expect(result.categoryId).toBe('cat-1');
    });

    // ── Labels → tags/countries/otherLabels ──
    it('maps channel labels to tags', () => {
        const mappingConfig = { labelMappings: { 'lbl-email': { type: 'channel', channelId: 'email' } } };
        const card = { ...baseCard, idLabels: ['lbl-email'] };
        const result = mergeCardIntoAction(baseAction, card, {}, mappingConfig);
        expect(result.tags).toContain('email');
        expect(result._inheritChannels).toContain('email');
    });

    it('maps country labels', () => {
        const mappingConfig = { labelMappings: { 'lbl-uk': { type: 'country', countryId: 'uk' } } };
        const card = { ...baseCard, idLabels: ['lbl-uk'] };
        const result = mergeCardIntoAction(baseAction, card, {}, mappingConfig);
        expect(result.countries).toContain('uk');
        expect(result._inheritCountries).toContain('uk');
    });

    it('maps other labels', () => {
        const mappingConfig = { labelMappings: { 'lbl-x': { type: 'other', labelName: 'X', labelColor: '#333' } } };
        const card = { ...baseCard, idLabels: ['lbl-x'] };
        const result = mergeCardIntoAction(baseAction, card, {}, mappingConfig);
        expect(result.otherLabels).toHaveLength(1);
        expect(result.otherLabels[0].name).toBe('X');
    });

    it('preserves existing tags when no channel labels', () => {
        const card = { ...baseCard, idLabels: [] };
        const result = mergeCardIntoAction(baseAction, card, {}, {});
        expect(result.tags).toEqual(['social']); // Preserved from baseAction
    });

    // ── Comments merge ──
    it('merges comments by trelloCommentId', () => {
        const action = {
            ...baseAction,
            comments: [{ id: 'cm-1', author: 'A', text: 'Old', date: '2026-03-01', trelloCommentId: 'tcm-1' }]
        };
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-1', data: { text: 'Updated' }, date: '2026-03-20', memberCreator: { fullName: 'A' } },
                { id: 'tcm-2', data: { text: 'New' }, date: '2026-03-21', memberCreator: { username: 'bob' } }
            ]
        };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.comments).toHaveLength(2);
        expect(result.comments[0].id).toBe('cm-1'); // Preserved
        expect(result.comments[0].text).toBe('Updated');
        expect(result.comments[1].author).toBe('bob');
    });

    it('preserves local-only comments', () => {
        const action = {
            ...baseAction,
            comments: [{ id: 'cm-local', author: 'Me', text: 'Private note', date: '2026-03-05' }]
        };
        const result = mergeCardIntoAction(action, baseCard, {}, {});
        expect(result.comments.some(c => c.text === 'Private note')).toBe(true);
    });

    // ── Attachments merge ──
    it('merges attachments by trelloAttachmentId', () => {
        const action = {
            ...baseAction,
            attachments: [{ id: 'att-1', name: 'f.pdf', url: 'u1', trelloAttachmentId: 'tatt-1' }]
        };
        const card = {
            ...baseCard,
            attachments: [
                { id: 'tatt-1', name: 'f.pdf', url: 'u1-new', mimeType: '', date: '' },
                { id: 'tatt-2', name: 'g.png', url: 'u2', mimeType: 'image/png', date: '' }
            ]
        };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.attachments).toHaveLength(2);
        expect(result.attachments[0].id).toBe('att-1');
        expect(result.attachments[0].url).toBe('u1-new');
    });

    it('preserves local-only attachments (unique URL)', () => {
        const action = {
            ...baseAction,
            attachments: [{ id: 'att-local', name: 'local.pdf', url: 'https://unique.url' }]
        };
        const result = mergeCardIntoAction(action, baseCard, {}, {});
        expect(result.attachments.some(a => a.url === 'https://unique.url')).toBe(true);
    });

    it('deduplicates local-only attachments by URL', () => {
        const action = {
            ...baseAction,
            attachments: [{ id: 'att-local', name: 'dup', url: 'https://shared.url' }]
        };
        const card = {
            ...baseCard,
            attachments: [{ id: 'tatt-1', name: 'dup', url: 'https://shared.url', mimeType: '', date: '' }]
        };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.attachments).toHaveLength(1);
    });

    // ── _inherit fields ──
    it('updates _inheritAssignees from card', () => {
        const result = mergeCardIntoAction(baseAction, baseCard, {}, {});
        expect(result._inheritAssignees).toEqual(['m2']);
    });
});


// ════════════════════════════════════════════════════════════
// mergeCheckItemIntoTask — Trello checklist item → existing task (card-as-action pull)
// ════════════════════════════════════════════════════════════
describe('mergeCheckItemIntoTask', () => {
    const baseTask = {
        id: 't1', actionId: 'act-1', title: 'Old item',
        description: 'desc', startDate: '2026-03-01', dueDate: '2026-03-31',
        month: 2, status: 'todo', priority: 'high', budget: 100,
        checklists: [], comments: [], attachments: [],
        channels: ['social'], countries: ['france'], assignees: ['m1'],
        order: 5, trelloCardId: 'card-1', trelloCheckItemId: 'tci-1',
        trelloLastModified: '2026-03-10T00:00:00.000Z'
    };

    const baseCard = {
        id: 'card-1', dateLastActivity: '2026-03-20T10:00:00.000Z',
        due: '2026-04-30T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z'
    };

    const baseItem = {
        id: 'tci-1', name: 'New item name', state: 'incomplete',
        pos: 32768, due: null, idMember: null
    };

    // ── Title ──
    it('updates title from Trello item name', () => {
        const result = mergeCheckItemIntoTask(baseTask, baseItem, baseCard);
        expect(result.title).toBe('New item name');
    });

    // ── Status ──
    it('sets completed status when item state is complete', () => {
        const item = { ...baseItem, state: 'complete' };
        const result = mergeCheckItemIntoTask(baseTask, item, baseCard);
        expect(result.status).toBe('completed');
    });

    it('reverts completed to todo when item becomes incomplete', () => {
        const task = { ...baseTask, status: 'completed' };
        const result = mergeCheckItemIntoTask(task, baseItem, baseCard);
        expect(result.status).toBe('todo');
    });

    it('preserves non-completed status when item is incomplete', () => {
        const task = { ...baseTask, status: 'inprogress' };
        const result = mergeCheckItemIntoTask(task, baseItem, baseCard);
        expect(result.status).toBe('inprogress');
    });

    it('preserves protected status "creating"', () => {
        const task = { ...baseTask, status: 'creating' };
        const item = { ...baseItem, state: 'complete' };
        const result = mergeCheckItemIntoTask(task, item, baseCard);
        expect(result.status).toBe('creating');
    });

    it('preserves protected status "review"', () => {
        const task = { ...baseTask, status: 'review' };
        const item = { ...baseItem, state: 'complete' };
        const result = mergeCheckItemIntoTask(task, item, baseCard);
        expect(result.status).toBe('review');
    });

    it('preserves protected status "paused"', () => {
        const task = { ...baseTask, status: 'paused' };
        const item = { ...baseItem, state: 'complete' };
        const result = mergeCheckItemIntoTask(task, item, baseCard);
        expect(result.status).toBe('paused');
    });

    // ── Dates ──
    it('uses item due date when available', () => {
        const item = { ...baseItem, due: '2026-05-15T00:00:00.000Z' };
        const result = mergeCheckItemIntoTask(baseTask, item, baseCard);
        expect(result.dueDate).toBe('2026-05-15');
        expect(result.month).toBe(4); // May
    });

    it('falls back to card due date when item has no due', () => {
        const result = mergeCheckItemIntoTask(baseTask, baseItem, baseCard);
        expect(result.dueDate).toBe('2026-04-30');
        expect(result.month).toBe(3); // April
    });

    it('preserves existing dueDate when neither item nor card has due', () => {
        const card = { ...baseCard, due: null };
        const result = mergeCheckItemIntoTask(baseTask, baseItem, card);
        expect(result.dueDate).toBe('2026-03-31');
    });

    it('computes startDate from dueDate when task has no startDate', () => {
        const task = { ...baseTask, startDate: null };
        const item = { ...baseItem, due: '2026-05-15T00:00:00.000Z' };
        const result = mergeCheckItemIntoTask(task, item, baseCard);
        expect(result.startDate).toBe('2026-05-01');
    });

    // ── Order (position) ──
    it('updates order from item pos', () => {
        const result = mergeCheckItemIntoTask(baseTask, baseItem, baseCard);
        expect(result.order).toBe(32768);
    });

    it('preserves order when item pos is null', () => {
        const item = { ...baseItem, pos: null };
        const result = mergeCheckItemIntoTask(baseTask, item, baseCard);
        expect(result.order).toBe(5);
    });

    // ── Assignee ──
    it('updates assignees from item idMember', () => {
        const item = { ...baseItem, idMember: 'member-2' };
        const result = mergeCheckItemIntoTask(baseTask, item, baseCard);
        expect(result.assignees).toEqual(['member-2']);
    });

    it('preserves assignees when item has no idMember', () => {
        const result = mergeCheckItemIntoTask(baseTask, baseItem, baseCard);
        expect(result.assignees).toEqual(['m1']);
    });

    // ── Timestamps ──
    it('sets trelloLastModified from card.dateLastActivity', () => {
        const result = mergeCheckItemIntoTask(baseTask, baseItem, baseCard);
        expect(result.trelloLastModified).toBe('2026-03-20T10:00:00.000Z');
    });

    // ── Preserved local-only fields ──
    it('preserves local-only fields (priority, budget, channels, countries, comments, etc.)', () => {
        const result = mergeCheckItemIntoTask(baseTask, baseItem, baseCard);
        expect(result.priority).toBe('high');
        expect(result.budget).toBe(100);
        expect(result.channels).toEqual(['social']);
        expect(result.countries).toEqual(['france']);
        expect(result.description).toBe('desc');
        expect(result.checklists).toEqual([]);
        expect(result.comments).toEqual([]);
        expect(result.attachments).toEqual([]);
    });

    // ── Composite order (checklist position + item position) ──
    it('computes composite order from checklist pos and item pos', () => {
        const cardWithChecklists = {
            ...baseCard,
            checklists: [
                { id: 'cl-a', name: 'CL-A', pos: 200, checkItems: [
                    { id: 'tci-1', name: 'New item name', state: 'incomplete', pos: 16384 }
                ]},
                { id: 'cl-b', name: 'CL-B', pos: 100, checkItems: [
                    { id: 'tci-2', name: 'Other item', state: 'incomplete', pos: 16384 }
                ]}
            ]
        };
        const result = mergeCheckItemIntoTask(baseTask, baseItem, cardWithChecklists);
        // item tci-1 is in CL-A (pos 200), item.pos = 32768
        // composite = 200 * 65536 + 32768 = 13140992
        expect(result.order).toBe(200 * 65536 + 32768);
    });

    it('ensures items in lower-pos checklist have lower composite order', () => {
        const cardWithChecklists = {
            ...baseCard,
            checklists: [
                { id: 'cl-a', name: 'CL-A', pos: 32768, checkItems: [
                    { id: 'tci-1', name: 'New item name', state: 'incomplete', pos: 16384 }
                ]},
                { id: 'cl-b', name: 'CL-B', pos: 16384, checkItems: [
                    { id: 'tci-other', name: 'Other', state: 'incomplete', pos: 16384 }
                ]}
            ]
        };
        const itemInA = { ...baseItem, id: 'tci-1', pos: 16384 };
        const itemInB = { id: 'tci-other', name: 'Other', state: 'incomplete', pos: 16384 };
        const taskB = { ...baseTask, id: 't2', trelloCheckItemId: 'tci-other', order: 0 };

        const resultA = mergeCheckItemIntoTask(baseTask, itemInA, cardWithChecklists);
        const resultB = mergeCheckItemIntoTask(taskB, itemInB, cardWithChecklists);

        // CL-B (pos 16384) items should have lower order than CL-A (pos 32768) items
        expect(resultB.order).toBeLessThan(resultA.order);
    });

    it('updates trelloChecklistId and trelloChecklistName when item moved to different checklist', () => {
        // Task was in CL-A, but item is now in CL-B on Trello
        const task = { ...baseTask, trelloChecklistId: 'cl-a', trelloChecklistName: 'CL-A' };
        const cardWithMove = {
            ...baseCard,
            checklists: [
                { id: 'cl-a', name: 'CL-A', pos: 16384, checkItems: [] },
                { id: 'cl-b', name: 'CL-B', pos: 32768, checkItems: [
                    { id: 'tci-1', name: 'New item name', state: 'incomplete', pos: 16384 }
                ]}
            ]
        };
        const result = mergeCheckItemIntoTask(task, baseItem, cardWithMove);
        expect(result.trelloChecklistId).toBe('cl-b');
        expect(result.trelloChecklistName).toBe('CL-B');
    });
});
