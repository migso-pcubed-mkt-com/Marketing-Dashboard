// Pure function to merge sync results with live state.
// Preserves: local edits during sync, newly created entities, deleted entities.

export const mergePostSync = ({
    syncedBoard, liveBoard,
    preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
    preSyncTaskMap, preSyncActionMap
}) => {
    const liveTaskIds = new Set(liveBoard.tasks.map(t => t.id));
    const liveActionIds = new Set(liveBoard.actions.map(a => a.id));
    const liveCategoryIds = new Set(liveBoard.categories.map(c => c.id));

    // ── Merge categories ──
    const mergedCategories = [];
    const processedCategoryIds = new Set();
    for (const syncedCat of syncedBoard.categories) {
        // If category existed pre-sync but was deleted from live → skip (user deleted it)
        if (preSyncCategoryIds.has(syncedCat.id) && !liveCategoryIds.has(syncedCat.id)) {
            processedCategoryIds.add(syncedCat.id);
            continue;
        }
        mergedCategories.push(syncedCat);
        processedCategoryIds.add(syncedCat.id);
    }
    // Add categories created during sync (not in pre-sync AND not in synced result)
    for (const cat of liveBoard.categories) {
        if (!processedCategoryIds.has(cat.id) && !preSyncCategoryIds.has(cat.id)) {
            mergedCategories.push(cat);
        }
    }

    // ── Merge tasks ──
    const mergedTasks = [];
    const processedTaskIds = new Set();
    for (const syncedTask of syncedBoard.tasks) {
        // If task existed pre-sync but was deleted from live → skip (user deleted it)
        if (preSyncTaskIds.has(syncedTask.id) && !liveTaskIds.has(syncedTask.id)) {
            processedTaskIds.add(syncedTask.id);
            continue;
        }
        const liveTask = liveBoard.tasks.find(t => t.id === syncedTask.id);
        const preSyncUpdatedAt = preSyncTaskMap.get(syncedTask.id);
        // Task was edited locally during sync → keep live version but merge Trello IDs
        if (liveTask && preSyncUpdatedAt && liveTask.updatedAt !== preSyncUpdatedAt
            && new Date(liveTask.updatedAt).getTime() > new Date(preSyncUpdatedAt).getTime()) {
            mergedTasks.push({
                ...liveTask,
                trelloCheckItemId: syncedTask.trelloCheckItemId || liveTask.trelloCheckItemId,
                trelloChecklistId: syncedTask.trelloChecklistId || liveTask.trelloChecklistId,
                trelloCardId: syncedTask.trelloCardId || liveTask.trelloCardId,
                trelloLastModified: syncedTask.trelloLastModified || liveTask.trelloLastModified,
                _trelloBaseline: syncedTask._trelloBaseline || liveTask._trelloBaseline,
            });
        } else {
            mergedTasks.push(syncedTask);
        }
        processedTaskIds.add(syncedTask.id);
    }
    // Add tasks created during sync (not in pre-sync snapshot = brand new)
    for (const task of liveBoard.tasks) {
        if (!processedTaskIds.has(task.id) && !preSyncTaskIds.has(task.id)) {
            mergedTasks.push(task);
        }
    }

    // ── Merge actions ──
    const mergedActions = [];
    const processedActionIds = new Set();
    for (const syncedAction of syncedBoard.actions) {
        // If action existed pre-sync but was deleted from live → skip (user deleted it)
        if (preSyncActionIds.has(syncedAction.id) && !liveActionIds.has(syncedAction.id)) {
            processedActionIds.add(syncedAction.id);
            continue;
        }
        const liveAction = liveBoard.actions.find(a => a.id === syncedAction.id);
        const preSyncUpdatedAt = preSyncActionMap.get(syncedAction.id);
        if (liveAction && preSyncUpdatedAt && liveAction.updatedAt !== preSyncUpdatedAt
            && new Date(liveAction.updatedAt).getTime() > new Date(preSyncUpdatedAt).getTime()) {
            mergedActions.push({
                ...liveAction,
                trelloCardId: syncedAction.trelloCardId || liveAction.trelloCardId,
                trelloLastModified: syncedAction.trelloLastModified || liveAction.trelloLastModified,
                _trelloBaseline: syncedAction._trelloBaseline || liveAction._trelloBaseline,
            });
        } else {
            mergedActions.push(syncedAction);
        }
        processedActionIds.add(syncedAction.id);
    }
    for (const action of liveBoard.actions) {
        if (!processedActionIds.has(action.id) && !preSyncActionIds.has(action.id)) {
            mergedActions.push(action);
        }
    }

    return {
        categories: mergedCategories,
        actions: mergedActions,
        tasks: mergedTasks
    };
};
