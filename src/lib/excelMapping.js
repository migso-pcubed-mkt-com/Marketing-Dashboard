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
 * Returns { sheets: [{ name, data, merges, cellColors }] }. `cellColors[r][c]` is an ARGB string or null.
 * Colors are read via exceljs (loaded on demand) so styling signals survive the xlsx→json conversion.
 */
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
        // exceljs expects an ArrayBuffer or Uint8Array — both work with the same buffer.
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
        // Legacy .xls or missing styles — proceed without color signal.
        colorsByName = {};
    }

    return {
        sheetNames: wb.SheetNames,
        sheets: xlsxSheets.map(s => ({ ...s, cellColors: colorsByName[s.name] || [] }))
    };
}

/**
 * ARGB (from exceljs) represents a non-neutral fill color (user-applied highlight).
 * Excludes transparent/default whites, pure black (often a font-default), and empty values.
 */
function isMeaningfulFill(argb) {
    if (!argb) return false;
    const up = String(argb).toUpperCase();
    if (up === '00000000') return false;           // fully transparent
    if (up === 'FFFFFFFF' || up === 'FFFFFF') return false; // white
    if (up === 'FF000000' || up === '000000') return false; // pure black — almost never a real highlight
    return true;
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

// Country aliases → country id (case-insensitive, punctuation-stripped)
const COUNTRY_ALIASES = {
    'global': 'global', 'world': 'global', 'worldwide': 'global', 'monde': 'global',
    'australia': 'australia', 'australie': 'australia',
    'canada': 'canada',
    'france': 'france', 'fr': 'france', 'french': 'france',
    'germany': 'germany', 'deutschland': 'germany', 'allemagne': 'germany', 'de': 'germany',
    'india': 'india', 'inde': 'india',
    'italy': 'italy', 'italia': 'italy', 'italie': 'italy', 'it': 'italy',
    'mexico': 'mexico', 'méxico': 'mexico', 'mexique': 'mexico',
    'netherlands': 'netherlands', 'pays bas': 'netherlands', 'paysbas': 'netherlands', 'holland': 'netherlands', 'nl': 'netherlands',
    'portugal': 'portugal', 'pt': 'portugal',
    'romania': 'romania', 'roumanie': 'romania', 'ro': 'romania',
    'sea': 'southeast-asia', 'south east asia': 'southeast-asia', 'southeast asia': 'southeast-asia',
    'spain': 'spain', 'espagne': 'spain', 'españa': 'spain', 'espana': 'spain', 'es': 'spain', 'sp': 'spain',
    'switzerland': 'switzerland', 'suisse': 'switzerland', 'schweiz': 'switzerland', 'ch': 'switzerland',
    'uk': 'uk', 'united kingdom': 'uk', 'royaume uni': 'uk', 'royaumeuni': 'uk', 'grande bretagne': 'uk', 'britain': 'uk', 'england': 'uk', 'gb': 'uk',
    'usa': 'usa', 'us': 'usa', 'united states': 'usa', 'etats unis': 'usa', 'états unis': 'usa', 'america': 'usa', 'amérique': 'usa'
};

function detectCountryId(label) {
    if (!label) return null;
    const s = String(label).trim().toLowerCase().replace(/[^a-zÀ-ɏ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (COUNTRY_ALIASES[s]) return COUNTRY_ALIASES[s];
    // Also try bare alphanum without accents
    const ascii = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return COUNTRY_ALIASES[ascii] || null;
}

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
 * Index merges by starting row for quick lookup. Returns Map<rowIdx, Array<{startCol,endCol,startRow,endRow}>>.
 */
function indexMergesByRow(merges) {
    const map = new Map();
    for (const m of merges || []) {
        const r = m.s.r;
        if (!map.has(r)) map.set(r, []);
        map.get(r).push({ startCol: m.s.c, endCol: m.e.c, startRow: m.s.r, endRow: m.e.r });
    }
    return map;
}

/**
 * Analyze each grid row to detect indent depth, merge span, country tag, month coverage.
 * This powers both auto-detection and the manual review UI.
 * Returns { monthHeader, rows: [{rowIdx, label, depth, mergeSpan, hasMonthContent, hasMonthSignal, countryId, startMonthCol, endMonthCol}] }
 */
export function analyzeGridRows(sheetData, merges = [], cellColors = []) {
    const data = sheetData.map(row => [...(row || [])]);
    // Do NOT expand merges yet — we want to detect the original blank cells for depth computation.
    // Build a side-copy with merges expanded for label lookup only.
    const expanded = sheetData.map(row => [...(row || [])]);
    expandMerges(expanded, merges);

    const monthHeader = findMonthHeader(expanded);
    if (!monthHeader) return null;

    const mergesByRow = indexMergesByRow(merges);
    const { headerRow, monthColumns } = monthHeader;
    const firstMonthCol = monthColumns[0].col;
    const rows = [];

    for (let r = headerRow + 1; r < data.length; r++) {
        const row = data[r] || [];
        // Depth: first non-empty column BEFORE the month columns (prefer unexpanded data so that merged-down cells don't falsely lift depth)
        let depth = -1;
        for (let c = 0; c < firstMonthCol; c++) {
            if (String(row[c] || '').trim()) { depth = c; break; }
        }
        // Fallback: use expanded to at least resolve a label
        let labelFromExpanded = '';
        let labelCol = depth;
        if (depth < 0) {
            for (let c = 0; c < firstMonthCol; c++) {
                if (String(expanded[r]?.[c] || '').trim()) { labelFromExpanded = String(expanded[r][c]).trim(); labelCol = c; break; }
            }
        }
        const label = depth >= 0 ? String(row[depth]).trim() : labelFromExpanded;

        // Month content (text) + colored-cell signal. Either one flags the row as a task candidate.
        let hasMonthContent = false;
        let hasMonthColor = false;
        let startMonthCol = null;
        let endMonthCol = null;
        for (const mc of monthColumns) {
            const val = String(expanded[r]?.[mc.col] || '').trim();
            const textSignal = val && val !== label;
            const colorSignal = isMeaningfulFill(cellColors?.[r]?.[mc.col]);
            if (textSignal || colorSignal) {
                if (textSignal) hasMonthContent = true;
                if (colorSignal) hasMonthColor = true;
                if (startMonthCol === null) startMonthCol = mc;
                endMonthCol = mc;
            }
        }
        const hasMonthSignal = hasMonthContent || hasMonthColor;

        // Merge span at this row for the label cell
        const mergesHere = mergesByRow.get(r) || [];
        const labelMerge = mergesHere.find(m => m.startCol === (depth >= 0 ? depth : labelCol));
        const mergeSpan = labelMerge ? (labelMerge.endCol - labelMerge.startCol + 1) : 1;
        // Large horizontal merge = section/super heading signal
        const wideMerge = labelMerge && labelMerge.endCol >= firstMonthCol - 1;

        if (!label && !hasMonthSignal) continue; // fully empty row

        rows.push({
            rowIdx: r,
            label: label || '',
            depth: depth >= 0 ? depth : 0,
            colIndex: depth >= 0 ? depth : labelCol,
            mergeSpan,
            wideMerge: !!wideMerge,
            hasMonthContent,
            hasMonthColor,
            hasMonthSignal,
            startMonthCol,
            endMonthCol,
            countryId: detectCountryId(label)
        });
    }

    return { headerRow, monthColumns, rows };
}

/**
 * Auto-assign a level ('super' | 'category' | 'action' | 'task' | 'ignore') to each row.
 * Heuristic:
 *   - hasMonthContent → 'task'
 *   - else shallowest depth (or widest merge) → 'super'/'category' depending on how many non-task depths exist
 *   - label matches a country and sits at a shallow depth → force 'super'
 */
export function autoAssignLevels(analysis) {
    if (!analysis) return [];
    const { rows } = analysis;

    const headerRows = rows.filter(r => !r.hasMonthSignal);
    const headerDepths = Array.from(new Set(headerRows.map(r => r.depth))).sort((a, b) => a - b);
    // Detect whether the shallowest depth looks like a super-category band
    // (country label or wide merge). If yes, shift the mapping so the next depth is still 'category'.
    const shallowestIsSuper = headerRows.some(r =>
        r.depth === headerDepths[0] && (r.countryId || r.wideMerge)
    );
    const depthToLevel = new Map();
    if (headerDepths.length >= 3) {
        // Deep nesting: shallowest is a super-category, next is category, deeper are actions.
        depthToLevel.set(headerDepths[0], 'super');
        depthToLevel.set(headerDepths[1], 'category');
        for (let i = 2; i < headerDepths.length; i++) depthToLevel.set(headerDepths[i], 'action');
    } else if (headerDepths.length === 2) {
        if (shallowestIsSuper) {
            depthToLevel.set(headerDepths[0], 'super');
            depthToLevel.set(headerDepths[1], 'category');
        } else {
            depthToLevel.set(headerDepths[0], 'category');
            depthToLevel.set(headerDepths[1], 'action');
        }
    } else if (headerDepths.length === 1) {
        // Single header depth: only one level of non-task rows — always category.
        // Even when the sole label is a country, the user needs a category to attach tasks to,
        // so map to 'category' here. The per-row country override below still tags tasks appropriately.
        depthToLevel.set(headerDepths[0], 'category');
    }

    return rows.map(r => {
        if (r.hasMonthSignal) return { ...r, level: 'task' };
        let level = depthToLevel.get(r.depth) || 'category';
        // Country label at shallow depth forces 'super' — but only when there's at least
        // one deeper header depth to host real categories underneath. Otherwise, the country
        // label must remain a category itself or tasks would have no parent container.
        if (r.countryId && r.depth === headerDepths[0] && headerDepths.length >= 2) level = 'super';
        return { ...r, level };
    });
}

/**
 * Build { categories, actions, tasks } from the level-assigned rows.
 * Defaults: super-categories become categories (with country tag propagated to descendants). Sub-categories are prefixed
 * with the super name (e.g. "France - Internal Coms") unless `flattenSuper` is true (super becomes only a country tag).
 */
export function buildGridHierarchy(sheetData, analysis, leveledRows, options = {}) {
    const { flattenSuper = false } = options;
    const { monthColumns } = analysis;
    const expanded = sheetData.map(row => [...(row || [])]);
    // We need merges to expand again for month cell lookup
    // Already handled by caller; analyzeGridRows used expanded for month detection but here we only need labels & contents.

    const categories = [];
    const actions = [];
    const tasks = [];
    const now = new Date().toISOString();

    let currentSuper = null;  // { name, countryId } OR null
    let currentCategory = null;
    let currentAction = null;
    let catColorIdx = 0;

    const ensureCategory = (name, countryId) => {
        const displayName = (currentSuper && !flattenSuper && currentSuper.name && !currentSuper.countryId)
            ? `${currentSuper.name} - ${name}`
            : name;
        const cat = {
            id: `cat-${crypto.randomUUID()}`,
            name: displayName,
            color: CATEGORY_COLORS[catColorIdx % CATEGORY_COLORS.length],
            gradient: GRADIENTS[catColorIdx % GRADIENTS.length],
            order: categories.length,
            createdAt: now,
            updatedAt: now
        };
        categories.push(cat);
        catColorIdx++;
        return cat;
    };

    const ensureDefaultAction = (cat) => {
        const action = {
            id: `a-${crypto.randomUUID()}`,
            name: cat.name,
            categoryId: cat.id,
            isDefault: true,
            budget: 0,
            priority: 'medium',
            tags: [],
            countries: [],
            status: 'inprogress',
            order: actions.length,
            createdAt: now,
            updatedAt: now
        };
        actions.push(action);
        return action;
    };

    for (const row of leveledRows) {
        if (row.level === 'ignore' || row.level === 'empty') continue;

        if (row.level === 'super') {
            // Apply super as prefix for following categories; if it's a country, don't prefix - use as country tag
            currentSuper = { name: row.label, countryId: row.countryId };
            // If flattenSuper AND it's a named non-country super, create a standalone category
            if (flattenSuper && !row.countryId && row.label) {
                currentCategory = ensureCategory(row.label, null);
                currentAction = ensureDefaultAction(currentCategory);
            } else {
                // Wait for child category row — reset current cat/action
                currentCategory = null;
                currentAction = null;
            }
            continue;
        }

        if (row.level === 'category') {
            const countryForCat = currentSuper?.countryId || row.countryId || null;
            // Country-only super: the child category keeps its own name (not prefixed), gets country tag via tasks
            currentCategory = ensureCategory(row.label || 'Category', countryForCat);
            currentAction = ensureDefaultAction(currentCategory);
            continue;
        }

        if (row.level === 'action') {
            if (!currentCategory) {
                currentCategory = ensureCategory('Imported', null);
            }
            currentAction = {
                id: `a-${crypto.randomUUID()}`,
                name: row.label || 'Action',
                categoryId: currentCategory.id,
                isDefault: false,
                budget: 0,
                priority: 'medium',
                tags: [],
                countries: currentSuper?.countryId ? [currentSuper.countryId] : [],
                status: 'inprogress',
                order: actions.length,
                createdAt: now,
                updatedAt: now
            };
            actions.push(currentAction);
            continue;
        }

        if (row.level === 'task') {
            if (!currentCategory) {
                currentCategory = ensureCategory('Imported', null);
            }
            if (!currentAction) {
                currentAction = ensureDefaultAction(currentCategory);
            }
            const startMc = row.startMonthCol;
            const endMc = row.endMonthCol || row.startMonthCol;
            if (!startMc) continue;
            const year = startMc.year || new Date().getFullYear();
            const startDate = `${year}-${String(startMc.month + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(year, endMc.month + 1, 0).getDate();
            const dueDate = `${year}-${String(endMc.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            // Title: prefer row label, else first non-empty month cell content
            let title = row.label;
            if (!title) {
                for (const mc of monthColumns) {
                    const v = String(expanded[row.rowIdx]?.[mc.col] || '').trim();
                    if (v) { title = v; break; }
                }
            }
            if (!title) title = 'Task';

            const countries = currentSuper?.countryId ? [currentSuper.countryId] : (row.countryId ? [row.countryId] : []);

            tasks.push({
                id: `t-${crypto.randomUUID()}`,
                actionId: currentAction.id,
                title,
                description: '',
                status: 'todo',
                priority: 'medium',
                budget: 0,
                month: startMc.month,
                startDate,
                dueDate,
                channels: [],
                countries,
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

/**
 * Parse a grid/roadmap sheet.
 * Returns { categories: [...], actions: [...], tasks: [...] }
 */
export function parseGrid(sheetData, merges = []) {
    const analysis = analyzeGridRows(sheetData, merges);
    if (!analysis) return null;
    const leveledRows = autoAssignLevels(analysis);
    return buildGridHierarchy(sheetData, analysis, leveledRows);
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
