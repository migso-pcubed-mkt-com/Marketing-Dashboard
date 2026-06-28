// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useUndoRedo from '../hooks/useUndoRedo.js';

// Builds a minimal v2 envelope whose single action carries `name`.
const make = (name) => ({
    version: 2,
    currentBoardId: 'b1',
    boards: [{
        id: 'b1', name: 'B', categories: [],
        actions: [{ id: 'a1', name, categoryId: 'c1', order: 0, updatedAt: '2026-01-01T00:00:00.000Z' }],
        tasks: []
    }]
});
const nameOf = (s) => s.boards[0].actions[0].name;

// Drives the hook the way App.jsx does: pushState records the PRE-change snapshot
// before each edit, then the live state advances.
function setup(initialName) {
    let live = make(initialName);
    const setBoardData = (u) => { live = typeof u === 'function' ? u(live) : u; };
    const { result } = renderHook(() => useUndoRedo(setBoardData, () => live));
    const edit = (toName, label) => {
        act(() => { result.current.pushState(live, label); });
        live = make(toName);
    };
    return { result, edit, get: () => live };
}

describe('useUndoRedo — undo/redo sequencing (regression for the pre-change snapshot model)', () => {
    it('walks undo one step at a time without skipping the most recent edit', () => {
        const { result, edit, get } = setup('orig');
        edit('AAA', 'e1');
        edit('BBB', 'e2');
        edit('CCC', 'e3'); // live is now CCC, never pushed

        act(() => { result.current.undo(); });
        expect(nameOf(get())).toBe('BBB'); // was 'AAA' before the fix (skipped a step)
        act(() => { result.current.undo(); });
        expect(nameOf(get())).toBe('AAA');
        act(() => { result.current.undo(); });
        expect(nameOf(get())).toBe('orig');
    });

    it('redo can return all the way to the latest edit', () => {
        const { result, edit, get } = setup('orig');
        edit('AAA', 'e1');
        edit('BBB', 'e2');
        edit('CCC', 'e3');

        act(() => { result.current.undo(); }); // -> BBB
        act(() => { result.current.undo(); }); // -> AAA
        act(() => { result.current.undo(); }); // -> orig
        act(() => { result.current.redo(); });
        expect(nameOf(get())).toBe('AAA');
        act(() => { result.current.redo(); });
        expect(nameOf(get())).toBe('BBB');
        act(() => { result.current.redo(); });
        expect(nameOf(get())).toBe('CCC'); // unreachable before the fix
    });

    it('can undo a single edit (tip materialization)', () => {
        const { result, edit, get } = setup('orig');
        edit('AAA', 'e1');
        act(() => { result.current.undo(); });
        expect(nameOf(get())).toBe('orig'); // was a no-op before the fix
    });

    it('a new edit after undo truncates the redo branch', async () => {
        const { result, edit, get } = setup('orig');
        edit('AAA', 'e1');
        edit('BBB', 'e2');
        act(() => { result.current.undo(); }); // -> AAA, BBB ahead
        // Flush the post-undo isUndoRedoRef reset (a setTimeout(0)), mirroring the real
        // app where a new edit always lands in a later task than the undo. Without this,
        // pushState would be (correctly) suppressed as an undo-echo.
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        edit('ZZZ', 'e3'); // new branch from AAA — truncates BBB
        expect(result.current.canRedo).toBe(false);
        act(() => { result.current.undo(); });
        expect(nameOf(get())).toBe('AAA');
    });
});
