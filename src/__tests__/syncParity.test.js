// Tests for card-as-action / card-as-task parity fixes (Fixes 7-10)
// Fix 7: Clock drift in card-as-action task paths
// Fix 8: _trelloBaseline refresh in card-as-task "neither changed" path
// Fix 9: Comment fallback in mergeCardIntoAction
// Fix 10: Comment attachments preserved in mergeCardIntoAction
import { describe, it, expect } from 'vitest';
import { mergeCardIntoAction, mergeCardIntoTask } from '../lib/trelloMapping.js';

// ════════════════════════════════════════════════════════════
// Fix 9: mergeCardIntoAction — comment fallback when card.comments is empty
// ════════════════════════════════════════════════════════════
describe('mergeCardIntoAction — comment fallback (Fix 9)', () => {
    const baseAction = {
        id: 'act-1', name: 'Action', categoryId: 'cat-1',
        tags: [], countries: [], otherLabels: [],
        comments: [], attachments: [], assignees: [],
        status: 'active', budget: 0, priority: 'medium',
        trelloCardId: 'card-1', trelloLastModified: '2026-03-10T00:00:00.000Z'
    };

    const baseCard = {
        id: 'card-1', name: 'Action', desc: '',
        due: null, start: null, dueComplete: false, closed: false,
        dateLastActivity: '2026-03-20T10:00:00.000Z',
        idList: 'list-1', idLabels: [], labels: [],
        idMembers: [], idChecklists: [],
        checklists: [], attachments: [], comments: [], pos: 100
    };

    it('preserves existing synced comments when card.comments is empty array', () => {
        const action = {
            ...baseAction,
            comments: [
                { id: 'cm-1', author: 'Alice', text: 'Important note', date: '2026-03-15', trelloCommentId: 'tcm-1' },
                { id: 'cm-2', author: 'Bob', text: 'Follow up', date: '2026-03-16', trelloCommentId: 'tcm-2' }
            ]
        };
        const card = { ...baseCard, comments: [] };
        const result = mergeCardIntoAction(action, card, {}, {});
        // Should preserve existing synced comments (rate limit / fetch failure protection)
        expect(result.comments.length).toBeGreaterThanOrEqual(2);
        expect(result.comments.some(c => c.trelloCommentId === 'tcm-1')).toBe(true);
        expect(result.comments.some(c => c.trelloCommentId === 'tcm-2')).toBe(true);
    });

    it('preserves existing synced comments when card.comments is undefined', () => {
        const action = {
            ...baseAction,
            comments: [
                { id: 'cm-1', author: 'Alice', text: 'Note', date: '2026-03-15', trelloCommentId: 'tcm-1' }
            ]
        };
        const card = { ...baseCard, comments: undefined };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.comments.some(c => c.trelloCommentId === 'tcm-1')).toBe(true);
    });

    it('preserves local-only comments alongside fallback', () => {
        const action = {
            ...baseAction,
            comments: [
                { id: 'cm-synced', author: 'Alice', text: 'Synced', date: '2026-03-15', trelloCommentId: 'tcm-1' },
                { id: 'cm-local', author: 'Me', text: 'Local note', date: '2026-03-16' }
            ]
        };
        const card = { ...baseCard, comments: [] };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.comments.some(c => c.id === 'cm-local')).toBe(true);
        expect(result.comments.some(c => c.trelloCommentId === 'tcm-1')).toBe(true);
    });

    it('replaces comments normally when card.comments has data', () => {
        const action = {
            ...baseAction,
            comments: [
                { id: 'cm-1', author: 'Old', text: 'Old text', date: '2026-03-10', trelloCommentId: 'tcm-1' }
            ]
        };
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-1', data: { text: 'Updated text' }, date: '2026-03-20', memberCreator: { fullName: 'Alice' } },
                { id: 'tcm-2', data: { text: 'New comment' }, date: '2026-03-21', memberCreator: { fullName: 'Bob' } }
            ]
        };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.comments).toHaveLength(2);
        expect(result.comments[0].text).toBe('Updated text');
        expect(result.comments[1].text).toBe('New comment');
    });
});

