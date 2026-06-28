import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────

const CATEGORY_COLORS = ['#6366f1','#f59e0b','#22c55e','#3b82f6','#ef4444','#8b5cf6','#ec4899','#14b8a6','#d97706','#f97316'];
const GRADIENTS = [
    'from-indigo-500 to-purple-600','from-amber-400 to-orange-500','from-green-400 to-emerald-600',
    'from-blue-400 to-blue-600','from-red-400 to-red-600','from-violet-400 to-violet-600',
    'from-pink-400 to-pink-600','from-teal-400 to-teal-600','from-amber-500 to-amber-700','from-orange-400 to-orange-600'
];

const genId = (prefix) => {
    const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return prefix ? `${prefix}-${uuid}` : uuid;
};

const cellToString = (val) => {
    if (val == null) return '';
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return String(val).trim();
};

const isEmptyCell = (val) => {
    if (val == null) return true;
    if (typeof val === 'string') return val.trim() === '';
    return false;
};

// ─────────────────────────────────────────────
// Workbook parsing — same shape as before so the modal stays in sync.
// ─────────────────────────────────────────────

export async function parseWorkbook(buffer) {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const xlsxSheets = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        const merges = ws['!merges'] || [];
        return { name, data, merges };
    });

    let colorsByName = {};
    try {
        const ExcelJSMod = await import('exceljs');
        const ExcelJS = ExcelJSMod.default || ExcelJSMod;
        const exWb = new ExcelJS.Workbook();
        await exWb.xlsx.load(buffer);
        for (const ws of exWb.worksheets) {
            const grid = [];
            ws.eachRow({ includeEmpty: true }, (row, rIdx) => {
                const rowArr = [];
                row.eachCell({ includeEmpty: true }, (cell, cIdx) => {
                    const fill = cell.fill;
                    const argb = fill?.fgColor?.argb || fill?.bgColor?.argb || null;
                    rowArr[cIdx - 1] = argb || null;
                });
                grid[rIdx - 1] = rowArr;
            });
            colorsByName[ws.name] = grid;
        }
    } catch {
        colorsByName = {};
    }

    return {
        sheetNames: wb.SheetNames,
        sheets: xlsxSheets.map(s => ({ ...s, cellColors: colorsByName[s.name] || [] }))
    };
}

// ─────────────────────────────────────────────
// Month detection — anchors the whole grid layout.
// ─────────────────────────────────────────────

// Month names accepted as headers. Match must consume the WHOLE cell (after trim
// + lowercase) — without that, plain prose like "Marketing" would silently match
// "mar" and corrupt the column map.
const MONTH_PATTERNS = [
    [0, /^(jan|janv|january|janvier)\.?$/],
    [1, /^(feb|fev|fév|february|février)\.?$/],
    [2, /^(mar|mars|march)\.?$/],
    [3, /^(apr|avr|april|avril)\.?$/],
    [4, /^(may|mai)\.?$/],
    [5, /^(jun|juin|june)\.?$/],
    [6, /^(jul|juil|july|juillet)\.?$/],
    [7, /^(aug|aoû|aou|aout|août|august)\.?$/],
    [8, /^(sep|sept|september|septembre)\.?$/],
    [9, /^(oct|october|octobre)\.?$/],
    [10, /^(nov|november|novembre)\.?$/],
    [11, /^(dec|déc|december|décembre)\.?$/]
];

function monthOf(text) {
    const s = cellToString(text).trim().toLowerCase();
    if (!s || s.length > 12) return -1;
    for (const [idx, re] of MONTH_PATTERNS) if (re.test(s)) return idx;
    return -1;
}

// Scan the first 20 rows; return the row with the most distinct month matches
// alongside the column index of each detected month. Tie → earliest row wins.
export function detectMonthHeader(data) {
    let best = { rowIdx: -1, monthCols: {}, score: 0 };
    const limit = Math.min(20, data.length);
    for (let r = 0; r < limit; r++) {
        const row = data[r] || [];
        const monthCols = {};
        let score = 0;
        for (let c = 0; c < row.length; c++) {
            const m = monthOf(row[c]);
            if (m >= 0 && monthCols[m] === undefined) {
                monthCols[m] = c;
                score++;
            }
        }
        if (score > best.score) best = { rowIdx: r, monthCols, score };
    }
    // Even small templates with just 2 month columns are valid.
    return best.score >= 2 ? best : null;
}

