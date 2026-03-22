import { describe, it, expect } from 'vitest';
import { validateBoardIntegrity } from '../lib/trelloSync.js';

describe('validateBoardIntegrity', () => {
    it('returns no warnings for valid board', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1', isDefault: true }],
            tasks: [{ id: 't1', title: 'Task', actionId: 'a1' }]
        };
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(true);
        expect(result.warnings).toEqual([]);
    });

    it('detects orphaned task (missing action)', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'c1' }],
            tasks: [{ id: 't1', title: 'Orphan', actionId: 'missing-action' }]
        };
        const result = validateBoardIntegrity(board);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('missing action');
    });

    it('detects orphaned action (missing category)', () => {
        const board = {
            categories: [{ id: 'c1' }],
            actions: [{ id: 'a1', categoryId: 'missing-cat', name: 'Act1' }],
            tasks: []
        };
        const result = validateBoardIntegrity(board);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('missing category');
    });

    it('handles empty board', () => {
        const board = { categories: [], actions: [], tasks: [] };
        const result = validateBoardIntegrity(board);
        expect(result.valid).toBe(true);
        expect(result.warnings).toEqual([]);
    });
});
