// Entity-level merge for collaborative editing.
// Instead of full-document replacement (last-write-wins), merges at entity level
// using updatedAt timestamps. Two users editing different tasks → both preserved.

import { mergeTombstones, tombstoneMap, isTombstoned } from './tombstones.js';

// Fields that are bookkeeping noise, not user-visible content. Two entity versions that
// differ ONLY in these are "the same" for conflict-notification purposes (no surprise to
// the user), so they never raise a conflict.
const VOLATILE_FIELDS = new Set([
    'updatedAt', 'createdAt', 'orderUpdatedAt', '_saveId',
    '_trelloBaseline', '_inheritChannels', '_inheritCountries', '_inheritOtherLabels',
    'trelloLastModified', 'dateLastActivity',
]);

const contentSignature = (e) => {
    if (!e || typeof e !== 'object') return JSON.stringify(e);
    const keys = Object.keys(e).filter(k => !VOLATILE_FIELDS.has(k)).sort();
    return JSON.stringify(keys.map(k => [k, e[k]]));
};

// True when two versions of the same entity differ in user-visible content.
const meaningfullyDiffers = (a, b) => contentSignature(a) !== contentSignature(b);

const entityName = (e, type) =>
    (type === 'task' ? e?.title : e?.name) || (type ? type[0].toUpperCase() + type.slice(1) : 'Item');

/**
 * Merge two arrays of entities by updatedAt timestamp.
 * For entities in both: keep the one with newer updatedAt.
 * Entities only in incoming: added (new from another user).
 * Entities only in local: kept (new locally, not yet on server).
 *
 * `tombMap` (optional, `Map<id, deletedAtMs>` from `tombstoneMap`) drops any entity
 * whose latest deletion tombstone is at-or-newer than its `updatedAt` (M18) — this is
 * what stops a deleted entity from resurrecting via a peer's stale copy.
 *
 * `conflictSink` (optional array) + `entityType`: when incoming wins over a meaningfully
 * different local version (a local edit is discarded), a `{ id, type, name }` record is
 * pushed so the caller can surface a non-silent "a teammate's change replaced yours"
 * notification instead of merging silently.
 */
export const mergeEntitiesByTimestamp = (localEntities = [], incomingEntities = [], tombMap = null, conflictSink = null, entityType = null) => {
    const localMap = new Map((localEntities || []).map(e => [e.id, e]));
    const result = [];
    const processedIds = new Set();

    // Process incoming entities in their order (authoritative from server)
    for (const incoming of (incomingEntities || [])) {
        const local = localMap.get(incoming.id);
        let chosen;
        if (local) {
            // Both have this entity — keep the newer one
            const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
            const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
            chosen = localTime > incomingTime ? local : incoming;
            // Conflict = the local version is being discarded for a different-content incoming one.
            if (conflictSink && chosen === incoming && meaningfullyDiffers(local, incoming)) {
                conflictSink.push({ id: incoming.id, type: entityType, name: entityName(incoming, entityType) });
            }
        } else {
            // Only in incoming — new from another user
            chosen = incoming;
        }
        processedIds.add(incoming.id);
        if (!isTombstoned(chosen, tombMap)) result.push(chosen);
    }

    // Add local-only entities (created locally, not yet on server) — unless a tombstone
    // (from either side, merged) says they were deleted at-or-after their last edit.
    for (const local of (localEntities || [])) {
        if (!processedIds.has(local.id) && !isTombstoned(local, tombMap)) {
            result.push(local);
        }
    }

    return result;
};

/**
 * Like `mergeBoardsEntityLevel` but also returns the list of conflicts (local versions
 * discarded for a different-content incoming one) so the caller can notify the user.
 * @returns {{ merged: object, conflicts: Array<{id,type,name}> }}
 */
export const mergeBoardsEntityLevelWithMeta = (localBoardData, incomingBoardData) => {
    if (!localBoardData?.boards) return { merged: incomingBoardData, conflicts: [] };
    if (!incomingBoardData?.boards) return { merged: localBoardData, conflicts: [] };
    const conflicts = [];
    const merged = mergeBoards(localBoardData, incomingBoardData, conflicts);
    return { merged, conflicts };
};