// ─────────────────────────────────────────────
// Sheet analysis — classify each row as empty / category / action.
// ─────────────────────────────────────────────

function indexMergesByOrigin(merges) {
    const byCell = new Map();
    for (const m of merges || []) {
        byCell.set(`${m.s.r}:${m.s.c}`, { endRow: m.e.r, endCol: m.e.c });
    }
    return byCell;
}

function indexVerticalMergeFragments(merges) {
    const fragments = new Set();
    for (const m of merges || []) {
        if (m.e.r > m.s.r) {
            for (let r = m.s.r + 1; r <= m.e.r; r++) {
                for (let c = m.s.c; c <= m.e.c; c++) fragments.add(`${r}:${c}`);
            }
        }
    }
    return fragments;
}

// Non-origin cells on a horizontal merge's top row. The origin cell already emits a
// single signal spanning the whole merge (endCol/endMonth), so these covered cells must
// be skipped — otherwise a COLOURED horizontal merge produced one duplicate overlapping
// task per covered month (the colour fill bypassed the "no content" skip) (M14).
function indexHorizontalMergeFragments(merges, monthCols) {
    const fragments = new Set();
    for (const m of merges || []) {
        // Only skip covered cells when the merge ORIGIN is itself a month column — its single
        // spanning signal already represents them. A merge originating in a label/non-month
        // column and spanning into months must NOT skip its month cells, or the row loses all
        // month signals and gets misclassified as a category.
        if (!monthCols.has(m.s.c)) continue;
        for (let c = m.s.c + 1; c <= m.e.c; c++) fragments.add(`${m.s.r}:${c}`);
    }
    return fragments;
}

function getLabel(row, labelCol = 0) {
    for (let c = labelCol; c < row.length; c++) {
        if (!isEmptyCell(row[c])) return cellToString(row[c]);
    }
    return '';
}

