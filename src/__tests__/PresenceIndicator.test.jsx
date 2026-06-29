// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import PresenceIndicator from '../components/PresenceIndicator.jsx';

afterEach(cleanup);

const collab = (id, name, extra = {}) => ({ id, name, color: '#6366f1', isGuest: false, ...extra });

describe('PresenceIndicator', () => {
    it('renders nothing when there are no collaborators', () => {
        const { container } = render(<PresenceIndicator collaborators={[]} />);
        expect(container.querySelector('.presence-row')).toBeNull();
    });

    it('renders one avatar per collaborator (with initials fallback)', () => {
        const { container, getByText } = render(
            <PresenceIndicator collaborators={[collab('u1', 'Ada Lovelace'), collab('u2', 'Grace Hopper')]} />
        );
        expect(container.querySelector('.presence-row')).not.toBeNull();
        expect(getByText('AL')).toBeTruthy();
        expect(getByText('GH')).toBeTruthy();
    });

    it('caps avatars at 4 and shows a +N overflow chip', () => {
        const many = Array.from({ length: 6 }, (_, i) => collab('u' + i, 'User ' + i));
        const { getByText, container } = render(<PresenceIndicator collaborators={many} />);
        // 4 shown + 1 overflow chip = 5 circular nodes inside the row (+ the pulse dot)
        expect(getByText('+2')).toBeTruthy();
        expect(container.querySelector('.presence-row').getAttribute('aria-label')).toMatch(/6 collaborators online/);
    });

    it('uses an <img> when an avatarUrl is provided', () => {
        const { container } = render(
            <PresenceIndicator collaborators={[collab('u1', 'Ada', { avatarUrl: 'https://x/y.png' })]} />
        );
        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        expect(img.getAttribute('src')).toBe('https://x/y.png');
    });
});
