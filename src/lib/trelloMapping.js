// Trello ↔ Dashboard mapping and conversion functions

import { CONFIG, TRELLO_COLORS } from '../config.js';

// --- ID generation ---
const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// --- Trello color → Dashboard color/gradient ---
const colorMap = {
    green:  { color: '#22c55e', gradient: 'from-green-400 to-emerald-600' },
    yellow: { color: '#f59e0b', gradient: 'from-amber-400 to-orange-500' },
    orange: { color: '#f97316', gradient: 'from-orange-400 to-red-500' },
    red:    { color: '#ef4444', gradient: 'from-red-400 to-rose-600' },
    purple: { color: '#8b5cf6', gradient: 'from-violet-400 to-purple-600' },
    blue:   { color: '#3b82f6', gradient: 'from-blue-400 to-indigo-600' },
    sky:    { color: '#0ea5e9', gradient: 'from-sky-400 to-cyan-600' },
    lime:   { color: '#84cc16', gradient: 'from-lime-400 to-green-500' },
    pink:   { color: '#ec4899', gradient: 'from-pink-400 to-rose-600' },
    black:  { color: '#6366f1', gradient: 'from-indigo-500 to-purple-600' }
};

export const trelloColorToHex = (trelloColor) =>
    (colorMap[trelloColor] || colorMap.black).color;

export const trelloColorToGradient = (trelloColor) =>
    (colorMap[trelloColor] || colorMap.black).gradient;

// --- Trello List → Dashboard Category ---
export const mapTrelloListToCategory = (list, index) => ({
    id: genId('cat'),
    name: list.name,
    color: Object.values(colorMap)[index % Object.values(colorMap).length].color,
    gradient: Object.values(colorMap)[index % Object.values(colorMap).length].gradient,
    trelloListId: list.id
});

// --- Trello Label → Dashboard Action ---
export const mapTrelloLabelToAction = (label, categoryId) => ({
    id: genId('act'),
    name: label.name || `Unlabeled (${label.color})`,
    categoryId,
    budget: 0,
    priority: 'medium',
    tags: [],
    trelloLabelId: label.id
});

// --- Trello Label → Channel match ---
// Tries to match label name to existing channels
export const matchLabelToChannel = (label) => {
    if (!label.name) return null;
    const name = label.name.toLowerCase();
    const channel = CONFIG.CHANNELS.find(c =>
        name.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(name)
    );
    return channel ? channel.id : null;
};

// --- Trello Card → Dashboard Task ---
export const mapTrelloCardToTask = (card, actionId, categoryId, mappingConfig) => {
    const now = new Date();
    const dueDate = card.due ? card.due.split('T')[0] : null;
    // Default start date: 1st of the due date's month (or current month if no due date)
    let startDate;
    if (card.start) {
        startDate = card.start.split('T')[0];
    } else if (dueDate) {
        const d = new Date(dueDate);
        startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    const month = dueDate ? new Date(dueDate).getMonth() : now.getMonth();

    // Map card labels to channels based on mappingConfig
    const channels = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'channel') {
                channels.push(mapping.channelId);
            }
        }
    }

    // Map Trello checklists (named, preserving checklist structure)
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

    // Map Trello attachments
    const attachments = [];
    if (card.attachments) {
        for (const att of card.attachments) {
            attachments.push({
                id: genId('att'),
                name: att.name,
                url: att.url,
                mimeType: att.mimeType || '',
                date: att.date,
                trelloAttachmentId: att.id
            });
        }
    }

    // Map Trello comments
    const comments = [];
    if (card.comments) {
        for (const comment of card.comments) {
            comments.push({
                id: genId('cm'),
                author: comment.memberCreator?.fullName || comment.memberCreator?.username || 'Unknown',
                text: comment.data?.text || '',
                date: comment.date,
                trelloCommentId: comment.id
            });
        }
    }

    // Map labels to countries
    const countries = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'country' && mapping.countryId) {
                countries.push(mapping.countryId);
            }
        }
    }

    // Map Trello members → assignees
    const assignees = card.idMembers || [];

    // Determine status
    let status = 'todo';
    if (card.dueComplete) {
        status = 'completed';
    }

    // Map unmapped labels as otherLabels
    const otherLabels = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'other') {
                otherLabels.push({ id: labelId, name: mapping.labelName || '', color: mapping.labelColor || '' });
            }
        }
    }

    return {
        id: genId('task'),
        actionId,
        title: card.name,
        description: card.desc || '',
        startDate,
        dueDate: dueDate || startDate,
        month,
        status,
        priority: 'medium',
        budget: 0,
        checklists,
        comments,
        attachments,
        channels,
        countries,
        assignees,
        otherLabels,
        order: card.pos || 0,
        createdAt: new Date().toISOString(),
        trelloCardId: card.id,
        trelloLastModified: card.dateLastActivity
    };
};

