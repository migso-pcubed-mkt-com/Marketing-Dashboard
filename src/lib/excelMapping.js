import * as XLSX from 'xlsx';
import { CONFIG } from '../config.js';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const CATEGORY_COLORS = ['#6366f1','#f59e0b','#22c55e','#3b82f6','#ef4444','#8b5cf6','#ec4899','#14b8a6','#d97706','#f97316'];
const GRADIENTS = [
    'from-indigo-500 to-purple-600','from-amber-400 to-orange-500','from-green-400 to-emerald-600',
    'from-blue-400 to-blue-600','from-red-400 to-red-600','from-violet-400 to-violet-600',
    'from-pink-400 to-pink-600','from-teal-400 to-teal-600','from-amber-500 to-amber-700','from-orange-400 to-orange-600'
];

/**
 * Parse a workbook from a File/ArrayBuffer.
 * Returns { sheets: [{ name, data, merges }] }
 */
export function parseWorkbook(buffer) {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    return {
        sheetNames: wb.SheetNames,
        sheets: wb.SheetNames.map(name => {
            const ws = wb.Sheets[name];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            const merges = ws['!merges'] || [];
            return { name, data, merges };
        })
    };
}

// ─────────────────────────────────────────────
// FORMAT DETECTION
// ─────────────────────────────────────────────

const MONTH_PATTERNS = [
    /^jan/i, /^feb/i, /^mar/i, /^apr/i, /^may/i, /^jun/i,
    /^jul/i, /^aug/i, /^sep/i, /^oct/i, /^nov/i, /^dec/i,
    // French
    /^janv/i, /^f[eé]v/i, /^mars/i, /^avr/i, /^mai/i, /^juin/i,
    /^juil/i, /^ao[uû]/i, /^sept/i, /^oct/i, /^nov/i, /^d[eé]c/i
];

const isMonthLike = (val) => {
    if (!val) return false;
    const s = String(val).trim();
    return MONTH_PATTERNS.some(p => p.test(s));
};

const isDateLike = (val) => {
    if (!val) return false;
    const s = String(val).trim();
    // Try to parse as a date
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s)) return true;
    const d = new Date(s);
    return !isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100;
};

/**
 * Detect if a sheet looks like a grid/roadmap (months as columns) or a flat list.
 * Returns 'grid' | 'list'
 */
export function detectFormat(sheetData) {
    if (!sheetData || sheetData.length < 2) return 'list';

    // Check the first 3 rows for month-like headers
    for (let r = 0; r < Math.min(3, sheetData.length); r++) {
        const row = sheetData[r];
        if (!row) continue;
        let monthCount = 0;
        for (let c = 1; c < row.length; c++) {
            if (isMonthLike(row[c])) monthCount++;
        }
        // If 3+ columns look like months, it's a grid
        if (monthCount >= 3) return 'grid';
    }

    return 'list';
}

// ─────────────────────────────────────────────
// GRID / ROADMAP PARSING
// ─────────────────────────────────────────────

/**
 * Parse month header row to get column-to-month mapping.
 * Returns { headerRow: number, monthColumns: [{col, month(0-11), year}] }
 */
function findMonthHeader(data) {
    const allMonths = CONFIG.MONTHS.map(m => m.toLowerCase());
    const allMonthsFull = CONFIG.MONTHS_FULL.map(m => m.toLowerCase());
    // Also French month names
    const frenchMonths = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

    for (let r = 0; r < Math.min(5, data.length); r++) {
        const row = data[r];
        if (!row) continue;
        const monthColumns = [];
        for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').trim().toLowerCase();
            if (!val) continue;

            // Try matching month names
            let monthIdx = allMonths.indexOf(val);
            if (monthIdx < 0) monthIdx = allMonthsFull.indexOf(val);
            if (monthIdx < 0) monthIdx = frenchMonths.indexOf(val);
            // Partial match (e.g., "Jan 2026")
            if (monthIdx < 0) {
                for (let m = 0; m < allMonths.length; m++) {
                    if (val.startsWith(allMonths[m]) || val.startsWith(allMonthsFull[m].toLowerCase()) || val.startsWith(frenchMonths[m])) {
                        monthIdx = m;
                        break;
                    }
                }
            }
            if (monthIdx >= 0) {
                // Try extracting year from the cell
                const yearMatch = String(row[c]).match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
                monthColumns.push({ col: c, month: monthIdx, year });
            }
        }
        if (monthColumns.length >= 3) {
            return { headerRow: r, monthColumns };
        }
    }
    return null;
}

