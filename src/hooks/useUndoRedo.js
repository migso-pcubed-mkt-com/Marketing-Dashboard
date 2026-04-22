import { useRef, useCallback, useState } from 'react';

const MAX_HISTORY = 60;
const DEFAULT_COALESCE_MS = 400;

export default function useUndoRedo(setBoardData) {
    const historyRef = useRef([]);
    const indexRef = useRef(-1);
    const isUndoRedoRef = useRef(false);
    const suspendedRef = useRef(false);

    const [, forceUpdate] = useState(0);

    const canUndo = indexRef.current > 0;
    const canRedo = indexRef.current < historyRef.current.length - 1;

    // pushState(boardData, label, { coalesceMs })
    // label: describes the user-visible change (e.g. "Task 'Foo' updated")
    // coalesceMs: if the previous entry shares the same label and was pushed within
    //   this window, skip the new push to keep the pre-change snapshot intact.
    //   Used for continuous actions like Timeline resize/drag so a single entry is
    //   kept per gesture.
    const pushState = useCallback((boardData, label = '', options = {}) => {
        if (isUndoRedoRef.current) return;
        if (suspendedRef.current) return;
        if (!boardData) return;

        let json;
        try { json = JSON.stringify(boardData); }
        catch (e) { console.warn('useUndoRedo: failed to serialize state, skipping snapshot', e); return; }

        if (indexRef.current < historyRef.current.length - 1) {
            historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
        }

        const coalesceMs = Number.isFinite(options.coalesceMs) ? options.coalesceMs : DEFAULT_COALESCE_MS;
        const last = historyRef.current[historyRef.current.length - 1];
        if (
            coalesceMs > 0 &&
            last &&
            label &&
            last.label === label &&
            Date.now() - last.timestamp < coalesceMs &&
            indexRef.current === historyRef.current.length - 1
        ) {
            // Keep the earlier (pre-change) snapshot, just bump timestamp so
            // subsequent pushes within the window continue to coalesce.
            last.timestamp = Date.now();
            forceUpdate(n => n + 1);
            return;
        }

        historyRef.current.push({ json, label, timestamp: Date.now() });

        if (historyRef.current.length > MAX_HISTORY) {
            historyRef.current = historyRef.current.slice(historyRef.current.length - MAX_HISTORY);
        }

        indexRef.current = historyRef.current.length - 1;
        forceUpdate(n => n + 1);
    }, []);

    const undo = useCallback(() => {
        if (indexRef.current <= 0) return null;

        indexRef.current -= 1;
        const entry = historyRef.current[indexRef.current];
        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse undo state', e); return null; }

        isUndoRedoRef.current = true;
        setBoardData(restored);
        setTimeout(() => { isUndoRedoRef.current = false; }, 0);

        forceUpdate(n => n + 1);
        return entry.label;
    }, [setBoardData]);

    const redo = useCallback(() => {
        if (indexRef.current >= historyRef.current.length - 1) return null;

        indexRef.current += 1;
        const entry = historyRef.current[indexRef.current];
        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse redo state', e); return null; }

        isUndoRedoRef.current = true;
        setBoardData(restored);
        setTimeout(() => { isUndoRedoRef.current = false; }, 0);

        forceUpdate(n => n + 1);
        return entry.label;
    }, [setBoardData]);

    const jumpTo = useCallback((targetIndex) => {
        if (targetIndex < 0 || targetIndex >= historyRef.current.length) return null;
        if (targetIndex === indexRef.current) return null;

        const entry = historyRef.current[targetIndex];
        let restored;
        try { restored = JSON.parse(entry.json); }
        catch (e) { console.warn('useUndoRedo: failed to parse jump state', e); return null; }

        indexRef.current = targetIndex;
        isUndoRedoRef.current = true;
        setBoardData(restored);
        setTimeout(() => { isUndoRedoRef.current = false; }, 0);

        forceUpdate(n => n + 1);
        return entry.label;
    }, [setBoardData]);

    const clear = useCallback(() => {
        historyRef.current = [];
        indexRef.current = -1;
        forceUpdate(n => n + 1);
    }, []);

    const suspend = useCallback(() => { suspendedRef.current = true; }, []);
    const resume = useCallback(() => { suspendedRef.current = false; }, []);

    const getHistory = useCallback(() => (
        historyRef.current.map((entry, idx) => ({
            index: idx,
            label: entry.label,
            timestamp: entry.timestamp,
            isCurrent: idx === indexRef.current
        }))
    ), []);

    return {
        pushState, undo, redo, jumpTo, clear,
        canUndo, canRedo,
        isUndoRedoRef,
        suspend, resume,
        getHistory,
        currentIndex: indexRef.current
    };
}
