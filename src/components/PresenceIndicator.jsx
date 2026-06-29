import { memo } from 'react';
import { initialsOf } from '../lib/presence.js';

// Small stacked-avatar row showing other collaborators currently on the board.
// Renders nothing when nobody else is present. Purely presentational — the live
// list comes from App's Supabase presence subscription.
const MAX_AVATARS = 4;

function PresenceIndicator({ collaborators = [] }) {
    if (!collaborators.length) return null;

    const shown = collaborators.slice(0, MAX_AVATARS);
    const overflow = collaborators.length - shown.length;
    const names = collaborators.map(c => c.name).join(', ');

    return (
        <div
            className="presence-row"
            title={`Online now: ${names}`}
            aria-label={`${collaborators.length} collaborator${collaborators.length > 1 ? 's' : ''} online`}
            style={{ display: 'flex', alignItems: 'center', marginRight: 8 }}
        >
            {shown.map((c, i) => (
                <div
                    key={c.id}
                    title={c.name + (c.isGuest ? ' (guest)' : '')}
                    style={{
                        width: 26, height: 26, borderRadius: '50%',
                        marginLeft: i === 0 ? 0 : -8,
                        background: c.color, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        border: '2px solid var(--bg-primary, #fff)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        overflow: 'hidden', flexShrink: 0,
                    }}
                >
                    {c.avatarUrl
                        ? <img src={c.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initialsOf(c.name)}
                </div>
            ))}
            {overflow > 0 && (
                <div
                    title={names}
                    style={{
                        width: 26, height: 26, borderRadius: '50%', marginLeft: -8,
                        background: 'var(--text-secondary, #6b7280)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, border: '2px solid var(--bg-primary, #fff)',
                        flexShrink: 0,
                    }}
                >
                    +{overflow}
                </div>
            )}
            <span className="presence-pulse" aria-hidden="true" style={{
                width: 7, height: 7, borderRadius: '50%', background: '#10b981', marginLeft: 6,
            }} />
        </div>
    );
}

export default memo(PresenceIndicator);
