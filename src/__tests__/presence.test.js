import { describe, it, expect } from 'vitest';
import { buildPresenceState, derivePresenceList, colorForId, initialsOf } from '../lib/presence.js';

describe('presence — buildPresenceState', () => {
    it('uses the Trello id as the stable person id and a derived colour', () => {
        const s = buildPresenceState({ id: 'u1', fullName: 'Ada Lovelace', avatarUrl: 'x.png' }, 'b1', 'sess-1');
        expect(s).toMatchObject({ id: 'u1', sessionId: 'sess-1', name: 'Ada Lovelace', avatarUrl: 'x.png', isGuest: false, boardId: 'b1' });
        expect(s.color).toBe(colorForId('u1'));
    });

    it('falls back to the sessionId + Guest for an unauthenticated user', () => {
        const s = buildPresenceState(null, 'b1', 'sess-2');
        expect(s).toMatchObject({ id: 'sess-2', name: 'Guest', isGuest: true });
    });

    it('uses username when fullName is absent', () => {
        const s = buildPresenceState({ id: 'u2', username: 'grace' }, null, 'sess-3');
        expect(s.name).toBe('grace');
        expect(s.boardId).toBeNull();
    });
});

describe('presence — derivePresenceList', () => {
    const meta = (id, name, extra = {}) => ({ id, sessionId: 's-' + id, name, color: '#000', ...extra });

    it('excludes self (by person id, covering the viewer\'s own extra tabs)', () => {
        const state = {
            's-me-1': [meta('me', 'Me')],
            's-me-2': [meta('me', 'Me')],         // my second tab — different key, same id
            's-her': [meta('her', 'Grace')],
        };
        const list = derivePresenceList(state, 'me');
        expect(list.map(c => c.id)).toEqual(['her']);
    });

    it('dedupes multiple tabs of the same other person into one entry', () => {
        const state = {
            'k1': [meta('u1', 'Ada')],
            'k2': [meta('u1', 'Ada')],
            'k3': [meta('u2', 'Babbage')],
        };
        const list = derivePresenceList(state, 'self');
        expect(list.map(c => c.id).sort()).toEqual(['u1', 'u2']);
    });

    it('sorts by name then id for a stable avatar row', () => {
        const state = {
            'k1': [meta('z', 'Zoe')],
            'k2': [meta('a', 'Ada')],
            'k3': [meta('m', 'Max')],
        };
        const list = derivePresenceList(state, 'self');
        expect(list.map(c => c.name)).toEqual(['Ada', 'Max', 'Zoe']);
    });

    it('handles empty/undefined presence state', () => {
        expect(derivePresenceList(undefined, 'self')).toEqual([]);
        expect(derivePresenceList({}, 'self')).toEqual([]);
    });

    it('skips malformed metas without an id', () => {
        const state = { k1: [{ name: 'no-id' }, null, meta('ok', 'OK')] };
        expect(derivePresenceList(state, 'self').map(c => c.id)).toEqual(['ok']);
    });
});

describe('presence — colorForId & initialsOf', () => {
    it('colorForId is deterministic and within the palette', () => {
        expect(colorForId('abc')).toBe(colorForId('abc'));
        expect(colorForId('abc')).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('initialsOf returns up to 2 uppercase chars', () => {
        expect(initialsOf('Ada Lovelace')).toBe('AL');
        expect(initialsOf('grace')).toBe('GR');
        expect(initialsOf('')).toBe('GU');        // empty → "Guest" fallback
        expect(initialsOf('   ')).toBe('?');       // whitespace-only → no initials
        expect(initialsOf('  Jean   Pierre  Dupont ')).toBe('JD');
    });
});
