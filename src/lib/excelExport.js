import * as XLSX from 'xlsx';
import { CONFIG } from '../config.js';

const statusColor = (id) => CONFIG.STATUSES.find(s => s.id === id)?.color || '#94a3b8';
const priorityName = (id) => CONFIG.PRIORITIES.find(p => p.id === id)?.name || id || '';

// Hex '#RRGGBB' → ARGB 'FFRRGGBB' for exceljs fills
const toARGB = (hex) => 'FF' + (hex || '#cccccc').replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6);

// Lighten an ARGB color toward white by `t` (0..1). Used for completed-task pale backgrounds.
const lightenARGB = (argb, t = 0.7) => {
    const r = parseInt(argb.slice(2, 4), 16);
    const g = parseInt(argb.slice(4, 6), 16);
    const b = parseInt(argb.slice(6, 8), 16);
    const mix = (c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0').toUpperCase();
    return 'FF' + mix(r) + mix(g) + mix(b);
};

const downloadExcelJs = async (workbook, filename) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

const downloadWorkbook = (wb, filename) => {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

// ─────────────────────────────────────────────
// TIMELINE (exceljs — styled Gantt)
// ─────────────────────────────────────────────

// Timeline export mirrors the grid/roadmap import layout: one label column (A)
// for the hierarchy (category → action), then 12 month columns (B…M). Task titles
// live inside the Gantt bar — the cells merged across startDate..dueDate — so the
// sheet matches what the import parser expects and produces a round-trip friendly file.
// A status legend is rendered to the right of December (col N–O).
export async function buildTimelineWorkbook(categories, actions, tasks, year) {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Marketing Dashboard';
    // No frozen views — users prefer to scroll the whole sheet freely.
    const ws = wb.addWorksheet('Timeline');

    const months = CONFIG.MONTHS;
    const header = ['', ...months, '', 'Legend'];
    const headerRow = ws.addRow(header);
    headerRow.eachCell((cell, col) => {
        if (col === 14) return; // spacer column stays blank
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    });
    headerRow.height = 22;

    ws.getColumn(1).width = 45;
    for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 10;
    ws.getColumn(14).width = 2;
    ws.getColumn(15).width = 22;

    // Roughly estimate the row height needed to fit a title across N merged month columns.
    // Each month column is ~10 chars wide, minus 2 chars of padding/indent.
    const estimateTitleHeight = (title, spanMonths) => {
        const perLine = Math.max(6, spanMonths * 10 - 2);
        const lines = Math.max(1, Math.ceil((title || '').length / perLine));
        return Math.max(20, lines * 14 + 6);
    };

    const sortedCats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    sortedCats.forEach(cat => {
        // Category band row — label in A, merged across the 13 timeline columns.
        const catRow = ws.addRow([cat.name, '', '', '', '', '', '', '', '', '', '', '', '']);
        ws.mergeCells(catRow.number, 1, catRow.number, 13);
        const catCell = catRow.getCell(1);
        catCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(cat.color) } };
        catCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        catRow.height = 20;

        const catActions = actions.filter(a => a.categoryId === cat.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        catActions.forEach(action => {
            const actionTasks = tasks.filter(t => t.actionId === action.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

            // Action sub-header (skipped for default/card-as-task actions — their tasks appear directly under the category).
            if (!action.isDefault) {
                const actionRow = ws.addRow([`  ${action.name}`, '', '', '', '', '', '', '', '', '', '', '', '']);
                ws.mergeCells(actionRow.number, 1, actionRow.number, 13);
                const actionCell = actionRow.getCell(1);
                const actionDone = action.status === 'completed';
                actionCell.font = {
                    bold: true, color: { argb: 'FF111827' }, size: 10,
                    strike: actionDone
                };
                actionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightenARGB(toARGB(cat.color), 0.75) } };
                actionCell.alignment = { vertical: 'middle', horizontal: 'left' };
                actionRow.height = 18;
            }

            actionTasks.forEach(task => {
                const tStart = task.startDate ? new Date(task.startDate) : null;
                const tEnd = task.dueDate ? new Date(task.dueDate) : tStart;
                if (!tStart) return;

                let startMonth = -1, endMonth = -1;
                for (let m = 0; m < 12; m++) {
                    const monthStart = new Date(year, m, 1);
                    const monthEnd = new Date(year, m + 1, 0);
                    if (tStart <= monthEnd && tEnd >= monthStart) {
                        if (startMonth === -1) startMonth = m;
                        endMonth = m;
                    }
                }
                if (startMonth === -1) return;

                const row = ws.addRow(['', '', '', '', '', '', '', '', '', '', '', '', '']);

                const startCol = 2 + startMonth;
                const endCol = 2 + endMonth;
                const spanMonths = endMonth - startMonth + 1;
                if (endCol > startCol) ws.mergeCells(row.number, startCol, row.number, endCol);

                const title = task.title || '';
                row.height = estimateTitleHeight(title, spanMonths);

                const barCell = row.getCell(startCol);
                barCell.value = title;
                const isDone = task.status === 'completed';
                const statusARGB = toARGB(statusColor(task.status));
                barCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: isDone ? lightenARGB(statusARGB, 0.55) : statusARGB }
                };
                barCell.font = {
                    bold: !isDone,
                    strike: isDone,
                    color: { argb: isDone ? 'FF4B5563' : 'FFFFFFFF' },
                    size: 10
                };
                barCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
                const border = { style: 'thin', color: { argb: 'FFD1D5DB' } };
                barCell.border = { top: border, left: border, right: border, bottom: border };
            });
        });
    });

    // Status legend — written last so it lands in the existing data rows (2..N)
    // instead of creating empty rows above the category bands.
    CONFIG.STATUSES.forEach((st, idx) => {
        const r = ws.getRow(2 + idx);
        const cell = r.getCell(15);
        cell.value = st.name;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(st.color) } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    });

    return wb;
}

