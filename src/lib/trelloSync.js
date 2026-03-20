// Bidirectional Trello sync with "last write wins" conflict resolution

import { fetchTrelloBoardFull, updateTrelloCard, createTrelloCard, addTrelloComment, addTrelloChecklist, addTrelloChecklistItems, updateTrelloChecklistItem, updateTrelloChecklist, addTrelloAttachment, uploadTrelloAttachment, deleteTrelloChecklist, deleteTrelloAttachment, createTrelloBoardLabel, addTrelloCardLabel, removeTrelloCardLabel, updateTrelloList, createTrelloList } from './trello.js';
import { mapTaskToTrelloCardUpdate, mergeCardIntoTask, mergeTrelloExtrasIntoTask, trelloColorToHex, mergeCardIntoAction, mergeCheckItemIntoTask, mapTaskToCheckItemUpdate, mapActionToTrelloCardUpdate, mapTrelloCardToAction, mapTrelloCheckItemToTask } from './trelloMapping.js';
import { CONFIG } from '../config.js';

// Sync lock — prevents concurrent sync operations
let syncInProgress = false;
let syncStartedAt = 0;
const SYNC_LOCK_TIMEOUT_MS = 60000; // 60s max — auto-reset if sync hangs

// Validate board integrity after sync — detect orphans, duplicates, missing refs
export const validateBoardIntegrity = (board) => {
    const warnings = [];
    const actionIds = new Set((board.actions || []).map(a => a.id));
    const categoryIds = new Set((board.categories || []).map(c => c.id));

    // Check tasks reference valid actions
    for (const task of (board.tasks || [])) {
        if (task.actionId && !actionIds.has(task.actionId)) {
            warnings.push(`Task "${task.title}" references missing action ${task.actionId}`);
        }
    }

    // Check actions reference valid categories
    for (const action of (board.actions || [])) {
        if (action.categoryId && !categoryIds.has(action.categoryId)) {
            warnings.push(`Action "${action.name}" references missing category ${action.categoryId}`);
        }
    }

    // Check for duplicate trelloCardId
    const cardIds = new Map();
    for (const task of (board.tasks || [])) {
        if (task.trelloCardId) {
            if (cardIds.has(task.trelloCardId)) {
                warnings.push(`Duplicate trelloCardId ${task.trelloCardId}: "${task.title}" and "${cardIds.get(task.trelloCardId)}"`);
            } else {
                cardIds.set(task.trelloCardId, task.title);
            }
        }
    }

    // Check for duplicate trelloCheckItemId
    const checkItemIds = new Map();
    for (const task of (board.tasks || [])) {
        if (task.trelloCheckItemId) {
            if (checkItemIds.has(task.trelloCheckItemId)) {
                warnings.push(`Duplicate trelloCheckItemId ${task.trelloCheckItemId}: "${task.title}" and "${checkItemIds.get(task.trelloCheckItemId)}"`);
            } else {
                checkItemIds.set(task.trelloCheckItemId, task.title);
            }
        }
    }

    // Check syncMode consistency
    if (board.trelloSync?.trelloBoardId && !board.trelloSync?.syncMode) {
        warnings.push('Board has trelloBoardId but no syncMode set');
    }

    if (warnings.length > 0) {
        console.warn(`[Board integrity] ${warnings.length} warning(s):`, warnings);
    }
    return { valid: warnings.length === 0, warnings };
};

