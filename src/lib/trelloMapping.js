// Trello ↔ Dashboard mapping and conversion functions

import { CONFIG, TRELLO_COLORS } from '../config.js';

// Statuses that have no Trello equivalent — never overwrite from dueComplete/item.state
const TRELLO_PROTECTED_STATUSES = new Set(['creating', 'review', 'paused']);

// --- ID generation (crypto.randomUUID for collision-free IDs) ---
const genId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

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
    const name = label.name.toLowerCase().trim();
    const channel = CONFIG.CHANNELS.find(c => {
        const cName = c.name.toLowerCase();
        // Short channel names (<=3 chars like "IA", "AI"): exact match only
        if (cName.length <= 3) return name === cName;
        // Longer names: substring match
        return name.includes(cName) || cName.includes(name);
    });
    return channel ? channel.id : null;
};

// --- Trello Label → Country match ---
// Matches label names to countries using abbreviations, ISO codes, and French translations
const COUNTRY_ALIASES = {
    'fr': 'france', 'france': 'france',
    'uk': 'uk', 'united kingdom': 'uk', 'gb': 'uk', 'royaume-uni': 'uk', 'royaume uni': 'uk',
    'us': 'usa', 'usa': 'usa', 'united states': 'usa', 'états-unis': 'usa', 'etats-unis': 'usa', 'etats unis': 'usa',
    'de': 'germany', 'germany': 'germany', 'allemagne': 'germany',
    'es': 'spain', 'spain': 'spain', 'espagne': 'spain',
    'it': 'italy', 'italy': 'italy', 'italie': 'italy',
    'nl': 'netherlands', 'netherlands': 'netherlands', 'pays-bas': 'netherlands', 'pays bas': 'netherlands',
    'pt': 'portugal', 'portugal': 'portugal',
    'ro': 'romania', 'romania': 'romania', 'roumanie': 'romania',
    'ch': 'switzerland', 'switzerland': 'switzerland', 'suisse': 'switzerland',
    'ca': 'canada', 'canada': 'canada',
    'mx': 'mexico', 'mexico': 'mexico', 'mexique': 'mexico',
    'in': 'india', 'india': 'india', 'inde': 'india',
    'au': 'australia', 'australia': 'australia', 'australie': 'australia',
    'sea': 'southeast-asia', 'south east asia': 'southeast-asia', 'southeast asia': 'southeast-asia', 'asie du sud-est': 'southeast-asia',
    'global': 'global', 'world': 'global', 'monde': 'global', 'gl': 'global'
};