export async function exportTimelineXlsx(categories, actions, tasks, year, boardName) {
    const wb = await buildTimelineWorkbook(categories, actions, tasks, year);
    await downloadExcelJs(wb, `timeline-${boardName || 'export'}-${year}.xlsx`);
}

// ─────────────────────────────────────────────
// KANBAN (exceljs — styled columns)
// ─────────────────────────────────────────────

// Card-as-action detection: a category is in card-as-action mode if it has at least
// one non-default action. In that case we render one cell per *action* (with its
// checklists/tasks inlined) instead of one cell per task. Pure card-as-task
// categories (only default actions) keep the original task-level rendering.
function isCardAsActionCategory(categoryId, actions) {
    return actions.some(a => a.categoryId === categoryId && !a.isDefault);
}

// Render an action as a multi-line cell. Bold styling is applied ONLY to the
// action name (via exceljs richText segments); checklist headings and task
// items stay in the default weight. Completed tasks are strike-through within
// the same cell. Layout:
//   [Action name]              ← bold (+ strike if action.status === completed)
//   ▸ Checklist 1
//     · Task A                 ← strike if task.status === completed
//     · Task B
//   ▸ Checklist 2
//     · Task C
// Returns { richText, plainText, lineCount } so callers can drive styling +
// row height without re-parsing the text.
function buildActionCell(action, actionTasks) {
    const actionDone = action.status === 'completed';
    const actionName = action.name || '';

    if (actionTasks.length === 0) {
        return {
            richText: [{ text: actionName, font: { bold: true, size: 10, strike: actionDone } }],
            plainText: actionName,
            lineCount: 1
        };
    }

    const groups = new Map();
    const groupOrder = [];
    for (const t of actionTasks) {
        const key = t.trelloChecklistName || '(Tasks)';
        if (!groups.has(key)) {
            groups.set(key, []);
            groupOrder.push(key);
        }
        groups.get(key).push(t);
    }

    const segments = [{ text: actionName, font: { bold: true, size: 10, strike: actionDone } }];
    const plainLines = [actionName];

    for (const name of groupOrder) {
        const items = groups.get(name).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        segments.push({ text: `\n\n▸ ${name}`, font: { bold: false, size: 10 } });
        plainLines.push('', `▸ ${name}`);
        for (const t of items) {
            const done = t.status === 'completed';
            segments.push({ text: `\n  · ${t.title || ''}`, font: { bold: false, size: 10, strike: done } });
            plainLines.push(`  · ${t.title || ''}`);
        }
    }

    return {
        richText: segments,
        plainText: plainLines.join('\n'),
        lineCount: plainLines.length
    };
}