const isNumeric = (val) => {
    if (val == null || val === '') return false;
    if (typeof val === 'number') return true;
    const cleaned = String(val).replace(/[, ]/g, '').replace(/[€$£]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return false;
    return !isNaN(Number(cleaned));
};

const toNumber = (val) => {
    if (typeof val === 'number') return val;
    return Number(String(val).replace(/[, ]/g, '').replace(/[€$£]/g, '')) || 0;
};

// A cell with a meaningful background fill (highlight) is treated as a task
// signal even when it carries no text. We reject the obvious "no-fill" ARGBs
// (transparent, white, pure black — the latter is almost always a font default
// rather than a real highlight) and accept everything else.
const isMeaningfulFill = (argb) => {
    if (!argb) return false;
    const up = String(argb).toUpperCase();
    if (up === '00000000') return false; // transparent
    if (up === 'FFFFFFFF' || up === 'FFFFFF') return false; // white
    if (up === 'FF000000' || up === '000000') return false; // pure black default
    return true;
};

// Analyze every row below the month header — returns per-row classification
// with enough context for both the auto-build and the manual review step.
export function analyzeSheet(sheet) {
    const data = sheet.data || [];
    const merges = sheet.merges || [];
    const cellColors = sheet.cellColors || [];
    const header = detectMonthHeader(data);
    if (!header) return { kind: 'list', headerRow: 0, rows: [] };

    const monthEntries = Object.entries(header.monthCols)
        .map(([m, c]) => ({ monthIdx: Number(m), col: c }))
        .sort((a, b) => a.monthIdx - b.monthIdx);
    const minMonthCol = Math.min(...monthEntries.map(e => e.col));

    const mergeOrigins = indexMergesByOrigin(merges);
    const verticalFragments = indexVerticalMergeFragments(merges);
    const horizontalFragments = indexHorizontalMergeFragments(merges, new Set(monthEntries.map(e => e.col)));

    const rows = [];
    for (let r = header.rowIdx + 1; r < data.length; r++) {
        const row = data[r] || [];
        const label = getLabel(row, 0);

        const monthSignals = [];
        for (const { monthIdx, col } of monthEntries) {
            if (verticalFragments.has(`${r}:${col}`) || horizontalFragments.has(`${r}:${col}`)) continue;
            const value = row[col];
            const merge = mergeOrigins.get(`${r}:${col}`);
            const hasContent = !isEmptyCell(value);
            // Cells with no text but a coloured fill are still task signals —
            // many roadmaps colour-block months instead of writing a label.
            const cellColor = cellColors?.[r]?.[col];
            const hasColor = isMeaningfulFill(cellColor);
            if (!hasContent && !merge && !hasColor) continue;

            let endCol = col;
            if (merge && merge.endCol > col) {
                endCol = Math.min(merge.endCol, monthEntries[monthEntries.length - 1].col);
            }
            let endMonth = monthIdx;
            for (const e of monthEntries) {
                if (e.col <= endCol) endMonth = Math.max(endMonth, e.monthIdx);
            }
            monthSignals.push({
                monthIdx,
                endMonthIdx: endMonth,
                col,
                endCol,
                value: cellToString(value),
                rawValue: value,
                isNumeric: isNumeric(value),
                hasColorOnly: !hasContent && !merge && hasColor
            });
        }

        const hasLabel = !!label;
        const hasMonthData = monthSignals.length > 0;

        let suggested;
        if (!hasLabel && !hasMonthData) suggested = 'empty';
        else if (hasLabel && !hasMonthData) suggested = 'category';
        else suggested = 'action';

        rows.push({
            rowIdx: r,
            label,
            monthSignals,
            hasMonthData,
            suggested,
            level: suggested
        });
    }

    return {
        kind: 'grid',
        headerRow: header.rowIdx,
        labelCol: 0,
        monthCols: monthEntries,
        firstMonthCol: minMonthCol,
        rows
    };
}

// ─────────────────────────────────────────────
// Hierarchy builder — turn classified rows into Categories / Actions / Tasks.
// ─────────────────────────────────────────────

const monthDates = (monthIdx, year) => {
    const start = new Date(year, monthIdx, 1);
    const end = new Date(year, monthIdx + 1, 0);
    const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { startDate: fmt(start), dueDate: fmt(end) };
};

const monthRangeDates = (startMonth, endMonth, year) => {
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, endMonth + 1, 0);
    const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { startDate: fmt(start), dueDate: fmt(end) };
};