export const matchLabelToCountry = (label) => {
    if (!label.name) return null;
    const name = label.name.toLowerCase().trim();
    // Direct match
    if (COUNTRY_ALIASES[name]) return COUNTRY_ALIASES[name];
    // Try substring matching against country names
    const country = CONFIG.COUNTRIES.find(c =>
        name.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(name)
    );
    return country ? country.id : null;
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
        const sortedChecklists = [...card.checklists].sort((a, b) => (a.pos || 0) - (b.pos || 0));
        for (const cl of sortedChecklists) {
            const sortedItems = [...(cl.checkItems || [])].sort((a, b) => (a.pos || 0) - (b.pos || 0));
            checklists.push({
                id: genId('cl'),
                name: cl.name || 'Checklist',
                trelloChecklistId: cl.id,
                items: sortedItems.map(item => ({
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
                const labelHex = mapping.labelColor?.startsWith('#') ? mapping.labelColor : (trelloColorToHex(mapping.labelColor) || '#64748b');
                otherLabels.push({ id: labelId, name: mapping.labelName || '', color: labelHex });
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
            syncMode: 'card-as-task',
            labelMappings: mappingConfig.labelMappings // Persist for future syncs
        }
    };
};

// ============================================================
// "Card as Action" mode — Cards → Actions, Checklist Items → Tasks
// ============================================================

// --- Trello Card → Dashboard Action (card-as-action mode) ---
export const mapTrelloCardToAction = (card, categoryId, mappingConfig) => {
    // Extract channels, countries, otherLabels from card labels
    const channels = [];
    const countries = [];
    const otherLabels = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'channel') channels.push(mapping.channelId);
            else if (mapping?.type === 'country' && mapping.countryId) countries.push(mapping.countryId);
            else if (mapping?.type === 'other') {
                const labelHex = mapping.labelColor?.startsWith('#') ? mapping.labelColor : (trelloColorToHex(mapping.labelColor) || '#64748b');
                otherLabels.push({ id: labelId, name: mapping.labelName || '', color: labelHex });
            }
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

    return {
        id: genId('act'),
        name: card.name,
        categoryId,
        budget: 0,
        priority: 'medium',
        tags: channels,
        countries,
        otherLabels,
        assignees: card.idMembers || [],
        startDate: card.start ? card.start.split('T')[0] : null,
        dueDate: card.due ? card.due.split('T')[0] : null,
        description: card.desc || '',
        comments,
        attachments,
        trelloCardId: card.id,
        trelloLastModified: card.dateLastActivity,
        // Store inherited label data so tasks can inherit them
        _inheritChannels: channels,
        _inheritCountries: countries,
        _inheritOtherLabels: otherLabels,
        _inheritAssignees: card.idMembers || []
    };
};

// --- Trello Checklist Item → Dashboard Task (card-as-action mode) ---
export const mapTrelloCheckItemToTask = (item, actionId, card, checklistId, checklistName, mappingConfig) => {
    const now = new Date();
    // Due date: item's own due, or inherit from card
    const itemDue = item.due ? item.due.split('T')[0] : null;
    const cardDue = card.due ? card.due.split('T')[0] : null;
    const dueDate = itemDue || cardDue || null;
    // Start date: card start, or 1st of due month, or 1st of current month
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

    // Inherit channels, countries, otherLabels from card labels
    const channels = [];
    const countries = [];
    const otherLabels = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'channel') channels.push(mapping.channelId);
            else if (mapping?.type === 'country' && mapping.countryId) countries.push(mapping.countryId);
            else if (mapping?.type === 'other') {
                const labelHex = mapping.labelColor?.startsWith('#') ? mapping.labelColor : (trelloColorToHex(mapping.labelColor) || '#64748b');
                otherLabels.push({ id: labelId, name: mapping.labelName || '', color: labelHex });
            }
        }
    }

    // Assignee: item member, or inherit from card
    const assignees = item.idMember ? [item.idMember] : (card.idMembers || []);

    return {
        id: genId('task'),
        actionId,
        title: item.name,
        description: '',
        startDate,
        dueDate: dueDate || startDate,
        month,
        status: item.state === 'complete' ? 'completed' : 'todo',
        priority: 'medium',
        budget: 0,
        checklists: [],
        comments: [],
        attachments: [],
        channels,
        countries,
        assignees,
        otherLabels,
        order: item.pos || 0,
        createdAt: new Date().toISOString(),
        trelloCardId: card.id,          // Parent card (for API calls)
        trelloCheckItemId: item.id,     // The checklist item this task came from
        trelloChecklistId: checklistId, // Which checklist on the card
        trelloChecklistName: checklistName,
        trelloLastModified: card.dateLastActivity
    };
};

