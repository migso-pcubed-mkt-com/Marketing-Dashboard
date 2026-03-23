// Comprehensive tests for extras/push mapping functions in trelloMapping.js
// Covers: mergeTrelloExtrasIntoTask, mapTaskToTrelloCardUpdate, mapActionToTrelloCardUpdate, mapTaskToCheckItemUpdate
import { describe, it, expect } from 'vitest';
import {
    mergeTrelloExtrasIntoTask,
    mapTaskToTrelloCardUpdate,
    mapActionToTrelloCardUpdate,
    mapTaskToCheckItemUpdate
} from '../lib/trelloMapping.js';

// ════════════════════════════════════════════════════════════
// mergeTrelloExtrasIntoTask — after push, merge new Trello extras into local task
// ════════════════════════════════════════════════════════════
describe('mergeTrelloExtrasIntoTask', () => {
    const baseTask = {
        id: 't1', title: 'Task',
        checklists: [], comments: [], attachments: [],
        channels: [], countries: [], otherLabels: []
    };

    it('returns task unchanged when card is null', () => {
        const result = mergeTrelloExtrasIntoTask(baseTask, null);
        expect(result).toBe(baseTask);
    });

    // ── Checklists ──
    it('adds new Trello checklists not present locally', () => {
        const task = { ...baseTask, checklists: [] };
        const card = {
            checklists: [{
                id: 'tcl-1', name: 'QA', pos: 16384,
                checkItems: [{ id: 'tci-1', name: 'Test A', state: 'incomplete', pos: 100 }]
            }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.checklists).toHaveLength(1);
        expect(result.checklists[0].trelloChecklistId).toBe('tcl-1');
        expect(result.checklists[0].items[0].trelloCheckItemId).toBe('tci-1');
    });

    it('adds new checklist items to existing local checklists', () => {
        const task = {
            ...baseTask,
            checklists: [{
                id: 'cl-1', name: 'Dev', trelloChecklistId: 'tcl-1',
                items: [{ id: 'cli-1', text: 'Step 1', done: false, trelloCheckItemId: 'tci-1' }]
            }]
        };
        const card = {
            checklists: [{
                id: 'tcl-1', name: 'Dev', pos: 16384,
                checkItems: [
                    { id: 'tci-1', name: 'Step 1', state: 'complete', pos: 100 },
                    { id: 'tci-2', name: 'Step 2', state: 'incomplete', pos: 200 }
                ]
            }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.checklists[0].items).toHaveLength(2);
        expect(result.checklists[0].items[0].done).toBe(true); // Updated
        expect(result.checklists[0].items[1].text).toBe('Step 2'); // New
    });

    it('removes local checklists deleted from Trello', () => {
        const task = {
            ...baseTask,
            checklists: [
                { id: 'cl-1', name: 'Deleted', trelloChecklistId: 'tcl-gone', items: [] },
                { id: 'cl-2', name: 'Kept', trelloChecklistId: 'tcl-kept', items: [] }
            ]
        };
        const card = {
            checklists: [{ id: 'tcl-kept', name: 'Kept', pos: 1, checkItems: [] }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.checklists).toHaveLength(1);
        expect(result.checklists[0].trelloChecklistId).toBe('tcl-kept');
    });

    it('removes local items deleted from Trello checklist', () => {
        const task = {
            ...baseTask,
            checklists: [{
                id: 'cl-1', name: 'CL', trelloChecklistId: 'tcl-1',
                items: [
                    { id: 'cli-1', text: 'Keep', done: false, trelloCheckItemId: 'tci-keep' },
                    { id: 'cli-2', text: 'Delete', done: false, trelloCheckItemId: 'tci-gone' }
                ]
            }]
        };
        const card = {
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [{ id: 'tci-keep', name: 'Keep', state: 'incomplete', pos: 1 }]
            }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.checklists[0].items).toHaveLength(1);
        expect(result.checklists[0].items[0].text).toBe('Keep');
    });

    it('sorts checklists and items by Trello pos (order)', () => {
        const task = { ...baseTask, checklists: [] };
        const card = {
            checklists: [
                { id: 'tcl-b', name: 'B', pos: 30000, checkItems: [
                    { id: 'tci-b2', name: 'B2', state: 'incomplete', pos: 200 },
                    { id: 'tci-b1', name: 'B1', state: 'incomplete', pos: 100 }
                ] },
                { id: 'tcl-a', name: 'A', pos: 10000, checkItems: [] }
            ]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.checklists[0].name).toBe('A');
        expect(result.checklists[1].name).toBe('B');
        expect(result.checklists[1].items[0].text).toBe('B1');
        expect(result.checklists[1].items[1].text).toBe('B2');
    });

    it('captures order from Trello pos on checklists and items', () => {
        const task = { ...baseTask, checklists: [] };
        const card = {
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 42000,
                checkItems: [{ id: 'tci-1', name: 'Item', state: 'incomplete', pos: 7000 }]
            }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.checklists[0].order).toBe(42000);
        expect(result.checklists[0].items[0].order).toBe(7000);
    });

    it('updates existing item state, due, assignee from Trello', () => {
        const task = {
            ...baseTask,
            checklists: [{
                id: 'cl-1', name: 'CL', trelloChecklistId: 'tcl-1',
                items: [{ id: 'cli-1', text: 'Item', done: false, trelloCheckItemId: 'tci-1', due: null, assignee: null }]
            }]
        };
        const card = {
            checklists: [{
                id: 'tcl-1', name: 'CL', pos: 1,
                checkItems: [{ id: 'tci-1', name: 'Item', state: 'complete', pos: 1, due: '2026-06-01T00:00:00.000Z', idMember: 'mem-1' }]
            }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.checklists[0].items[0].done).toBe(true);
        expect(result.checklists[0].items[0].due).toBe('2026-06-01');
        expect(result.checklists[0].items[0].assignee).toBe('mem-1');
    });

    it('pulls all Trello checklists when task has no local checklists', () => {
        const card = {
            checklists: [
                { id: 'tcl-1', name: 'CL1', pos: 100, checkItems: [{ id: 'i1', name: 'A', state: 'complete', pos: 1 }] },
                { id: 'tcl-2', name: 'CL2', pos: 200, checkItems: [] }
            ]
        };
        const result = mergeTrelloExtrasIntoTask(baseTask, card);
        expect(result.checklists).toHaveLength(2);
        expect(result.checklists[0].items[0].done).toBe(true);
    });

    // ── Comments ──
    it('adds new Trello comments not present locally', () => {
        const card = {
            comments: [
                { id: 'tcm-1', data: { text: 'Hello' }, date: '2026-03-20', memberCreator: { fullName: 'Alice' } }
            ]
        };
        const result = mergeTrelloExtrasIntoTask(baseTask, card);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].text).toBe('Hello');
        expect(result.comments[0].trelloCommentId).toBe('tcm-1');
    });

    it('deduplicates comments by trelloCommentId', () => {
        const task = {
            ...baseTask,
            comments: [{ id: 'cm-1', text: 'Hello', trelloCommentId: 'tcm-1' }]
        };
        const card = {
            comments: [{ id: 'tcm-1', data: { text: 'Hello' }, date: '2026-03-20', memberCreator: { fullName: 'A' } }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.comments).toHaveLength(1);
    });

    it('deduplicates comments by text content', () => {
        const task = {
            ...baseTask,
            comments: [{ id: 'cm-local', text: 'Same text' }]
        };
        const card = {
            comments: [{ id: 'tcm-new', data: { text: 'Same text' }, date: '2026-03-20', memberCreator: { fullName: 'A' } }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.comments).toHaveLength(1);
    });

    it('captures trelloCommentId for local comments matching by text', () => {
        const task = {
            ...baseTask,
            comments: [{ id: 'cm-local', text: 'Match me' }]
        };
        const card = {
            comments: [{ id: 'tcm-match', data: { text: 'Match me' }, date: '2026-03-20', memberCreator: { fullName: 'A' } }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.comments[0].trelloCommentId).toBe('tcm-match');
    });

    // ── Attachments ──
    it('adds new Trello attachments not present locally', () => {
        const card = {
            attachments: [{ id: 'tatt-1', name: 'doc.pdf', url: 'https://doc.url', mimeType: 'application/pdf', date: '2026-03-20' }]
        };
        const result = mergeTrelloExtrasIntoTask(baseTask, card);
        expect(result.attachments).toHaveLength(1);
        expect(result.attachments[0].trelloAttachmentId).toBe('tatt-1');
    });

    it('deduplicates attachments by trelloAttachmentId', () => {
        const task = {
            ...baseTask,
            attachments: [{ id: 'att-1', name: 'f', url: 'u', trelloAttachmentId: 'tatt-1' }]
        };
        const card = {
            attachments: [{ id: 'tatt-1', name: 'f', url: 'u', mimeType: '', date: '' }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.attachments).toHaveLength(1);
    });

    it('deduplicates attachments by URL', () => {
        const task = {
            ...baseTask,
            attachments: [{ id: 'att-local', name: 'f', url: 'https://same.url' }]
        };
        const card = {
            attachments: [{ id: 'tatt-new', name: 'f', url: 'https://same.url', mimeType: '', date: '' }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.attachments).toHaveLength(1);
    });

    it('captures trelloAttachmentId for local attachments matching by URL', () => {
        const task = {
            ...baseTask,
            attachments: [{ id: 'att-local', name: 'f', url: 'https://same.url' }]
        };
        const card = {
            attachments: [{ id: 'tatt-1', name: 'f', url: 'https://same.url', mimeType: '', date: '' }]
        };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.attachments[0].trelloAttachmentId).toBe('tatt-1');
    });

    // ── Labels re-pull (union merge) ──
    it('re-pulls channel labels and merges with local channels', () => {
        const task = { ...baseTask, channels: ['email'] };
        const mappingConfig = {
            labelMappings: { 'lbl-social': { type: 'channel', channelId: 'social' } }
        };
        const card = { idLabels: ['lbl-social'] };
        const result = mergeTrelloExtrasIntoTask(task, card, mappingConfig);
        expect(result.channels).toContain('social');
        expect(result.channels).toContain('email');
    });

    it('re-pulls country labels and merges with local countries', () => {
        const task = { ...baseTask, countries: ['uk'] };
        const mappingConfig = {
            labelMappings: { 'lbl-fr': { type: 'country', countryId: 'france' } }
        };
        const card = { idLabels: ['lbl-fr'] };
        const result = mergeTrelloExtrasIntoTask(task, card, mappingConfig);
        expect(result.countries).toContain('france');
        expect(result.countries).toContain('uk');
    });

    it('re-pulls otherLabels and adds new ones', () => {
        const task = {
            ...baseTask,
            otherLabels: [{ id: 'lbl-existing', name: 'Existing', color: '#333' }]
        };
        const mappingConfig = {
            labelMappings: { 'lbl-new': { type: 'other', labelName: 'New', labelColor: '#999' } }
        };
        const card = { idLabels: ['lbl-new'] };
        const result = mergeTrelloExtrasIntoTask(task, card, mappingConfig);
        expect(result.otherLabels).toHaveLength(2);
    });

    it('does not duplicate existing otherLabels on re-pull', () => {
        const task = {
            ...baseTask,
            otherLabels: [{ id: 'lbl-x', name: 'X', color: '#333' }]
        };
        const mappingConfig = {
            labelMappings: { 'lbl-x': { type: 'other', labelName: 'X', labelColor: '#333' } }
        };
        const card = { idLabels: ['lbl-x'] };
        const result = mergeTrelloExtrasIntoTask(task, card, mappingConfig);
        expect(result.otherLabels).toHaveLength(1);
    });

    it('does not touch labels when no mappingConfig', () => {
        const task = { ...baseTask, channels: ['email'] };
        const card = { idLabels: ['lbl-social'] };
        const result = mergeTrelloExtrasIntoTask(task, card);
        expect(result.channels).toEqual(['email']);
    });

    // ── otherLabels color: Trello named color fallback ──
    it('converts Trello named color to hex for otherLabels', () => {
        const mappingConfig = {
            labelMappings: { 'lbl-x': { type: 'other', labelName: 'X', labelColor: 'red' } }
        };
        const card = { idLabels: ['lbl-x'] };
        const result = mergeTrelloExtrasIntoTask(baseTask, card, mappingConfig);
        expect(result.otherLabels[0].color).toBe('#ef4444');
    });
});


// ════════════════════════════════════════════════════════════
// mapTaskToTrelloCardUpdate — local task → Trello card update payload
// ════════════════════════════════════════════════════════════
describe('mapTaskToTrelloCardUpdate', () => {
    it('maps title to name', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'My Task' });
        expect(result.name).toBe('My Task');
    });

    it('maps description to desc', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T', description: 'A desc' });
        expect(result.desc).toBe('A desc');
    });

    it('does not include desc when description is null', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T' });
        expect(result).not.toHaveProperty('desc');
    });

    it('maps startDate to start', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T', startDate: '2026-04-01' });
        expect(result.start).toBe('2026-04-01');
    });

    it('maps dueDate to due', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T', dueDate: '2026-04-30' });
        expect(result.due).toBe('2026-04-30');
    });

    it('maps completed status to dueComplete=true', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T', status: 'completed' });
        expect(result.dueComplete).toBe('true');
    });

    it('maps non-completed status to dueComplete=false', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T', status: 'inprogress' });
        expect(result.dueComplete).toBe('false');
    });

    it('maps listId to idList when provided', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T' }, 'list-123');
        expect(result.idList).toBe('list-123');
    });

    it('does not include idList when not provided', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T' });
        expect(result).not.toHaveProperty('idList');
    });

    it('maps assignees to idMembers (comma-separated)', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T', assignees: ['m1', 'm2'] });
        expect(result.idMembers).toBe('m1,m2');
    });

    it('sets idMembers to empty string when no assignees', () => {
        const result = mapTaskToTrelloCardUpdate({ title: 'T', assignees: [] });
        expect(result.idMembers).toBe('');
    });

    it('handles all fields together', () => {
        const result = mapTaskToTrelloCardUpdate({
            title: 'Full Task', description: 'Desc',
            startDate: '2026-04-01', dueDate: '2026-04-30',
            status: 'completed', assignees: ['m1']
        }, 'list-1');
        expect(result).toEqual({
            name: 'Full Task', desc: 'Desc',
            start: '2026-04-01', due: '2026-04-30',
            dueComplete: 'true', idList: 'list-1',
            idMembers: 'm1'
        });
    });
});


