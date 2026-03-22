import { describe, it, expect } from 'vitest';
import { migrateToV2, normalizeTaskChecklists } from '../lib/migration.js';

describe('migrateToV2', () => {
    it('returns v2 data as-is', () => {
        const v2 = { version: 2, currentBoardId: 'b1', boards: [{ id: 'b1', name: 'Test' }] };
        expect(migrateToV2(v2)).toBe(v2);
    });

    it('migrates v1 flat format to v2 envelope', () => {
        const v1 = {
            categories: [{ id: 'c1', name: 'Cat1' }],
            actions: [{ id: 'a1', name: 'Act1' }],
            tasks: [{ id: 't1', title: 'Task1' }]
        };
        const result = migrateToV2(v1);
        expect(result.version).toBe(2);
        expect(result.boards).toHaveLength(1);
        expect(result.boards[0].id).toBe('board-default');
        expect(result.boards[0].categories).toEqual(v1.categories);
        expect(result.boards[0].actions).toEqual(v1.actions);
        expect(result.boards[0].tasks).toEqual(v1.tasks);
    });

    it('returns fresh defaults for null/corrupt data', () => {
        const result = migrateToV2(null);
        expect(result.version).toBe(2);
        expect(result.boards).toHaveLength(1);
        expect(result.boards[0].categories.length).toBeGreaterThan(0);
    });

    it('returns fresh defaults for empty object', () => {
        const result = migrateToV2({});
        expect(result.version).toBe(2);
        expect(result.boards[0].categories.length).toBeGreaterThan(0);
    });

    it('handles v1 with missing actions/tasks', () => {
        const result = migrateToV2({ categories: [{ id: 'c1' }] });
        expect(result.boards[0].actions).toEqual([]);
        expect(result.boards[0].tasks).toEqual([]);
    });
});

describe('normalizeTaskChecklists', () => {
    it('returns existing checklists array as-is', () => {
        const task = { checklists: [{ id: 'cl1', name: 'CL', items: [] }] };
        expect(normalizeTaskChecklists(task)).toBe(task.checklists);
    });

    it('migrates old flat checklist to named format', () => {
        const task = { checklist: [{ id: 'i1', text: 'Item 1', done: false }] };
        const result = normalizeTaskChecklists(task);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Checklist');
        expect(result[0].items).toEqual(task.checklist);
    });

    it('returns empty array if no checklist data', () => {
        expect(normalizeTaskChecklists({})).toEqual([]);
    });

    it('returns empty array for empty checklist', () => {
        expect(normalizeTaskChecklists({ checklist: [] })).toEqual([]);
    });
});