/**
 * Merge two boardData objects at entity level.
 * Categories, actions, tasks are merged by updatedAt timestamp.
 * Board metadata (trelloSync, members) uses selective preservation.
 */
export const mergeBoardsEntityLevel = (localBoardData, incomingBoardData) => {
    if (!localBoardData?.boards) return incomingBoardData;
    if (!incomingBoardData?.boards) return localBoardData;
    return mergeBoards(localBoardData, incomingBoardData, null);
};

const mergeBoards = (localBoardData, incomingBoardData, conflictSink) => {

    // Board-level tombstones (M18): a board deleted by one client must not resurrect
    // from a peer's stale copy. Merged union of envelope-level `boardDeletions`.
    const mergedBoardDeletions = mergeTombstones(localBoardData.boardDeletions, incomingBoardData.boardDeletions);
    const boardTombMap = tombstoneMap(mergedBoardDeletions);
    const boardUpdatedAt = (b) => b?.updatedAt || b?.createdAt || null;

    const mergedBoards = incomingBoardData.boards.map(incomingBoard => {
        const localBoard = localBoardData.boards.find(b => b.id === incomingBoard.id);
        if (!localBoard) return incomingBoard;

        // Per-board entity tombstones — union of both sides, then drop resurrected entities.
        const mergedDeletions = mergeTombstones(localBoard.deletions, incomingBoard.deletions);
        const entityTombMap = tombstoneMap(mergedDeletions);

        // Merge trelloSync: local as base, incoming on top (preserve local config if incoming missing)
        let mergedSync = incomingBoard.trelloSync;
        if (localBoard.trelloSync) {
            mergedSync = { ...localBoard.trelloSync, ...(incomingBoard.trelloSync || {}) };
            if (localBoard.trelloSync.syncMode && !incomingBoard.trelloSync?.syncMode) {
                mergedSync.syncMode = localBoard.trelloSync.syncMode;
            }
            if (localBoard.trelloSync.labelMappings && !incomingBoard.trelloSync?.labelMappings) {
                mergedSync.labelMappings = localBoard.trelloSync.labelMappings;
            }
            if (localBoard.trelloSync.trelloBoardId && !incomingBoard.trelloSync?.trelloBoardId) {
                mergedSync.trelloBoardId = localBoard.trelloSync.trelloBoardId;
            }
        }

        return {
            ...localBoard,
            ...incomingBoard,
            categories: mergeEntitiesByTimestamp(localBoard.categories, incomingBoard.categories, entityTombMap, conflictSink, 'category'),
            actions: mergeEntitiesByTimestamp(localBoard.actions, incomingBoard.actions, entityTombMap, conflictSink, 'action'),
            tasks: mergeEntitiesByTimestamp(localBoard.tasks, incomingBoard.tasks, entityTombMap, conflictSink, 'task'),
            deletions: mergedDeletions,
            trelloSync: mergedSync,
            members: incomingBoard.members || localBoard.members,
        };
    });

    // Include local-only boards (created locally, not yet in incoming) — unless a
    // board-level tombstone says the board was deleted at-or-after its last update.
    for (const localBoard of localBoardData.boards) {
        if (!incomingBoardData.boards.find(b => b.id === localBoard.id)) {
            const del = boardTombMap?.get(localBoard.id);
            const upd = boardUpdatedAt(localBoard);
            const deleted = del !== undefined && del >= (upd ? new Date(upd).getTime() : 0);
            if (!deleted) mergedBoards.push(localBoard);
        }
    }

    // Drop incoming boards that this client deleted (local board-tombstone newer than the
    // incoming board's updatedAt) — symmetric to the local-only guard above.
    const finalBoards = mergedBoards.filter(b => {
        const del = boardTombMap?.get(b.id);
        if (del === undefined) return true;
        return del < new Date(boardUpdatedAt(b) || 0).getTime();
    });

    return {
        ...localBoardData,
        ...incomingBoardData,
        boards: finalBoards.length ? finalBoards : mergedBoards,
        ...(mergedBoardDeletions.length ? { boardDeletions: mergedBoardDeletions } : {}),
    };
};
