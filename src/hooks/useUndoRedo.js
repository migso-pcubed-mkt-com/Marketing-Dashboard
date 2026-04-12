import { useRef, useCallback, useState } from 'react';

/**
 * Ring-buffer based undo/redo hook for board state.
 * Stores JSON-serialized snapshots to avoid shared references.
 *
 * Usage in App.jsx:
 *   const { pushState, undo, redo, canUndo, canRedo } = useUndoRedo(setBoardData);
 *   // Call pushState(boardData, 'Task updated') before each user mutation
 *   // Call undo() / redo() from UI buttons or Ctrl+Z / Ctrl+Shift+Z
 */
const MAX_HISTORY = 30;

export default function useUndoRedo(setBoardData) {
    const historyRef = useRef([]);    // ring buffer of { json, label }
    const indexRef = useRef(-1);      // current position in history
    const isUndoRedoRef = useRef(false); // prevents recording during undo/redo

    // Force re-render when canUndo/canRedo changes
    const [, forceUpdate] = useState(0);

    const canUndo = indexRef.current > 0;
    const canRedo = indexRef.current < historyRef.current.length - 1;

    /**
     * Push current boardData as a snapshot before a mutation.
     * Call this BEFORE the mutation happens (captures the "before" state).
     */
    const pushState = useCallback((boardData, label = '') => {
        if (isUndoRedoRef.current) return;
        if (!boardData) return;

        const json = JSON.stringify(boardData);

        // If we undid some steps and then make a new change, discard the redo branch
        if (indexRef.current < historyRef.current.length - 1) {
            historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
        }

        historyRef.current.push({ json, label });

        // Trim to max size
        if (historyRef.current.length > MAX_HISTORY) {
            historyRef.current = historyRef.current.slice(historyRef.current.length - MAX_HISTORY);
        }

        indexRef.current = historyRef.current.length - 1;
        forceUpdate(n => n + 1);
    }, []);

    /**
     * Undo: restore the previous snapshot.
     */
    const undo = useCallback(() => {
        if (indexRef.current <= 0) return null;

        indexRef.current -= 1;
        const entry = historyRef.current[indexRef.current];
        const restored = JSON.parse(entry.json);

        isUndoRedoRef.current = true;
        setBoardData(restored);
        // Reset flag after React processes the state update
        setTimeout(() => { isUndoRedoRef.current = false; }, 0);

        forceUpdate(n => n + 1);
        return entry.label;
    }, [setBoardData]);

    /**
     * Redo: advance to the next snapshot.
     */
    const redo = useCallback(() => {
        if (indexRef.current >= historyRef.current.length - 1) return null;

        indexRef.current += 1;
        const entry = historyRef.current[indexRef.current];
        const restored = JSON.parse(entry.json);

        isUndoRedoRef.current = true;
        setBoardData(restored);
        setTimeout(() => { isUndoRedoRef.current = false; }, 0);

        forceUpdate(n => n + 1);
        return entry.label;
    }, [setBoardData]);

    return { pushState, undo, redo, canUndo, canRedo, isUndoRedoRef };
}
