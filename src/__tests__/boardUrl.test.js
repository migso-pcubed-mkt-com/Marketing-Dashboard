import { describe, it, expect } from 'vitest';
import { getBoardIdFromSearch, getViewFromSearch, buildBoardSearch, resolveInitialBoardId } from '../lib/boardUrl.js';

describe('getBoardIdFromSearch', () => {
    it('extracts the board id from a search string', () => {
        expect(getBoardIdFromSearch('?board=board-abc')).toBe('board-abc');
    });
    it('returns null when the param is absent or empty', () => {
        expect(getBoardIdFromSearch('')).toBeNull();
        expect(getBoardIdFromSearch('?other=1')).toBeNull();
        expect(getBoardIdFromSearch('?board=')).toBeNull();
        expect(getBoardIdFromSearch(undefined)).toBeNull();
    });
    it('handles ids with URL-encoded characters', () => {
        expect(getBoardIdFromSearch('?board=board-a%20b')).toBe('board-a b');
    });
});

describe('getViewFromSearch', () => {
    it('extracts a valid view', () => {
        expect(getViewFromSearch('?view=timeline')).toBe('timeline');
        expect(getViewFromSearch('?board=b1&view=calendar')).toBe('calendar');
    });
    it('accepts the kpis alias for dashboard, case-insensitively', () => {
        expect(getViewFromSearch('?view=kpis')).toBe('dashboard');
        expect(getViewFromSearch('?view=KPIs')).toBe('dashboard');
        expect(getViewFromSearch('?view=Timeline')).toBe('timeline');
    });
    it('returns null for unknown or missing views', () => {
        expect(getViewFromSearch('?view=nope')).toBeNull();
        expect(getViewFromSearch('')).toBeNull();
        expect(getViewFromSearch('?board=b1')).toBeNull();
    });
});

describe('buildBoardSearch', () => {
    it('sets the view param for non-default views', () => {
        expect(buildBoardSearch('', 'b1', 'timeline')).toBe('?board=b1&view=timeline');
    });
    it('omits the view param for the default kanban view', () => {
        expect(buildBoardSearch('?view=timeline', 'b1', 'kanban')).toBe('?board=b1');
    });
    it('drops an unknown view instead of writing it', () => {
        expect(buildBoardSearch('', 'b1', 'wat')).toBe('?board=b1');
    });
    it('sets the board param on an empty search', () => {
        expect(buildBoardSearch('', 'board-1')).toBe('?board=board-1');
    });
    it('replaces an existing board param', () => {
        expect(buildBoardSearch('?board=old', 'board-new')).toBe('?board=board-new');
    });
    it('preserves unrelated params', () => {
        const out = buildBoardSearch('?foo=bar&board=old', 'b2');
        expect(out).toContain('foo=bar');
        expect(out).toContain('board=b2');
    });
    it('removes the param when boardId is falsy', () => {
        expect(buildBoardSearch('?board=old', null)).toBe('');
        expect(buildBoardSearch('?foo=bar&board=old', null)).toBe('?foo=bar');
    });
});

describe('resolveInitialBoardId', () => {
    const envelope = {
        version: 2,
        currentBoardId: 'board-stored',
        boards: [{ id: 'board-stored' }, { id: 'board-shared' }]
    };
    it('prefers a URL board that exists in the envelope', () => {
        expect(resolveInitialBoardId(envelope, '?board=board-shared')).toBe('board-shared');
    });
    it('falls back to stored currentBoardId when the URL board is unknown', () => {
        expect(resolveInitialBoardId(envelope, '?board=board-deleted')).toBe('board-stored');
    });
    it('falls back to stored currentBoardId without a URL param', () => {
        expect(resolveInitialBoardId(envelope, '')).toBe('board-stored');
    });
    it('defaults to board-default when the envelope has no currentBoardId', () => {
        expect(resolveInitialBoardId({ boards: [] }, '')).toBe('board-default');
        expect(resolveInitialBoardId(null, '?board=x')).toBe('board-default');
    });
});
