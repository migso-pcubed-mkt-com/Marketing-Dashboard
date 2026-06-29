// Entity-level merge for collaborative editing.
// Instead of full-document replacement (last-write-wins), merges at entity level
// using updatedAt timestamps. Two users editing different tasks → both preserved.

import { mergeTombstones, tombstoneMap, isTombstoned } from './tombstones.js';

/**
 * Merge two arrays of entities by updatedAt timestamp.
 * For entities in both: keep the one with newer updatedAt.
 * Entities only in incoming: added (new from another user).
 * Entities only in local: kept (new locally, not yet on server).
 *
 * `tombMap` (optional, `Map<id, deletedAtMs>` from `tombstoneMap`) drops any entity
 * whose latest deletion tombstone is at-or-newer than its `updatedAt` (M18) — this is
 * what stops a deleted entity from resurrecting via a peer's stale copy.
 */
export const mergeEntitiesByTimestamp = (localEntities = [], incomingEntities = [], tombMap = null) => {
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
 * Merge two boardData objects at entity level.
 * Categories, actions, tasks are merged by updatedAt timestamp.
 * Board metadata (trelloSync, members) uses selective preservation.
 */
export const mergeBoardsEntityLevel = (localBoardData, incomingBoardData) => {
    if (!localBoardData?.boards) return incomingBoardData;
    if (!incomingBoardData?.boards) return localBoardData;

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
            categories: mergeEntitiesByTimestamp(localBoard.categories, incomingBoard.categories, entityTombMap),
            actions: mergeEntitiesByTimestamp(localBoard.actions, incomingBoard.actions, entityTombMap),
            tasks: mergeEntitiesByTimestamp(localBoard.tasks, incomingBoard.tasks, entityTombMap),
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