// Push comments, checklists, attachments that don't already exist on Trello.
// Returns { pushed, taskModified, deletedChecklistIds } — deletedChecklistIds lists checklists deleted on Trello.
const pushTaskExtrasToTrello = async (task, card) => {
    const pushed = { comments: 0, checklists: 0, attachments: 0 };
    let taskModified = false;
    const deletedChecklistIds = []; // Track checklists deleted on Trello (had ID but not found)

    // Push new comments (those without trelloCommentId)
    // Build set of existing Trello comment texts for dedup
    const trelloCommentTexts = new Set((card.comments || []).map(c => (c.data?.text || c.text || '').trim()));
    for (const comment of (task.comments || [])) {
        if (!comment.trelloCommentId && comment.text) {
            // Skip if identical text already exists on Trello (dedup)
            if (trelloCommentTexts.has(comment.text.trim())) {
                // Try to capture the Trello comment ID for this matching comment
                const matchingTrelloComment = (card.comments || []).find(c => (c.data?.text || c.text || '').trim() === comment.text.trim());
                if (matchingTrelloComment) {
                    comment.trelloCommentId = matchingTrelloComment.id;
                    taskModified = true;
                }
                continue;
            }
            try {
                // Upload comment attachments as card-level attachments first
                if (comment.attachments?.length > 0) {
                    for (const att of comment.attachments) {
                        if (att.trelloAttachmentId) continue;
                        try {
                            let result = null;
                            if (att.data) {
                                result = await uploadTrelloAttachment(task.trelloCardId, att.data, att.name, att.type);
                            } else if (att.url) {
                                result = await addTrelloAttachment(task.trelloCardId, att.url, att.name);
                            }
                            if (result?.id) {
                                att.trelloAttachmentId = result.id;
                                if (result.url) att.url = result.url;
                                // Also update matching task-level attachment copy
                                const taskAtt = (task.attachments || []).find(ta => ta.id === att.id);
                                if (taskAtt) {
                                    taskAtt.trelloAttachmentId = result.id;
                                    if (result.url) taskAtt.url = result.url;
                                }
                                taskModified = true;
                            }
                        } catch (e) {
                            console.error('Failed to upload comment attachment:', att.name, e);
                        }
                    }
                }
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
            // Push only truly new items (no trelloCheckItemId AND name not on Trello)
            const newItems = (cl.items || []).filter(item => item.text && !item.trelloCheckItemId && !existing.itemNames.has(item.text));
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
        } else if (cl.trelloChecklistId) {
            // Checklist had a Trello ID but no longer exists on Trello → deleted on Trello side
            console.log(`[Trello sync] Checklist "${cl.name}" (${cl.trelloChecklistId}) was deleted on Trello — removing locally`);
            deletedChecklistIds.push(cl.id);
            taskModified = true;
        } else {
            // New checklist (never on Trello) — create on Trello
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
    // Collect all position updates and execute in parallel for speed
    const positionUpdates = [];
    for (let clIdx = 0; clIdx < taskChecklists.length; clIdx++) {
        const cl = taskChecklists[clIdx];
        if (!cl.trelloChecklistId) continue;
        const trelloCl = card.checklists?.find(c => c.id === cl.trelloChecklistId);
        // Sync checklist position (Trello uses pos as a float; use index * 16384)
        const expectedPos = (clIdx + 1) * 16384;
        if (trelloCl && Math.abs((trelloCl.pos || 0) - expectedPos) > 100) {
            positionUpdates.push(
                updateTrelloChecklist(cl.trelloChecklistId, { pos: expectedPos })
                    .then(() => { taskModified = true; })
                    .catch(e => console.error(`Failed to update checklist "${cl.name}" pos:`, e.message))
            );
        }
        // Sync item positions within the checklist
        for (let itemIdx = 0; itemIdx < (cl.items || []).length; itemIdx++) {
            const item = cl.items[itemIdx];
            if (!item.trelloCheckItemId) continue;
            const expectedItemPos = (itemIdx + 1) * 16384;
            const trelloItem = trelloCl?.checkItems?.find(ci => ci.id === item.trelloCheckItemId);
            const currentPos = trelloItem?.pos || 0;
            if (Math.abs(currentPos - expectedItemPos) > 100) {
                positionUpdates.push(
                    updateTrelloChecklistItem(task.trelloCardId, item.trelloCheckItemId, { pos: expectedItemPos })
                        .then(() => { taskModified = true; })
                        .catch(e => console.error(`Failed to update item "${item.text}" pos:`, e.message))
                );
            }
        }
    }
    if (positionUpdates.length > 0) await Promise.all(positionUpdates);

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
    // Safety: only delete if the task actually has local checklists (owns the card's checklists).
    // Tasks with no local checklists should never trigger deletion — avoids wiping card-as-action checklists.
    const localChecklistIds = new Set(taskChecklists.filter(cl => cl.trelloChecklistId).map(cl => cl.trelloChecklistId));
    if (localChecklistIds.size > 0) {
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
    } // end: localChecklistIds.size > 0

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

    return { pushed, taskModified, deletedChecklistIds };
};

// Push ONLY comments and attachments for actions (card-as-action mode).
// Unlike pushTaskExtrasToTrello, this NEVER touches checklists or deletes anything.
// In card-as-action mode, checklists = tasks and are managed by the task-level sync.
const pushActionExtrasToTrello = async (action, card) => {
    let actionModified = false;

    // Push new comments (without trelloCommentId)
    const trelloCommentTexts = new Set((card.comments || []).map(c => (c.data?.text || c.text || '').trim()));
    for (const comment of (action.comments || [])) {
        if (!comment.trelloCommentId && comment.text) {
            if (trelloCommentTexts.has(comment.text.trim())) {
                const match = (card.comments || []).find(c => (c.data?.text || c.text || '').trim() === comment.text.trim());
                if (match) { comment.trelloCommentId = match.id; actionModified = true; }
                continue;
            }
            try {
                const result = await addTrelloComment(action.trelloCardId, comment.text);
                if (result?.id) { comment.trelloCommentId = result.id; actionModified = true; }
            } catch (e) {
                console.error('Failed to push action comment:', e);
            }
        }
    }

    // Push new attachments (without trelloAttachmentId) — additive only, no deletions
    const trelloAttUrls = new Set((card.attachments || []).map(a => a.url));
    for (const att of (action.attachments || [])) {
        if (att.trelloAttachmentId) continue;
        try {
            let result = null;
            if (att.url && !trelloAttUrls.has(att.url)) {
                result = await addTrelloAttachment(action.trelloCardId, att.url, att.name);
            } else if (att.data && !att.url) {
                result = await uploadTrelloAttachment(action.trelloCardId, att.data, att.name, att.type);
            }
            if (result?.id) { att.trelloAttachmentId = result.id; if (result.url) att.url = result.url; actionModified = true; }
        } catch (e) {
            console.error('Failed to push action attachment:', att.name, e);
        }
    }

    return { actionModified };
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
    // Prevent concurrent syncs — skip if another sync is already running
    if (syncInProgress) {
        // Auto-reset if lock held longer than timeout (sync hung)
        if (syncStartedAt && Date.now() - syncStartedAt > SYNC_LOCK_TIMEOUT_MS) {
            console.warn(`[Trello sync] Lock held for >${SYNC_LOCK_TIMEOUT_MS / 1000}s — force-resetting stale lock`);
            syncInProgress = false;
        } else {
            console.log('[Trello sync] Sync already in progress, skipping');
            return { board, result: { created: 0, updated: 0, pushed: 0, errors: 0, skipped: true } };
        }
    }
    syncInProgress = true;
    syncStartedAt = Date.now();
    try {
        return await _syncWithTrelloInner(board, mappingConfig, { readOnly });
    } finally {
        syncInProgress = false;
        syncStartedAt = 0;
    }
};

const _syncWithTrelloInner = async (board, mappingConfig, { readOnly = false } = {}) => {
    const { trelloSync } = board;
    // Branch on sync mode
    if (trelloSync.syncMode === 'card-as-action') {
        return syncWithTrelloCardAsAction(board, mappingConfig, { readOnly });
    }

    const result = { created: 0, updated: 0, pushed: 0, errors: 0, errorDetails: [] };

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
        // Skip card-as-action tasks — they use trelloCheckItemId, not their own card
        // This guard prevents accidental processing if syncMode is lost/corrupted
        if (task.trelloCheckItemId || task.trelloChecklistName || task.trelloChecklistId) continue;

        const card = trelloCardMap.get(task.trelloCardId);
        if (!card) {
            // Card deleted on Trello — mark as paused
            if (task.status !== 'paused') {
                updatedTasks[i] = { ...task, status: 'paused', trelloArchived: false };
                result.updated++;
            }
            continue;
        }

        // Remove from map (processed)
        trelloCardMap.delete(task.trelloCardId);

        // Handle archived cards
        if (card.closed) {
            if (!task.trelloArchived || task.status !== 'paused') {
                updatedTasks[i] = { ...task, status: 'paused', trelloArchived: true, trelloLastModified: card.dateLastActivity };
                result.updated++;
            }
            continue;
        } else if (task.trelloArchived) {
            // Card was unarchived on Trello — restore
            updatedTasks[i] = { ...task, trelloArchived: false, status: task.status === 'paused' ? 'todo' : task.status };
            task = updatedTasks[i]; // Use updated task for further processing
            result.updated++;
        }

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
                    const { taskModified, deletedChecklistIds } = await pushTaskExtrasToTrello(task, card);
                    // Remove checklists that were deleted on Trello
                    if (deletedChecklistIds.length > 0) {
                        const delSet = new Set(deletedChecklistIds);
                        task.checklists = (task.checklists || []).filter(cl => !delSet.has(cl.id));
                    }
                    // Push labels (channels, countries, otherLabels)
                    await pushTaskLabelsToTrello(task, card, board, mappingConfig);
                    // After push, also pull any new Trello extras (checklists, items) into local task
                    const mergedTask = mergeTrelloExtrasIntoTask(task, card);
                    updatedTasks[i] = { ...mergedTask, trelloLastModified: new Date().toISOString(), updatedAt: task.updatedAt };
                    result.pushed++;
                } catch (err) {
                    console.error(`Failed to push task "${task.title}" to Trello:`, err);
                    result.errors++;
                    result.errorDetails.push({ name: task.title, op: 'push', error: err.message });
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
                    const { taskModified, deletedChecklistIds } = await pushTaskExtrasToTrello(task, card);
                    if (deletedChecklistIds.length > 0) {
                        const delSet = new Set(deletedChecklistIds);
                        task.checklists = (task.checklists || []).filter(cl => !delSet.has(cl.id));
                    }
                    await pushTaskLabelsToTrello(task, card, board, mappingConfig);
                    // After push, also pull any new Trello extras (checklists, items) into local task
                    const mergedTask = mergeTrelloExtrasIntoTask(task, card);
                    updatedTasks[i] = { ...mergedTask, trelloLastModified: new Date().toISOString(), updatedAt: task.updatedAt };
                    result.pushed++;
                } catch (err) {
                    console.error(`Failed to push task "${task.title}" to Trello:`, err);
                    result.errors++;
                    result.errorDetails.push({ name: task.title, op: 'push', error: err.message });
                }
            } else {
                updatedTasks[i] = mergeCardIntoTask(task, card, mappingConfig);
                result.updated++;
            }
        } else {
            // Neither side has timestamp changes — still merge extras
            // (positions, new checklist items, comments that don't affect dateLastActivity)
            const mergedTask = mergeTrelloExtrasIntoTask(task, card);
            // Check if anything actually changed
            const extrasChanged = JSON.stringify(mergedTask.checklists) !== JSON.stringify(task.checklists) ||
                JSON.stringify(mergedTask.comments) !== JSON.stringify(task.comments) ||
                JSON.stringify(mergedTask.attachments) !== JSON.stringify(task.attachments);
            if (extrasChanged) {
                updatedTasks[i] = { ...mergedTask, trelloLastModified: card.dateLastActivity };
                result.updated++;
            }
        }
    }

    // 3. New cards on Trello (not yet in dashboard)
    for (const [cardId, card] of trelloCardMap) {
        // Skip archived cards — don't import them as new tasks
        if (card.closed) continue;

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

        const genId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
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
            result.errorDetails.push({ name: task.title, op: 'create card', error: err.message });
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

    // Post-sync integrity check
    const integrity = validateBoardIntegrity(syncedBoard);
    if (!integrity.valid) {
        result.integrityWarnings = integrity.warnings;
    }

    return { board: syncedBoard, result };
};