/**
 * Expand merged cells: for each merge, copy the top-left value to all cells in the range.
 * Modifies data in-place.
 */
function expandMerges(data, merges) {
    for (const merge of merges) {
        const val = data[merge.s.r]?.[merge.s.c];
        if (!val) continue;
        for (let r = merge.s.r; r <= merge.e.r; r++) {
            for (let c = merge.s.c; c <= merge.e.c; c++) {
                if (r === merge.s.r && c === merge.s.c) continue;
                if (!data[r]) data[r] = [];
                data[r][c] = val;
            }
        }
    }
}

/**
 * Parse a grid/roadmap sheet.
 * Returns { categories: [...], actions: [...], tasks: [...] }
 */
export function parseGrid(sheetData, merges = []) {
    const data = sheetData.map(row => [...(row || [])]);
    expandMerges(data, merges);

    const monthHeader = findMonthHeader(data);
    if (!monthHeader) {
        // Fallback to list parsing if we can't find month headers
        return null;
    }

    const { headerRow, monthColumns } = monthHeader;
    const categories = [];
    const actions = [];
    const tasks = [];

    // Determine the "label" column (usually column 0 or the one before the first month)
    const labelCol = 0;

    // Track current category and action
    let currentCategory = null;
    let currentAction = null;
    let catColorIdx = 0;

    for (let r = headerRow + 1; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;

        const label = String(row[labelCol] || '').trim();

        // Check if this row has any task content in month columns
        const hasTaskContent = monthColumns.some(mc => {
            const val = String(row[mc.col] || '').trim();
            return val && val !== label; // Non-empty and not just repeating the label
        });

        // Check second column if exists (might be action name)
        const secondCol = labelCol + 1 < monthColumns[0].col ? String(row[labelCol + 1] || '').trim() : '';

        if (label && !hasTaskContent && !secondCol) {
            // Row with only a label and no task content = likely a category header
            const catId = `cat-${crypto.randomUUID()}`;
            currentCategory = {
                id: catId,
                name: label,
                color: CATEGORY_COLORS[catColorIdx % CATEGORY_COLORS.length],
                gradient: GRADIENTS[catColorIdx % GRADIENTS.length],
                order: categories.length,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            categories.push(currentCategory);
            catColorIdx++;

            // Create default action for this category
            const actionId = `a-${crypto.randomUUID()}`;
            currentAction = {
                id: actionId,
                name: label,
                categoryId: catId,
                isDefault: true,
                budget: 0,
                priority: 'medium',
                tags: [],
                status: 'inprogress',
                order: actions.length,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            actions.push(currentAction);
            continue;
        }

        if (!currentCategory) {
            // Create a default category if none exists yet
            const catId = `cat-${crypto.randomUUID()}`;
            currentCategory = {
                id: catId,
                name: 'Imported',
                color: CATEGORY_COLORS[0],
                gradient: GRADIENTS[0],
                order: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            categories.push(currentCategory);

            const actionId = `a-${crypto.randomUUID()}`;
            currentAction = {
                id: actionId,
                name: 'Imported',
                categoryId: catId,
                isDefault: true,
                budget: 0,
                priority: 'medium',
                tags: [],
                status: 'inprogress',
                order: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            actions.push(currentAction);
        }

        // This row has task content — extract tasks from month columns
        const taskName = label || secondCol || '';
        if (!taskName && !hasTaskContent) continue;

        // Find the date range (first and last month with content)
        let startMonth = null, endMonth = null, taskYear = new Date().getFullYear();
        for (const mc of monthColumns) {
            const val = String(row[mc.col] || '').trim();
            if (val) {
                if (startMonth === null) {
                    startMonth = mc.month;
                    taskYear = mc.year;
                }
                endMonth = mc.month;
            }
        }

        if (startMonth !== null) {
            const title = taskName || monthColumns.filter(mc => String(row[mc.col] || '').trim()).map(mc => String(row[mc.col]).trim()).find(v => v) || 'Task';
            const startDate = `${taskYear}-${String(startMonth + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(taskYear, endMonth + 1, 0).getDate();
            const dueDate = `${taskYear}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const now = new Date().toISOString();

            tasks.push({
                id: `t-${crypto.randomUUID()}`,
                actionId: currentAction.id,
                title,
                description: '',
                status: 'todo',
                priority: 'medium',
                budget: 0,
                month: startMonth,
                startDate,
                dueDate,
                channels: [],
                checklist: [],
                comments: [],
                attachments: [],
                order: tasks.length,
                createdAt: now,
                updatedAt: now
            });
        }
    }

    return categories.length > 0 ? { categories, actions, tasks } : null;
}

// ─────────────────────────────────────────────
// LIST / TABLE PARSING
// ─────────────────────────────────────────────

// Known column name patterns for auto-detection
const COLUMN_PATTERNS = {
    title:       /^(title|name|task|tâche|titre|nom)/i,
    description: /^(desc|description)/i,
    status:      /^(status|statut|état|state)/i,
    priority:    /^(priority|priorit[eé]|prio)/i,
    startDate:   /^(start|début|begin|from)/i,
    dueDate:     /^(end|due|fin|deadline|echeance|échéance|to$)/i,
    category:    /^(category|categorie|catégorie|group|groupe)/i,
    action:      /^(action|initiative|project|projet)/i,
    owner:       /^(owner|assignee|responsable|assigned|member|membre)/i,
    budget:      /^(budget|cost|coût|co[uû]t)/i,
    channel:     /^(channel|canal|type)/i
};

/**
 * Auto-detect column mappings from header row.
 * Returns { [fieldName]: columnIndex }
 */
export function detectColumnMappings(headerRow) {
    const mappings = {};
    if (!headerRow) return mappings;

    headerRow.forEach((cell, idx) => {
        const val = String(cell || '').trim();
        if (!val) return;
        for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
            if (pattern.test(val) && !mappings[field]) {
                mappings[field] = idx;
                break;
            }
        }
    });

    // If no title column found, use the first non-empty text column
    if (mappings.title === undefined) {
        for (let i = 0; i < headerRow.length; i++) {
            if (headerRow[i] && !Object.values(mappings).includes(i)) {
                mappings.title = i;
                break;
            }
        }
    }

    return mappings;
}

/**
 * Match a status string to a CONFIG.STATUSES id
 */
function matchStatus(val) {
    if (!val) return 'todo';
    const s = String(val).trim().toLowerCase();
    for (const status of CONFIG.STATUSES) {
        if (s === status.id || s === status.name.toLowerCase()) return status.id;
    }
    if (/done|complet|finish|terminé/i.test(s)) return 'completed';
    if (/progress|en cours|wip/i.test(s)) return 'inprogress';
    if (/review|revu/i.test(s)) return 'review';
    if (/creat|créa/i.test(s)) return 'creating';
    if (/pause|hold|suspen/i.test(s)) return 'paused';
    return 'todo';
}

/**
 * Match a priority string
 */
function matchPriority(val) {
    if (!val) return 'medium';
    const s = String(val).trim().toLowerCase();
    if (/high|haute|élevée|haut/i.test(s)) return 'high';
    if (/low|basse|faible|bas/i.test(s)) return 'low';
    return 'medium';
}

/**
 * Parse a date string into YYYY-MM-DD
 */
function parseDate(val) {
    if (!val) return null;
    const s = String(val).trim();
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    // Try Date parse
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990) {
        return d.toISOString().split('T')[0];
    }
    return null;
}

/**
 * Parse a list/table sheet with column mappings.
 * Returns { categories: [...], actions: [...], tasks: [...] }
 */
export function parseList(sheetData, mappings) {
    if (!sheetData || sheetData.length < 2) return null;

    const categories = [];
    const actions = [];
    const tasks = [];
    const categoryMap = new Map();  // name → category
    const actionMap = new Map();    // "catId|actionName" → action
    let catColorIdx = 0;
    const now = new Date().toISOString();

    const getOrCreateCategory = (name) => {
        const key = (name || 'General').trim();
        if (categoryMap.has(key)) return categoryMap.get(key);
        const cat = {
            id: `cat-${crypto.randomUUID()}`,
            name: key,
            color: CATEGORY_COLORS[catColorIdx % CATEGORY_COLORS.length],
            gradient: GRADIENTS[catColorIdx % GRADIENTS.length],
            order: categories.length,
            createdAt: now,
            updatedAt: now
        };
        categories.push(cat);
        categoryMap.set(key, cat);
        catColorIdx++;
        return cat;
    };

    const getOrCreateAction = (catId, name) => {
        const actionName = (name || 'Tasks').trim();
        const key = `${catId}|${actionName}`;
        if (actionMap.has(key)) return actionMap.get(key);
        const action = {
            id: `a-${crypto.randomUUID()}`,
            name: actionName,
            categoryId: catId,
            isDefault: !name,
            budget: 0,
            priority: 'medium',
            tags: [],
            status: 'inprogress',
            order: actions.length,
            createdAt: now,
            updatedAt: now
        };
        actions.push(action);
        actionMap.set(key, action);
        return action;
    };

    // Skip header row (index 0)
    for (let r = 1; r < sheetData.length; r++) {
        const row = sheetData[r];
        if (!row) continue;

        const title = mappings.title !== undefined ? String(row[mappings.title] || '').trim() : '';
        if (!title) continue;  // Skip empty rows

        const catName = mappings.category !== undefined ? String(row[mappings.category] || '').trim() : '';
        const actionName = mappings.action !== undefined ? String(row[mappings.action] || '').trim() : '';

        const cat = getOrCreateCategory(catName || 'General');
        const action = getOrCreateAction(cat.id, actionName || null);

        const startDate = mappings.startDate !== undefined ? parseDate(row[mappings.startDate]) : null;
        const dueDate = mappings.dueDate !== undefined ? parseDate(row[mappings.dueDate]) : null;
        const month = dueDate ? new Date(dueDate).getMonth() : (startDate ? new Date(startDate).getMonth() : new Date().getMonth());

        const budgetVal = mappings.budget !== undefined ? row[mappings.budget] : 0;
        const budget = typeof budgetVal === 'number' ? budgetVal : parseFloat(String(budgetVal).replace(/[^0-9.-]/g, '')) || 0;

        tasks.push({
            id: `t-${crypto.randomUUID()}`,
            actionId: action.id,
            title,
            description: mappings.description !== undefined ? String(row[mappings.description] || '') : '',
            status: matchStatus(mappings.status !== undefined ? row[mappings.status] : ''),
            priority: matchPriority(mappings.priority !== undefined ? row[mappings.priority] : ''),
            budget,
            month,
            startDate: startDate || new Date().toISOString().split('T')[0],
            dueDate: dueDate || null,
            channels: [],
            assignees: [],
            checklist: [],
            comments: [],
            attachments: [],
            order: tasks.length,
            createdAt: now,
            updatedAt: now
        });
    }

    return categories.length > 0 ? { categories, actions, tasks } : null;
}
