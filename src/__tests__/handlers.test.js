import { describe, it, expect } from 'vitest';
import {
    applyTaskUpdate,
    applyBatchTaskUpdate,
    applyActionUpdate,
    computeTagPropagation,
    applyTaskReorder,
} from '../lib/handlers';

const NOW = '2026-04-11T12:00:00.000Z';

// --- Fixtures ---

function makeTasks() {
    return [
        { id: 't1', title: 'Task 1', status: 'todo', month: 0, order: 0, budget: 100 },
        { id: 't2', title: 'Task 2', status: 'todo', month: 0, order: 1, budget: 200 },
        { id: 't3', title: 'Task 3', status: 'done', month: 1, order: 0, budget: 50 },
    ];
}

function makeActions() {
    return [
        { id: 'a1', name: 'Action 1', tags: ['social'], countries: ['FR'] },
        { id: 'a2', name: 'Action 2', tags: ['email'], countries: ['US'] },
    ];
}

// ============================================================
// applyTaskUpdate
// ============================================================

describe('applyTaskUpdate', () => {
    it('updates the matching task and sets updatedAt', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 't2', { title: 'Renamed' }, NOW);
        expect(result).toHaveLength(3);
        expect(result[1]).toMatchObject({ id: 't2', title: 'Renamed', updatedAt: NOW });
        // Others unchanged
        expect(result[0]).toBe(tasks[0]);
        expect(result[2]).toBe(tasks[2]);
    });

    it('recalculates month from dueDate', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 't1', { dueDate: '2026-06-15' }, NOW);
        expect(result[0].month).toBe(5); // June = month 5
    });

    it('recalculates month from startDate when no dueDate', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 't1', { startDate: '2026-03-10' }, NOW);
        expect(result[0].month).toBe(2); // March = month 2
    });

    it('prefers dueDate over startDate for month calculation', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 't1', { dueDate: '2026-08-01', startDate: '2026-03-01' }, NOW);
        expect(result[0].month).toBe(7); // August from dueDate
    });

    it('sets orderUpdatedAt when order changes', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 't1', { order: 5 }, NOW);
        expect(result[0].orderUpdatedAt).toBe(NOW);
        expect(result[0].order).toBe(5);
    });

    it('does not set orderUpdatedAt when order is not in updates', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 't1', { title: 'X' }, NOW);
        expect(result[0].orderUpdatedAt).toBeUndefined();
    });

    it('returns unchanged array when taskId not found', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 'nonexistent', { title: 'X' }, NOW);
        // All items should be reference-equal
        result.forEach((t, i) => expect(t).toBe(tasks[i]));
    });

    it('preserves existing fields not in updates', () => {
        const tasks = makeTasks();
        const result = applyTaskUpdate(tasks, 't1', { status: 'in-progress' }, NOW);
        expect(result[0].title).toBe('Task 1');
        expect(result[0].budget).toBe(100);
        expect(result[0].status).toBe('in-progress');
    });
});

// ============================================================
// applyBatchTaskUpdate
// ============================================================

describe('applyBatchTaskUpdate', () => {
    it('updates multiple tasks atomically', () => {
        const tasks = makeTasks();
        const updates = [
            { id: 't1', changes: { title: 'Updated 1' } },
            { id: 't3', changes: { title: 'Updated 3' } },
        ];
        const result = applyBatchTaskUpdate(tasks, updates, NOW);
        expect(result[0]).toMatchObject({ id: 't1', title: 'Updated 1', updatedAt: NOW });
        expect(result[2]).toMatchObject({ id: 't3', title: 'Updated 3', updatedAt: NOW });
        // t2 unchanged
        expect(result[1]).toBe(tasks[1]);
    });

    it('sets orderUpdatedAt for order changes', () => {
        const tasks = makeTasks();
        const updates = [
            { id: 't1', changes: { order: 2 } },
            { id: 't2', changes: { order: 0 } },
        ];
        const result = applyBatchTaskUpdate(tasks, updates, NOW);
        expect(result[0].orderUpdatedAt).toBe(NOW);
        expect(result[1].orderUpdatedAt).toBe(NOW);
    });

    it('recalculates month from dueDate in batch', () => {
        const tasks = makeTasks();
        const updates = [{ id: 't1', changes: { dueDate: '2026-12-25' } }];
        const result = applyBatchTaskUpdate(tasks, updates, NOW);
        expect(result[0].month).toBe(11); // December
    });

    it('recalculates month from startDate when no dueDate in batch', () => {
        const tasks = makeTasks();
        const updates = [{ id: 't2', changes: { startDate: '2026-07-01' } }];
        const result = applyBatchTaskUpdate(tasks, updates, NOW);
        expect(result[1].month).toBe(6); // July
    });

    it('returns unchanged array when no updates match', () => {
        const tasks = makeTasks();
        const updates = [{ id: 'nonexistent', changes: { title: 'X' } }];
        const result = applyBatchTaskUpdate(tasks, updates, NOW);
        result.forEach((t, i) => expect(t).toBe(tasks[i]));
    });

    it('handles empty updates array', () => {
        const tasks = makeTasks();
        const result = applyBatchTaskUpdate(tasks, [], NOW);
        result.forEach((t, i) => expect(t).toBe(tasks[i]));
    });
});

