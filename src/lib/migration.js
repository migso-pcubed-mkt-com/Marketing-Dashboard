import { CONFIG, DEFAULT_ACTIONS, DEFAULT_TASKS } from '../config.js';

/**
 * Migrate data from v1 (flat) to v2 (multi-board) format.
 * Idempotent — calling on already-migrated data is a no-op.
 *
 * @param {object} data - Raw loaded data from any storage backend
 * @returns {object} Data in v2 multi-board format
 */
export function migrateToV2(data) {
    // Already v2
    if (data && data.version === 2 && Array.isArray(data.boards)) {
        return data;
    }

    // V1 format (flat categories/actions/tasks)
    if (data && data.categories) {
        return {
            version: 2,
            currentBoardId: 'board-default',
            boards: [{
                id: 'board-default',
                name: 'Marketing Plan',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                categories: data.categories,
                actions: data.actions || [],
                tasks: data.tasks || []
            }]
        };
    }

    // Corrupt or empty data — return fresh defaults
    return {
        version: 2,
        currentBoardId: 'board-default',
        boards: [{
            id: 'board-default',
            name: 'Marketing Plan',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            categories: [...CONFIG.CATEGORIES],
            actions: [...DEFAULT_ACTIONS],
            tasks: [...DEFAULT_TASKS]
        }]
    };
}
