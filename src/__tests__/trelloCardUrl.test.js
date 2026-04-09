// Tests for Trello card URL resolution in checklist item names
import { describe, it, expect, vi } from 'vitest';
import { resolveTrelloCardUrl, mapTrelloCheckItemToTask, mergeCheckItemIntoTask } from '../lib/trelloMapping.js';

// ════════════════════════════════════════════════════════════
// resolveTrelloCardUrl — detect and resolve Trello card URLs
// ════════════════════════════════════════════════════════════
describe('resolveTrelloCardUrl', () => {
    const allCards = [
        { id: 'card-1', shortLink: 'ABC123', name: 'My Card' },
        { id: 'card-2', shortLink: 'DEF456', name: 'Another Card' }
    ];

    it('resolves same-board card URL to card name', () => {
        const result = resolveTrelloCardUrl('https://trello.com/c/ABC123', allCards);
        expect(result).toEqual({
            title: 'My Card',
            trelloLinkedCardUrl: 'https://trello.com/c/ABC123'
        });
    });

    it('resolves same-board card URL with slug', () => {
        const result = resolveTrelloCardUrl('https://trello.com/c/DEF456/42-another-card', allCards);
        expect(result).toEqual({
            title: 'Another Card',
            trelloLinkedCardUrl: 'https://trello.com/c/DEF456/42-another-card'
        });
    });

    it('falls back to slug for cross-board cards', () => {
        const result = resolveTrelloCardUrl('https://trello.com/c/XYZ789/42-some-card-title', allCards);
        expect(result).toEqual({
            title: 'Some card title',
            trelloLinkedCardUrl: 'https://trello.com/c/XYZ789/42-some-card-title'
        });
    });

    it('capitalizes first letter of slug fallback', () => {
        const result = resolveTrelloCardUrl('https://trello.com/c/XYZ789/7-running-recap-article', []);
        expect(result.title).toBe('Running recap article');
    });

    it('returns raw URL as title when no slug and no matching card', () => {
        const url = 'https://trello.com/c/UNKNOWN';
        const result = resolveTrelloCardUrl(url, allCards);
        expect(result).toEqual({
            title: url,
            trelloLinkedCardUrl: url
        });
    });

    it('returns null for non-Trello text', () => {
        expect(resolveTrelloCardUrl('Regular task title', allCards)).toBeNull();
    });

    it('returns null for empty/null input', () => {
        expect(resolveTrelloCardUrl('', allCards)).toBeNull();
        expect(resolveTrelloCardUrl(null, allCards)).toBeNull();
    });

    it('returns null for non-card Trello URLs', () => {
        expect(resolveTrelloCardUrl('https://trello.com/b/BOARD123', allCards)).toBeNull();
    });

    it('works with https prefix', () => {
        const result = resolveTrelloCardUrl('https://trello.com/c/ABC123', allCards);
        expect(result).not.toBeNull();
        expect(result.title).toBe('My Card');
    });

    it('works with http prefix', () => {
        const result = resolveTrelloCardUrl('http://trello.com/c/ABC123', allCards);
        expect(result).not.toBeNull();
        expect(result.title).toBe('My Card');
    });

    it('works with null allCards', () => {
        const result = resolveTrelloCardUrl('https://trello.com/c/ABC123/5-some-task', null);
        expect(result).toEqual({
            title: 'Some task',
            trelloLinkedCardUrl: 'https://trello.com/c/ABC123/5-some-task'
        });
    });
});

// ════════════════════════════════════════════════════════════
// mapTrelloCheckItemToTask — URL resolution in new task creation
// ════════════════════════════════════════════════════════════
describe('mapTrelloCheckItemToTask with card URL', () => {
    const allCards = [
        { id: 'card-ref', shortLink: 'REF123', name: 'Referenced Card' }
    ];

    const card = {
        id: 'card-1', due: '2026-04-15T00:00:00.000Z', start: null,
        dateLastActivity: '2026-04-01T00:00:00.000Z',
        idLabels: [], idMembers: [], checklists: []
    };

    it('resolves card URL in item name to card title', () => {
        const item = { id: 'ci-1', name: 'https://trello.com/c/REF123', pos: 0, state: 'incomplete' };
        const task = mapTrelloCheckItemToTask(item, 'act-1', card, 'cl-1', 'Tasks', {}, allCards);
        expect(task.title).toBe('Referenced Card');
        expect(task.trelloLinkedCardUrl).toBe('https://trello.com/c/REF123');
    });

    it('keeps regular title as-is', () => {
        const item = { id: 'ci-2', name: 'Regular task', pos: 0, state: 'incomplete' };
        const task = mapTrelloCheckItemToTask(item, 'act-1', card, 'cl-1', 'Tasks', {}, allCards);
        expect(task.title).toBe('Regular task');
        expect(task.trelloLinkedCardUrl).toBeUndefined();
    });

    it('sets baseline title to resolved title (not raw URL)', () => {
        const item = { id: 'ci-3', name: 'https://trello.com/c/REF123', pos: 0, state: 'incomplete' };
        const task = mapTrelloCheckItemToTask(item, 'act-1', card, 'cl-1', 'Tasks', {}, allCards);
        expect(task._trelloBaseline.title).toBe('Referenced Card');
    });
});