// ============================================================
// applyActionUpdate
// ============================================================

describe('applyActionUpdate', () => {
    it('updates the matching action and sets updatedAt', () => {
        const actions = makeActions();
        const result = applyActionUpdate(actions, 'a1', { name: 'Renamed' }, NOW);
        expect(result[0]).toMatchObject({ id: 'a1', name: 'Renamed', updatedAt: NOW });
        expect(result[1]).toBe(actions[1]);
    });

    it('returns unchanged array when actionId not found', () => {
        const actions = makeActions();
        const result = applyActionUpdate(actions, 'nonexistent', { name: 'X' }, NOW);
        result.forEach((a, i) => expect(a).toBe(actions[i]));
    });

    it('preserves existing fields', () => {
        const actions = makeActions();
        const result = applyActionUpdate(actions, 'a2', { name: 'New' }, NOW);
        expect(result[1].tags).toEqual(['email']);
        expect(result[1].countries).toEqual(['US']);
    });
});

// ============================================================
// computeTagPropagation
// ============================================================

describe('computeTagPropagation', () => {
    it('returns empty when no tag or country updates', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        expect(computeTagPropagation(action, { name: 'X' }, [])).toEqual([]);
    });

    it('returns empty when tags/countries unchanged', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        const updates = { tags: ['social'], countries: ['FR'] };
        const tasks = [{ id: 't1', channels: ['social'], countries: ['FR'] }];
        expect(computeTagPropagation(action, updates, tasks)).toEqual([]);
    });

    it('returns empty when no linked tasks', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        const updates = { tags: ['email'] };
        expect(computeTagPropagation(action, updates, [])).toEqual([]);
    });

    it('returns empty when oldAction is null', () => {
        expect(computeTagPropagation(null, { tags: ['x'] }, [{ id: 't1' }])).toEqual([]);
    });

    it('propagates new tags to linked tasks (union merge)', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        const tasks = [
            { id: 't1', channels: ['social', 'website'], countries: ['FR'] },
            { id: 't2', channels: ['social'], countries: ['FR', 'DE'] },
        ];
        const updates = { tags: ['email', 'social'] };
        const result = computeTagPropagation(action, updates, tasks);
        expect(result).toHaveLength(2);
        // t1: new tags (email, social) + task-specific (website, not in old tags)
        expect(result[0].id).toBe('t1');
        expect(result[0].changes.channels).toEqual(expect.arrayContaining(['email', 'social', 'website']));
        // t2: new tags (email, social) + no task-specific
        expect(result[1].id).toBe('t2');
        expect(result[1].changes.channels).toEqual(expect.arrayContaining(['email', 'social']));
    });

    it('propagates new countries to linked tasks (union merge)', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        const tasks = [
            { id: 't1', channels: ['social'], countries: ['FR', 'DE'] },
        ];
        const updates = { countries: ['US', 'FR'] };
        const result = computeTagPropagation(action, updates, tasks);
        expect(result).toHaveLength(1);
        // new countries (US, FR) + task-specific (DE, not in old countries)
        expect(result[0].changes.countries).toEqual(expect.arrayContaining(['US', 'FR', 'DE']));
    });

    it('removes old action tags from tasks when action tags removed', () => {
        const action = { id: 'a1', tags: ['social', 'email'], countries: [] };
        const tasks = [
            { id: 't1', channels: ['social', 'email', 'website'], countries: [] },
        ];
        const updates = { tags: ['email'] }; // removed 'social'
        const result = computeTagPropagation(action, updates, tasks);
        // new tags (email) + task-specific (website — not in old tags social,email)
        expect(result[0].changes.channels).toEqual(expect.arrayContaining(['email', 'website']));
        expect(result[0].changes.channels).not.toContain('social');
    });

    it('handles tasks with no channels/countries', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        const tasks = [{ id: 't1' }]; // no channels or countries
        const updates = { tags: ['email'] };
        const result = computeTagPropagation(action, updates, tasks);
        expect(result[0].changes.channels).toEqual(['email']);
    });

    it('handles action with no existing tags', () => {
        const action = { id: 'a1' }; // no tags, no countries
        const tasks = [{ id: 't1', channels: ['website'] }];
        const updates = { tags: ['email'] };
        const result = computeTagPropagation(action, updates, tasks);
        // old tags = [], new tags = [email], task-specific = [website] (all of them, since none in old)
        expect(result[0].changes.channels).toEqual(expect.arrayContaining(['email', 'website']));
    });

    it('only propagates tags when only tags changed', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        const tasks = [{ id: 't1', channels: ['social'], countries: ['FR'] }];
        const updates = { tags: ['email'] };
        const result = computeTagPropagation(action, updates, tasks);
        expect(result[0].changes).toHaveProperty('channels');
        expect(result[0].changes).not.toHaveProperty('countries');
    });

    it('only propagates countries when only countries changed', () => {
        const action = { id: 'a1', tags: ['social'], countries: ['FR'] };
        const tasks = [{ id: 't1', channels: ['social'], countries: ['FR'] }];
        const updates = { countries: ['US'] };
        const result = computeTagPropagation(action, updates, tasks);
        expect(result[0].changes).not.toHaveProperty('channels');
        expect(result[0].changes).toHaveProperty('countries');
    });
});