// Build a uniform list of columns for any Kanban view.
// Each column: { label, color, items: [{ kind: 'task'|'action', data, tasks? }] }.
function buildKanbanColumns(categories, actions, tasks, view) {
    const taskDate = (t) => t.dueDate || t.startDate;
    const sortByOrder = (list) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const NEUTRAL_HEADER = '#475569';
    const UNASSIGNED = '#94a3b8';

    const taskItems = (ts) => ts.map(t => ({ kind: 'task', data: t }));

    if (view === 'status') {
        return CONFIG.STATUSES.map(s => ({
            label: s.name,
            color: s.color,
            items: taskItems(sortByOrder(tasks.filter(t => t.status === s.id)))
        }));
    }

    if (view === 'month') {
        const cols = [];
        for (let m = 0; m < 12; m++) {
            const mTasks = sortByOrder(tasks.filter(t => {
                const d = taskDate(t);
                return d && new Date(d).getMonth() === m;
            }));
            cols.push({ label: CONFIG.MONTHS_FULL[m], color: NEUTRAL_HEADER, items: taskItems(mTasks) });
        }
        const noDate = sortByOrder(tasks.filter(t => !taskDate(t)));
        if (noDate.length) cols.push({ label: 'Unscheduled', color: UNASSIGNED, items: taskItems(noDate) });
        return cols;
    }

    if (view === 'quarter') {
        const cols = [];
        for (let q = 0; q < 4; q++) {
            const qTasks = sortByOrder(tasks.filter(t => {
                const d = taskDate(t);
                return d && Math.floor(new Date(d).getMonth() / 3) === q;
            }));
            cols.push({ label: `Q${q + 1}`, color: NEUTRAL_HEADER, items: taskItems(qTasks) });
        }
        const noDate = sortByOrder(tasks.filter(t => !taskDate(t)));
        if (noDate.length) cols.push({ label: 'Unscheduled', color: UNASSIGNED, items: taskItems(noDate) });
        return cols;
    }

    if (view === 'country') {
        const presentIds = new Set();
        tasks.forEach(t => (t.countries || []).forEach(c => presentIds.add(c)));
        const cols = CONFIG.COUNTRIES
            .filter(c => presentIds.has(c.id))
            .map(c => ({
                label: c.name,
                color: c.color || NEUTRAL_HEADER,
                items: taskItems(sortByOrder(tasks.filter(t => (t.countries || []).includes(c.id))))
            }));
        const extraIds = Array.from(presentIds).filter(id => !CONFIG.COUNTRIES.some(c => c.id === id));
        for (const id of extraIds) {
            cols.push({
                label: id,
                color: NEUTRAL_HEADER,
                items: taskItems(sortByOrder(tasks.filter(t => (t.countries || []).includes(id))))
            });
        }
        const noCountry = sortByOrder(tasks.filter(t => !(t.countries || []).length));
        if (noCountry.length) cols.push({ label: 'No country', color: UNASSIGNED, items: taskItems(noCountry) });
        return cols;
    }

    // Default: category view. Switch to action-centric rendering if the category
    // is in card-as-action mode; otherwise render individual tasks.
    const sortedCats = sortByOrder(categories);
    return sortedCats.map(cat => {
        const catActions = sortByOrder(actions.filter(a => a.categoryId === cat.id));
        if (isCardAsActionCategory(cat.id, actions)) {
            const items = catActions.map(action => ({
                kind: 'action',
                data: action,
                tasks: sortByOrder(tasks.filter(t => t.actionId === action.id))
            }));
            return { label: cat.name, color: cat.color, items };
        }
        const catActionIds = new Set(catActions.map(a => a.id));
        const catTasks = sortByOrder(tasks.filter(t => catActionIds.has(t.actionId)));
        return { label: cat.name, color: cat.color, items: taskItems(catTasks) };
    });
}

