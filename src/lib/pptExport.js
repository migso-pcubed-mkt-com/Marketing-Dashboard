import { CONFIG } from '../config.js';

// 16:9 widescreen in inches — PowerPoint's canonical widescreen size.
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.3;

// ─────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────

const toHex = (c) => (c || '').replace('#', '').toUpperCase() || '94A3B8';

const statusColor = (statusId) => {
    const s = CONFIG.STATUSES.find(st => st.id === statusId);
    return s?.color || '#94A3B8';
};

// Lighten a hex colour by mixing it with white. t=1 → pure white.
const lighten = (hex, t = 0.7) => {
    const h = toHex(hex);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lr = Math.round(r + (255 - r) * t);
    const lg = Math.round(g + (255 - g) * t);
    const lb = Math.round(b + (255 - b) * t);
    return [lr, lg, lb].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
};

// Luminance-based contrast picker: dark text on light fills, white on dark.
const contrastText = (hex) => {
    const h = toHex(hex);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '1F2937' : 'FFFFFF';
};

// ─────────────────────────────────────────────
// Date helpers (reused from Excel timeline logic)
// ─────────────────────────────────────────────

const clampToYear = (iso, year, fallback) => {
    if (!iso) return fallback;
    const d = new Date(iso);
    if (d.getFullYear() < year) return new Date(year, 0, 1);
    if (d.getFullYear() > year) return new Date(year, 11, 31);
    return d;
};

// Convert a date to a horizontal position inside a 12-month grid [0..1].
// Month index + day fraction of month → continuous 0..12.
const dateToGridUnit = (date, year) => {
    const m = date.getMonth();
    const dim = new Date(year, m + 1, 0).getDate();
    return m + (date.getDate() - 1) / dim;
};

// ─────────────────────────────────────────────
// Row planning for Timeline
// ─────────────────────────────────────────────

const sortByOrder = (arr) => arr.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

function buildTimelineRows(categories, actions, tasks) {
    const rows = [];
    const catsSorted = sortByOrder(categories);
    for (const cat of catsSorted) {
        const catActions = sortByOrder(actions.filter(a => a.categoryId === cat.id));
        if (catActions.length === 0) continue;
        rows.push({ type: 'category', category: cat });

        const allDefault = catActions.every(a => a.isDefault);
        if (allDefault) {
            // card-as-task: tasks appear directly under the category banner.
            const catTasks = sortByOrder(tasks.filter(t => catActions.some(a => a.id === t.actionId)));
            catTasks.forEach(task => rows.push({ type: 'task', task, category: cat }));
        } else {
            for (const action of catActions) {
                const actTasks = sortByOrder(tasks.filter(t => t.actionId === action.id));
                if (action.isDefault) {
                    actTasks.forEach(task => rows.push({ type: 'task', task, category: cat }));
                } else {
                    rows.push({ type: 'action', action, category: cat });
                    actTasks.forEach(task => rows.push({ type: 'task', task, category: cat, indentAction: true }));
                }
            }
        }
    }
    return rows;
}

// ─────────────────────────────────────────────
// Timeline PPT — one slide with 12 months + label column
// ─────────────────────────────────────────────