// ============================================================
// applyTaskReorder
// ============================================================

describe('applyTaskReorder', () => {
    function makeOrderedTasks() {
        return [
            { id: 't1', month: 0, status: 'todo', order: 0 },
            { id: 't2', month: 0, status: 'todo', order: 1 },
            { id: 't3', month: 0, status: 'todo', order: 2 },
            { id: 't4', month: 1, status: 'done', order: 0 },
        ];
    }

    it('returns unchanged when draggedId === targetId', () => {
        const tasks = makeOrderedTasks();
        const result = applyTaskReorder(tasks, 't1', 't1', 'before');
        expect(result).toBe(tasks);
    });

    it('returns unchanged when dragged task not found', () => {
        const tasks = makeOrderedTasks();
        const result = applyTaskReorder(tasks, 'nonexistent', 't2', 'before');
        expect(result).toBe(tasks);
    });

    it('returns unchanged when target task not found', () => {
        const tasks = makeOrderedTasks();
        const result = applyTaskReorder(tasks, 't1', 'nonexistent', 'before');
        expect(result).toBe(tasks);
    });

    it('reorders within same column — move t3 before t1', () => {
        const tasks = makeOrderedTasks();
        const result = applyTaskReorder(tasks, 't3', 't1', 'before');
        // In month 0: should be t3, t1, t2
        const month0 = result.filter(t => t.month === 0).sort((a, b) => a.order - b.order);
        expect(month0.map(t => t.id)).toEqual(['t3', 't1', 't2']);
        // Verify sequential order
        expect(month0[0].order).toBe(0);
        expect(month0[1].order).toBe(1);
        expect(month0[2].order).toBe(2);
    });

    it('reorders within same column — move t1 after t3', () => {
        const tasks = makeOrderedTasks();
        const result = applyTaskReorder(tasks, 't1', 't3', 'after');
        const month0 = result.filter(t => t.month === 0).sort((a, b) => a.order - b.order);
        expect(month0.map(t => t.id)).toEqual(['t2', 't3', 't1']);
    });

    it('reorders within same column — move t1 after t2', () => {
        const tasks = makeOrderedTasks();
        const result = applyTaskReorder(tasks, 't1', 't2', 'after');
        const month0 = result.filter(t => t.month === 0).sort((a, b) => a.order - b.order);
        expect(month0.map(t => t.id)).toEqual(['t2', 't1', 't3']);
    });

    it('cross-column drag updates month and dates', () => {
        const tasks = [
            { id: 't1', month: 0, status: 'todo', order: 0, startDate: '2026-01-01', dueDate: '2026-01-31' },
            { id: 't4', month: 1, status: 'done', order: 0, startDate: '2026-02-01', dueDate: '2026-02-28' },
        ];
        const result = applyTaskReorder(tasks, 't1', 't4', 'before');
        const movedTask = result.find(t => t.id === 't1');
        expect(movedTask.month).toBe(1);
        expect(movedTask.startDate).toMatch(/^2026-02-01/);
        expect(movedTask.dueDate).toMatch(/^2026-02/);
    });

    it('cross-column drag updates status', () => {
        const tasks = [
            { id: 't1', month: 0, status: 'todo', order: 0 },
            { id: 't4', month: 0, status: 'done', order: 0 },
        ];
        const result = applyTaskReorder(tasks, 't1', 't4', 'before');
        const movedTask = result.find(t => t.id === 't1');
        expect(movedTask.status).toBe('done');
    });

    it('does not affect tasks in other columns', () => {
        const tasks = makeOrderedTasks();
        const result = applyTaskReorder(tasks, 't1', 't3', 'after');
        const month1Task = result.find(t => t.id === 't4');
        expect(month1Task.order).toBe(0);
        expect(month1Task.month).toBe(1);
    });

    it('cross-column drag sets updatedAt', () => {
        const tasks = [
            { id: 't1', month: 0, status: 'todo', order: 0 },
            { id: 't4', month: 1, status: 'done', order: 0 },
        ];
        const result = applyTaskReorder(tasks, 't1', 't4', 'before');
        const movedTask = result.find(t => t.id === 't1');
        expect(movedTask.updatedAt).toBeDefined();
    });
});