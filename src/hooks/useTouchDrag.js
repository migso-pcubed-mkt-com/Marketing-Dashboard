import { useRef, useState, useCallback } from 'react';

/**
 * Reusable touch drag-and-drop hook.
 * Works alongside HTML5 Drag API (mouse) without conflict.
 *
 * Usage:
 *   const { touchHandlers, isDragging } = useTouchDrag({
 *       itemAttribute: 'data-task-id',
 *       onReorder: (draggedId, targetId, position) => { ... },
 *       longPressMs: 300,
 *   });
 *   // Spread touchHandlers onto each draggable item
 *
 * For index-based reorder (like CategoriesManagementModal):
 *   const { touchHandlers, isDragging } = useTouchDrag({
 *       itemAttribute: 'data-drag-index',
 *       onReorderByIndex: (fromIndex, toIndex) => { ... },
 *   });
 */
export function useTouchDrag({
    itemAttribute = 'data-drag-id',
    longPressMs = 300,
    onReorder,          // (draggedId, targetId, position) => void
    onReorderByIndex,   // (fromIndex, toIndex) => void — for index-based reorder
    onDrop,             // (draggedId, targetInfo) => void — for cross-container drops
    dropAttribute,      // e.g. 'data-date' for CalendarView drop zones
    disabled = false,
} = {}) {
    const [isDragging, setIsDragging] = useState(false);
    const [draggedId, setDraggedId] = useState(null);
    const touchTimeoutRef = useRef(null);
    const draggedIdRef = useRef(null);
    const startPosRef = useRef(null);
    const ghostRef = useRef(null);

    const cleanup = useCallback(() => {
        if (touchTimeoutRef.current) {
            clearTimeout(touchTimeoutRef.current);
            touchTimeoutRef.current = null;
        }
        if (ghostRef.current) {
            ghostRef.current.remove();
            ghostRef.current = null;
        }
        // Remove all drag-over highlights
        document.querySelectorAll('.touch-drag-over').forEach(el =>
            el.classList.remove('touch-drag-over')
        );
        setIsDragging(false);
        setDraggedId(null);
        draggedIdRef.current = null;
    }, []);

    const handleTouchStart = useCallback((e) => {
        if (disabled) return;
        const item = e.currentTarget.closest(`[${itemAttribute}]`);
        if (!item) return;
        const id = item.getAttribute(itemAttribute);
        const touch = e.touches[0];
        startPosRef.current = { x: touch.clientX, y: touch.clientY };

        touchTimeoutRef.current = setTimeout(() => {
            draggedIdRef.current = id;
            setDraggedId(id);
            setIsDragging(true);
            if (navigator.vibrate) navigator.vibrate(50);
            // Prevent scroll while dragging
            item.style.opacity = '0.5';
        }, longPressMs);
    }, [itemAttribute, longPressMs, disabled]);

    const handleTouchMove = useCallback((e) => {
        if (!draggedIdRef.current) {
            // Cancel long-press if finger moved too much before activation
            if (startPosRef.current && touchTimeoutRef.current) {
                const touch = e.touches[0];
                const dx = Math.abs(touch.clientX - startPosRef.current.x);
                const dy = Math.abs(touch.clientY - startPosRef.current.y);
                if (dx > 10 || dy > 10) {
                    clearTimeout(touchTimeoutRef.current);
                    touchTimeoutRef.current = null;
                }
            }
            return;
        }
        e.preventDefault(); // Prevent scroll while dragging

        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el) return;

        // Remove previous highlights
        document.querySelectorAll('.touch-drag-over').forEach(node =>
            node.classList.remove('touch-drag-over')
        );

        // Cross-container drop (e.g. calendar day cells)
        if (dropAttribute) {
            const dropZone = el.closest(`[${dropAttribute}]`);
            if (dropZone) {
                dropZone.classList.add('touch-drag-over');
            }
            return;
        }

        // Same-container reorder
        const target = el.closest(`[${itemAttribute}]`);
        if (!target) return;
        const targetId = target.getAttribute(itemAttribute);
        if (targetId === draggedIdRef.current) return;

        if (onReorderByIndex) {
            // Index-based: reorder immediately on move
            const fromIdx = parseInt(draggedIdRef.current);
            const toIdx = parseInt(targetId);
            if (!isNaN(fromIdx) && !isNaN(toIdx) && fromIdx !== toIdx) {
                onReorderByIndex(fromIdx, toIdx);
                draggedIdRef.current = String(toIdx);
                setDraggedId(String(toIdx));
            }
        } else {
            // ID-based: show indicator
            const rect = target.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const position = touch.clientY < midpoint ? 'before' : 'after';
            target.classList.add('touch-drag-over');
            target.setAttribute('data-touch-pos', position);
        }
    }, [itemAttribute, dropAttribute, onReorderByIndex]);

    const handleTouchEnd = useCallback((e) => {
        const wasDragging = !!draggedIdRef.current;
        const currentDraggedId = draggedIdRef.current;

        if (wasDragging) {
            // Restore opacity on the dragged element
            const draggedEl = document.querySelector(`[${itemAttribute}="${currentDraggedId}"]`);
            if (draggedEl) draggedEl.style.opacity = '';

            if (dropAttribute && onDrop) {
                // Cross-container drop
                const touch = e.changedTouches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                if (el) {
                    const dropZone = el.closest(`[${dropAttribute}]`);
                    if (dropZone) {
                        const dropValue = dropZone.getAttribute(dropAttribute);
                        onDrop(currentDraggedId, dropValue);
                    }
                }
            } else if (onReorder) {
                // Same-container reorder — find target with indicator
                const target = document.querySelector('.touch-drag-over');
                if (target) {
                    const targetId = target.getAttribute(itemAttribute);
                    const position = target.getAttribute('data-touch-pos') || 'after';
                    if (targetId && targetId !== currentDraggedId) {
                        onReorder(currentDraggedId, targetId, position);
                    }
                }
            }
        }

        cleanup();
    }, [itemAttribute, dropAttribute, onReorder, onDrop, cleanup]);

    return {
        touchHandlers: {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
        },
        isDragging,
        draggedId,
    };
}
