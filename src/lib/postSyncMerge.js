// Pure function to merge sync results with live state.
// Preserves: local edits during sync, newly created entities, deleted entities.

export const mergePostSync = ({
    syncedBoard, liveBoard,
    preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
    preSyncTaskMap, preSyncActionMap, preSyncCategoryMap
}) => {
    const liveTaskIds = new Set(liveBoard.tasks.map(t => t.id));
    const liveActionIds = new Set(liveBoard.actions.map(a => a.id));
    const liveCategoryIds = new Set(liveBoard.categories.map(c => c.id));

    // True when an entity's live updatedAt is strictly newer than the snapshot taken
    // before sync started → the user edited it during the sync window.
    const editedDuringSync = (live, preSyncUpdatedAt) =>
        live && preSyncUpdatedAt && live.updatedAt !== preSyncUpdatedAt
        && new Date(live.updatedAt).getTime() > new Date(preSyncUpdatedAt).getTime();

    // ── Merge categories ──
    const mergedCategories = [];
    const processedCategoryIds = new Set();
    for (const syncedCat of syncedBoard.categories) {
        // If category existed pre-sync but was deleted from live → skip (user deleted it)
        if (preSyncCategoryIds.has(syncedCat.id) && !liveCategoryIds.has(syncedCat.id)) {
            processedCategoryIds.add(syncedCat.id);
            continue;
        }
        const liveCat = liveBoard.categories.find(c => c.id === syncedCat.id);
        const preSyncUpdatedAt = preSyncCategoryMap?.get(syncedCat.id);
        // Category renamed/recolored/reordered locally during sync → keep the live edit,
        // only adopt the Trello link id from the synced result (M16). Without this, the
        // synced (pre-edit) category overwrote the user's in-flight rename/color/order.
        if (editedDuringSync(liveCat, preSyncUpdatedAt)) {
            mergedCategories.push({ ...liveCat, trelloListId: syncedCat.trelloListId || liveCat.trelloListId });
        } else {
            mergedCategories.push(syncedCat);
        }
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
    // Add tasks created during sync (brand new), OR preserve a task that was edited
    // locally during sync but vanished from the synced result because Trello deleted it in
    // the same window — dropping it would lose the user's in-flight edit (M15).
    for (const task of liveBoard.tasks) {
        if (processedTaskIds.has(task.id)) continue;
        if (!preSyncTaskIds.has(task.id)) {
            mergedTasks.push(task); // brand new during sync
        } else if (editedDuringSync(task, preSyncTaskMap.get(task.id))) {
            mergedTasks.push(task); // edited locally during sync + Trello-deleted → keep local edit
        }
        // else: existed pre-sync, untouched locally, absent from Trello → genuine deletion
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
        if (processedActionIds.has(action.id)) continue;
        if (!preSyncActionIds.has(action.id)) {
            mergedActions.push(action); // brand new during sync
        } else if (editedDuringSync(action, preSyncActionMap.get(action.id))) {
            mergedActions.push(action); // edited locally during sync + Trello-deleted → keep local edit
        }
        // else: existed pre-sync, untouched locally, absent from Trello → genuine deletion
    }

    return {
        categories: mergedCategories,
        actions: mergedActions,
        tasks: mergedTasks
    };
};