// ============================================================
// Card-as-Action sync mode: Cards → Actions, Checklist Items → Tasks
// ============================================================
const syncWithTrelloCardAsAction = async (board, mappingConfig, { readOnly = false } = {}) => {
    const { trelloSync } = board;
    const result = { created: 0, updated: 0, pushed: 0, errors: 0, errorDetails: [] };

    // 1. Fetch current Trello state
    const trelloData = await fetchTrelloBoardFull(trelloSync.trelloBoardId);
    const { cards, lists, members: trelloMembers } = trelloData;

    // Build lookup maps
    const trelloCardMap = new Map(cards.map(c => [c.id, c]));

    // Build category ↔ list lookups
    const catToListId = {};
    const listToCatId = {};
    for (const cat of board.categories) {
        if (cat.trelloListId) {
            catToListId[cat.id] = cat.trelloListId;
            listToCatId[cat.trelloListId] = cat.id;
        }
    }

    // 1b. Sync lists ↔ categories (name, position, creation)
    const updatedCategories = [...board.categories];
    const trelloListMap = new Map(lists.map(l => [l.id, l]));

    // Pull: update category names/positions from Trello lists
    for (let i = 0; i < updatedCategories.length; i++) {
        const cat = updatedCategories[i];
        if (!cat.trelloListId) continue;
        const list = trelloListMap.get(cat.trelloListId);
        if (!list) continue;
        const catUpdatedAt = new Date(cat.updatedAt || 0).getTime();
        const catSyncTime = new Date(cat.trelloLastModified || 0).getTime();
        const catLocallyModified = catUpdatedAt > catSyncTime;
        if (catLocallyModified && !readOnly) {
            // Push local changes to Trello
            try {
                const updates = {};
                if (cat.name !== list.name) updates.name = cat.name;
                if (cat.order !== undefined) {
                    const expectedPos = (cat.order + 1) * 16384;
                    if (Math.abs((list.pos || 0) - expectedPos) > 100) {
                        updates.pos = String(expectedPos);
                    }
                }
                if (Object.keys(updates).length > 0) {
                    await updateTrelloList(cat.trelloListId, updates);
                    updatedCategories[i] = { ...cat, trelloListPos: cat.order !== undefined ? (cat.order + 1) * 16384 : list.pos, trelloLastModified: new Date().toISOString() };
                    result.pushed++;
                }
            } catch (e) {
                console.error(`Failed to push category "${cat.name}" to Trello list:`, e);
                result.errors++;
                result.errorDetails.push({ name: cat.name, op: 'push list', error: e.message });
            }
        } else {
            // Pull from Trello
            if (cat.name !== list.name || (list.pos && cat.trelloListPos !== list.pos)) {
                updatedCategories[i] = { ...cat, name: list.name, trelloListPos: list.pos, order: i, trelloLastModified: new Date().toISOString() };
                result.updated++;
            }
        }
    }

    // Push: create new local categories (no trelloListId) as Trello lists
    if (!readOnly) {
        for (let i = 0; i < updatedCategories.length; i++) {
            const cat = updatedCategories[i];
            if (cat.trelloListId) continue;
            try {
                const pos = (i + 1) * 16384;
                const created = await createTrelloList(trelloSync.trelloBoardId, cat.name, pos);
                if (created?.id) {
                    updatedCategories[i] = { ...cat, trelloListId: created.id, trelloListPos: created.pos, trelloLastModified: new Date().toISOString() };
                    catToListId[cat.id] = created.id;
                    listToCatId[created.id] = cat.id;
                    result.pushed++;
                }
            } catch (e) {
                console.error(`Failed to create Trello list for category "${cat.name}":`, e);
                result.errors++;
                result.errorDetails.push({ name: cat.name, op: 'create list', error: e.message });
            }
        }
    }

    // Pull: create local categories from new Trello lists
    const existingListIds = new Set(updatedCategories.map(c => c.trelloListId).filter(Boolean));
    for (const list of lists) {
        if (existingListIds.has(list.id)) continue;
        const newCat = {
            id: `cat-${crypto.randomUUID()}`,
            name: list.name,
            color: CONFIG.CATEGORIES[updatedCategories.length % CONFIG.CATEGORIES.length]?.color || '#6366f1',
            trelloListId: list.id,
            trelloListPos: list.pos,
            trelloLastModified: new Date().toISOString()
        };
        updatedCategories.push(newCat);
        catToListId[newCat.id] = list.id;
        listToCatId[list.id] = newCat.id;
        result.created++;
    }

    // Sort categories by Trello list position
    updatedCategories.sort((a, b) => (a.trelloListPos || 0) - (b.trelloListPos || 0));

    // Clone actions and tasks for mutation
    const updatedActions = [...board.actions];
    const updatedTasks = [...board.tasks];
    const newActions = [];
    const newTasks = [];

    // Track which cards have been processed
    const processedCardIds = new Set();

    // 2. Sync existing actions (linked to Trello cards)
    for (let i = 0; i < updatedActions.length; i++) {
        const action = updatedActions[i];
        if (!action.trelloCardId) continue;

        const card = trelloCardMap.get(action.trelloCardId);
        processedCardIds.add(action.trelloCardId);

        if (!card) {
            // Card deleted on Trello — mark all tasks under this action as paused
            for (let j = 0; j < updatedTasks.length; j++) {
                if (updatedTasks[j].actionId === action.id && updatedTasks[j].status !== 'paused') {
                    updatedTasks[j] = { ...updatedTasks[j], status: 'paused' };
                    result.updated++;
                }
            }
            continue;
        }

        // Handle archived cards
        if (card.closed) {
            for (let j = 0; j < updatedTasks.length; j++) {
                if (updatedTasks[j].actionId === action.id && updatedTasks[j].status !== 'paused') {
                    updatedTasks[j] = { ...updatedTasks[j], status: 'paused', trelloArchived: true };
                    result.updated++;
                }
            }
            continue;
        }

        // Compare timestamps for action
        const trelloTime = new Date(card.dateLastActivity).getTime();
        const lastSyncTime = new Date(action.trelloLastModified || 0).getTime();
        const actionUpdateTime = new Date(action.updatedAt || 0).getTime();
        const actionLocallyModified = actionUpdateTime > lastSyncTime;
        const trelloCardModified = trelloTime > lastSyncTime;

        if (actionLocallyModified && !trelloCardModified && !readOnly) {
            // Local action changed — push to Trello card
            try {
                const listId = catToListId[action.categoryId];
                const updates = mapActionToTrelloCardUpdate(action, listId);
                await updateTrelloCard(action.trelloCardId, updates);
                updatedActions[i] = { ...action, trelloLastModified: new Date().toISOString() };
                result.pushed++;
            } catch (e) {
                console.error(`Failed to push action "${action.name}" to Trello:`, e);
                result.errors++;
                result.errorDetails.push({ name: action.name, op: 'push card', error: e.message });
                updatedActions[i] = mergeCardIntoAction(action, card, listToCatId, mappingConfig);
            }
        } else if (trelloCardModified && !actionLocallyModified) {
            // Trello changed — pull
            updatedActions[i] = mergeCardIntoAction(action, card, listToCatId, mappingConfig);
        } else if (trelloCardModified && actionLocallyModified) {
            // Both changed — last write wins
            if (actionUpdateTime >= trelloTime && !readOnly) {
                try {
                    const listId = catToListId[action.categoryId];
                    const updates = mapActionToTrelloCardUpdate(action, listId);
                    await updateTrelloCard(action.trelloCardId, updates);
                    updatedActions[i] = { ...action, trelloLastModified: new Date().toISOString() };
                    result.pushed++;
                } catch (e) {
                    console.error(`Failed to push action "${action.name}" to Trello:`, e);
                    result.errors++;
                    result.errorDetails.push({ name: action.name, op: 'push card', error: e.message });
                    updatedActions[i] = mergeCardIntoAction(action, card, listToCatId, mappingConfig);
                }
            } else {
                updatedActions[i] = mergeCardIntoAction(action, card, listToCatId, mappingConfig);
            }
        } else {
            // Neither changed — just refresh metadata (comments, attachments)
            updatedActions[i] = mergeCardIntoAction(action, card, listToCatId, mappingConfig);
        }

        // Push action extras (comments, attachments only — NEVER touch checklists)
        if (!readOnly && action.trelloCardId) {
            try {
                const { actionModified } = await pushActionExtrasToTrello(action, card);
                if (actionModified) {
                    updatedActions[i] = { ...updatedActions[i], ...action };
                }
            } catch (e) {
                console.error(`Failed to push extras for action "${action.name}":`, e);
                result.errors++;
                result.errorDetails.push({ name: action.name, op: 'push extras', error: e.message });
            }
        }

        // Sync checklist items ↔ tasks
        // Build map of all checklist items on this card
        const trelloItems = new Map();
        for (const cl of (card.checklists || [])) {
            for (const item of (cl.checkItems || [])) {
                trelloItems.set(item.id, { item, checklistId: cl.id, checklistName: cl.name });
            }
        }

        // Process existing tasks linked to this card's checklist items
        for (let j = 0; j < updatedTasks.length; j++) {
            const task = updatedTasks[j];
            if (task.actionId !== action.id || !task.trelloCheckItemId) continue;

            const itemData = trelloItems.get(task.trelloCheckItemId);
            if (!itemData) {
                // Item deleted on Trello — clear trelloCheckItemId so it can be recreated
                updatedTasks[j] = { ...task, trelloCheckItemId: null, trelloChecklistId: null };
                result.updated++;
                continue;
            }

            // Remove from map (processed)
            trelloItems.delete(task.trelloCheckItemId);

            const { item } = itemData;
            const taskUpdateTime = new Date(task.updatedAt || 0).getTime();
            const taskSyncTime = new Date(task.trelloLastModified || 0).getTime();
            const taskLocallyModified = taskUpdateTime > taskSyncTime;
            const trelloItemModified = trelloTime > taskSyncTime;

            if (trelloItemModified && !taskLocallyModified) {
                // Trello changed — pull
                updatedTasks[j] = mergeCheckItemIntoTask(task, item, card);
                result.updated++;
            } else if (taskLocallyModified && !trelloItemModified) {
                // Local changed — push
                if (!readOnly) {
                    try {
                        const updates = mapTaskToCheckItemUpdate(task);
                        await updateTrelloChecklistItem(task.trelloCardId, task.trelloCheckItemId, updates);
                        updatedTasks[j] = { ...task, trelloLastModified: new Date().toISOString() };
                        result.pushed++;
                    } catch (e) {
                        console.error(`Failed to push task "${task.title}" to Trello checkItem:`, e);
                        result.errors++;
                        result.errorDetails.push({ name: task.title, op: 'push checkItem', error: e.message });
                    }
                }
            } else if (trelloItemModified && taskLocallyModified) {
                // Both changed — last write wins
                if (taskUpdateTime >= trelloTime && !readOnly) {
                    try {
                        const updates = mapTaskToCheckItemUpdate(task);
                        await updateTrelloChecklistItem(task.trelloCardId, task.trelloCheckItemId, updates);
                        updatedTasks[j] = { ...task, trelloLastModified: new Date().toISOString() };
                        result.pushed++;
                    } catch (e) {
                        console.error(`Failed to push task "${task.title}" to Trello checkItem:`, e);
                        result.errors++;
                        result.errorDetails.push({ name: task.title, op: 'push checkItem', error: e.message });
                    }
                } else {
                    updatedTasks[j] = mergeCheckItemIntoTask(task, item, card);
                    result.updated++;
                }
            }
        }

        // Sync checklist names: if local trelloChecklistName differs from Trello, push rename
        if (!readOnly) {
            const localChecklistNames = new Map(); // checklistId → localName
            for (const task of updatedTasks) {
                if (task.actionId === action.id && task.trelloChecklistId && task.trelloChecklistName) {
                    localChecklistNames.set(task.trelloChecklistId, task.trelloChecklistName);
                }
            }
            for (const cl of (card.checklists || [])) {
                const localName = localChecklistNames.get(cl.id);
                if (localName && localName !== cl.name) {
                    try {
                        await updateTrelloChecklist(cl.id, { name: localName });
                        result.pushed++;
                    } catch (e) {
                        console.error(`Failed to rename checklist "${cl.name}" → "${localName}":`, e);
                    }
                }
            }
        }

        // Sync checklist and item positions to Trello (card-as-action mode)
        if (!readOnly) {
            const positionUpdates = [];
            // Group tasks by checklistId, sorted by order
            const checklistGroups = new Map();
            for (const task of updatedTasks) {
                if (task.actionId !== action.id || !task.trelloChecklistId) continue;
                if (!checklistGroups.has(task.trelloChecklistId)) checklistGroups.set(task.trelloChecklistId, []);
                checklistGroups.get(task.trelloChecklistId).push(task);
            }
            // Sort each group by order
            for (const [clId, clTasks] of checklistGroups) {
                clTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
            }
            // Sync checklist positions (based on first task's order in each checklist)
            const sortedChecklists = [...checklistGroups.entries()].sort((a, b) => {
                const aMin = Math.min(...a[1].map(t => t.order || 0));
                const bMin = Math.min(...b[1].map(t => t.order || 0));
                return aMin - bMin;
            });
            sortedChecklists.forEach(([clId, _], clIdx) => {
                const expectedPos = (clIdx + 1) * 16384;
                const trelloCl = card.checklists?.find(c => c.id === clId);
                if (trelloCl && Math.abs((trelloCl.pos || 0) - expectedPos) > 100) {
                    positionUpdates.push(
                        updateTrelloChecklist(clId, { pos: expectedPos })
                            .catch(e => console.error(`[card-as-action] Failed to update checklist pos:`, e.message))
                    );
                }
            });
            // Sync item positions within each checklist
            for (const [clId, clTasks] of checklistGroups) {
                const trelloCl = card.checklists?.find(c => c.id === clId);
                clTasks.forEach((task, itemIdx) => {
                    if (!task.trelloCheckItemId) return;
                    const expectedItemPos = (itemIdx + 1) * 16384;
                    const trelloItem = trelloCl?.checkItems?.find(ci => ci.id === task.trelloCheckItemId);
                    if (trelloItem && Math.abs((trelloItem.pos || 0) - expectedItemPos) > 100) {
                        positionUpdates.push(
                            updateTrelloChecklistItem(card.id, task.trelloCheckItemId, { pos: expectedItemPos })
                                .catch(e => console.error(`[card-as-action] Failed to update item pos:`, e.message))
                        );
                    }
                });
            }
            if (positionUpdates.length > 0) {
                await Promise.all(positionUpdates);
                result.pushed += positionUpdates.length;
            }
        }

        // Pull checklist names from Trello → update local tasks
        for (const cl of (card.checklists || [])) {
            for (let j = 0; j < updatedTasks.length; j++) {
                const task = updatedTasks[j];
                if (task.trelloChecklistId === cl.id && task.trelloChecklistName !== cl.name) {
                    const taskUpdateTime = new Date(task.updatedAt || 0).getTime();
                    const lastSyncTime = new Date(task.trelloLastModified || 0).getTime();
                    // Only pull if local hasn't been modified since last sync
                    if (taskUpdateTime <= lastSyncTime) {
                        updatedTasks[j] = { ...task, trelloChecklistName: cl.name };
                    }
                }
            }
        }

        // New checklist items on Trello → create local tasks
        for (const [itemId, { item, checklistId, checklistName }] of trelloItems) {
            const newTask = mapTrelloCheckItemToTask(item, action.id, card, checklistId, checklistName, mappingConfig);
            newTasks.push(newTask);
            result.created++;
        }
    }

    // 3. New cards on Trello (not yet in dashboard) → create new actions + tasks
    for (const [cardId, card] of trelloCardMap) {
        if (processedCardIds.has(cardId)) continue;
        if (card.closed) continue;

        const categoryId = listToCatId[card.idList];
        if (!categoryId) continue;

        const newAction = mapTrelloCardToAction(card, categoryId, mappingConfig);
        newActions.push(newAction);

        // Create tasks from checklist items
        if (card.checklists) {
            const sortedChecklists = [...card.checklists].sort((a, b) => (a.pos || 0) - (b.pos || 0));
            for (const cl of sortedChecklists) {
                const sortedItems = [...(cl.checkItems || [])].sort((a, b) => (a.pos || 0) - (b.pos || 0));
                for (const item of sortedItems) {
                    newTasks.push(mapTrelloCheckItemToTask(item, newAction.id, card, cl.id, cl.name, mappingConfig));
                    result.created++;
                }
            }
        }
        result.created++;
    }

    // 4. Push new local actions (no trelloCardId) to Trello as cards
    if (!readOnly) {
        for (let i = 0; i < updatedActions.length; i++) {
            const action = updatedActions[i];
            if (action.trelloCardId) continue;
            const listId = catToListId[action.categoryId];
            if (!listId) continue;

            try {
                const cardData = { name: action.name, desc: action.description || '' };
                const created = await createTrelloCard(listId, cardData);
                updatedActions[i] = {
                    ...action,
                    trelloCardId: created.id,
                    trelloLastModified: created.dateLastActivity || new Date().toISOString()
                };

                // Push local tasks under this action as checklist items
                const actionTasks = updatedTasks.filter(t => t.actionId === action.id && !t.trelloCheckItemId);
                if (actionTasks.length > 0) {
                    // Create a default checklist
                    const checklistResult = await addTrelloChecklist(created.id, 'Tasks', actionTasks.map(t => ({ text: t.title, done: t.status === 'completed' })));
                    if (checklistResult?.id) {
                        const createdItems = checklistResult.checkItems || [];
                        for (let k = 0; k < actionTasks.length && k < createdItems.length; k++) {
                            const tIdx = updatedTasks.findIndex(t => t.id === actionTasks[k].id);
                            if (tIdx >= 0) {
                                updatedTasks[tIdx] = {
                                    ...updatedTasks[tIdx],
                                    trelloCardId: created.id,
                                    trelloCheckItemId: createdItems[k].id,
                                    trelloChecklistId: checklistResult.id,
                                    trelloLastModified: new Date().toISOString()
                                };
                            }
                        }
                    }
                }
                result.pushed++;
            } catch (e) {
                console.error(`Failed to create Trello card for action "${action.name}":`, e);
                result.errors++;
                result.errorDetails.push({ name: action.name, op: 'create card', error: e.message });
            }
        }

        // Push new local tasks (no trelloCheckItemId) to Trello as checklist items
        // Group by trelloChecklistName to recreate proper checklist structure
        const tasksByCard = new Map();
        for (let i = 0; i < updatedTasks.length; i++) {
            const task = updatedTasks[i];
            if (task.trelloCheckItemId || !task.trelloCardId) continue;
            const taskAction = updatedActions.find(a => a.id === task.actionId);
            if (!taskAction?.trelloCardId) continue;
            if (!tasksByCard.has(taskAction.trelloCardId)) tasksByCard.set(taskAction.trelloCardId, []);
            tasksByCard.get(taskAction.trelloCardId).push({ task, index: i });
        }

        for (const [cardId, taskEntries] of tasksByCard) {
            const card = trelloCardMap.get(cardId);
            // Group tasks by checklist name
            const groups = {};
            for (const entry of taskEntries) {
                const name = entry.task.trelloChecklistName || 'Tasks';
                if (!groups[name]) groups[name] = [];
                groups[name].push(entry);
            }

            for (const [checklistName, entries] of Object.entries(groups)) {
                // Look for existing checklist with this name on the card
                let checklistId = card?.checklists?.find(cl => cl.name === checklistName)?.id;

                if (!checklistId) {
                    // Create checklist with proper name (restores original checklist structure)
                    try {
                        const clResult = await addTrelloChecklist(cardId, checklistName, []);
                        if (clResult?.id) checklistId = clResult.id;
                    } catch (e) {
                        console.error(`Failed to create checklist "${checklistName}" on card ${cardId}:`, e);
                        continue;
                    }
                }
                if (!checklistId) continue;

                // Add all items to this checklist
                const items = entries.map(e => ({
                    text: e.task.title,
                    done: e.task.status === 'completed'
                }));
                try {
                    const itemResults = await addTrelloChecklistItems(checklistId, items);
                    const createdItems = itemResults?.items || [];
                    for (let k = 0; k < entries.length && k < createdItems.length; k++) {
                        const task = entries[k].task;
                        updatedTasks[entries[k].index] = {
                            ...task,
                            trelloCardId: cardId,
                            trelloCheckItemId: createdItems[k].id,
                            trelloChecklistId: checklistId,
                            trelloLastModified: new Date().toISOString()
                        };
                        result.pushed++;

                        // Sync metadata (due date, assignee) for recreated items
                        const metaUpdates = {};
                        if (task.dueDate) metaUpdates.due = task.dueDate;
                        if (task.assignees?.length > 0) metaUpdates.idMember = task.assignees[0];
                        if (Object.keys(metaUpdates).length > 0) {
                            try {
                                await updateTrelloChecklistItem(cardId, createdItems[k].id, metaUpdates);
                            } catch (e) {
                                console.error(`Failed to sync metadata for item "${task.title}":`, e);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to push items to checklist "${checklistName}":`, e);
                    result.errors++;
                    result.errorDetails.push({ name: checklistName, op: 'push checklist items', error: e.message });
                }
            }
        }
    }

    // 5. Update members
    const members = (trelloMembers || []).map(m => ({
        id: m.id,
        fullName: m.fullName,
        username: m.username,
        avatarUrl: m.avatarUrl ? `${m.avatarUrl}/50.png` : null
    }));

    // 6. Build updated board
    const syncedBoard = {
        ...board,
        categories: updatedCategories,
        actions: [...updatedActions, ...newActions],
        tasks: [...updatedTasks, ...newTasks],
        members: members.length ? members : (board.members || []),
        trelloSync: {
            ...board.trelloSync,
            lastSyncAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
    };

    // Post-sync integrity check
    const integrity = validateBoardIntegrity(syncedBoard);
    if (!integrity.valid) {
        result.integrityWarnings = integrity.warnings;
    }

    return { board: syncedBoard, result };
};
