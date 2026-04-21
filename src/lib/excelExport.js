import * as XLSX from 'xlsx';
import { CONFIG } from '../config.js';

const statusName = (id) => CONFIG.STATUSES.find(s => s.id === id)?.name || id || '';
const statusColor = (id) => CONFIG.STATUSES.find(s => s.id === id)?.color || '#94a3b8';
const priorityName = (id) => CONFIG.PRIORITIES.find(p => p.id === id)?.name || id || '';

// Hex '#RRGGBB' → ARGB 'FFRRGGBB' for exceljs fills
const toARGB = (hex) => 'FF' + (hex || '#cccccc').replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6);

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

export async function buildTimelineWorkbook(categories, actions, tasks, year) {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Marketing Dashboard';
    const ws = wb.addWorksheet('Timeline', {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }]
    });

    const months = CONFIG.MONTHS;
    const header = ['Category', 'Action', 'Task', ...months];
    const headerRow = ws.addRow(header);
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    });
    headerRow.height = 22;

    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 26;
    ws.getColumn(3).width = 32;
    for (let c = 4; c <= 15; c++) ws.getColumn(c).width = 6;

    const sortedCats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    sortedCats.forEach(cat => {
        const catRow = ws.addRow([cat.name, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        ws.mergeCells(catRow.number, 1, catRow.number, 15);
        const catCell = catRow.getCell(1);
        catCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(cat.color) } };
        catCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        catRow.height = 20;

        const catActions = actions.filter(a => a.categoryId === cat.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        catActions.forEach(action => {
            const actionTasks = tasks.filter(t => t.actionId === action.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

            if (!action.isDefault) {
                const actionRow = ws.addRow([`  ${action.name}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
                ws.mergeCells(actionRow.number, 1, actionRow.number, 15);
                const actionCell = actionRow.getCell(1);
                actionCell.font = { bold: true, color: { argb: 'FF111827' }, size: 10 };
                actionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(cat.color).replace(/^FF/, '33') } };
                actionCell.alignment = { vertical: 'middle', horizontal: 'left' };
                actionRow.height = 18;
            }

            actionTasks.forEach(task => {
                const row = ws.addRow([
                    cat.name,
                    action.isDefault ? '' : action.name,
                    task.title || '',
                    '', '', '', '', '', '', '', '', '', '', '', ''
                ]);
                row.height = 18;
                row.getCell(1).font = { color: { argb: 'FF6B7280' }, size: 10 };
                row.getCell(2).font = { color: { argb: 'FF6B7280' }, size: 10 };
                row.getCell(3).font = { bold: false, size: 10 };
                row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

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

                const startCol = 4 + startMonth;
                const endCol = 4 + endMonth;
                if (endCol > startCol) ws.mergeCells(row.number, startCol, row.number, endCol);

                const barCell = row.getCell(startCol);
                const owner = (task.assignees || []).length > 0 ? ` — ${task.assignees.join(', ')}` : '';
                barCell.value = endCol > startCol ? `${task.title || ''}${owner}` : '■';
                barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(statusColor(task.status)) } };
                barCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
                barCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                const border = { style: 'thin', color: { argb: 'FF000000' } };
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

export async function buildKanbanWorkbook(categories, actions, tasks) {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Marketing Dashboard';
    const ws = wb.addWorksheet('Kanban', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    const sortedCats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const columns = sortedCats.map(cat => {
        const catActions = actions.filter(a => a.categoryId === cat.id);
        const catTasks = tasks
            .filter(t => catActions.some(a => a.id === t.actionId))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return { cat, tasks: catTasks };
    });

    const maxRows = Math.max(...columns.map(c => c.tasks.length), 0);

    const headerRow = ws.addRow(columns.map(c => c.cat.name));
    headerRow.eachCell((cell, colIdx) => {
        const cat = columns[colIdx - 1].cat;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(cat.color) } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    headerRow.height = 28;

    columns.forEach((_, ci) => { ws.getColumn(ci + 1).width = 30; });

    for (let r = 0; r < maxRows; r++) {
        const row = ws.addRow(columns.map(col => {
            const task = col.tasks[r];
            if (!task) return '';
            const p = task.priority ? `\n[${priorityName(task.priority)}]` : '';
            return `${task.title || ''}${p}`;
        }));
        row.height = 34;
        row.eachCell((cell, colIdx) => {
            const task = columns[colIdx - 1].tasks[r];
            if (!task) return;
            cell.border = {
                left: { style: 'thick', color: { argb: toARGB(statusColor(task.status)) } },
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
            cell.font = { size: 10, color: { argb: 'FF111827' } };
        });
    }

    return wb;
}

export async function exportKanbanXlsx(categories, actions, tasks, boardName) {
    const wb = await buildKanbanWorkbook(categories, actions, tasks);
    await downloadExcelJs(wb, `kanban-${boardName || 'export'}-${new Date().toISOString().split('T')[0]}.xlsx`);
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