// Build a Board envelope from the analyzed sheet using the user-confirmed
// classifications. Categories with zero actions get a default action so the
// data model stays consistent with the rest of the app.
export function buildBoard(sheet, analysis, options = {}) {
    const year = options.year || new Date().getFullYear();
    const boardName = options.boardName || sheet.name || 'Imported board';
    const overrides = options.overrides || {};

    const board = {
        id: genId('board'),
        name: boardName,
        color: CATEGORY_COLORS[0],
        gradient: GRADIENTS[0],
        categories: [],
        actions: [],
        tasks: []
    };

    if (analysis.kind !== 'grid') return board;

    let currentCategory = null;
    let categoryIdx = 0;

    const ensureFallbackCategory = () => {
        if (currentCategory) return currentCategory;
        const cat = {
            id: genId('cat'),
            name: 'General',
            color: CATEGORY_COLORS[0],
            gradient: GRADIENTS[0],
            order: 0
        };
        board.categories.push(cat);
        currentCategory = cat;
        categoryIdx = 1;
        return cat;
    };

    for (const row of analysis.rows) {
        const level = overrides[row.rowIdx] || row.level;
        if (level === 'empty') continue;

        if (level === 'category') {
            const cat = {
                id: genId('cat'),
                name: row.label || `Category ${categoryIdx + 1}`,
                color: CATEGORY_COLORS[categoryIdx % CATEGORY_COLORS.length],
                gradient: GRADIENTS[categoryIdx % GRADIENTS.length],
                order: categoryIdx
            };
            board.categories.push(cat);
            currentCategory = cat;
            categoryIdx++;
            continue;
        }

        if (level === 'action') {
            const cat = ensureFallbackCategory();
            const action = {
                id: genId('act'),
                name: row.label || `Action ${board.actions.length + 1}`,
                categoryId: cat.id,
                isDefault: false,
                order: board.actions.filter(a => a.categoryId === cat.id).length,
                description: '',
                tags: [], channels: [], countries: [], otherLabels: [],
                status: 'todo',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            board.actions.push(action);

            // One task per month signal. Numeric cells become budget tasks named
            // after the row label + month. Text cells use the cell content as
            // the task title. Cells with only a coloured fill (no text, no
            // merge value) are tagged `hasColorOnly` and use the row label +
            // month, same naming as budget tasks for visual consistency.
            let taskOrder = 0;
            for (const sig of row.monthSignals) {
                const dates = sig.endMonthIdx > sig.monthIdx
                    ? monthRangeDates(sig.monthIdx, sig.endMonthIdx, year)
                    : monthDates(sig.monthIdx, year);
                const monthLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][sig.monthIdx];
                const isBudget = sig.isNumeric;
                const title = (isBudget || sig.hasColorOnly)
                    ? `${row.label || action.name} — ${monthLabel}`
                    : (sig.value || `${row.label || action.name} (${monthLabel})`);
                const task = {
                    id: genId('task'),
                    actionId: action.id,
                    title: title.slice(0, 200),
                    description: '',
                    status: 'todo',
                    priority: 'medium',
                    startDate: dates.startDate,
                    dueDate: dates.dueDate,
                    month: sig.monthIdx,
                    budget: isBudget ? toNumber(sig.rawValue) : 0,
                    channels: [], countries: [], otherLabels: [],
                    assignees: [],
                    checklist: [],
                    order: taskOrder++,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                board.tasks.push(task);
            }
            continue;
        }
    }

    // Categories with zero actions get a default action so the data model stays
    // consistent (handleAddCategory pattern in App.jsx).
    for (const cat of board.categories) {
        const hasAction = board.actions.some(a => a.categoryId === cat.id);
        if (!hasAction) {
            board.actions.push({
                id: genId('act'),
                name: 'Tasks',
                categoryId: cat.id,
                isDefault: true,
                order: 0,
                description: '',
                tags: [], channels: [], countries: [], otherLabels: [],
                status: 'todo',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
    }

    return board;
}

// Run analyzeSheet on every sheet — the modal uses this to drive a one-board-
// per-sheet import wizard.
export function analyzeWorkbook(parsed) {
    return parsed.sheets.map(sheet => ({
        name: sheet.name,
        sheet,
        analysis: analyzeSheet(sheet)
    }));
}

// ─────────────────────────────────────────────
// LIST FORMAT — kept for back-compat with column-based sheets.
// ─────────────────────────────────────────────

const COLUMN_PATTERNS = {
    title:       [/^(title|name|task|action|item|t[âa]che|nom|titre)$/i],
    description: [/^(desc|description|note|notes|detail)/i],
    status:      [/^(status|state|[ée]tat|statut)$/i],
    priority:    [/^(priority|priorit[eé]|importance)$/i],
    startDate:   [/^(start|debut|d[eé]but|begin|from|date debut)/i],
    dueDate:     [/^(due|deadline|fin|end|to|date fin|due date)/i],
    category:    [/^(category|cat[eé]gorie|theme|th[eè]me|group|groupe)$/i],
    action:      [/^(action|campaign|campagne|project|projet)$/i],
    owner:       [/^(owner|assignee|responsible|attribu[eé]|propri[eé]taire)$/i],
    budget:      [/^(budget|cost|co[uû]t|amount|montant)$/i],
    channel:     [/^(channel|canal|m[eé]dia|media|type)$/i],
    country:     [/^(country|pays|region|r[eé]gion)$/i]
};

export function detectColumnMappings(headerRow) {
    const mappings = {};
    if (!headerRow) return mappings;
    for (let c = 0; c < headerRow.length; c++) {
        const cell = cellToString(headerRow[c]).toLowerCase();
        if (!cell) continue;
        for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
            if (mappings[field] !== undefined) continue;
            if (patterns.some(p => p.test(cell))) { mappings[field] = c; break; }
        }
    }
    return mappings;
}

const STATUS_LOOKUP = [
    [/(todo|to ?do|à ?faire|backlog)/i, 'todo'],
    [/(creat|cr[eé]at)/i, 'creating'],
    [/(progres|en ?cours|wip|doing)/i, 'inprogress'],
    [/(review|relecture|valid)/i, 'review'],
    [/(complete|done|termin|fini)/i, 'completed'],
    [/(paus|hold|stop|annul)/i, 'paused']
];

const PRIO_LOOKUP = [
    [/(high|haute|urg|critical)/i, 'high'],
    [/(low|basse|faible|minor)/i, 'low'],
    [/(med|normal|moyen)/i, 'medium']
];

const matchStatus = (val) => {
    const s = cellToString(val).toLowerCase();
    if (!s) return 'todo';
    for (const [re, id] of STATUS_LOOKUP) if (re.test(s)) return id;
    return 'todo';
};

const matchPriority = (val) => {
    const s = cellToString(val).toLowerCase();
    if (!s) return 'medium';
    for (const [re, id] of PRIO_LOOKUP) if (re.test(s)) return id;
    return 'medium';
};

const parseDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    const s = cellToString(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
        const yy = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
        return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990) return d.toISOString().slice(0, 10);
    return null;
};

export function buildBoardFromList(sheet, mappings, options = {}) {
    const data = sheet.data || [];
    const boardName = options.boardName || sheet.name || 'Imported board';
    const board = {
        id: genId('board'),
        name: boardName,
        color: CATEGORY_COLORS[0],
        gradient: GRADIENTS[0],
        categories: [], actions: [], tasks: []
    };
    if (data.length < 2 || mappings.title === undefined) return board;

    const catMap = new Map();
    const actMap = new Map();
    const ensureCategory = (name) => {
        const key = (name || 'General').trim();
        if (catMap.has(key)) return catMap.get(key);
        const cat = {
            id: genId('cat'),
            name: key,
            color: CATEGORY_COLORS[catMap.size % CATEGORY_COLORS.length],
            gradient: GRADIENTS[catMap.size % GRADIENTS.length],
            order: catMap.size
        };
        board.categories.push(cat);
        catMap.set(key, cat);
        return cat;
    };
    const ensureAction = (catId, name) => {
        const key = `${catId}::${(name || '').trim() || '__default__'}`;
        if (actMap.has(key)) return actMap.get(key);
        const action = {
            id: genId('act'),
            name: name || 'Tasks',
            categoryId: catId,
            isDefault: !name,
            order: board.actions.filter(a => a.categoryId === catId).length,
            description: '',
            tags: [], channels: [], countries: [], otherLabels: [],
            status: 'todo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        board.actions.push(action);
        actMap.set(key, action);
        return action;
    };

    for (let r = 1; r < data.length; r++) {
        const row = data[r] || [];
        const title = cellToString(row[mappings.title]);
        if (!title) continue;
        const cat = ensureCategory(mappings.category !== undefined ? cellToString(row[mappings.category]) : 'General');
        const action = ensureAction(cat.id, mappings.action !== undefined ? cellToString(row[mappings.action]) : '');
        const task = {
            id: genId('task'),
            actionId: action.id,
            title: title.slice(0, 200),
            description: mappings.description !== undefined ? cellToString(row[mappings.description]) : '',
            status: mappings.status !== undefined ? matchStatus(row[mappings.status]) : 'todo',
            priority: mappings.priority !== undefined ? matchPriority(row[mappings.priority]) : 'medium',
            startDate: mappings.startDate !== undefined ? parseDate(row[mappings.startDate]) : null,
            dueDate: mappings.dueDate !== undefined ? parseDate(row[mappings.dueDate]) : null,
            budget: mappings.budget !== undefined ? toNumber(row[mappings.budget]) : 0,
            channels: [], countries: [], otherLabels: [],
            assignees: mappings.owner !== undefined ? [cellToString(row[mappings.owner])].filter(Boolean) : [],
            checklist: [],
            order: board.tasks.filter(t => t.actionId === action.id).length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (task.dueDate) task.month = new Date(task.dueDate).getMonth();
        board.tasks.push(task);
    }
    return board;
}
