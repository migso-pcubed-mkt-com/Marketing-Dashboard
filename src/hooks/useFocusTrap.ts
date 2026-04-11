import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
].join(', ');

/**
 * Trap focus inside a dialog while it's open.
 * - On mount: focuses the first focusable element (or the container).
 * - Tab / Shift+Tab cycle through focusable children.
 * - On unmount: restores focus to the element that was focused before the dialog opened.
 */
export function useFocusTrap(isOpen: boolean): React.RefObject<HTMLDivElement | null> {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const previousFocusRef = useRef<Element | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        previousFocusRef.current = document.activeElement;

        const container = containerRef.current;
        if (!container) return;

        const focusFirst = () => {
            const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            if (first) {
                first.focus();
            } else {
                container.focus();
            }
        };

        const raf = requestAnimationFrame(focusFirst);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first || !container.contains(document.activeElement)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last || !container.contains(document.activeElement)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('keydown', handleKeyDown, true);
            if (previousFocusRef.current && typeof (previousFocusRef.current as HTMLElement).focus === 'function') {
                (previousFocusRef.current as HTMLElement).focus();
            }
        };
    }, [isOpen]);

    return containerRef;
}