// ════════════════════════════════════════════════════════════
// mapActionToTrelloCardUpdate — local action → Trello card update (card-as-action)
// ════════════════════════════════════════════════════════════
describe('mapActionToTrelloCardUpdate', () => {
    it('maps name to name', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'My Action' });
        expect(result.name).toBe('My Action');
    });

    it('maps description to desc', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'A', description: 'Desc' });
        expect(result.desc).toBe('Desc');
    });

    it('maps dates', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'A', startDate: '2026-04-01', dueDate: '2026-04-30' });
        expect(result.start).toBe('2026-04-01');
        expect(result.due).toBe('2026-04-30');
    });

    it('maps completed status to dueComplete=true', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'A', status: 'completed' });
        expect(result.dueComplete).toBe('true');
    });

    it('maps non-completed status to dueComplete=false', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'A', status: 'inprogress' });
        expect(result.dueComplete).toBe('false');
    });

    it('maps listId to idList', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'A' }, 'list-1');
        expect(result.idList).toBe('list-1');
    });

    it('maps assignees to idMembers (comma-separated)', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'A', assignees: ['m1', 'm2'] });
        expect(result.idMembers).toBe('m1,m2');
    });

    it('sets idMembers to empty string when no assignees', () => {
        const result = mapActionToTrelloCardUpdate({ name: 'A', assignees: [] });
        expect(result.idMembers).toBe('');
    });
});


