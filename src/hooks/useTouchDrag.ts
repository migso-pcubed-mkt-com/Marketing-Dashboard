import { useRef, useState, useCallback } from 'react';

interface UseTouchDragOptions {
    itemAttribute?: string;
    longPressMs?: number;
    onReorder?: (draggedId: string, targetId: string, position: string) => void;
    onReorderByIndex?: (fromIndex: number, toIndex: number) => void;
    onDrop?: (draggedId: string, targetInfo: string) => void;
    dropAttribute?: string;
    disabled?: boolean;
}

interface UseTouchDragReturn {
    touchHandlers: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    isDragging: boolean;
    draggedId: string | null;
}

export function useTouchDrag({
    itemAttribute = 'data-drag-id',
    longPressMs = 300,
    onReorder,
    onReorderByIndex,
    onDrop,
    dropAttribute,
    disabled = false,
}: UseTouchDragOptions = {}): UseTouchDragReturn {
    const [isDragging, setIsDragging] = useState(false);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const touchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const draggedIdRef = useRef<string | null>(null);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);
    const ghostRef = useRef<HTMLElement | null>(null);

    const cleanup = useCallback(() => {
        if (touchTimeoutRef.current) {
            clearTimeout(touchTimeoutRef.current);
            touchTimeoutRef.current = null;
        }
        if (ghostRef.current) {
            ghostRef.current.remove();
            ghostRef.current = null;
        }
        document.querySelectorAll('.touch-drag-over').forEach(el =>
            el.classList.remove('touch-drag-over')
        );
        setIsDragging(false);
        setDraggedId(null);
        draggedIdRef.current = null;
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled) return;
        const item = (e.currentTarget as HTMLElement).closest(`[${itemAttribute}]`) as HTMLElement | null;
        if (!item) return;
        const id = item.getAttribute(itemAttribute);
        const touch = e.touches[0];
        startPosRef.current = { x: touch.clientX, y: touch.clientY };

        touchTimeoutRef.current = setTimeout(() => {
            draggedIdRef.current = id;
            setDraggedId(id);
            setIsDragging(true);
            if (navigator.vibrate) navigator.vibrate(50);
            item.style.opacity = '0.5';
        }, longPressMs);
    }, [itemAttribute, longPressMs, disabled]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!draggedIdRef.current) {
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
        e.preventDefault();

        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el) return;

        document.querySelectorAll('.touch-drag-over').forEach(node =>
            node.classList.remove('touch-drag-over')
        );

        if (dropAttribute) {
            const dropZone = el.closest(`[${dropAttribute}]`);
            if (dropZone) {
                dropZone.classList.add('touch-drag-over');
            }
            return;
        }

        const target = el.closest(`[${itemAttribute}]`) as HTMLElement | null;
        if (!target) return;
        const targetId = target.getAttribute(itemAttribute);
        if (targetId === draggedIdRef.current) return;

        if (onReorderByIndex) {
            const fromIdx = parseInt(draggedIdRef.current!);
            const toIdx = parseInt(targetId!);
            if (!isNaN(fromIdx) && !isNaN(toIdx) && fromIdx !== toIdx) {
                onReorderByIndex(fromIdx, toIdx);
                draggedIdRef.current = String(toIdx);
                setDraggedId(String(toIdx));
            }
        } else {
            const rect = target.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const position = touch.clientY < midpoint ? 'before' : 'after';
            target.classList.add('touch-drag-over');
            target.setAttribute('data-touch-pos', position);
        }
    }, [itemAttribute, dropAttribute, onReorderByIndex]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        const wasDragging = !!draggedIdRef.current;
        const currentDraggedId = draggedIdRef.current;

        if (wasDragging) {
            const draggedEl = document.querySelector(`[${itemAttribute}="${currentDraggedId}"]`) as HTMLElement | null;
            if (draggedEl) draggedEl.style.opacity = '';

            if (dropAttribute && onDrop) {
                const touch = e.changedTouches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                if (el) {
                    const dropZone = el.closest(`[${dropAttribute}]`);
                    if (dropZone) {
                        const dropValue = dropZone.getAttribute(dropAttribute);
                        onDrop(currentDraggedId!, dropValue!);
                    }
                }
            } else if (onReorder) {
                const target = document.querySelector('.touch-drag-over');
                if (target) {
                    const targetId = target.getAttribute(itemAttribute);
                    const position = target.getAttribute('data-touch-pos') || 'after';
                    if (targetId && targetId !== currentDraggedId) {
                        onReorder(currentDraggedId!, targetId, position);
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