// ════════════════════════════════════════════════════════════
// Fix 10: mergeCardIntoAction — comment attachments preservation
// ════════════════════════════════════════════════════════════
describe('mergeCardIntoAction — comment attachments (Fix 10)', () => {
    const baseAction = {
        id: 'act-1', name: 'Action', categoryId: 'cat-1',
        tags: [], countries: [], otherLabels: [],
        comments: [], attachments: [], assignees: [],
        status: 'active', budget: 0, priority: 'medium',
        trelloCardId: 'card-1', trelloLastModified: '2026-03-10T00:00:00.000Z'
    };

    const baseCard = {
        id: 'card-1', name: 'Action', desc: '',
        due: null, start: null, dueComplete: false, closed: false,
        dateLastActivity: '2026-03-20T10:00:00.000Z',
        idList: 'list-1', idLabels: [], labels: [],
        idMembers: [], idChecklists: [],
        checklists: [], attachments: [], comments: [], pos: 100
    };

    it('preserves comment attachments when merging comments by trelloCommentId', () => {
        const action = {
            ...baseAction,
            comments: [{
                id: 'cm-1', author: 'Alice', text: 'See attached',
                date: '2026-03-15', trelloCommentId: 'tcm-1',
                attachments: [{ id: 'att-c1', name: 'screenshot.png', url: 'https://att.url' }]
            }]
        };
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-1', data: { text: 'See attached' }, date: '2026-03-15', memberCreator: { fullName: 'Alice' } }
            ]
        };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.comments[0].attachments).toBeDefined();
        expect(result.comments[0].attachments).toHaveLength(1);
        expect(result.comments[0].attachments[0].name).toBe('screenshot.png');
    });

    it('does not add attachments when existing comment has none', () => {
        const action = {
            ...baseAction,
            comments: [{
                id: 'cm-1', author: 'Alice', text: 'No att',
                date: '2026-03-15', trelloCommentId: 'tcm-1'
            }]
        };
        const card = {
            ...baseCard,
            comments: [
                { id: 'tcm-1', data: { text: 'No att' }, date: '2026-03-15', memberCreator: { fullName: 'Alice' } }
            ]
        };
        const result = mergeCardIntoAction(action, card, {}, {});
        expect(result.comments[0].attachments).toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════
// Fix 9 parity check: mergeCardIntoTask already has comment fallback
// ════════════════════════════════════════════════════════════
describe('mergeCardIntoTask — comment fallback (parity verification)', () => {
    const baseTask = {
        id: 't1', actionId: 'act-1', title: 'Task', description: '',
        startDate: '2026-03-01', dueDate: '2026-03-31', month: 2,
        status: 'todo', priority: 'medium', budget: 0,
        checklists: [], comments: [], attachments: [],
        channels: [], countries: [], assignees: [], otherLabels: [],
        order: 0, createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
        trelloCardId: 'card-1', trelloLastModified: '2026-03-10T00:00:00.000Z'
    };

    const baseCard = {
        id: 'card-1', name: 'Task', desc: '',
        due: '2026-03-31T00:00:00.000Z', start: '2026-03-01T00:00:00.000Z',
        dueComplete: false, closed: false,
        dateLastActivity: '2026-03-20T10:00:00.000Z',
        idList: 'list-1', idLabels: [], labels: [],
        idMembers: [], idChecklists: [],
        checklists: [], attachments: [], comments: [], pos: 100
    };

    it('preserves existing synced comments when card.comments is empty (already implemented)', () => {
        const task = {
            ...baseTask,
            comments: [
                { id: 'cm-1', author: 'Alice', text: 'Keep me', date: '2026-03-15', trelloCommentId: 'tcm-1' }
            ]
        };
        const card = { ...baseCard, comments: [] };
        const result = mergeCardIntoTask(task, card, {}, {}, []);
        expect(result.comments.some(c => c.trelloCommentId === 'tcm-1')).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════
// Fix 8: _trelloBaseline refresh in "neither changed" path
// This is tested via mergeCardIntoTask's baseline setting to verify the
// baseline shape, then the sync-level test verifies the path updates it.
// ════════════════════════════════════════════════════════════
describe('mergeCardIntoTask — _trelloBaseline shape', () => {
    const baseTask = {
        id: 't1', actionId: 'act-1', title: 'Old', description: '',
        startDate: '2026-03-01', dueDate: '2026-03-31', month: 2,
        status: 'todo', priority: 'medium', budget: 0,
        checklists: [], comments: [], attachments: [],
        channels: [], countries: [], assignees: [], otherLabels: [],
        order: 0, createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
        trelloCardId: 'card-1', trelloLastModified: '2026-03-10T00:00:00.000Z',
        _trelloBaseline: {
            title: 'Stale', description: '', startDate: null,
            dueDate: '2026-03-31', status: null, assignees: []
        }
    };

    it('refreshes _trelloBaseline from card fields on full merge', () => {
        const card = {
            id: 'card-1', name: 'Updated Title', desc: 'New desc',
            due: '2026-04-15T00:00:00.000Z', start: '2026-04-01T00:00:00.000Z',
            dueComplete: true, closed: false,
            dateLastActivity: '2026-03-25T10:00:00.000Z',
            idList: 'list-1', idLabels: [], labels: [],
            idMembers: ['m1', 'm2'], idChecklists: [],
            checklists: [], attachments: [], comments: [], pos: 100
        };
        const result = mergeCardIntoTask(baseTask, card, {}, {}, []);
        expect(result._trelloBaseline).toEqual({
            title: 'Updated Title',
            description: 'New desc',
            startDate: '2026-04-01',
            dueDate: '2026-04-15',
            status: 'completed',
            assignees: ['m1', 'm2'],
            checklistItems: {}
        });
    });
});