// --- Build import data in "card-as-action" mode ---
export const buildImportDataCardAsAction = (trelloData, mappingConfig) => {
    const { board, lists, labels, cards, members: trelloMembers } = trelloData;

    // 1. Map lists → categories (same as card-as-task mode)
    const categories = lists
        .sort((a, b) => a.pos - b.pos)
        .map((list, i) => mapTrelloListToCategory(list, i));
    const listToCat = {};
    lists.forEach((list, i) => { listToCat[list.id] = categories[i].id; });

    // 2. Map cards → actions
    const actions = [];
    const tasks = [];
    const sortedCards = [...cards].sort((a, b) => (a.pos || 0) - (b.pos || 0));
    for (const card of sortedCards) {
        if (card.closed) continue; // Skip archived cards on import
        const categoryId = listToCat[card.idList];
        if (!categoryId) continue; // Skip cards from unmapped/archived lists
        const action = mapTrelloCardToAction(card, categoryId, mappingConfig);
        actions.push(action);

        // 3. Map checklist items → tasks
        if (card.checklists) {
            const sortedChecklists = [...card.checklists].sort((a, b) => (a.pos || 0) - (b.pos || 0));
            for (const cl of sortedChecklists) {
                const sortedItems = [...(cl.checkItems || [])].sort((a, b) => (a.pos || 0) - (b.pos || 0));
                for (const item of sortedItems) {
                    tasks.push(mapTrelloCheckItemToTask(item, action.id, card, cl.id, cl.name, mappingConfig));
                }
            }
        }
    }

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
            syncMode: 'card-as-action',
            labelMappings: mappingConfig.labelMappings
        }
    };
};

// --- Merge Trello card changes into existing Action (card-as-action pull) ---
export const mergeCardIntoAction = (existingAction, card, listToCat, mappingConfig) => {
    // Extract channels, countries, otherLabels from card labels
    const channels = [];
    const countries = [];
    const otherLabels = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'channel') channels.push(mapping.channelId);
            else if (mapping?.type === 'country' && mapping.countryId) countries.push(mapping.countryId);
            else if (mapping?.type === 'other') {
                const labelHex = mapping.labelColor?.startsWith('#') ? mapping.labelColor : (trelloColorToHex(mapping.labelColor) || '#64748b');
                otherLabels.push({ id: labelId, name: mapping.labelName || '', color: labelHex });
            }
        }
    }

    // Merge comments by trelloCommentId
    const existingCmMap = new Map();
    for (const cm of (existingAction.comments || [])) {
        if (cm.trelloCommentId) existingCmMap.set(cm.trelloCommentId, cm);
    }
    const localOnlyComments = (existingAction.comments || []).filter(cm => !cm.trelloCommentId);
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
    mergedComments.push(...localOnlyComments);

    // Merge attachments by trelloAttachmentId
    const existingAttMap = new Map();
    for (const att of (existingAction.attachments || [])) {
        if (att.trelloAttachmentId) existingAttMap.set(att.trelloAttachmentId, att);
    }
    const localOnlyAtts = (existingAction.attachments || []).filter(att => !att.trelloAttachmentId);
    const mergedAttachments = [];
    if (card.attachments) {
        for (const att of card.attachments) {
            const existing = existingAttMap.get(att.id);
            mergedAttachments.push({
                id: existing?.id || genId('att'),
                name: att.name, url: att.url, mimeType: att.mimeType || '',
                date: att.date, trelloAttachmentId: att.id
            });
        }
    }
    const trelloAttUrls = new Set(mergedAttachments.map(a => a.url));
    for (const att of localOnlyAtts) {
        if (!att.url || !trelloAttUrls.has(att.url)) mergedAttachments.push(att);
    }

    return {
        ...existingAction,
        name: card.name,
        description: card.desc || existingAction.description || '',
        categoryId: listToCat?.[card.idList] || existingAction.categoryId,
        status: TRELLO_PROTECTED_STATUSES.has(existingAction.status) ? existingAction.status : (card.dueComplete ? 'completed' : (existingAction.status || 'inprogress')),
        assignees: card.idMembers || existingAction.assignees || [],
        startDate: card.start ? card.start.split('T')[0] : existingAction.startDate,
        dueDate: card.due ? card.due.split('T')[0] : existingAction.dueDate,
        tags: channels.length ? channels : (existingAction.tags || []),
        countries: countries.length ? countries : (existingAction.countries || []),
        otherLabels: otherLabels.length ? otherLabels : (existingAction.otherLabels || []),
        comments: mergedComments,
        attachments: mergedAttachments,
        _inheritChannels: channels.length ? channels : (existingAction._inheritChannels || []),
        _inheritCountries: countries.length ? countries : (existingAction._inheritCountries || []),
        _inheritOtherLabels: otherLabels.length ? otherLabels : (existingAction._inheritOtherLabels || []),
        _inheritAssignees: card.idMembers || existingAction._inheritAssignees || [],
        trelloLastModified: card.dateLastActivity
    };
};