export async function exportTimelinePPT(categories, actions, tasks, year, boardName) {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5
    pptx.title = `Timeline — ${boardName || 'Board'} — ${year}`;

    const slide = pptx.addSlide();

    // Title
    slide.addText(`Timeline — ${boardName || 'Board'} — ${year}`, {
        x: MARGIN, y: 0.1, w: SLIDE_W - 2 * MARGIN, h: 0.35,
        fontSize: 16, bold: true, color: '111827', fontFace: 'Calibri'
    });

    const gridTop = 0.55;
    const gridBottom = SLIDE_H - MARGIN;
    const gridLeft = MARGIN;
    const gridRight = SLIDE_W - MARGIN;
    const labelW = 2.0;
    const monthW = (gridRight - gridLeft - labelW) / 12;
    const tableW = gridRight - gridLeft;

    // Plan data rows first so we can size the table to fit exactly.
    const rows = buildTimelineRows(categories, actions, tasks);
    if (rows.length === 0) {
        slide.addText('No data to display', {
            x: gridLeft, y: gridTop + 0.2, w: tableW, h: 0.3,
            fontSize: 11, color: '6B7280', align: 'center', italic: true
        });
        return pptx.writeFile({ fileName: `timeline-${sanitize(boardName)}-${year}.pptx` });
    }

    const headerH = 0.32;
    const availableH = gridBottom - gridTop - headerH;
    const rowH = Math.max(0.14, Math.min(0.32, availableH / rows.length));
    const fontSize = Math.min(10, Math.max(6, rowH * 28));

    // Build the table rows. Single source of truth — no manual shape-per-cell.
    const colW = [labelW, ...Array(12).fill(monthW)];
    const borderThin = { type: 'solid', color: 'E5E7EB', pt: 0.5 };
    const headerCellOpts = { bold: true, color: 'FFFFFF', fill: { color: '1F2937' }, valign: 'middle', fontSize: 10, fontFace: 'Calibri', border: borderThin };
    const monthHeaderOpts = { bold: true, color: '374151', fill: { color: 'F3F4F6' }, valign: 'middle', align: 'center', fontSize: 10, fontFace: 'Calibri', border: borderThin };

    const tableRows = [];
    tableRows.push([
        { text: 'Actions', options: { ...headerCellOpts, align: 'left' } },
        ...CONFIG.MONTHS.map(m => ({ text: m, options: monthHeaderOpts }))
    ]);

    // Remember each data row's index so we can compute its Y when overlaying bars.
    const dataRowYOffsets = []; // absolute Y of the top of each data row (index matches rows[])
    let cursorY = gridTop + headerH;

    for (const row of rows) {
        dataRowYOffsets.push(cursorY);
        if (row.type === 'category') {
            const color = toHex(row.category.color);
            const catOpts = {
                bold: true,
                color: contrastText(color),
                fill: { color },
                valign: 'middle',
                align: 'left',
                fontSize,
                fontFace: 'Calibri',
                border: { type: 'solid', color: 'FFFFFF', pt: 0.5 },
                colspan: 13
            };
            tableRows.push([{ text: row.category.name.toUpperCase(), options: catOpts }]);
        } else if (row.type === 'action') {
            const actionCell = { text: row.action.name, options: { bold: true, color: '1F2937', fill: { color: 'F9FAFB' }, valign: 'middle', align: 'left', fontSize, fontFace: 'Calibri', border: borderThin, margin: 0.05 } };
            const emptyMonth = { text: '', options: { fill: { color: 'F9FAFB' }, border: borderThin } };
            tableRows.push([actionCell, ...Array(12).fill(emptyMonth)]);
        } else {
            // task row: empty grid cells — the bar shape is drawn on top afterwards.
            const labelCell = { text: row.task.startDate && row.task.dueDate ? '' : (row.indentAction ? `  ${row.task.title}` : row.task.title),
                options: { fill: { color: 'FFFFFF' }, valign: 'middle', align: 'left', fontSize: Math.min(fontSize, 8), color: '6B7280', fontFace: 'Calibri', italic: !row.task.startDate, border: borderThin, margin: 0.05 } };
            const emptyCell = { text: '', options: { fill: { color: 'FFFFFF' }, border: { type: 'solid', color: 'F3F4F6', pt: 0.3 } } };
            tableRows.push([labelCell, ...Array(12).fill(emptyCell)]);
        }
        cursorY += rowH;
    }

    slide.addTable(tableRows, {
        x: gridLeft,
        y: gridTop,
        w: tableW,
        colW,
        rowH: [headerH, ...Array(rows.length).fill(rowH)],
        fontFace: 'Calibri',
        fontSize,
        border: borderThin
    });

    // Overlay task bars as native roundRect shapes on top of the table — same
    // editable primitive as before, but with far fewer shapes (1 per task vs
    // 13 rects + text per task in the previous implementation).
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.type !== 'task') continue;
        const task = row.task;
        if (!task.startDate || !task.dueDate) continue;
        const start = clampToYear(task.startDate, year, null);
        const end = clampToYear(task.dueDate, year, null);
        if (!start || !end) continue;

        const u1 = dateToGridUnit(start, year);
        const endPlus = new Date(end);
        endPlus.setDate(endPlus.getDate() + 1);
        const u2 = Math.min(12, dateToGridUnit(endPlus, year));
        if (u2 <= u1) continue;

        const barX = gridLeft + labelW + u1 * monthW + 0.02;
        const barW = Math.max(0.15, (u2 - u1) * monthW - 0.04);
        const rowY = dataRowYOffsets[i];
        const barY = rowY + rowH * 0.15;
        const barH = rowH * 0.7;
        const isDone = task.status === 'completed';
        const baseColor = toHex(statusColor(task.status));
        const fillColor = isDone ? lighten(baseColor, 0.55) : baseColor;
        const titleText = row.indentAction ? `  ${task.title}` : task.title;

        // pptxgenjs renders shape + text as a single primitive when you call
        // addText(text, { shape, ...fillOpts }) — `addShape` does NOT honour a
        // `text:` option (that was the v3 regression). One unified object also
        // means the user can click and edit the bar in PowerPoint as a single
        // textbox-shape, not two overlapping primitives.
        slide.addText(titleText, {
            shape: pptx.ShapeType.roundRect,
            x: barX, y: barY, w: barW, h: barH,
            fill: { color: fillColor },
            line: { color: fillColor, width: 0.5 },
            rectRadius: 0.04,
            color: '000000',
            fontFace: 'Calibri',
            fontSize: Math.min(9, Math.max(6, barH * 30)),
            align: 'left', valign: 'middle',
            wrap: false,
            strike: isDone,
            margin: 0.04
        });
    }

    return pptx.writeFile({ fileName: `timeline-${sanitize(boardName)}-${year}.pptx` });
}

