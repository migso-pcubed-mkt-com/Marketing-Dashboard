// Entity-level merge for collaborative editing.
// Instead of full-document replacement (last-write-wins), merges at entity level
// using updatedAt timestamps. Two users editing different tasks → both preserved.

/**
 * Merge two arrays of entities by updatedAt timestamp.
 * For entities in both: keep the one with newer updatedAt.
 * Entities only in incoming: added (new from another user).
 * Entities only in local: kept (new locally, not yet on server).
 */
export const mergeEntitiesByTimestamp = (localEntities = [], incomingEntities = []) => {
    const localMap = new Map(localEntities.map(e => [e.id, e]));
    const result = [];
    const processedIds = new Set();

    // Process incoming entities in their order (authoritative from server)
    for (const incoming of incomingEntities) {
        const local = localMap.get(incoming.id);
        if (local) {
            // Both have this entity — keep the newer one
            const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
            const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
            result.push(localTime > incomingTime ? local : incoming);
        } else {
            // Only in incoming — new from another user
            result.push(incoming);
        }
        processedIds.add(incoming.id);
    }

    // Add local-only entities (created locally, not yet on server)
    for (const local of localEntities) {
        if (!processedIds.has(local.id)) {
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

    const mergedBoards = incomingBoardData.boards.map(incomingBoard => {
        const localBoard = localBoardData.boards.find(b => b.id === incomingBoard.id);
        if (!localBoard) return incomingBoard;

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
            categories: mergeEntitiesByTimestamp(localBoard.categories, incomingBoard.categories),
            actions: mergeEntitiesByTimestamp(localBoard.actions, incomingBoard.actions),
            tasks: mergeEntitiesByTimestamp(localBoard.tasks, incomingBoard.tasks),
            trelloSync: mergedSync,
            members: incomingBoard.members || localBoard.members,
        };
    });

    // Include local-only boards (created locally, not yet in incoming)
    for (const localBoard of localBoardData.boards) {
        if (!incomingBoardData.boards.find(b => b.id === localBoard.id)) {
            mergedBoards.push(localBoard);
        }
    }

    return {
        ...localBoardData,
        ...incomingBoardData,
        boards: mergedBoards,
    };
};
