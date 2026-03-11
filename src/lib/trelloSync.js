// Bidirectional Trello sync with "last write wins" conflict resolution

import { fetchTrelloBoardFull, updateTrelloCard, createTrelloCard } from './trello.js';
import { mapTaskToTrelloCardUpdate, mergeCardIntoTask } from './trelloMapping.js';

// Sync a dashboard board with its linked Trello board
// Returns { created, updated, pushed, errors } counts
export const syncWithTrello = async (board, mappingConfig) => {
    const { trelloSync } = board;
    if (!trelloSync?.trelloBoardId) {
        throw new Error('Board is not linked to Trello');
    }

    const result = { created: 0, updated: 0, pushed: 0, errors: 0 };

    // 1. Fetch current Trello state
    const trelloData = await fetchTrelloBoardFull(trelloSync.trelloBoardId);
    const { cards, lists, members: trelloMembers } = trelloData;

    // Build lookup maps
    const trelloCardMap = new Map(cards.map(c => [c.id, c]));
    const listIdMap = new Map(lists.map(l => [l.id, l]));

    // Build categoryId → trelloListId lookup from board categories
    const catToListId = {};
    for (const cat of board.categories) {
        if (cat.trelloListId) catToListId[cat.id] = cat.trelloListId;
    }

    // Build trelloListId → categoryId reverse lookup
    const listToCatId = {};
    for (const cat of board.categories) {
        if (cat.trelloListId) listToCatId[cat.trelloListId] = cat.id;
    }

    // Clone tasks for mutation
    const updatedTasks = [...board.tasks];
    const newTasks = [];

    // 2. For each existing task with trelloCardId, check for updates
    for (let i = 0; i < updatedTasks.length; i++) {
        const task = updatedTasks[i];
        if (!task.trelloCardId) continue;

        const card = trelloCardMap.get(task.trelloCardId);
        if (!card) {
            // Card deleted on Trello — mark as paused
            if (task.status !== 'paused') {
                updatedTasks[i] = { ...task, status: 'paused' };
                result.updated++;
            }
            continue;
        }

        // Remove from map (processed)
        trelloCardMap.delete(task.trelloCardId);

        // Compare timestamps — last write wins
        const trelloTime = new Date(card.dateLastActivity).getTime();
        const lastSyncTime = new Date(task.trelloLastModified || 0).getTime();
        const localUpdateTime = new Date(task.updatedAt || 0).getTime();

        // Task was locally modified after last sync?
        const locallyModified = localUpdateTime > lastSyncTime;
        // Trello was modified since last sync?
        const trelloModified = trelloTime > lastSyncTime;

        if (trelloModified && !locallyModified) {
            // Only Trello changed → update local task
            updatedTasks[i] = mergeCardIntoTask(task, card, mappingConfig);
            result.updated++;
        } else if (locallyModified && !trelloModified) {
            // Only dashboard changed → push to Trello
            try {
                const action = board.actions.find(a => a.id === task.actionId);
                const listId = action ? catToListId[action.categoryId] : null;
                const updates = mapTaskToTrelloCardUpdate(task, listId);
                await updateTrelloCard(task.trelloCardId, updates);
                updatedTasks[i] = { ...task, trelloLastModified: new Date().toISOString(), updatedAt: task.updatedAt };
                result.pushed++;
            } catch (err) {
                console.error(`Failed to push task "${task.title}" to Trello:`, err);
                result.errors++;
            }
        } else if (trelloModified && locallyModified) {
            // Both changed — last write wins based on absolute timestamp
            if (localUpdateTime >= trelloTime) {
                try {
                    const action = board.actions.find(a => a.id === task.actionId);
                    const listId = action ? catToListId[action.categoryId] : null;
                    const updates = mapTaskToTrelloCardUpdate(task, listId);
                    await updateTrelloCard(task.trelloCardId, updates);
                    updatedTasks[i] = { ...task, trelloLastModified: new Date().toISOString(), updatedAt: task.updatedAt };
                    result.pushed++;
                } catch (err) {
                    console.error(`Failed to push task "${task.title}" to Trello:`, err);
                    result.errors++;
                }
            } else {
                updatedTasks[i] = mergeCardIntoTask(task, card, mappingConfig);
                result.updated++;
            }
        }
    }

    // 3. New cards on Trello (not yet in dashboard)
    for (const [cardId, card] of trelloCardMap) {
        const categoryId = listToCatId[card.idList];
        if (!categoryId) continue; // Card in unknown list, skip

        // Find an action for this card
        let actionId = null;
        if (card.idLabels && mappingConfig?.labelMappings) {
            for (const labelId of card.idLabels) {
                const mapping = mappingConfig.labelMappings[labelId];
                if (mapping?.type === 'action') {
                    // Find the action with this trelloLabelId
                    const action = board.actions.find(a => a.trelloLabelId === labelId);
                    if (action) { actionId = action.id; break; }
                }
            }
        }
        // Fall back to first action in this category
        if (!actionId) {
            const defaultAction = board.actions.find(a => a.categoryId === categoryId);
            if (defaultAction) actionId = defaultAction.id;
        }
        if (!actionId) continue;

        const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dueDate = card.due ? card.due.split('T')[0] : null;
        const startDate = dueDate || new Date().toISOString().split('T')[0];

        // Map checklists
        const checklist = [];
        if (card.checklists) {
            for (const cl of card.checklists) {
                for (const item of cl.checkItems || []) {
                    checklist.push({ id: genId('cl'), text: item.name, done: item.state === 'complete' });
                }
            }
        }

        // Map attachments
        const attachments = [];
        if (card.attachments) {
            for (const att of card.attachments) {
                attachments.push({ id: genId('att'), name: att.name, url: att.url, mimeType: att.mimeType || '', date: att.date, trelloAttachmentId: att.id });
            }
        }

        // Map comments
        const comments = [];
        if (card.comments) {
            for (const comment of card.comments) {
                comments.push({ id: genId('cm'), author: comment.memberCreator?.fullName || comment.memberCreator?.username || 'Unknown', text: comment.data?.text || '', date: comment.date, trelloCommentId: comment.id });
            }
        }

        // Map channels from labels
        const channels = [];
        if (card.idLabels && mappingConfig?.labelMappings) {
            for (const labelId of card.idLabels) {
                const mapping = mappingConfig.labelMappings[labelId];
                if (mapping?.type === 'channel') channels.push(mapping.channelId);
            }
        }

        // Map other labels
        const otherLabels = [];
        if (card.idLabels && mappingConfig?.labelMappings) {
            for (const labelId of card.idLabels) {
                const mapping = mappingConfig.labelMappings[labelId];
                if (mapping?.type === 'other') otherLabels.push({ id: labelId, name: mapping.labelName || '', color: mapping.labelColor || '' });
            }
        }

        const newTask = {
            id: genId('task'),
            actionId,
            title: card.name,
            description: card.desc || '',
            startDate,
            dueDate: dueDate || startDate,
            month: dueDate ? new Date(dueDate).getMonth() : new Date().getMonth(),
            status: card.dueComplete ? 'completed' : 'todo',
            priority: 'medium',
            budget: 0,
            checklist,
            comments,
            attachments,
            channels,
            countries: [],
            assignees: card.idMembers || [],
            otherLabels,
            order: card.pos || 0,
            createdAt: new Date().toISOString(),
            trelloCardId: card.id,
            trelloLastModified: card.dateLastActivity
        };
        newTasks.push(newTask);
        result.created++;
    }

    // 4. Push new dashboard tasks (no trelloCardId) to Trello
    for (let i = 0; i < updatedTasks.length; i++) {
        const task = updatedTasks[i];
        if (task.trelloCardId) continue; // Already linked

        // Find the Trello listId for this task's category
        const action = board.actions.find(a => a.id === task.actionId);
        if (!action) continue;
        const listId = catToListId[action.categoryId];
        if (!listId) continue;

        try {
            const cardData = { name: task.title, desc: task.description || '' };
            if (task.dueDate) cardData.due = task.dueDate;
            // Include label IDs if the action has a Trello label (comma-separated string)
            if (action.trelloLabelId) cardData.idLabels = [action.trelloLabelId].join(',');

            const created = await createTrelloCard(listId, cardData);
            updatedTasks[i] = {
                ...task,
                trelloCardId: created.id,
                trelloLastModified: created.dateLastActivity || new Date().toISOString()
            };
            result.pushed++;
        } catch (err) {
            console.error(`Failed to create Trello card for "${task.title}":`, err);
            result.errors++;
        }
    }

    // 5. Update members from Trello
    const members = (trelloMembers || []).map(m => ({
        id: m.id,
        fullName: m.fullName,
        username: m.username,
        avatarUrl: m.avatarUrl ? `${m.avatarUrl}/50.png` : null
    }));

    // 6. Build updated board
    const syncedBoard = {
        ...board,
        tasks: [...updatedTasks, ...newTasks],
        members: members.length ? members : (board.members || []),
        trelloSync: {
            ...board.trelloSync,
            lastSyncAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
    };

    return { board: syncedBoard, result };
};
