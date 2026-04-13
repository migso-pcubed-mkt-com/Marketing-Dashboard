import * as XLSX from 'xlsx';
import { CONFIG } from '../config.js';

/**
 * Hex color (#RRGGBB) → XLSX fill object (ARGB without #)
 */
const hexToFill = (hex) => {
    const argb = 'FF' + (hex || '#cccccc').replace('#', '');
    return { fgColor: { rgb: argb } };
};

const statusName = (id) => CONFIG.STATUSES.find(s => s.id === id)?.name || id || '';
const statusColor = (id) => CONFIG.STATUSES.find(s => s.id === id)?.color || '#94a3b8';
const priorityName = (id) => CONFIG.PRIORITIES.find(p => p.id === id)?.name || id || '';

/**
 * Apply basic column widths to a worksheet.
 */
const autoWidth = (ws, data) => {
    if (!data || data.length === 0) return;
    ws['!cols'] = data[0].map((_, colIdx) => {
        let max = 10;
        data.forEach(row => {
            const val = row[colIdx];
            if (val != null) {
                const len = String(val).length;
                if (len > max) max = len;
            }
        });
        return { wch: Math.min(max + 2, 40) };
    });
};

/**
 * Download a workbook as .xlsx file
 */
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
// EXPORT TIMELINE
// ─────────────────────────────────────────────

export function exportTimelineXlsx(categories, actions, tasks, year, boardName) {
    const wb = XLSX.utils.book_new();
    const months = CONFIG.MONTHS;

    // Build header row
    const header = ['Category', 'Action', 'Task', 'Status', 'Priority', 'Owner', 'Start', 'End', ...months];
    const rows = [header];

    // Sort categories
    const sortedCats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    sortedCats.forEach(cat => {
        const catActions = actions.filter(a => a.categoryId === cat.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        catActions.forEach(action => {
            const actionTasks = tasks.filter(t => t.actionId === action.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (actionTasks.length === 0) {
                // Action with no tasks — still show it
                const row = [cat.name, action.isDefault ? '' : action.name, '', '', '', '', '', '', ...Array(12).fill('')];
                rows.push(row);
            }
            actionTasks.forEach(task => {
                const members = (task.assignees || []).join(', ');
                const row = [
                    cat.name,
                    action.isDefault ? '' : action.name,
                    task.title || '',
                    statusName(task.status),
                    priorityName(task.priority),
                    members,
                    task.startDate || '',
                    task.dueDate || '',
                ];
                // Fill month columns with markers based on date range
                for (let m = 0; m < 12; m++) {
                    const monthStart = new Date(year, m, 1);
                    const monthEnd = new Date(year, m + 1, 0);
                    const tStart = task.startDate ? new Date(task.startDate) : null;
                    const tEnd = task.dueDate ? new Date(task.dueDate) : null;

                    if (tStart && tEnd && tStart <= monthEnd && tEnd >= monthStart) {
                        row.push('■');  // Task spans this month
                    } else {
                        row.push('');
                    }
                }
                rows.push(row);
            });
        });
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    autoWidth(ws, rows);

    // Make month columns narrower
    if (ws['!cols']) {
        for (let i = 8; i < 20; i++) {
            ws['!cols'][i] = { wch: 5 };
        }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Timeline');
    downloadWorkbook(wb, `timeline-${boardName || 'export'}-${year}.xlsx`);
}

// ─────────────────────────────────────────────
// EXPORT KANBAN
// ─────────────────────────────────────────────

export function exportKanbanXlsx(categories, actions, tasks, boardName) {
    const wb = XLSX.utils.book_new();

    const sortedCats = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Find max tasks per column to determine row count
    const columns = sortedCats.map(cat => {
        const catActions = actions.filter(a => a.categoryId === cat.id);
        const catTasks = tasks.filter(t => catActions.some(a => a.id === t.actionId))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return {
            name: cat.name,
            tasks: catTasks
        };
    });

    const maxRows = Math.max(...columns.map(c => c.tasks.length), 0);

    // Build grid: headers + data rows
    const header = columns.map(c => c.name);
    const rows = [header];

    for (let r = 0; r < maxRows; r++) {
        const row = columns.map(col => {
            const task = col.tasks[r];
            if (!task) return '';
            const status = statusName(task.status);
            const priority = priorityName(task.priority);
            return `${task.title}${status ? ' [' + status + ']' : ''}${priority ? ' (' + priority + ')' : ''}`;
        });
        rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    autoWidth(ws, rows);

    XLSX.utils.book_append_sheet(wb, ws, 'Kanban');
    downloadWorkbook(wb, `kanban-${boardName || 'export'}-${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ─────────────────────────────────────────────
// EXPORT CALENDAR
// ─────────────────────────────────────────────

export function exportCalendarXlsx(tasks, year, boardName) {
    const wb = XLSX.utils.book_new();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let month = 0; month < 12; month++) {
        const monthName = CONFIG.MONTHS_FULL[month] || CONFIG.MONTHS[month];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0).getDate();

        // ISO weekday: Mon=0 ... Sun=6
        let startDow = firstDay.getDay() - 1;
        if (startDow < 0) startDow = 6;

        // Build calendar grid
        const rows = [[`${monthName} ${year}`, '', '', '', '', '', ''], dayNames];

        let week = Array(7).fill('');
        let dayNum = 1;

        // Fill first week
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

        // Fill remaining weeks
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

        // Set column widths
        ws['!cols'] = dayNames.map(() => ({ wch: 18 }));

        // Merge month title across all columns
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

        // Sanitize sheet name (max 31 chars, no special chars)
        const sheetName = monthName.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    downloadWorkbook(wb, `calendar-${boardName || 'export'}-${year}.xlsx`);
}
