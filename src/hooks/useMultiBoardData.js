import { useMemo } from 'react';

// Deterministic board colors for visual distinction
const BOARD_COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4'
];

/**
 * Merges categories, actions, and tasks from multiple boards.
 * Adds _sourceBoardId, _sourceBoardName, _sourceBoardColor to each entity.
 * Returns merged arrays ready for read-only consumption by views.
 */
const useMultiBoardData = (selectedBoardIds, allBoards) => {
    return useMemo(() => {
        if (!selectedBoardIds || selectedBoardIds.length === 0 || !allBoards) {
            return { categories: [], actions: [], tasks: [], members: [], boardSources: [] };
        }

        const selectedBoards = allBoards.filter(b => selectedBoardIds.includes(b.id));
        const mergedCategories = [];
        const mergedActions = [];
        const mergedTasks = [];
        const mergedMembers = [];
        const boardSources = [];
        const memberIds = new Set();

        selectedBoards.forEach((board, idx) => {
            const color = BOARD_COLORS[idx % BOARD_COLORS.length];
            const source = { id: board.id, name: board.name, color };
            boardSources.push(source);

            const tag = { _sourceBoardId: board.id, _sourceBoardName: board.name, _sourceBoardColor: color };

            (board.categories || []).forEach(cat => {
                mergedCategories.push({ ...cat, ...tag });
            });

            (board.actions || []).forEach(act => {
                mergedActions.push({ ...act, ...tag });
            });

            (board.tasks || []).forEach(task => {
                mergedTasks.push({ ...task, ...tag });
            });

            // Merge members (dedup by id)
            (board.members || []).forEach(m => {
                if (!memberIds.has(m.id)) {
                    memberIds.add(m.id);
                    mergedMembers.push(m);
                }
            });
        });

        return { categories: mergedCategories, actions: mergedActions, tasks: mergedTasks, members: mergedMembers, boardSources };
    }, [selectedBoardIds, allBoards]);
};

export default useMultiBoardData;