// ════════════════════════════════════════════════════════════
// mergeCheckItemIntoTask — URL resolution on existing task merge
// ════════════════════════════════════════════════════════════
describe('mergeCheckItemIntoTask with card URL', () => {
    const allCards = [
        { id: 'card-ref', shortLink: 'REF123', name: 'Referenced Card' }
    ];

    const existingTask = {
        id: 't-1', actionId: 'act-1', title: 'Old title',
        status: 'todo', dueDate: '2026-03-31', startDate: '2026-03-01',
        month: 2, order: 0, assignees: [],
        trelloChecklistId: 'cl-1', trelloChecklistName: 'Tasks'
    };

    const card = {
        id: 'card-1', due: '2026-04-15T00:00:00.000Z',
        dateLastActivity: '2026-04-01T00:00:00.000Z',
        checklists: [{ id: 'cl-1', name: 'Tasks', pos: 0, checkItems: [{ id: 'ci-1', pos: 0 }] }]
    };

    it('resolves card URL on merge', () => {
        const item = { id: 'ci-1', name: 'https://trello.com/c/REF123', pos: 0, state: 'incomplete' };
        const merged = mergeCheckItemIntoTask(existingTask, item, card, allCards);
        expect(merged.title).toBe('Referenced Card');
        expect(merged.trelloLinkedCardUrl).toBe('https://trello.com/c/REF123');
    });

    it('clears trelloLinkedCardUrl when item is no longer a URL', () => {
        const item = { id: 'ci-1', name: 'Now a plain title', pos: 0, state: 'incomplete' };
        const taskWithUrl = { ...existingTask, trelloLinkedCardUrl: 'https://trello.com/c/OLD' };
        const merged = mergeCheckItemIntoTask(taskWithUrl, item, card, allCards);
        expect(merged.title).toBe('Now a plain title');
        expect(merged.trelloLinkedCardUrl).toBeUndefined();
    });

    it('sets baseline title to resolved title on merge', () => {
        const item = { id: 'ci-1', name: 'https://trello.com/c/REF123', pos: 0, state: 'incomplete' };
        const merged = mergeCheckItemIntoTask(existingTask, item, card, allCards);
        expect(merged._trelloBaseline.title).toBe('Referenced Card');
    });
});