// --- Build full import data from Trello board ---
// mappingConfig = { labelMappings: { [trelloLabelId]: { type: 'action'|'channel'|'other'|'ignore', categoryId?, channelId? } } }
export const buildImportData = (trelloData, mappingConfig) => {
    const { board, lists, labels, cards, members: trelloMembers } = trelloData;

    // 1. Map lists → categories
    const categories = lists
        .sort((a, b) => a.pos - b.pos)
        .map((list, i) => mapTrelloListToCategory(list, i));

    // Build listId → categoryId lookup
    const listToCat = {};
    lists.forEach((list, i) => { listToCat[list.id] = categories[i].id; });

    // 2. Map labels → actions based on mappingConfig
    const actions = [];
    const labelToAction = {};
    for (const label of labels) {
        const mapping = mappingConfig.labelMappings[label.id];
        if (!mapping || mapping.type !== 'action') continue;
        const categoryId = mapping.categoryId || categories[0]?.id;
        const action = mapTrelloLabelToAction(label, categoryId);
        actions.push(action);
        labelToAction[label.id] = action.id;
    }

    // 3. Create a default "General" action per category for cards without action-mapped labels
    const defaultActions = {};
    for (const cat of categories) {
        const defaultAction = {
            id: genId('act'),
            name: `${cat.name} — General`,
            categoryId: cat.id,
            budget: 0,
            priority: 'medium',
            tags: [],
            isDefault: true // Flag: auto-generated, tasks show directly under category
        };
        actions.push(defaultAction);
        defaultActions[cat.id] = defaultAction.id;
    }

    // 4. Map cards → tasks
    const tasks = cards.map(card => {
        const categoryId = listToCat[card.idList] || categories[0]?.id;

        // Find the first action-mapped label on this card
        let actionId = null;
        if (card.idLabels) {
            for (const labelId of card.idLabels) {
                if (labelToAction[labelId]) {
                    actionId = labelToAction[labelId];
                    break;
                }
            }
        }
        // Fall back to default action for this category
        if (!actionId) {
            actionId = defaultActions[categoryId];
        }

        return mapTrelloCardToTask(card, actionId, categoryId, mappingConfig);
    });

    // Map members
    const members = (trelloMembers || []).map(m => ({
        id: m.id,
        fullName: m.fullName,
        username: m.username,
        avatarUrl: m.avatarUrl ? `${m.avatarUrl}/50.png` : null
    }));

    return {
        categories,
        actions,
        tasks,
        members,
        trelloSync: {
            trelloBoardId: board.id,
            trelloBoardName: board.name,
            trelloBoardUrl: board.url,
            lastSyncAt: new Date().toISOString(),
            syncEnabled: true,
            pollIntervalMs: 120000,
            labelMappings: mappingConfig.labelMappings // Persist for future syncs
        }
    };
};

// --- Dashboard Task → Trello Card update ---
export const mapTaskToTrelloCardUpdate = (task, listId) => {
    const updates = { name: task.title };
    if (task.description != null) updates.desc = task.description;
    if (task.dueDate) updates.due = task.dueDate;
    updates.dueComplete = (task.status === 'completed').toString();
    if (listId) updates.idList = listId;
    if (task.assignees?.length > 0) updates.idMembers = task.assignees.join(',');
    else updates.idMembers = '';
    return updates;
};