// ════════════════════════════════════════════════════════════
// mapTaskToCheckItemUpdate — local task → Trello checklist item update (card-as-action)
// ════════════════════════════════════════════════════════════
describe('mapTaskToCheckItemUpdate', () => {
    it('maps title to name', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'My Item' });
        expect(result.name).toBe('My Item');
    });

    it('maps completed status to state=complete', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'I', status: 'completed' });
        expect(result.state).toBe('complete');
    });

    it('maps non-completed status to state=incomplete', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'I', status: 'inprogress' });
        expect(result.state).toBe('incomplete');
    });

    it('maps todo status to state=incomplete', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'I', status: 'todo' });
        expect(result.state).toBe('incomplete');
    });

    it('maps dueDate to due', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'I', dueDate: '2026-05-01' });
        expect(result.due).toBe('2026-05-01');
    });

    it('does not include due when no dueDate', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'I' });
        expect(result).not.toHaveProperty('due');
    });

    it('maps first assignee to idMember', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'I', assignees: ['m1', 'm2'] });
        expect(result.idMember).toBe('m1');
    });

    it('does not include idMember when no assignees', () => {
        const result = mapTaskToCheckItemUpdate({ title: 'I', assignees: [] });
        expect(result).not.toHaveProperty('idMember');
    });

    it('handles all fields', () => {
        const result = mapTaskToCheckItemUpdate({
            title: 'Full Item', status: 'completed',
            dueDate: '2026-05-01', assignees: ['m1']
        });
        expect(result).toEqual({
            name: 'Full Item', state: 'complete',
            due: '2026-05-01', idMember: 'm1'
        });
    });
});
