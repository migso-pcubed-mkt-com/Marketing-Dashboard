// Bidirectional Trello sync with "last write wins" conflict resolution

import { fetchTrelloBoardFull, updateTrelloCard, createTrelloCard, addTrelloComment, addTrelloChecklist, addTrelloChecklistItems, addTrelloAttachment, uploadTrelloAttachment } from './trello.js';
import { mapTaskToTrelloCardUpdate, mergeCardIntoTask } from './trelloMapping.js';

// Push comments, checklists, attachments that don't already exist on Trello.
// Returns { pushed, updatedTask } — updatedTask has captured Trello IDs on newly pushed items.
const pushTaskExtrasToTrello = async (task, card) => {
    const pushed = { comments: 0, checklists: 0, attachments: 0 };
    let taskModified = false;

    // Push new comments (those without trelloCommentId)
    for (const comment of (task.comments || [])) {
        if (!comment.trelloCommentId && comment.text) {
            try {
                const result = await addTrelloComment(task.trelloCardId, comment.text);
                if (result?.id) {
                    comment.trelloCommentId = result.id;
                    taskModified = true;
                }
                pushed.comments++;
            } catch (e) {
                console.error('Failed to push comment:', e);
            }
        }
    }

    // Push checklists — support both old flat format and new named format
    const taskChecklists = task.checklists || (task.checklist ? [{ name: 'Checklist', items: task.checklist }] : []);
    // Build map of existing Trello checklists by name, with item names
    const trelloChecklistMap = new Map();
    if (card.checklists) {
        for (const cl of card.checklists) {
            const itemNames = new Set((cl.checkItems || []).map(item => item.name));
            trelloChecklistMap.set(cl.name, { id: cl.id, itemNames });
        }
    }
    for (const cl of taskChecklists) {
        const existing = trelloChecklistMap.get(cl.name);
        if (existing) {
            // Checklist exists on Trello — capture its ID if we don't have it
            if (!cl.trelloChecklistId) {
                cl.trelloChecklistId = existing.id;
                taskModified = true;
            }
            // Push only new items to the EXISTING checklist (don't create a new one)
            const newItems = (cl.items || []).filter(item => !existing.itemNames.has(item.text));
            if (newItems.length > 0) {
                try {
                    await addTrelloChecklistItems(existing.id, newItems);
                    pushed.checklists += newItems.length;
                } catch (e) {
                    console.error('Failed to push checklist items:', e);
                }
            }
        } else {
            // New checklist — create on Trello
            const items = (cl.items || []).filter(item => item.text);
            if (items.length > 0 || cl.name) {
                try {
                    const result = await addTrelloChecklist(task.trelloCardId, cl.name || 'Checklist', items);
                    if (result?.id) {
                        cl.trelloChecklistId = result.id;
                        taskModified = true;
                    }
                    pushed.checklists += items.length;
                } catch (e) {
                    console.error('Failed to push checklist:', e);
                }
            }
        }
    }

    // Push attachments not yet on Trello (URL-based or file uploads)
    const trelloAttUrls = new Set((card.attachments || []).map(a => a.url));
    for (const att of (task.attachments || [])) {
        if (att.trelloAttachmentId) continue; // Already on Trello

        try {
            let result = null;
            if (att.url && !trelloAttUrls.has(att.url)) {
                // URL attachment — push URL directly
                result = await addTrelloAttachment(task.trelloCardId, att.url, att.name);
            } else if (att.data && !att.url) {
                // Local file upload (base64) — upload file to Trello
                result = await uploadTrelloAttachment(task.trelloCardId, att.data, att.name, att.type);
            }
            if (result?.id) {
                att.trelloAttachmentId = result.id;
                if (result.url) att.url = result.url; // Store the Trello URL for future reference
                taskModified = true;
                pushed.attachments++;
            }
        } catch (e) {
            console.error('Failed to push attachment:', att.name, e);
        }
    }

    return { pushed, taskModified };
};

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
                // Also push comments, checklists, attachments — capture Trello IDs
                const { taskModified } = await pushTaskExtrasToTrello(task, card);
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
                    const { taskModified } = await pushTaskExtrasToTrello(task, card);
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
        // Default start date: 1st of the due date's month (or current month if no due date)
        let startDate;
        if (card.start) {
            startDate = card.start.split('T')[0];
        } else if (dueDate) {
            const d = new Date(dueDate);
            startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        } else {
            const now = new Date();
            startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        }

        // Map checklists (named, preserving structure)
        const checklists = [];
        if (card.checklists) {
            for (const cl of card.checklists) {
                checklists.push({
                    id: genId('cl'),
                    name: cl.name || 'Checklist',
                    trelloChecklistId: cl.id,
                    items: (cl.checkItems || []).map(item => ({
                        id: genId('cli'),
                        text: item.name,
                        done: item.state === 'complete'
                    }))
                });
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

        // Map countries from labels
        const countries = [];
        if (card.idLabels && mappingConfig?.labelMappings) {
            for (const labelId of card.idLabels) {
                const mapping = mappingConfig.labelMappings[labelId];
                if (mapping?.type === 'country' && mapping.countryId) countries.push(mapping.countryId);
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
            checklists,
            comments,
            attachments,
            channels,
            countries,
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