// ─────────────────────────────────────────────
// Kanban PPT — columns × cards grid, by category
// ─────────────────────────────────────────────

const MAX_COLS_PER_SLIDE = 6;

function buildKanbanColumns(categories, actions, tasks) {
    // Card-as-action per-category detection, same rule as the Excel export.
    return sortByOrder(categories).map(cat => {
        const catActions = sortByOrder(actions.filter(a => a.categoryId === cat.id));
        const hasCA = catActions.some(a => !a.isDefault);
        if (hasCA) {
            // Build per-action items (each with its linked tasks as a sub-list).
            const items = [];
            for (const action of catActions) {
                const actTasks = sortByOrder(tasks.filter(t => t.actionId === action.id));
                if (action.isDefault) {
                    actTasks.forEach(task => items.push({ kind: 'task', task }));
                } else {
                    items.push({ kind: 'action', action, tasks: actTasks });
                }
            }
            return { label: cat.name, color: cat.color, items };
        }
        const catTasks = sortByOrder(tasks.filter(t => catActions.some(a => a.id === t.actionId)));
        return { label: cat.name, color: cat.color, items: catTasks.map(task => ({ kind: 'task', task })) };
    }).filter(col => col.items.length > 0 || true); // keep empty columns for structure parity
}

export async function exportKanbanPPT(categories, actions, tasks, boardName) {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = `Kanban — ${boardName || 'Board'}`;

    const columns = buildKanbanColumns(categories, actions, tasks);
    if (columns.length === 0) {
        const slide = pptx.addSlide();
        slide.addText('No data to display', {
            x: MARGIN, y: SLIDE_H / 2 - 0.2, w: SLIDE_W - 2 * MARGIN, h: 0.4,
            fontSize: 14, italic: true, color: '6B7280', align: 'center'
        });
        return pptx.writeFile({ fileName: `kanban-${sanitize(boardName)}.pptx` });
    }

    // Split into slides if there are more columns than MAX_COLS_PER_SLIDE.
    const slideCount = Math.ceil(columns.length / MAX_COLS_PER_SLIDE);
    for (let s = 0; s < slideCount; s++) {
        const slideCols = columns.slice(s * MAX_COLS_PER_SLIDE, (s + 1) * MAX_COLS_PER_SLIDE);
        renderKanbanSlide(pptx, slideCols, boardName, s + 1, slideCount);
    }

    return pptx.writeFile({ fileName: `kanban-${sanitize(boardName)}.pptx` });
}