// --- Merge Trello card changes into existing task (merge-by-ID, preserves local-only items) ---
export const mergeCardIntoTask = (existingTask, card, mappingConfig) => {
    // --- Checklists: merge by trelloChecklistId ---
    const existingCLMap = new Map();
    for (const cl of (existingTask.checklists || [])) {
        if (cl.trelloChecklistId) existingCLMap.set(cl.trelloChecklistId, cl);
    }
    const localOnlyChecklists = (existingTask.checklists || []).filter(cl => !cl.trelloChecklistId);
    const mergedChecklists = [];
    if (card.checklists) {
        for (const cl of card.checklists) {
            const existing = existingCLMap.get(cl.id);
            // Merge items by name within each checklist
            const existingItemMap = new Map();
            if (existing) {
                for (const item of (existing.items || [])) {
                    existingItemMap.set(item.text, item);
                }
            }
            const mergedItems = (cl.checkItems || []).map(item => {
                const existingItem = existingItemMap.get(item.name);
                return {
                    id: existingItem?.id || genId('cli'),
                    text: item.name,
                    done: item.state === 'complete'
                };
            });
            mergedChecklists.push({
                id: existing?.id || genId('cl'),
                name: cl.name || 'Checklist',
                trelloChecklistId: cl.id,
                items: mergedItems
            });
        }
    }
    // Append local-only checklists
    mergedChecklists.push(...localOnlyChecklists);

    // --- Attachments: merge by trelloAttachmentId + URL ---
    const existingAttMap = new Map();
    const existingAttUrls = new Set();
    for (const att of (existingTask.attachments || [])) {
        if (att.trelloAttachmentId) existingAttMap.set(att.trelloAttachmentId, att);
        if (att.url) existingAttUrls.set(att.url);
    }
    const localOnlyAtts = (existingTask.attachments || []).filter(att => !att.trelloAttachmentId);
    const mergedAttachments = [];
    if (card.attachments) {
        for (const att of card.attachments) {
            const existing = existingAttMap.get(att.id);
            mergedAttachments.push({
                id: existing?.id || genId('att'),
                name: att.name,
                url: att.url,
                mimeType: att.mimeType || '',
                date: att.date,
                trelloAttachmentId: att.id
            });
        }
    }
    // Append local-only attachments (not already present by URL)
    const trelloAttUrls = new Set(mergedAttachments.map(a => a.url));
    for (const att of localOnlyAtts) {
        if (!att.url || !trelloAttUrls.has(att.url)) {
            mergedAttachments.push(att);
        }
    }

    // --- Comments: merge by trelloCommentId ---
    const existingCmMap = new Map();
    for (const cm of (existingTask.comments || [])) {
        if (cm.trelloCommentId) existingCmMap.set(cm.trelloCommentId, cm);
    }
    const localOnlyComments = (existingTask.comments || []).filter(cm => !cm.trelloCommentId);
    const mergedComments = [];
    if (card.comments) {
        for (const comment of card.comments) {
            const existing = existingCmMap.get(comment.id);
            mergedComments.push({
                id: existing?.id || genId('cm'),
                author: comment.memberCreator?.fullName || comment.memberCreator?.username || 'Unknown',
                text: comment.data?.text || '',
                date: comment.date,
                trelloCommentId: comment.id
            });
        }
    }
    // Append local-only comments
    mergedComments.push(...localOnlyComments);

    // Merge assignees
    const assignees = card.idMembers || existingTask.assignees || [];

    // Merge otherLabels
    const otherLabels = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'other') {
                otherLabels.push({ id: labelId, name: mapping.labelName || '', color: mapping.labelColor || '' });
            }
        }
    }

    // Merge countries from labels
    const countries = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'country' && mapping.countryId) {
                countries.push(mapping.countryId);
            }
        }
    }

    return {
        ...existingTask,
        title: card.name,
        description: card.desc || existingTask.description,
        dueDate: card.due ? card.due.split('T')[0] : existingTask.dueDate,
        status: card.dueComplete ? 'completed' : existingTask.status,
        checklists: mergedChecklists,
        attachments: mergedAttachments,
        comments: mergedComments,
        assignees,
        countries: countries.length ? countries : existingTask.countries,
        otherLabels: otherLabels.length ? otherLabels : (existingTask.otherLabels || []),
        trelloLastModified: card.dateLastActivity
    };
};