export async function buildKanbanWorkbook(categories, actions, tasks, view = 'category') {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Marketing Dashboard';
    const ws = wb.addWorksheet('Kanban', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    const columns = buildKanbanColumns(categories, actions, tasks, view);
    if (columns.length === 0) return wb;

    const maxRows = Math.max(...columns.map(c => c.items.length), 0);
    const legendCol = columns.length + 2; // one spacer column then the legend

    // Header row: column labels + Legend
    const headerValues = [...columns.map(c => c.label), '', 'Legend'];
    const headerRow = ws.addRow(headerValues);
    headerRow.eachCell((cell, colIdx) => {
        if (colIdx === columns.length + 1) return; // spacer — keep blank
        const col = columns[colIdx - 1];
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        const fillColor = col ? toARGB(col.color) : 'FF1F2937'; // legend header = dark slate
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    headerRow.height = 28;

    columns.forEach((_, ci) => { ws.getColumn(ci + 1).width = 34; });
    ws.getColumn(columns.length + 1).width = 2;
    ws.getColumn(legendCol).width = 22;

    // Rough wrap estimate: 34-char column width at size 10 ≈ 30 usable chars per line.
    const estimateLinesForText = (text) => {
        if (!text) return 1;
        const rawLines = String(text).split('\n');
        let total = 0;
        for (const line of rawLines) total += Math.max(1, Math.ceil(line.length / 30));
        return total;
    };

    for (let r = 0; r < maxRows; r++) {
        const cellValues = columns.map(col => {
            const item = col.items[r];
            if (!item) return null;
            if (item.kind === 'action') return buildActionCell(item.data, item.tasks);
            const task = item.data;
            const done = task.status === 'completed';
            const title = task.title || '';
            const prio = task.priority ? `\n[${priorityName(task.priority)}]` : '';
            return {
                richText: [
                    { text: title, font: { size: 10, bold: false, strike: done, color: { argb: done ? 'FF6B7280' : 'FF111827' } } },
                    ...(prio ? [{ text: prio, font: { size: 9, bold: false, color: { argb: 'FF6B7280' } } }] : [])
                ],
                plainText: title + prio,
                lineCount: 1 + (prio ? 1 : 0)
            };
        });

        const row = ws.addRow(cellValues.map(() => ''));
        // Dynamic height driven by the tallest cell (lineCount + wrap estimate).
        let maxLines = 1;
        cellValues.forEach((cv) => {
            if (!cv) return;
            const lines = Math.max(cv.lineCount || 1, estimateLinesForText(cv.plainText || ''));
            if (lines > maxLines) maxLines = lines;
        });
        row.height = Math.max(34, maxLines * 14 + 8);

        row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
            if (colIdx > columns.length) return;
            const cv = cellValues[colIdx - 1];
            const item = columns[colIdx - 1].items[r];
            if (!cv || !item) return;
            cell.value = { richText: cv.richText };
            const statusId = item.data.status;
            const statusARGB = toARGB(statusColor(statusId));
            const isDone = statusId === 'completed';
            cell.border = {
                left: { style: 'thick', color: { argb: statusARGB } },
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: isDone ? lightenARGB(statusARGB, 0.82) : 'FFF8FAFC' }
            };
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
            // cell.font intentionally not overridden — richText carries per-segment style.
        });
    }

    // Status legend — written after data rows so it lands on existing rows 2..7.
    CONFIG.STATUSES.forEach((st, idx) => {
        const r = ws.getRow(2 + idx);
        const cell = r.getCell(legendCol);
        cell.value = st.name;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(st.color) } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
    });

    return wb;
}

export async function exportKanbanXlsx(categories, actions, tasks, boardName, view = 'category') {
    const wb = await buildKanbanWorkbook(categories, actions, tasks, view);
    const suffix = view === 'category' ? '' : `-${view}`;
    await downloadExcelJs(wb, `kanban${suffix}-${boardName || 'export'}-${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ─────────────────────────────────────────────
// CALENDAR (xlsx — unchanged)
// ─────────────────────────────────────────────

export function exportCalendarXlsx(tasks, year, boardName) {
    const wb = XLSX.utils.book_new();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let month = 0; month < 12; month++) {
        const monthName = CONFIG.MONTHS_FULL[month] || CONFIG.MONTHS[month];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0).getDate();

        let startDow = firstDay.getDay() - 1;
        if (startDow < 0) startDow = 6;

        const rows = [[`${monthName} ${year}`, '', '', '', '', '', ''], dayNames];

        let week = Array(7).fill('');
        let dayNum = 1;

        for (let d = startDow; d < 7 && dayNum <= lastDay; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayTasks = tasks.filter(t => t.dueDate === dateStr);
            const cell = dayTasks.length > 0
                ? `${dayNum}\n${dayTasks.map(t => t.title).join('\n')}`
                : String(dayNum);
            week[d] = cell;
            dayNum++;
        }
        rows.push(week);

        while (dayNum <= lastDay) {
            week = Array(7).fill('');
            for (let d = 0; d < 7 && dayNum <= lastDay; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayTasks = tasks.filter(t => t.dueDate === dateStr);
                const cell = dayTasks.length > 0
                    ? `${dayNum}\n${dayTasks.map(t => t.title).join('\n')}`
                    : String(dayNum);
                week[d] = cell;
                dayNum++;
            }
            rows.push(week);
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = dayNames.map(() => ({ wch: 18 }));
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

        const sheetName = monthName.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    downloadWorkbook(wb, `calendar-${boardName || 'export'}-${year}.xlsx`);
}