function renderKanbanSlide(pptx, columns, boardName, pageNum, totalPages) {
    const slide = pptx.addSlide();

    const titleText = totalPages > 1
        ? `Kanban — ${boardName || 'Board'} (${pageNum}/${totalPages})`
        : `Kanban — ${boardName || 'Board'}`;
    slide.addText(titleText, {
        x: MARGIN, y: 0.1, w: SLIDE_W - 2 * MARGIN, h: 0.35,
        fontSize: 16, bold: true, color: '111827', fontFace: 'Calibri'
    });

    const gridTop = 0.55;
    const gridBottom = SLIDE_H - MARGIN;
    const gridLeft = MARGIN;
    const gridRight = SLIDE_W - MARGIN;
    const colGap = 0.1;
    const colW = (gridRight - gridLeft - colGap * (columns.length - 1)) / columns.length;

    const headerH = 0.4;

    columns.forEach((col, ci) => {
        const x = gridLeft + ci * (colW + colGap);
        const headerColor = toHex(col.color);

        // Column header (colored banner)
        slide.addShape(pptx.ShapeType.roundRect, {
            x, y: gridTop, w: colW, h: headerH,
            fill: { color: headerColor },
            line: { color: headerColor, width: 0 },
            rectRadius: 0.05
        });
        slide.addText(`${col.label}  (${col.items.length})`, {
            x: x + 0.08, y: gridTop, w: colW - 0.16, h: headerH,
            fontSize: 11, bold: true, color: contrastText(headerColor),
            fontFace: 'Calibri', valign: 'middle', align: 'left'
        });

        // Cards
        const listTop = gridTop + headerH + 0.08;
        const listH = gridBottom - listTop;
        if (col.items.length === 0) return;
        const cardGap = 0.06;
        const cardH = Math.max(0.35, Math.min(0.8, (listH - cardGap * (col.items.length - 1)) / col.items.length));

        let y = listTop;
        for (const item of col.items) {
            if (y + cardH > gridBottom) break; // clip overflow
            if (item.kind === 'action') {
                renderActionCard(pptx, slide, item.action, item.tasks, x, y, colW, cardH);
            } else {
                renderTaskCard(pptx, slide, item.task, x, y, colW, cardH);
            }
            y += cardH + cardGap;
        }
    });
}

