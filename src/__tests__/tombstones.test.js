import { describe, it, expect } from 'vitest';
import {
    addTombstones, mergeTombstones, tombstoneMap, isTombstoned,
    pruneEnvelopeTombstones, TOMBSTONE_TTL_MS
} from '../lib/tombstones.js';
import { mergeEntitiesByTimestamp, mergeBoardsEntityLevel } from '../lib/realtimeMerge.js';

// Dates are relative to the real clock so they always sit inside the tombstone TTL
// window (mergeBoardsEntityLevel prunes via Date.now()). Only the ordering OLD<MID<NEW
// matters for the merge-direction assertions; the explicit-now prune tests below use
// absolute offsets instead.
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const T = {
    OLD: new Date(NOW - 10 * DAY).toISOString(),
    MID: new Date(NOW - 5 * DAY).toISOString(),
    NEW: new Date(NOW - 1 * DAY).toISOString(),
};
const ms = (iso) => new Date(iso).getTime();

describe('tombstones — addTombstones', () => {
    it('stamps new entries with `now` when no deletedAt given', () => {
        const now = ms(T.NEW);
        const out = addTombstones([], [{ id: 't1', type: 'task' }], now);
        expect(out).toEqual([{ id: 't1', type: 'task', deletedAt: new Date(now).toISOString() }]);
    });

    it('dedupes by id, keeping the newest deletedAt', () => {
        const out = addTombstones(
            [{ id: 't1', type: 'task', deletedAt: T.OLD }],
            [{ id: 't1', type: 'task', deletedAt: T.NEW }],
            ms(T.NEW)
        );
        expect(out).toHaveLength(1);
        expect(out[0].deletedAt).toBe(T.NEW);
    });

    it('keeps the existing (newer) deletedAt when the incoming is older', () => {
        const out = addTombstones(
            [{ id: 't1', type: 'task', deletedAt: T.NEW }],
            [{ id: 't1', type: 'task', deletedAt: T.OLD }],
            ms(T.NEW)
        );
        expect(out[0].deletedAt).toBe(T.NEW);
    });

    it('prunes entries older than the TTL', () => {
        const now = ms(T.NEW);
        const expired = new Date(now - TOMBSTONE_TTL_MS - 1000).toISOString();
        const fresh = new Date(now - 1000).toISOString();
        const out = addTombstones(
            [{ id: 'old', type: 'task', deletedAt: expired }, { id: 'new', type: 'task', deletedAt: fresh }],
            [], now
        );
        expect(out.map(t => t.id)).toEqual(['new']);
    });

    it('ignores malformed entries (no id)', () => {
        const out = addTombstones([], [{ type: 'task' }, null, { id: 't1' }], ms(T.NEW));
        expect(out.map(t => t.id)).toEqual(['t1']);
    });

    it('mergeTombstones is a union alias', () => {
        const out = mergeTombstones(
            [{ id: 'a', deletedAt: T.OLD }],
            [{ id: 'b', deletedAt: T.NEW }],
            ms(T.NEW)
        );
        expect(out.map(t => t.id).sort()).toEqual(['a', 'b']);
    });
});

describe('tombstones — tombstoneMap & isTombstoned', () => {
    it('returns null for an empty array (cheap skip)', () => {
        expect(tombstoneMap([])).toBeNull();
        expect(tombstoneMap(undefined)).toBeNull();
    });

    it('maps id → newest deletedAt ms', () => {
        const m = tombstoneMap([
            { id: 't1', deletedAt: T.OLD },
            { id: 't1', deletedAt: T.NEW },
            { id: 't2', deletedAt: T.MID },
        ]);
        expect(m.get('t1')).toBe(ms(T.NEW));
        expect(m.get('t2')).toBe(ms(T.MID));
    });

    it('isTombstoned: deletion at-or-after the entity updatedAt → deleted', () => {
        const m = tombstoneMap([{ id: 't1', deletedAt: T.NEW }]);
        expect(isTombstoned({ id: 't1', updatedAt: T.OLD }, m)).toBe(true);
        expect(isTombstoned({ id: 't1', updatedAt: T.NEW }, m)).toBe(true); // tie → delete wins
    });

    it('isTombstoned: an edit AFTER the deletion survives', () => {
        const m = tombstoneMap([{ id: 't1', deletedAt: T.MID }]);
        expect(isTombstoned({ id: 't1', updatedAt: T.NEW }, m)).toBe(false);
    });

    it('isTombstoned: no tombstone or no map → false', () => {
        expect(isTombstoned({ id: 't1', updatedAt: T.NEW }, null)).toBe(false);
        expect(isTombstoned({ id: 't9', updatedAt: T.NEW }, tombstoneMap([{ id: 't1', deletedAt: T.NEW }]))).toBe(false);
    });
});

