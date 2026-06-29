// Deletion tombstones for collaborative merge (M18).
//
// Problem: the entity-level merge (`mergeEntitiesByTimestamp`) treats an entity that
// is present locally but absent from the incoming server copy as "created locally,
// not yet on the server" and re-adds it. When user A deletes a task and user B still
// has it, B's copy resurrects the task on the next merge. A *deletion* and a *creation*
// are indistinguishable to a pure presence diff.
//
// Fix: when an entity is deleted we record a tombstone `{ id, type, deletedAt }` on the
// board. Tombstones travel with the board (Supabase / GitHub / localStorage), are merged
// as a union (newest `deletedAt` per id), and the entity merge drops any entity whose
// latest tombstone is at-or-newer than the entity's own `updatedAt`. An edit that happens
// *after* a deletion (newer `updatedAt`) still wins — last-write-wins between edit & delete.
//
// Tombstones are garbage-collected after TOMBSTONE_TTL_MS so the array can't grow forever;
// the TTL is long enough that any replica syncing within the window honours the deletion.

export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const toMs = (iso) => {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? 0 : t;
};

/**
 * Union-merge tombstone entries into an existing tombstone array.
 * - Dedupes by id, keeping the newest `deletedAt`.
 * - New entries without an explicit `deletedAt` are stamped with `now`.
 * - Prunes entries older than TOMBSTONE_TTL_MS.
 *
 * @param {Array<{id,type,deletedAt}>} existing
 * @param {Array<{id,type,deletedAt}>} entries  new deletions (or another tombstone array to merge)
 * @param {number} now  epoch ms (injectable for tests)
 * @returns {Array<{id,type,deletedAt}>}
 */
export const addTombstones = (existing = [], entries = [], now = Date.now()) => {
    const nowIso = new Date(now).toISOString();
    const byId = new Map();
    const put = (raw) => {
        if (!raw || !raw.id) return;
        const deletedAt = raw.deletedAt || nowIso;
        const ts = toMs(deletedAt);
        const cur = byId.get(raw.id);
        if (!cur || ts >= toMs(cur.deletedAt)) {
            byId.set(raw.id, { id: raw.id, type: raw.type || cur?.type, deletedAt });
        }
    };
    (existing || []).forEach(put);
    (entries || []).forEach(put);
    const cutoff = now - TOMBSTONE_TTL_MS;
    return [...byId.values()].filter((t) => toMs(t.deletedAt) >= cutoff);
};

/** Alias — merging two tombstone arrays is the same union operation. */
export const mergeTombstones = addTombstones;

/**
 * Build a `Map<id, deletedAtMs>` (newest deletion per id) from a tombstone array.
 * Returns null for an empty/absent array so callers can cheaply skip tombstone logic.
 */
export const tombstoneMap = (tombs) => {
    if (!tombs || tombs.length === 0) return null;
    const m = new Map();
    for (const t of tombs) {
        if (!t || !t.id) continue;
        const ts = toMs(t.deletedAt);
        const prev = m.get(t.id);
        if (prev === undefined || ts > prev) m.set(t.id, ts);
    }
    return m;
};

/**
 * True when `entity` is covered by a tombstone that is at-or-newer than the entity's
 * own `updatedAt` — i.e. the deletion is the latest operation and the entity should be
 * dropped. A later edit (entity.updatedAt > tombstone) returns false (edit wins).
 */
export const isTombstoned = (entity, tombMap) => {
    if (!tombMap || !entity) return false;
    const del = tombMap.get(entity.id);
    if (del === undefined) return false;
    return del >= toMs(entity.updatedAt);
};

/** Prune expired tombstones across every board in a v2 envelope (called on load/save). */
export const pruneEnvelopeTombstones = (boardData, now = Date.now()) => {
    if (!boardData?.boards) return boardData;
    let changed = false;
    const boards = boardData.boards.map((b) => {
        if (!b.deletions || b.deletions.length === 0) return b;
        const pruned = addTombstones(b.deletions, [], now);
        if (pruned.length === b.deletions.length) return b;
        changed = true;
        return { ...b, deletions: pruned };
    });
    let boardTombs = boardData.boardDeletions;
    if (boardTombs && boardTombs.length) {
        const prunedBoards = addTombstones(boardTombs, [], now);
        if (prunedBoards.length !== boardTombs.length) { boardTombs = prunedBoards; changed = true; }
    }
    if (!changed) return boardData;
    return { ...boardData, boards, ...(boardTombs !== undefined ? { boardDeletions: boardTombs } : {}) };
};