// --- Merge Trello checklist item into existing Task (card-as-action pull) ---
export const mergeCheckItemIntoTask = (existingTask, item, card) => {
    const itemDue = item.due ? item.due.split('T')[0] : null;
    const cardDue = card.due ? card.due.split('T')[0] : null;
    const dueDate = itemDue || cardDue || existingTask.dueDate;
    const month = dueDate ? new Date(dueDate).getMonth() : existingTask.month;
    let startDate = existingTask.startDate;
    if (dueDate && !existingTask.startDate) {
        const d = new Date(dueDate);
        startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return {
        ...existingTask,
        title: item.name,
        status: TRELLO_PROTECTED_STATUSES.has(existingTask.status) ? existingTask.status : (item.state === 'complete' ? 'completed' : (existingTask.status === 'completed' ? 'todo' : existingTask.status)),
        dueDate: dueDate || existingTask.dueDate,
        startDate,
        month,
        order: item.pos != null ? item.pos : existingTask.order,
        assignees: item.idMember ? [item.idMember] : existingTask.assignees,
        trelloLastModified: card.dateLastActivity
    };
};

// --- Push Task back to Trello checklist item (card-as-action mode) ---
export const mapTaskToCheckItemUpdate = (task) => {
    const updates = { name: task.title };
    updates.state = task.status === 'completed' ? 'complete' : 'incomplete';
    if (task.dueDate) updates.due = task.dueDate;
    if (task.assignees?.length > 0) updates.idMember = task.assignees[0];
    return updates;
};

// --- Push Action back to Trello card (card-as-action mode) ---
export const mapActionToTrelloCardUpdate = (action, listId) => {
    const updates = { name: action.name };
    if (action.description != null) updates.desc = action.description;
    if (listId) updates.idList = listId;
    if (action.startDate) updates.start = action.startDate;
    if (action.dueDate) updates.due = action.dueDate;
    updates.dueComplete = (action.status === 'completed').toString();
    if (action.assignees?.length > 0) updates.idMembers = action.assignees.join(',');
    else updates.idMembers = '';
    return updates;
};

// --- Dashboard Task → Trello Card update ---
export const mapTaskToTrelloCardUpdate = (task, listId) => {
    const updates = { name: task.title };
    if (task.description != null) updates.desc = task.description;
    if (task.startDate) updates.start = task.startDate;
    if (task.dueDate) updates.due = task.dueDate;
    updates.dueComplete = (task.status === 'completed').toString();
    if (listId) updates.idList = listId;
    if (task.assignees?.length > 0) updates.idMembers = task.assignees.join(',');
    else updates.idMembers = '';
    return updates;
};

// --- After push: merge new Trello extras (checklists, attachments, labels) into local task ---
// This ensures items added on Trello side are preserved even when "push wins".
// mappingConfig is optional — if provided, also re-pulls channels/countries/otherLabels from card labels.
export const mergeTrelloExtrasIntoTask = (task, card, mappingConfig) => {
    if (!card) return task;
    const updated = { ...task };

    // Merge checklist items from Trello into local checklists
    if (card.checklists && updated.checklists) {
        // Remove local checklists whose trelloChecklistId no longer exists on Trello (deleted on Trello)
        const trelloClIds = new Set(card.checklists.map(tc => tc.id));
        const updatedChecklists = updated.checklists
            .filter(cl => !cl.trelloChecklistId || trelloClIds.has(cl.trelloChecklistId))
            .map(cl => {
            if (!cl.trelloChecklistId) return cl;
            const trelloCl = card.checklists.find(tc => tc.id === cl.trelloChecklistId);
            if (!trelloCl || !trelloCl.checkItems) return cl;
            // Find items on Trello that don't exist locally (by trelloCheckItemId first, then by name)
            const localItemIds = new Set((cl.items || []).filter(i => i.trelloCheckItemId).map(i => i.trelloCheckItemId));
            const localItemNames = new Set((cl.items || []).map(i => i.text));
            const sortedTrelloItems = [...trelloCl.checkItems].sort((a, b) => (a.pos || 0) - (b.pos || 0));
            const newItems = sortedTrelloItems
                .filter(ti => !localItemIds.has(ti.id) && !localItemNames.has(ti.name))
                .map(ti => ({
                    id: genId('cli'),
                    text: ti.name,
                    done: ti.state === 'complete',
                    trelloCheckItemId: ti.id,
                    due: ti.due ? ti.due.split('T')[0] : null,
                    assignee: ti.idMember || null
                }));
            // Also update state/metadata of existing items from Trello
            // Remove local items whose trelloCheckItemId no longer exists on Trello (deleted on Trello)
            const trelloItemIds = new Set(trelloCl.checkItems.map(ti => ti.id));
            const mergedItems = (cl.items || [])
                .filter(item => !item.trelloCheckItemId || trelloItemIds.has(item.trelloCheckItemId))
                .map(item => {
                const trelloItem = item.trelloCheckItemId
                    ? trelloCl.checkItems.find(ti => ti.id === item.trelloCheckItemId)
                    : trelloCl.checkItems.find(ti => ti.name === item.text);
                if (trelloItem) {
                    return { ...item, done: trelloItem.state === 'complete', trelloCheckItemId: trelloItem.id, due: trelloItem.due ? trelloItem.due.split('T')[0] : item.due, assignee: trelloItem.idMember || item.assignee };
                }
                return item;
            });
            if (newItems.length === 0 && mergedItems.every((item, i) => item.done === (cl.items || [])[i]?.done)) return cl;
            return { ...cl, items: [...mergedItems, ...newItems] };
        });
        // Also add entirely new Trello checklists not present locally
        const localTrelloClIds = new Set(updated.checklists.map(cl => cl.trelloChecklistId).filter(Boolean));
        const newChecklists = (card.checklists || [])
            .filter(tc => !localTrelloClIds.has(tc.id))
            .map(tc => ({
                id: genId('cl'),
                name: tc.name || 'Checklist',
                trelloChecklistId: tc.id,
                items: (tc.checkItems || []).map(ti => ({
                    id: genId('cli'),
                    text: ti.name,
                    done: ti.state === 'complete',
                    trelloCheckItemId: ti.id,
                    due: ti.due ? ti.due.split('T')[0] : null,
                    assignee: ti.idMember || null
                }))
            }));
        updated.checklists = [...updatedChecklists, ...newChecklists];
    } else if (card.checklists && !updated.checklists?.length) {
        // No local checklists but Trello has some — pull them all
        updated.checklists = card.checklists.map(tc => ({
            id: genId('cl'),
            name: tc.name || 'Checklist',
            trelloChecklistId: tc.id,
            items: (tc.checkItems || []).map(ti => ({
                id: genId('cli'),
                text: ti.name,
                done: ti.state === 'complete',
                trelloCheckItemId: ti.id,
                due: ti.due ? ti.due.split('T')[0] : null,
                assignee: ti.idMember || null
            }))
        }));
    }

    // Merge comments from Trello into local (same pattern as checklists: by trelloCommentId)
    if (card.comments) {
        const localCommentIds = new Set((updated.comments || []).filter(c => c.trelloCommentId).map(c => c.trelloCommentId));
        const localCommentTexts = new Set((updated.comments || []).map(c => c.text?.trim()));
        const newComments = card.comments
            .filter(c => !localCommentIds.has(c.id) && !localCommentTexts.has((c.data?.text || '').trim()))
            .map(c => ({
                id: genId('cm'),
                author: c.memberCreator?.fullName || c.memberCreator?.username || 'Unknown',
                text: c.data?.text || '',
                date: c.date,
                trelloCommentId: c.id
            }));
        if (newComments.length > 0) {
            updated.comments = [...(updated.comments || []), ...newComments];
        }
        // Also capture trelloCommentId for existing local comments that match by text
        for (const localCm of (updated.comments || [])) {
            if (!localCm.trelloCommentId) {
                const match = card.comments.find(tc => (tc.data?.text || '').trim() === localCm.text?.trim());
                if (match) localCm.trelloCommentId = match.id;
            }
        }
    }

    // Merge attachments from Trello into local (by trelloAttachmentId, preserve local-only)
    if (card.attachments) {
        const localAttIds = new Set((updated.attachments || []).filter(a => a.trelloAttachmentId).map(a => a.trelloAttachmentId));
        const localAttUrls = new Set((updated.attachments || []).map(a => a.url).filter(Boolean));
        const newAtts = card.attachments
            .filter(a => !localAttIds.has(a.id) && !localAttUrls.has(a.url))
            .map(a => ({
                id: genId('att'),
                name: a.name,
                url: a.url,
                mimeType: a.mimeType || '',
                date: a.date,
                trelloAttachmentId: a.id
            }));
        if (newAtts.length > 0) {
            updated.attachments = [...(updated.attachments || []), ...newAtts];
        }
        // Capture trelloAttachmentId for local attachments that match by URL
        for (const localAtt of (updated.attachments || [])) {
            if (!localAtt.trelloAttachmentId && localAtt.url) {
                const match = card.attachments.find(ta => ta.url === localAtt.url);
                if (match) localAtt.trelloAttachmentId = match.id;
            }
        }
    }

    // Re-pull label-based fields (channels, countries, otherLabels) from Trello card
    // Union merge: keep local tags + add any Trello-only tags
    if (card.idLabels && mappingConfig?.labelMappings) {
        const trelloChannels = [], trelloCountries = [], trelloOtherLabels = [];
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (!mapping) continue;
            if (mapping.type === 'channel' && mapping.channelId) trelloChannels.push(mapping.channelId);
            else if (mapping.type === 'country' && mapping.countryId) trelloCountries.push(mapping.countryId);
            else if (mapping.type === 'other') {
                const hex = mapping.labelColor?.startsWith('#') ? mapping.labelColor : (trelloColorToHex(mapping.labelColor) || '#64748b');
                trelloOtherLabels.push({ id: labelId, name: mapping.labelName || '', color: hex });
            }
        }
        if (trelloChannels.length) {
            const merged = new Set(updated.channels || []);
            trelloChannels.forEach(c => merged.add(c));
            updated.channels = [...merged];
        }
        if (trelloCountries.length) {
            const merged = new Set(updated.countries || []);
            trelloCountries.forEach(c => merged.add(c));
            updated.countries = [...merged];
        }
        if (trelloOtherLabels.length) {
            const existingIds = new Set((updated.otherLabels || []).map(l => l.id));
            const newLabels = trelloOtherLabels.filter(l => !existingIds.has(l.id));
            if (newLabels.length) updated.otherLabels = [...(updated.otherLabels || []), ...newLabels];
        }
    }

    return updated;
};