describe('tombstones — mergeEntitiesByTimestamp with tombstones', () => {
    it('drops a local-only entity that a peer deleted (no resurrection)', () => {
        const local = [{ id: 't1', title: 'kept by B', updatedAt: T.OLD }];
        const incoming = []; // A deleted it
        const tomb = tombstoneMap([{ id: 't1', deletedAt: T.MID }]);
        expect(mergeEntitiesByTimestamp(local, incoming, tomb)).toEqual([]);
    });

    it('keeps an entity re-edited after the deletion (edit wins)', () => {
        const local = [{ id: 't1', title: 'B re-edited', updatedAt: T.NEW }];
        const incoming = [];
        const tomb = tombstoneMap([{ id: 't1', deletedAt: T.MID }]);
        const out = mergeEntitiesByTimestamp(local, incoming, tomb);
        expect(out).toHaveLength(1);
        expect(out[0].title).toBe('B re-edited');
    });

    it('drops an incoming entity that local deleted', () => {
        const local = [];
        const incoming = [{ id: 't1', title: 'stale', updatedAt: T.OLD }];
        const tomb = tombstoneMap([{ id: 't1', deletedAt: T.NEW }]);
        expect(mergeEntitiesByTimestamp(local, incoming, tomb)).toEqual([]);
    });

    it('without a tombMap, behaviour is unchanged (back-compat)', () => {
        const local = [{ id: 't1', updatedAt: T.NEW }];
        const incoming = [{ id: 't2', updatedAt: T.NEW }];
        const out = mergeEntitiesByTimestamp(local, incoming);
        expect(out.map(t => t.id).sort()).toEqual(['t1', 't2']);
    });
});

describe('tombstones — mergeBoardsEntityLevel end-to-end', () => {
    const board = (id, { tasks = [], actions = [], categories = [], deletions, ...extra } = {}) => ({
        version: 2, currentBoardId: id,
        boards: [{ id, name: 'B', categories, actions, tasks, ...(deletions ? { deletions } : {}), ...extra }],
    });

    it('A deletes a task → B does not resurrect it after merge', () => {
        // B's local still has the task (untouched); A's incoming lacks it + carries a tombstone.
        const local = board('b1', { tasks: [{ id: 't1', title: 'x', updatedAt: T.OLD }] });
        const incoming = board('b1', { tasks: [], deletions: [{ id: 't1', type: 'task', deletedAt: T.MID }] });
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards[0].tasks).toHaveLength(0);
        // tombstone is carried forward in the merged board
        expect(result.boards[0].deletions.map(d => d.id)).toContain('t1');
    });

    it('B edits a task AFTER A deleted it → edit wins (resurrects)', () => {
        const local = board('b1', { tasks: [{ id: 't1', title: 'B re-typed', updatedAt: T.NEW }] });
        const incoming = board('b1', { tasks: [], deletions: [{ id: 't1', type: 'task', deletedAt: T.MID }] });
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards[0].tasks).toHaveLength(1);
        expect(result.boards[0].tasks[0].title).toBe('B re-typed');
    });

    it('tombstones merge as a union across both sides', () => {
        const local = board('b1', { tasks: [], deletions: [{ id: 't1', type: 'task', deletedAt: T.OLD }] });
        const incoming = board('b1', { tasks: [], deletions: [{ id: 't2', type: 'task', deletedAt: T.MID }] });
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards[0].deletions.map(d => d.id).sort()).toEqual(['t1', 't2']);
    });

    it('board-level: A deletes a board → B does not resurrect it', () => {
        // local (B) still has board b2; incoming (A) lacks it and carries a boardDeletion.
        const local = {
            version: 2, currentBoardId: 'b1',
            boards: [
                { id: 'b1', name: 'Main', categories: [], actions: [], tasks: [], updatedAt: T.OLD },
                { id: 'b2', name: 'Old', categories: [], actions: [], tasks: [], updatedAt: T.OLD },
            ],
        };
        const incoming = {
            version: 2, currentBoardId: 'b1',
            boards: [{ id: 'b1', name: 'Main', categories: [], actions: [], tasks: [], updatedAt: T.OLD }],
            boardDeletions: [{ id: 'b2', type: 'board', deletedAt: T.MID }],
        };
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards.map(b => b.id)).toEqual(['b1']);
        expect(result.boardDeletions.map(d => d.id)).toContain('b2');
    });

    it('board-level: a board recreated/edited after deletion survives', () => {
        const local = {
            version: 2, currentBoardId: 'b1',
            boards: [
                { id: 'b1', name: 'Main', categories: [], actions: [], tasks: [], updatedAt: T.OLD },
                { id: 'b2', name: 'Revived', categories: [], actions: [], tasks: [], updatedAt: T.NEW },
            ],
        };
        const incoming = {
            version: 2, currentBoardId: 'b1',
            boards: [{ id: 'b1', name: 'Main', categories: [], actions: [], tasks: [], updatedAt: T.OLD }],
            boardDeletions: [{ id: 'b2', type: 'board', deletedAt: T.MID }],
        };
        const result = mergeBoardsEntityLevel(local, incoming);
        expect(result.boards.map(b => b.id).sort()).toEqual(['b1', 'b2']);
    });
});

describe('tombstones — pruneEnvelopeTombstones', () => {
    it('prunes expired tombstones across boards and boardDeletions', () => {
        const now = ms(T.NEW);
        const expired = new Date(now - TOMBSTONE_TTL_MS - 1).toISOString();
        const fresh = new Date(now - 1000).toISOString();
        const data = {
            version: 2, currentBoardId: 'b1',
            boards: [{ id: 'b1', categories: [], actions: [], tasks: [], deletions: [
                { id: 'old', type: 'task', deletedAt: expired },
                { id: 'new', type: 'task', deletedAt: fresh },
            ] }],
            boardDeletions: [{ id: 'oldBoard', type: 'board', deletedAt: expired }],
        };
        const out = pruneEnvelopeTombstones(data, now);
        expect(out.boards[0].deletions.map(d => d.id)).toEqual(['new']);
        expect(out.boardDeletions).toEqual([]);
    });

    it('returns the same reference when nothing to prune (no churn)', () => {
        const data = { version: 2, boards: [{ id: 'b1', categories: [], actions: [], tasks: [] }] };
        expect(pruneEnvelopeTombstones(data, ms(T.NEW))).toBe(data);
    });
});
