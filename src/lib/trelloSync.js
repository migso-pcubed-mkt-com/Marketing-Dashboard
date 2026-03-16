// Bidirectional Trello sync with "last write wins" conflict resolution

import { fetchTrelloBoardFull, updateTrelloCard, createTrelloCard, addTrelloComment, addTrelloChecklist, addTrelloChecklistItems, updateTrelloChecklistItem, updateTrelloChecklist, addTrelloAttachment, uploadTrelloAttachment, deleteTrelloChecklist, deleteTrelloAttachment, createTrelloBoardLabel, addTrelloCardLabel, removeTrelloCardLabel } from './trello.js';
import { mapTaskToTrelloCardUpdate, mergeCardIntoTask, mergeTrelloExtrasIntoTask, trelloColorToHex } from './trelloMapping.js';
import { CONFIG } from '../config.js';

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
    // Build map of existing Trello checklists by name AND by ID, with item names
    const trelloChecklistMap = new Map();
    const trelloChecklistIdMap = new Map();
    if (card.checklists) {
        for (const cl of card.checklists) {
            const itemNames = new Set((cl.checkItems || []).map(item => item.name));
            trelloChecklistMap.set(cl.name, { id: cl.id, itemNames });
            trelloChecklistIdMap.set(cl.id, { id: cl.id, name: cl.name, itemNames });
        }
    }
    console.log(`[Trello sync] Card "${task.title}" has ${card.checklists?.length || 0} Trello checklists, ${taskChecklists.length} local checklists`);
    for (const cl of taskChecklists) {
        // Match by trelloChecklistId first, then by name
        const existing = (cl.trelloChecklistId && trelloChecklistIdMap.get(cl.trelloChecklistId)) || trelloChecklistMap.get(cl.name);
        if (existing) {
            // Checklist exists on Trello — capture its ID if we don't have it
            if (!cl.trelloChecklistId) {
                cl.trelloChecklistId = existing.id;
                taskModified = true;
            }
            // Push only new items to the EXISTING checklist (don't create a new one)
            const newItems = (cl.items || []).filter(item => item.text && !existing.itemNames.has(item.text));
            console.log(`[Trello sync] Checklist "${cl.name}" — ${cl.items?.length || 0} local items, ${existing.itemNames.size} on Trello, ${newItems.length} new to push`);
            if (newItems.length > 0) {
                try {
                    const result = await addTrelloChecklistItems(existing.id, newItems);
                    const actualCount = result?.itemsAdded || 0;
                    console.log(`[Trello sync] Pushed ${actualCount}/${newItems.length} items to checklist "${cl.name}"`, result);
                    pushed.checklists += actualCount;
                    if (actualCount > 0) taskModified = true;
                } catch (e) {
                    console.error('[Trello sync] Failed to push checklist items:', e.message);
                }
            }
            // Sync state, name, due, and assignee of existing items
            const trelloChecklistFull = card.checklists?.find(c => c.id === existing.id);
            if (trelloChecklistFull?.checkItems) {
                for (const localItem of (cl.items || [])) {
                    if (!localItem.text) continue;
                    const trelloItem = localItem.trelloCheckItemId
                        ? trelloChecklistFull.checkItems.find(ci => ci.id === localItem.trelloCheckItemId)
                        : trelloChecklistFull.checkItems.find(ci => ci.name === localItem.text);
                    if (trelloItem) {
                        // Capture trelloCheckItemId if missing
                        if (!localItem.trelloCheckItemId) {
                            localItem.trelloCheckItemId = trelloItem.id;
                            taskModified = true;
                        }
                        // Build update payload for changed fields
                        const updates = {};
                        const localState = localItem.done ? 'complete' : 'incomplete';
                        if (trelloItem.state !== localState) updates.state = localState;
                        if (localItem.text !== trelloItem.name) updates.name = localItem.text;
                        const localDue = localItem.due || null;
                        const trelloDue = trelloItem.due ? trelloItem.due.split('T')[0] : null;
                        if (localDue !== trelloDue) updates.due = localDue;
                        const localAssignee = localItem.assignee || null;
                        const trelloMember = trelloItem.idMember || null;
                        if (localAssignee !== trelloMember) updates.idMember = localAssignee;
                        if (Object.keys(updates).length > 0) {
                            try {
                                await updateTrelloChecklistItem(task.trelloCardId, trelloItem.id, updates);
                                pushed.checklists++;
                                taskModified = true;
                            } catch (e) {
                                console.error(`Failed to update checkItem "${localItem.text}":`, e.message);
                            }
                        }
                    }
                }
            }
        } else {
            // New checklist — create on Trello
            const items = (cl.items || []).filter(item => item.text);
            console.log(`[Trello sync] Creating NEW checklist "${cl.name}" with ${items.length} items for card ${task.trelloCardId}`);
            if (items.length > 0 || cl.name) {
                try {
                    const result = await addTrelloChecklist(task.trelloCardId, cl.name || 'Checklist', items);
                    if (result?.id) {
                        cl.trelloChecklistId = result.id;
                        taskModified = true;
                        const actualCount = result.itemsCreated || 0;
                        console.log(`[Trello sync] Created checklist "${cl.name}" (${result.id}) with ${actualCount}/${items.length} items`);
                        pushed.checklists += actualCount;
                    } else {
                        console.error('[Trello sync] Checklist creation returned no ID:', result);
                    }
                } catch (e) {
                    console.error('[Trello sync] Failed to push checklist:', e.message);
                }
            }
        }
    }

    // Sync checklist and item positions to Trello (based on local array order)
    for (let clIdx = 0; clIdx < taskChecklists.length; clIdx++) {
        const cl = taskChecklists[clIdx];
        if (!cl.trelloChecklistId) continue;
        const trelloCl = card.checklists?.find(c => c.id === cl.trelloChecklistId);
        if (!trelloCl) continue;
        // Sync checklist position (Trello uses pos as a float; use index * 16384)
        const expectedPos = (clIdx + 1) * 16384;
        if (Math.abs((trelloCl.pos || 0) - expectedPos) > 1000) {
            try {
                await updateTrelloChecklist(cl.trelloChecklistId, { pos: expectedPos });
                taskModified = true;
            } catch (e) { console.error(`Failed to update checklist "${cl.name}" pos:`, e.message); }
        }
        // Sync item positions within the checklist
        for (let itemIdx = 0; itemIdx < (cl.items || []).length; itemIdx++) {
            const item = cl.items[itemIdx];
            if (!item.trelloCheckItemId) continue;
            const trelloItem = trelloCl.checkItems?.find(ci => ci.id === item.trelloCheckItemId);
            if (!trelloItem) continue;
            const expectedItemPos = (itemIdx + 1) * 16384;
            if (Math.abs((trelloItem.pos || 0) - expectedItemPos) > 1000) {
                try {
                    await updateTrelloChecklistItem(task.trelloCardId, item.trelloCheckItemId, { pos: expectedItemPos });
                    taskModified = true;
                } catch (e) { console.error(`Failed to update item "${item.text}" pos:`, e.message); }
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

    // Delete checklists removed locally but still on Trello
    const localChecklistIds = new Set(taskChecklists.filter(cl => cl.trelloChecklistId).map(cl => cl.trelloChecklistId));
    for (const cl of (card.checklists || [])) {
        if (!localChecklistIds.has(cl.id)) {
            try {
                await deleteTrelloChecklist(cl.id);
                console.log(`[Trello sync] Deleted checklist "${cl.name}" from Trello`);
                pushed.checklists++;
                taskModified = true;
            } catch (e) {
                console.error('Failed to delete checklist:', cl.name, e.message);
            }
        }
    }

    // Delete attachments removed locally but still on Trello
    const localAttIds = new Set((task.attachments || []).filter(a => a.trelloAttachmentId).map(a => a.trelloAttachmentId));
    for (const att of (card.attachments || [])) {
        if (!localAttIds.has(att.id)) {
            try {
                await deleteTrelloAttachment(task.trelloCardId, att.id);
                console.log(`[Trello sync] Deleted attachment "${att.name}" from Trello`);
                pushed.attachments++;
                taskModified = true;
            } catch (e) {
                console.error('Failed to delete attachment:', att.name, e.message);
            }
        }
    }

    return { pushed, taskModified };
};

// Map hex color to nearest Trello named color
const hexToTrelloColor = (hex) => {
    if (!hex) return null;
    const colors = { '#61bd4f': 'green', '#f2d600': 'yellow', '#ff9f1a': 'orange', '#eb5a46': 'red', '#c377e0': 'purple', '#0079bf': 'blue', '#00c2e0': 'sky', '#51e898': 'lime', '#ff78cb': 'pink', '#344563': 'black' };
    // Check exact match
    for (const [h, name] of Object.entries(colors)) {
        if (hex.toLowerCase() === h) return name;
    }
    return null; // Trello will use null color (no background)
};

// Push task labels (channels, countries, otherLabels) to Trello
// Creates labels on the board if they don't exist, adds/removes from card
const pushTaskLabelsToTrello = async (task, card, board, mappingConfig) => {
    if (!task.trelloCardId || !mappingConfig?.labelMappings) return { labelsModified: false };
    let modified = false;

    // Build reverse mapping: local tag → trelloLabelId
    const channelToLabel = {};
    const countryToLabel = {};
    const otherToLabel = {};
    for (const [labelId, mapping] of Object.entries(mappingConfig.labelMappings)) {
        if (mapping.type === 'channel' && mapping.channelId) channelToLabel[mapping.channelId] = labelId;
        if (mapping.type === 'country' && mapping.countryId) countryToLabel[mapping.countryId] = labelId;
        if (mapping.type === 'other') otherToLabel[labelId] = labelId;
    }

    // Compute expected label IDs from task's tags
    const expectedLabelIds = new Set();

    // Action label (always keep)
    const action = board.actions.find(a => a.id === task.actionId);
    if (action?.trelloLabelId) expectedLabelIds.add(action.trelloLabelId);

    // Channel labels
    for (const channelId of (task.channels || [])) {
        if (channelToLabel[channelId]) {
            expectedLabelIds.add(channelToLabel[channelId]);
        } else {
            // Channel not mapped — create a label on Trello
            const channelConfig = CONFIG.CHANNELS.find(c => c.id === channelId);
            if (channelConfig) {
                try {
                    const label = await createTrelloBoardLabel(board.trelloSync.trelloBoardId, channelConfig.name, hexToTrelloColor(channelConfig.color));
                    if (label?.id) {
                        channelToLabel[channelId] = label.id;
                        mappingConfig.labelMappings[label.id] = { type: 'channel', channelId, labelName: channelConfig.name, labelColor: channelConfig.color };
                        expectedLabelIds.add(label.id);
                        modified = true;
                    }
                } catch (e) {
                    console.error(`Failed to create label for channel "${channelConfig.name}":`, e.message);
                }
            }
        }
    }

    // Country labels
    for (const countryId of (task.countries || [])) {
        if (countryToLabel[countryId]) {
            expectedLabelIds.add(countryToLabel[countryId]);
        }
        // Don't auto-create country labels (too many countries = too many labels)
    }

    // Other labels
    for (const label of (task.otherLabels || [])) {
        if (otherToLabel[label.id]) {
            expectedLabelIds.add(label.id);
        } else {
            // Check if a label with matching name exists in mappings
            const existingEntry = Object.entries(mappingConfig.labelMappings).find(([, m]) => m.type === 'other' && m.labelName === label.name);
            if (existingEntry) {
                expectedLabelIds.add(existingEntry[0]);
            } else {
                // Create new label on Trello
                try {
                    const trelloLabel = await createTrelloBoardLabel(board.trelloSync.trelloBoardId, label.name, hexToTrelloColor(label.color));
                    if (trelloLabel?.id) {
                        mappingConfig.labelMappings[trelloLabel.id] = { type: 'other', labelName: label.name, labelColor: label.color };
                        otherToLabel[trelloLabel.id] = trelloLabel.id;
                        expectedLabelIds.add(trelloLabel.id);
                        modified = true;
                    }
                } catch (e) {
                    console.error(`Failed to create label "${label.name}":`, e.message);
                }
            }
        }
    }

    // Add missing labels to card
    const currentLabelIds = new Set(card.idLabels || []);
    for (const labelId of expectedLabelIds) {
        if (!currentLabelIds.has(labelId)) {
            try {
                await addTrelloCardLabel(task.trelloCardId, labelId);
                modified = true;
            } catch (e) {
                console.error(`Failed to add label ${labelId} to card:`, e.message);
            }
        }
    }

    // Remove labels no longer expected (except action labels — keep those)
    for (const labelId of currentLabelIds) {
        if (!expectedLabelIds.has(labelId)) {
            // Only remove if we know this label from our mapping (don't touch unknown labels)
            if (mappingConfig.labelMappings[labelId]) {
                try {
                    await removeTrelloCardLabel(task.trelloCardId, labelId);
                    modified = true;
                } catch (e) {
                    console.error(`Failed to remove label ${labelId} from card:`, e.message);
                }
            }
        }
    }

    return { labelsModified: modified };
};

// Sync a dashboard board with its linked Trello board
// Returns { created, updated, pushed, errors } counts
export const syncWithTrello = async (board, mappingConfig, { readOnly = false } = {}) => {
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
            // Only dashboard changed → push to Trello (skip if readOnly / guest mode)
            if (!readOnly) {
                try {
                    const action = board.actions.find(a => a.id === task.actionId);
                    const listId = action ? catToListId[action.categoryId] : null;
                    const updates = mapTaskToTrelloCardUpdate(task, listId);
                    await updateTrelloCard(task.trelloCardId, updates);
                    // Also push comments, checklists, attachments — capture Trello IDs
                    const { taskModified } = await pushTaskExtrasToTrello(task, card);
                    // Push labels (channels, countries, otherLabels)
                    await pushTaskLabelsToTrello(task, card, board, mappingConfig);
                    // After push, also pull any new Trello extras (checklists, items) into local task
                    const mergedTask = mergeTrelloExtrasIntoTask(task, card);
                    updatedTasks[i] = { ...mergedTask, trelloLastModified: new Date().toISOString(), updatedAt: task.updatedAt };
                    result.pushed++;
                } catch (err) {
                    console.error(`Failed to push task "${task.title}" to Trello:`, err);
                    result.errors++;
                }
            }
        } else if (trelloModified && locallyModified) {
            // Both changed — last write wins based on absolute timestamp
            if (localUpdateTime >= trelloTime && !readOnly) {
                try {
                    const action = board.actions.find(a => a.id === task.actionId);
                    const listId = action ? catToListId[action.categoryId] : null;
                    const updates = mapTaskToTrelloCardUpdate(task, listId);
                    await updateTrelloCard(task.trelloCardId, updates);
                    const { taskModified } = await pushTaskExtrasToTrello(task, card);
                    await pushTaskLabelsToTrello(task, card, board, mappingConfig);
                    // After push, also pull any new Trello extras (checklists, items) into local task
                    const mergedTask = mergeTrelloExtrasIntoTask(task, card);
                    updatedTasks[i] = { ...mergedTask, trelloLastModified: new Date().toISOString(), updatedAt: task.updatedAt };
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
                        done: item.state === 'complete',
                        trelloCheckItemId: item.id,
                        due: item.due ? item.due.split('T')[0] : null,
                        assignee: item.idMember || null
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
                if (mapping?.type === 'other') {
                    const labelHex = mapping.labelColor?.startsWith('#') ? mapping.labelColor : (trelloColorToHex(mapping.labelColor) || '#64748b');
                    otherLabels.push({ id: labelId, name: mapping.labelName || '', color: labelHex });
                }
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

    // 4. Push new dashboard tasks (no trelloCardId) to Trello — skip in readOnly/guest mode
    if (readOnly) {
        // In guest/readOnly mode, don't push anything to Trello
    } else for (let i = 0; i < updatedTasks.length; i++) {
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
            // Push checklists, comments, attachments for the newly created card
            try {
                const emptyCard = { id: created.id, checklists: [], comments: [], attachments: [], idLabels: [] };
                await pushTaskExtrasToTrello(updatedTasks[i], emptyCard);
                await pushTaskLabelsToTrello(updatedTasks[i], emptyCard, board, mappingConfig);
            } catch (extrasErr) {
                console.error(`Failed to push extras for new card "${task.title}":`, extrasErr);
            }
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