// --- Merge Trello card changes into existing task (merge-by-ID, preserves local-only items) ---
export const mergeCardIntoTask = (existingTask, card, mappingConfig, listToCatId, boardActions) => {
    // --- Checklists: merge by trelloChecklistId ---
    const existingCLMap = new Map();
    for (const cl of (existingTask.checklists || [])) {
        if (cl.trelloChecklistId) existingCLMap.set(cl.trelloChecklistId, cl);
    }
    const localOnlyChecklists = (existingTask.checklists || []).filter(cl => !cl.trelloChecklistId);
    const mergedChecklists = [];
    if (card.checklists) {
        const sortedCLs = [...card.checklists].sort((a, b) => (a.pos || 0) - (b.pos || 0));
        for (const cl of sortedCLs) {
            const existing = existingCLMap.get(cl.id);
            // Merge items by trelloCheckItemId first, then by name
            const existingItemByTrelloId = new Map();
            const existingItemByName = new Map();
            if (existing) {
                for (const item of (existing.items || [])) {
                    if (item.trelloCheckItemId) existingItemByTrelloId.set(item.trelloCheckItemId, item);
                    existingItemByName.set(item.text, item);
                }
            }
            const sortedCheckItems = [...(cl.checkItems || [])].sort((a, b) => (a.pos || 0) - (b.pos || 0));
            const mergedItems = sortedCheckItems.map(item => {
                const existingItem = existingItemByTrelloId.get(item.id) || existingItemByName.get(item.name);
                return {
                    id: existingItem?.id || genId('cli'),
                    text: item.name,
                    done: item.state === 'complete',
                    trelloCheckItemId: item.id,
                    due: item.due ? item.due.split('T')[0] : (existingItem?.due || null),
                    assignee: item.idMember || (existingItem?.assignee || null)
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
        if (att.url) existingAttUrls.add(att.url);
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
                const labelHex = mapping.labelColor?.startsWith('#') ? mapping.labelColor : (trelloColorToHex(mapping.labelColor) || '#64748b');
                otherLabels.push({ id: labelId, name: mapping.labelName || '', color: labelHex });
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

    // Merge channels from labels
    const channels = [];
    if (card.idLabels && mappingConfig?.labelMappings) {
        for (const labelId of card.idLabels) {
            const mapping = mappingConfig.labelMappings[labelId];
            if (mapping?.type === 'channel' && mapping.channelId) {
                channels.push(mapping.channelId);
            }
        }
    }

    // Detect card moved between lists → update actionId to default action of new category
    let actionId = existingTask.actionId;
    if (listToCatId && boardActions && card.idList) {
        const newCatId = listToCatId[card.idList];
        if (newCatId) {
            const currentAction = boardActions.find(a => a.id === existingTask.actionId);
            if (currentAction && currentAction.categoryId !== newCatId) {
                // Card moved to a different list — find default action in new category
                const newAction = boardActions.find(a => a.categoryId === newCatId && a.isDefault) ||
                                  boardActions.find(a => a.categoryId === newCatId);
                if (newAction) actionId = newAction.id;
            }
        }
    }

    // Build sets of mapped channel/country IDs to preserve local-only values
    const mappedChannelIds = new Set();
    const mappedCountryIds = new Set();
    if (mappingConfig?.labelMappings) {
        for (const mapping of Object.values(mappingConfig.labelMappings)) {
            if (mapping.type === 'channel' && mapping.channelId) mappedChannelIds.add(mapping.channelId);
            if (mapping.type === 'country' && mapping.countryId) mappedCountryIds.add(mapping.countryId);
        }
    }

    const newDueDate = card.due ? card.due.split('T')[0] : existingTask.dueDate;

    return {
        ...existingTask,
        actionId,
        title: card.name,
        description: card.desc || existingTask.description,
        startDate: card.start ? card.start.split('T')[0] : existingTask.startDate,
        dueDate: newDueDate,
        month: newDueDate ? new Date(newDueDate).getMonth() : existingTask.month,
        status: TRELLO_PROTECTED_STATUSES.has(existingTask.status) ? existingTask.status : (card.dueComplete ? 'completed' : existingTask.status),
        checklists: mergedChecklists,
        attachments: mergedAttachments,
        comments: mergedComments,
        assignees,
        channels: channels.length
            ? [...new Set([...channels, ...(existingTask.channels || []).filter(c => !mappedChannelIds.has(c))])]
            : existingTask.channels,
        countries: countries.length
            ? [...new Set([...countries, ...(existingTask.countries || []).filter(c => !mappedCountryIds.has(c))])]
            : existingTask.countries,
        otherLabels: otherLabels.length ? otherLabels : (existingTask.otherLabels || []),
        updatedAt: card.dateLastActivity,
        trelloLastModified: card.dateLastActivity
    };
};