function renderTaskCard(pptx, slide, task, x, y, w, h) {
    const isDone = task.status === 'completed';
    const baseColor = toHex(statusColor(task.status));
    const stripeColor = baseColor;
    const bgColor = isDone ? lighten(baseColor, 0.85) : 'FFFFFF';

    // Card background
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h,
        fill: { color: bgColor },
        line: { color: 'E5E7EB', width: 0.5 },
        rectRadius: 0.04
    });
    // Left status stripe
    slide.addShape(pptx.ShapeType.rect, {
        x, y, w: 0.08, h,
        fill: { color: stripeColor },
        line: { color: stripeColor, width: 0 }
    });

    const padL = 0.15;
    const padR = 0.1;
    const titleH = Math.min(h * 0.6, 0.35);
    slide.addText(task.title || '(untitled)', {
        x: x + padL, y: y + 0.02, w: w - padL - padR, h: titleH,
        fontSize: Math.min(10, Math.max(7, h * 16)),
        bold: true, color: isDone ? '6B7280' : '111827',
        strike: isDone, fontFace: 'Calibri', valign: 'top', align: 'left'
    });

    if (h > 0.4) {
        const dateStr = [task.startDate, task.dueDate].filter(Boolean).join(' → ');
        const footerY = y + h - 0.2;
        if (dateStr) {
            slide.addText(dateStr, {
                x: x + padL, y: footerY, w: (w - padL - padR) * 0.7, h: 0.18,
                fontSize: 7, color: '6B7280', fontFace: 'Calibri', valign: 'middle', align: 'left'
            });
        }
        if (task.budget > 0) {
            slide.addText(`${(task.budget / 1000).toFixed(0)}k€`, {
                x: x + padL + (w - padL - padR) * 0.7, y: footerY,
                w: (w - padL - padR) * 0.3, h: 0.18,
                fontSize: 7, bold: true, color: '374151', fontFace: 'Calibri',
                valign: 'middle', align: 'right'
            });
        }
    }
}

function renderActionCard(pptx, slide, action, tasks, x, y, w, h) {
    // Action grouping card mirrors the Excel `buildActionCell` output:
    //   <Action name>            ← bold (+ strike if action.status === completed)
    //   ▸ Checklist 1
    //     · Task A                ← strike if task.status === completed
    //     · Task B
    //   ▸ Checklist 2
    //     · Task C
    // Tasks without a trelloChecklistName fall under a synthetic "(Tasks)" group
    // so card-as-action and the plain-action paths render identically.
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h,
        fill: { color: 'F9FAFB' },
        line: { color: 'E5E7EB', width: 0.5 },
        rectRadius: 0.04
    });
    const padL = 0.1;
    const padR = 0.1;
    const footerH = 0.18;
    const actionDone = action.status === 'completed';
    const groups = new Map();
    const groupOrder = [];
    for (const t of tasks) {
        const key = t.trelloChecklistName || '(Tasks)';
        if (!groups.has(key)) { groups.set(key, []); groupOrder.push(key); }
        groups.get(key).push(t);
    }

    // Build a single richText sequence — action name first, then each group with
    // its tasks. The whole block lives in one addText call so it fits inside the
    // card with consistent line spacing.
    const segments = [];
    segments.push({
        text: action.name || '(action)',
        options: { fontSize: 10, bold: true, strike: actionDone, color: '111827', fontFace: 'Calibri' }
    });
    for (const name of groupOrder) {
        const items = groups.get(name).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        segments.push({ text: `\n▸ ${name}`, options: { fontSize: 8, color: '374151', fontFace: 'Calibri' } });
        for (const t of items) {
            const done = t.status === 'completed';
            segments.push({
                text: `\n  · ${t.title || ''}`,
                options: { fontSize: 7, color: done ? '9CA3AF' : '374151', strike: done, fontFace: 'Calibri' }
            });
        }
    }

    const listTop = y + 0.06;
    const listBottom = y + h - footerH - 0.04;
    const listH = Math.max(0.18, listBottom - listTop);
    slide.addText(segments, {
        x: x + padL, y: listTop, w: w - padL - padR, h: listH,
        valign: 'top', align: 'left', margin: 0,
        fit: 'shrink' // pptxgenjs auto-shrinks text to fit when needed
    });

    if (tasks.length > 0) {
        const done = tasks.filter(t => t.status === 'completed').length;
        slide.addText(`${done}/${tasks.length} tasks`, {
            x: x + padL, y: y + h - footerH - 0.02, w: w - padL - padR, h: footerH,
            fontSize: 7, color: '6B7280', fontFace: 'Calibri', valign: 'middle', align: 'left', bold: true
        });
    }
}

// ─────────────────────────────────────────────
// Filename sanitisation — keep OS-safe characters only.
// ─────────────────────────────────────────────

function sanitize(name) {
    return String(name || 'export').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}