// ════════════════════════════════════════════════════════════
// Cross-board card URL async resolution (post-sync step)
// ════════════════════════════════════════════════════════════
describe('resolveCrossBoardCardUrls', () => {
    // This function doesn't exist yet — it will be added to trelloSync.js
    // Tests the async resolution of cross-board card URLs that couldn't be resolved synchronously

    it('resolves unresolved cross-board URLs via async card fetch', async () => {
        // Dynamically import to pick up the new export
        const { resolveCrossBoardCardUrls } = await import('../lib/trelloSync.js');

        const tasks = [
            { id: 't-1', title: 'https://trello.com/c/CROSS1', trelloLinkedCardUrl: 'https://trello.com/c/CROSS1' },
            { id: 't-2', title: 'Normal task', trelloLinkedCardUrl: undefined },
            { id: 't-3', title: 'https://trello.com/c/CROSS2', trelloLinkedCardUrl: 'https://trello.com/c/CROSS2' },
        ];

        const mockFetch = vi.fn()
            .mockResolvedValueOnce({ name: 'Cross Board Card 1', shortLink: 'CROSS1' })
            .mockResolvedValueOnce({ name: 'Cross Board Card 2', shortLink: 'CROSS2' });

        const result = await resolveCrossBoardCardUrls(tasks, mockFetch);

        expect(result[0].title).toBe('Cross Board Card 1');
        expect(result[0].trelloLinkedCardUrl).toBe('https://trello.com/c/CROSS1');
        expect(result[0]._trelloBaseline.title).toBe('Cross Board Card 1');
        expect(result[1].title).toBe('Normal task'); // unchanged
        expect(result[2].title).toBe('Cross Board Card 2');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('deduplicates shortLinks when multiple tasks reference the same card', async () => {
        const { resolveCrossBoardCardUrls } = await import('../lib/trelloSync.js');

        const tasks = [
            { id: 't-1', title: 'https://trello.com/c/SAME1', trelloLinkedCardUrl: 'https://trello.com/c/SAME1' },
            { id: 't-2', title: 'https://trello.com/c/SAME1', trelloLinkedCardUrl: 'https://trello.com/c/SAME1' },
        ];

        const mockFetch = vi.fn()
            .mockResolvedValueOnce({ name: 'Shared Card', shortLink: 'SAME1' });

        const result = await resolveCrossBoardCardUrls(tasks, mockFetch);

        expect(result[0].title).toBe('Shared Card');
        expect(result[1].title).toBe('Shared Card');
        expect(mockFetch).toHaveBeenCalledTimes(1); // only one fetch for deduped shortLink
    });

    it('keeps URL as title when fetch fails (card inaccessible)', async () => {
        const { resolveCrossBoardCardUrls } = await import('../lib/trelloSync.js');

        const tasks = [
            { id: 't-1', title: 'https://trello.com/c/PRIVATE1', trelloLinkedCardUrl: 'https://trello.com/c/PRIVATE1' },
        ];

        const mockFetch = vi.fn().mockRejectedValueOnce(new Error('401 Unauthorized'));

        const result = await resolveCrossBoardCardUrls(tasks, mockFetch);

        expect(result[0].title).toBe('https://trello.com/c/PRIVATE1'); // unchanged
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('skips tasks that are already resolved (title !== trelloLinkedCardUrl)', async () => {
        const { resolveCrossBoardCardUrls } = await import('../lib/trelloSync.js');

        const tasks = [
            { id: 't-1', title: 'Already Resolved', trelloLinkedCardUrl: 'https://trello.com/c/RES1' },
            { id: 't-2', title: 'https://trello.com/c/NEED1', trelloLinkedCardUrl: 'https://trello.com/c/NEED1' },
        ];

        const mockFetch = vi.fn()
            .mockResolvedValueOnce({ name: 'Resolved Card', shortLink: 'NEED1' });

        const result = await resolveCrossBoardCardUrls(tasks, mockFetch);

        expect(result[0].title).toBe('Already Resolved'); // unchanged
        expect(result[1].title).toBe('Resolved Card');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});

// ════════════════════════════════════════════════════════════
// handleAddNewTask Trello metadata enrichment
// ════════════════════════════════════════════════════════════
describe('handleAddNewTask Trello metadata enrichment', () => {
    // This tests the enrichment logic that should be in handleAddNewTask
    // We extract the enrichment into a pure function to make it testable

    it('adds Trello metadata from sibling task when creating via NewTaskModal', async () => {
        const { enrichNewTaskWithTrelloMetadata } = await import('../lib/trelloSync.js');

        const newTask = {
            id: 't-new', actionId: 'act-1', title: 'New task from modal',
            status: 'todo', startDate: '2026-04-01', dueDate: '2026-04-30'
        };
        const existingTasks = [
            { id: 't-1', actionId: 'act-1', trelloChecklistName: 'Social Media Post', trelloChecklistId: 'cl-1', trelloCardId: 'card-1' },
            { id: 't-2', actionId: 'act-2', trelloChecklistName: 'Other', trelloChecklistId: 'cl-2', trelloCardId: 'card-2' },
        ];
        const actions = [
            { id: 'act-1', trelloCardId: 'card-1' },
        ];

        const enriched = enrichNewTaskWithTrelloMetadata(newTask, existingTasks, actions);

        expect(enriched.trelloChecklistName).toBe('Social Media Post');
        expect(enriched.trelloChecklistId).toBe('cl-1');
        expect(enriched.trelloCardId).toBe('card-1');
    });

    it('falls back to action trelloCardId when no sibling tasks exist', async () => {
        const { enrichNewTaskWithTrelloMetadata } = await import('../lib/trelloSync.js');

        const newTask = { id: 't-new', actionId: 'act-1', title: 'New task' };
        const existingTasks = []; // no siblings
        const actions = [{ id: 'act-1', trelloCardId: 'card-1' }];

        const enriched = enrichNewTaskWithTrelloMetadata(newTask, existingTasks, actions);

        expect(enriched.trelloChecklistName).toBe('Tasks');
        expect(enriched.trelloCardId).toBe('card-1');
    });

    it('does nothing when no Trello metadata available', async () => {
        const { enrichNewTaskWithTrelloMetadata } = await import('../lib/trelloSync.js');

        const newTask = { id: 't-new', actionId: 'act-1', title: 'New task' };
        const existingTasks = [];
        const actions = [{ id: 'act-1' }]; // no trelloCardId

        const enriched = enrichNewTaskWithTrelloMetadata(newTask, existingTasks, actions);

        expect(enriched.trelloCardId).toBeUndefined();
        expect(enriched.trelloChecklistName).toBeUndefined();
    });
});
