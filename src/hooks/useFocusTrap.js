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
 *
 * @param {boolean} isOpen — whether the dialog is currently visible
 * @returns {React.RefObject} — attach this ref to the dialog container element
 */
export function useFocusTrap(isOpen) {
    const containerRef = useRef(null);
    const previousFocusRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        // Remember what was focused before the dialog opened
        previousFocusRef.current = document.activeElement;

        const container = containerRef.current;
        if (!container) return;

        // Focus the first focusable element, or the container itself
        const focusFirst = () => {
            const first = container.querySelector(FOCUSABLE_SELECTOR);
            if (first) {
                first.focus();
            } else {
                container.focus();
            }
        };

        // Small delay to let the DOM render
        const raf = requestAnimationFrame(focusFirst);

        const handleKeyDown = (e) => {
            if (e.key !== 'Tab') return;

            const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)];
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                // Shift+Tab: wrap from first → last
                if (document.activeElement === first || !container.contains(document.activeElement)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab: wrap from last → first
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
            // Restore focus to the previously focused element
            if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
                previousFocusRef.current.focus();
            }
        };
    }, [isOpen]);

    return containerRef;
}
