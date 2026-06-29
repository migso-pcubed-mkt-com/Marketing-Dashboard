// Collaborator presence for the live board, backed by Supabase Realtime "presence".
// Pure helpers here are unit-testable; the channel wiring lives in App.jsx and no-ops
// when Supabase is unavailable (guest/offline) so nothing breaks without a connection.

const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

/** Deterministic, stable colour for a presence id (so the same person keeps one colour). */
export const colorForId = (id) => {
    const s = String(id || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
};

/** Initials for an avatar fallback (max 2 chars). */
export const initialsOf = (name) => {
    const parts = String(name || 'Guest').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * The presence payload this client broadcasts. `sessionId` is unique per tab so a user
 * with two tabs still tracks correctly; `id` is the stable person id (Trello id, or the
 * sessionId for guests who have none).
 */
export const buildPresenceState = (trelloUser, boardId, sessionId) => {
    const id = trelloUser?.id || sessionId;
    return {
        id,
        sessionId,
        name: trelloUser?.fullName || trelloUser?.username || 'Guest',
        avatarUrl: trelloUser?.avatarUrl || null,
        isGuest: !trelloUser,
        boardId: boardId || null,
        color: colorForId(id),
    };
};

/**
 * Reduce Supabase `channel.presenceState()` (a map of presence-key → array of metas)
 * into a deduped list of OTHER collaborators.
 * - Excludes self (any meta whose `id` === selfId — covers the viewer's own extra tabs).
 * - Dedupes by person `id` (multiple tabs of the same person collapse to one entry).
 * - Keeps a stable order by name then id so the avatar row doesn't reshuffle.
 */
export const derivePresenceList = (presenceState, selfId) => {
    const byId = new Map();
    for (const key of Object.keys(presenceState || {})) {
        const metas = presenceState[key] || [];
        for (const meta of metas) {
            if (!meta || !meta.id) continue;
            if (meta.id === selfId) continue;
            if (!byId.has(meta.id)) {
                byId.set(meta.id, {
                    id: meta.id,
                    name: meta.name || 'Guest',
                    avatarUrl: meta.avatarUrl || null,
                    isGuest: !!meta.isGuest,
                    boardId: meta.boardId || null,
                    color: meta.color || colorForId(meta.id),
                });
            }
        }
    }
    return [...byId.values()].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id));
};
