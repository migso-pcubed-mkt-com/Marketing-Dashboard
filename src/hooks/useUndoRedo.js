import { useRef, useCallback, useState } from 'react';

const MAX_HISTORY = 60;

export default function useUndoRedo(setBoardData) {
    const historyRef = useRef([]);
    const indexRef = useRef(-1);
    const isUndoRedoRef = useRef(false);
    const suspendedRef = useRef(false);

    const [, forceUpdate] = useState(0);

    const canUndo = indexRef.current > 0;
    const canRedo = indexRef.current < historyRef.current.length - 1;

    const pushState = useCallback((boardData, label = '') => {
        if (isUndoRedoRef.current) return;
        if (suspendedRef.current) return;
        if (!boardData) return;

        let json;
        try { json = JSON.stringify(boardData); }
        catch (e) { console.warn('useUndoRedo: failed to serialize state, skipping snapshot', e); return; }

        if (indexRef.current < historyRef.current.length - 1) {
            historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
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
