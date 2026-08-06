import { describe, it, expect } from 'vitest';
import { getBoardIdFromSearch, buildBoardSearch, resolveInitialBoardId } from '../lib/boardUrl.js';

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

describe('buildBoardSearch', () => {
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
