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
export async function buildTimelineWorkbook(categories, actions, tasks, year) {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Marketing Dashboard';
    const ws = wb.addWorksheet('Timeline', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    });

    const months = CONFIG.MONTHS;
    const header = ['', ...months];
    const headerRow = ws.addRow(header);
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    });
    headerRow.height = 22;

    ws.getColumn(1).width = 45;
    for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 10;

    const sortedCats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    sortedCats.forEach(cat => {
        // Category band row — label in A, merged across all 13 columns for a full-width section header.
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
                actionCell.font = { bold: true, color: { argb: 'FF111827' }, size: 10 };
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
                row.height = 18;

                const startCol = 2 + startMonth;
                const endCol = 2 + endMonth;
                if (endCol > startCol) ws.mergeCells(row.number, startCol, row.number, endCol);

                const barCell = row.getCell(startCol);
                barCell.value = task.title || '';
                const isDone = task.status === 'completed';
                const statusARGB = toARGB(statusColor(task.status));
                barCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: isDone ? lightenARGB(statusARGB, 0.55) : statusARGB }
                };
                barCell.font = {
                    bold: !isDone,
                    color: { argb: isDone ? 'FF4B5563' : 'FFFFFFFF' },
                    size: 10
                };
                barCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
                const border = { style: 'thin', color: { argb: 'FFD1D5DB' } };
                barCell.border = { top: border, left: border, right: border, bottom: border };
            });
        });
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

// Render an action as a multi-line cell value.
// Layout:
//   [Action name]
//   ▸ Checklist 1
//     · Task A
//     · Task B
//   ▸ Checklist 2
//     · Task C
function buildActionCellText(action, actionTasks) {
    if (actionTasks.length === 0) return action.name || '';
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
    const lines = [action.name || ''];
    for (const name of groupOrder) {
        const items = groups.get(name).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        lines.push('');
        lines.push(`▸ ${name}`);
        for (const t of items) lines.push(`  · ${t.title || ''}`);
    }
    return lines.join('\n');
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

    const headerRow = ws.addRow(columns.map(c => c.label));
    headerRow.eachCell((cell, colIdx) => {
        const col = columns[colIdx - 1];
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(col.color) } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    headerRow.height = 28;

    columns.forEach((_, ci) => { ws.getColumn(ci + 1).width = 34; });

    for (let r = 0; r < maxRows; r++) {
        const rowValues = columns.map(col => {
            const item = col.items[r];
            if (!item) return '';
            if (item.kind === 'action') return buildActionCellText(item.data, item.tasks);
            const task = item.data;
            const p = task.priority ? `\n[${priorityName(task.priority)}]` : '';
            return `${task.title || ''}${p}`;
        });
        const row = ws.addRow(rowValues);
        // Taller row for action cells so their multi-line content stays readable.
        const hasActionItem = columns.some(col => col.items[r]?.kind === 'action');
        row.height = hasActionItem ? 90 : 34;
        row.eachCell((cell, colIdx) => {
            const item = columns[colIdx - 1].items[r];
            if (!item) return;
            const statusId = item.kind === 'action' ? item.data.status : item.data.status;
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
            cell.font = {
                size: 10,
                color: { argb: isDone ? 'FF6B7280' : 'FF111827' },
                bold: item.kind === 'action'
            };
        });
    }

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
