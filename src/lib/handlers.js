/**
 * Pure transformation functions for CRUD handlers.
 * These are the lambdas extracted from setTasks(prev => ...) and similar patterns.
 * Each function is pure: (state, ...args) => newState, with no side effects.
 */

/**
 * Apply updates to a single task by ID.
 * Recalculates month from dueDate/startDate, sets orderUpdatedAt on order changes.
 */
export function applyTaskUpdate(tasks, taskId, updates, now = new Date().toISOString()) {
    return tasks.map(t => {
        if (t.id !== taskId) return t;
        const newTask = { ...t, ...updates, updatedAt: now };
        if (updates.dueDate) {
            newTask.month = new Date(updates.dueDate).getMonth();
        } else if (updates.startDate) {
            newTask.month = new Date(updates.startDate).getMonth();
        }
        if (updates.order !== undefined) newTask.orderUpdatedAt = now;
        return newTask;
    });
}

/**
 * Apply batch updates to multiple tasks atomically.
 * Each entry: { id, changes }
 */
export function applyBatchTaskUpdate(tasks, updates, now = new Date().toISOString()) {
    return tasks.map(t => {
        const u = updates.find(u => u.id === t.id);
        if (!u) return t;
        const newTask = { ...t, ...u.changes, updatedAt: now };
        if (u.changes.order !== undefined) newTask.orderUpdatedAt = now;
        if (u.changes.dueDate) {
            newTask.month = new Date(u.changes.dueDate).getMonth();
        } else if (u.changes.startDate) {
            newTask.month = new Date(u.changes.startDate).getMonth();
        }
        return newTask;
    });
}

/**
 * Apply update to a single action by ID.
 */
export function applyActionUpdate(actions, actionId, updates, now = new Date().toISOString()) {
    return actions.map(a =>
        a.id === actionId ? { ...a, ...updates, updatedAt: now } : a
    );
}

/**
 * Compute tag propagation batch updates when action tags/countries change.
 * Returns array of { id, changes } for linked tasks, or empty array if no propagation needed.
 */
export function computeTagPropagation(oldAction, updates, linkedTasks) {
    if (!oldAction || (updates.tags === undefined && updates.countries === undefined)) return [];

    const oldTags = new Set(oldAction.tags || []);
    const oldCountries = new Set(oldAction.countries || []);
    const newTags = updates.tags !== undefined ? updates.tags : (oldAction.tags || []);
    const newCountries = updates.countries !== undefined ? updates.countries : (oldAction.countries || []);
    const tagsChanged = updates.tags !== undefined && JSON.stringify([...(oldAction.tags || [])].sort()) !== JSON.stringify([...newTags].sort());
    const countriesChanged = updates.countries !== undefined && JSON.stringify([...(oldAction.countries || [])].sort()) !== JSON.stringify([...newCountries].sort());

    if (!tagsChanged && !countriesChanged) return [];
    if (linkedTasks.length === 0) return [];

    return linkedTasks.map(task => {
        const changes = {};
        if (tagsChanged) {
            const taskSpecificTags = (task.channels || []).filter(c => !oldTags.has(c));
            changes.channels = [...new Set([...newTags, ...taskSpecificTags])];
        }
        if (countriesChanged) {
            const taskSpecificCountries = (task.countries || []).filter(c => !oldCountries.has(c));
            changes.countries = [...new Set([...newCountries, ...taskSpecificCountries])];
        }
        return { id: task.id, changes };
    });
}

/**
 * Reorder tasks: move dragged task to target position.
 * Returns the updated tasks array with new order values.
 */
export function applyTaskReorder(tasks, draggedId, targetId, position) {
    if (draggedId === targetId) return tasks;

    const draggedTask = tasks.find(t => t.id === draggedId);
    const targetTask = tasks.find(t => t.id === targetId);
    if (!draggedTask || !targetTask) return tasks;

    const isDifferentMonth = (draggedTask.month !== undefined && targetTask.month !== undefined && draggedTask.month !== targetTask.month);
    const isDifferentStatus = (draggedTask.status !== undefined && targetTask.status !== undefined && draggedTask.status !== targetTask.status);
    const isDifferentColumn = isDifferentMonth || isDifferentStatus;

    let updatedDraggedTask = { ...draggedTask };
    if (isDifferentColumn) {
        if (isDifferentMonth) {
            updatedDraggedTask.month = targetTask.month;
            const year = targetTask.startDate ? new Date(targetTask.startDate).getFullYear() : 2026;
            const monthIdx = targetTask.month;
            const startDate = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-01';
            const lastDay = new Date(year, monthIdx + 1, 0).getDate();
            const dueDate = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-' + lastDay;
            updatedDraggedTask.startDate = startDate;
            updatedDraggedTask.dueDate = dueDate;
        }
        if (isDifferentStatus) {
            updatedDraggedTask.status = targetTask.status;
        }
        updatedDraggedTask.updatedAt = new Date().toISOString();
    }

    const targetColumnTasks = tasks.filter(t => {
        if (t.id === draggedId) return true;
        if (targetTask.month !== undefined) return t.month === targetTask.month;
        return t.status === targetTask.status;
    }).map(t => t.id === draggedId ? updatedDraggedTask : t).sort((a, b) => (a.order || 0) - (b.order || 0));

    const draggedIndex = targetColumnTasks.findIndex(t => t.id === draggedId);
    const targetIndex = targetColumnTasks.findIndex(t => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return tasks;

    const reordered = [...targetColumnTasks];
    reordered.splice(draggedIndex, 1);
    const adjustedTargetIdx = reordered.findIndex(t => t.id === targetId);
    if (adjustedTargetIdx === -1) return tasks;
    const insertIndex = position === 'before' ? adjustedTargetIdx : adjustedTargetIdx + 1;
    reordered.splice(insertIndex, 0, updatedDraggedTask);
    const updatedTasks = reordered.map((t, idx) => ({ ...t, order: idx }));

    return tasks.map(t => {
        const updated = updatedTasks.find(ut => ut.id === t.id);
        return updated || t;
    });
}
