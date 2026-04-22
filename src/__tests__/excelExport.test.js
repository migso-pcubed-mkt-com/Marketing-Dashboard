import { describe, it, expect } from 'vitest';
import { buildKanbanWorkbook, buildTimelineWorkbook } from '../lib/excelExport.js';

// Board layout: Brand is card-as-action (mixes default + non-default), Conversion is card-as-task (all default).
const categories = [
    { id: 'c1', name: 'Brand', color: '#6366f1', order: 0 },
    { id: 'c2', name: 'Conversion', color: '#22c55e', order: 1 }
];

const actions = [
    { id: 'a1', name: 'Default Brand', categoryId: 'c1', isDefault: true, order: 0, status: 'todo' },
    { id: 'a2', name: 'Linkedin Ads', categoryId: 'c1', isDefault: false, order: 1, status: 'inprogress' },
    { id: 'a3', name: 'Default Conversion', categoryId: 'c2', isDefault: true, order: 0, status: 'todo' }
];

const tasks = [
    { id: 't1', actionId: 'a1', title: 'Campaign A', status: 'inprogress', priority: 'high', startDate: '2026-02-01', dueDate: '2026-04-30', order: 0 },
    { id: 't2', actionId: 'a2', title: 'LinkedIn Q2', status: 'todo', priority: 'medium', trelloChecklistName: 'Design', startDate: '2026-05-01', dueDate: '2026-06-30', order: 0 },
    { id: 't3', actionId: 'a3', title: 'Landing Page', status: 'completed', priority: 'low', startDate: '2026-01-10', dueDate: '2026-01-20', order: 0 }
];

// Simpler board where every category is card-as-task — used by tests that need raw per-task rendering.
const taskModeActions = [
    { id: 'a1', name: 'Default Brand', categoryId: 'c1', isDefault: true, order: 0, status: 'todo' },
    { id: 'a3', name: 'Default Conversion', categoryId: 'c2', isDefault: true, order: 0, status: 'todo' }
];
const taskModeTasks = [
    { id: 't1', actionId: 'a1', title: 'Campaign A', status: 'inprogress', priority: 'high', startDate: '2026-02-01', dueDate: '2026-04-30', order: 0 },
    { id: 't3', actionId: 'a3', title: 'Landing Page', status: 'completed', priority: 'low', startDate: '2026-01-10', dueDate: '2026-01-20', order: 0 }
];

describe('buildKanbanWorkbook — category view', () => {
    it('creates one column per category with a header row styled by category color', async () => {
        const wb = await buildKanbanWorkbook(categories, taskModeActions, taskModeTasks);
        const ws = wb.getWorksheet('Kanban');
        expect(ws).toBeDefined();

        const headerRow = ws.getRow(1);
        expect(headerRow.getCell(1).value).toBe('Brand');
        expect(headerRow.getCell(2).value).toBe('Conversion');
        expect(headerRow.getCell(1).fill.fgColor.argb).toBe('FF6366F1');
        expect(headerRow.getCell(2).fill.fgColor.argb).toBe('FF22C55E');
    });

    it('renders task-level cells in card-as-task categories', async () => {
        const wb = await buildKanbanWorkbook(categories, taskModeActions, taskModeTasks);
        const ws = wb.getWorksheet('Kanban');

        const r2 = ws.getRow(2);
        expect(String(r2.getCell(1).value)).toContain('Campaign A');
        expect(String(r2.getCell(2).value)).toContain('Landing Page');
        // Status-colored left border (inprogress=#3b82f6, completed=#22c55e)
        expect(r2.getCell(1).border.left.color.argb).toBe('FF3B82F6');
        expect(r2.getCell(2).border.left.color.argb).toBe('FF22C55E');
    });

    it('renders action-centric cells in card-as-action categories with checklist/task breakdown', async () => {
        const wb = await buildKanbanWorkbook(categories, actions, tasks);
        const ws = wb.getWorksheet('Kanban');

        // Brand is card-as-action (has a non-default action). Its column collects actions, not tasks.
        // First Brand cell = the default action (named 'Default Brand') with its task inline.
        const r2 = ws.getRow(2);
        const brandCell = String(r2.getCell(1).value);
        expect(brandCell).toContain('Default Brand');
        expect(brandCell).toContain('Campaign A');

        // Second Brand cell = the Linkedin Ads action with its own task under the "Design" checklist.
        const r3 = ws.getRow(3);
        const linkedinCell = String(r3.getCell(1).value);
        expect(linkedinCell).toContain('Linkedin Ads');
        expect(linkedinCell).toContain('Design');
        expect(linkedinCell).toContain('LinkedIn Q2');
    });
});

describe('buildTimelineWorkbook', () => {
    it('renders a single label column plus 12 month columns with Jan…Dec headers', async () => {
        const wb = await buildTimelineWorkbook(categories, actions, tasks, 2026);
        const ws = wb.getWorksheet('Timeline');
        expect(ws).toBeDefined();

        const hdr = ws.getRow(1);
        // Col A = empty label header, cols B..M = months
        expect(hdr.getCell(1).value).toBe('');
        expect(hdr.getCell(2).value).toBe('Jan');
        expect(hdr.getCell(13).value).toBe('Dec');
    });

    it('writes a full-width category band with the category color in col A', async () => {
        const wb = await buildTimelineWorkbook(categories, actions, tasks, 2026);
        const ws = wb.getWorksheet('Timeline');

        // Row 2 = first category band (Brand)
        const r2 = ws.getRow(2);
        expect(r2.getCell(1).value).toBe('Brand');
        expect(r2.getCell(1).fill.fgColor.argb).toBe('FF6366F1');
    });

    it('writes task titles inside the Gantt bar cells under the active months (not in col A)', async () => {
        const wb = await buildTimelineWorkbook(categories, actions, tasks, 2026);
        const ws = wb.getWorksheet('Timeline');

        // Find the row whose bar cells collectively contain "Campaign A".
        // Campaign A spans Feb..Apr → startCol 3 (B=Jan=col 2, Feb=col 3).
        let campaignRow = null;
        ws.eachRow(row => {
            for (let c = 2; c <= 13; c++) {
                if (String(row.getCell(c).value || '').includes('Campaign A')) {
                    campaignRow = row;
                    break;
                }
            }
        });
        expect(campaignRow).not.toBeNull();

        // Col A of the task row must be empty — the title lives in the Gantt bar.
        expect(campaignRow.getCell(1).value || '').toBe('');

        // Bar fill at Feb (col 3) is the inprogress color.
        const barCell = campaignRow.getCell(3);
        expect(String(barCell.value)).toBe('Campaign A');
        expect(barCell.fill.fgColor.argb).toBe('FF3B82F6');
    });

    it('skips the action sub-header row for default (card-as-task) actions', async () => {
        const wb = await buildTimelineWorkbook(categories, taskModeActions, taskModeTasks, 2026);
        const ws = wb.getWorksheet('Timeline');

        // With all-default actions, no row should carry an action label (no '  ' prefixed names).
        let foundActionRow = false;
        ws.eachRow(row => {
            const v = String(row.getCell(1).value || '');
            if (/^ {2}\S/.test(v)) foundActionRow = true;
        });
        expect(foundActionRow).toBe(false);
    });
});

describe('buildKanbanWorkbook — alternative views', () => {
    const monthTasks = [
        { id: 't1', actionId: 'a1', title: 'January task',  status: 'todo',        startDate: '2026-01-05', dueDate: '2026-01-10', order: 0 },
        { id: 't2', actionId: 'a1', title: 'April task',    status: 'inprogress',  startDate: '2026-04-01', dueDate: '2026-04-20', order: 1 },
        { id: 't3', actionId: 'a1', title: 'July task',     status: 'completed',   startDate: '2026-07-01', dueDate: '2026-07-15', order: 2 }
    ];

    it('renders 12 month columns when view="month"', async () => {
        const wb = await buildKanbanWorkbook(categories, actions, monthTasks, 'month');
        const ws = wb.getWorksheet('Kanban');
        const hdr = ws.getRow(1);
        expect(hdr.getCell(1).value).toBe('January');
        expect(hdr.getCell(12).value).toBe('December');
    });

    it('renders 4 quarter columns when view="quarter"', async () => {
        const wb = await buildKanbanWorkbook(categories, actions, monthTasks, 'quarter');
        const ws = wb.getWorksheet('Kanban');
        const hdr = ws.getRow(1);
        expect(hdr.getCell(1).value).toBe('Q1');
        expect(hdr.getCell(2).value).toBe('Q2');
        expect(hdr.getCell(3).value).toBe('Q3');
        expect(hdr.getCell(4).value).toBe('Q4');
    });

    it('renders 6 status columns in CONFIG.STATUSES order when view="status"', async () => {
        const statusTasks = [
            { id: 't1', actionId: 'a1', title: 'A', status: 'todo',       order: 0 },
            { id: 't2', actionId: 'a1', title: 'B', status: 'inprogress', order: 0 },
            { id: 't3', actionId: 'a1', title: 'C', status: 'completed',  order: 0 },
            { id: 't4', actionId: 'a1', title: 'D', status: 'paused',     order: 0 }
        ];
        const wb = await buildKanbanWorkbook(categories, actions, statusTasks, 'status');
        const ws = wb.getWorksheet('Kanban');
        const hdr = ws.getRow(1);
        expect(hdr.getCell(1).value).toBe('To Do');
        expect(hdr.getCell(2).value).toBe('Creating');
        expect(hdr.getCell(3).value).toBe('In Progress');
        expect(hdr.getCell(4).value).toBe('In Review');
        expect(hdr.getCell(5).value).toBe('Completed');
        expect(hdr.getCell(6).value).toBe('Paused');
    });

    it('groups tasks by country when view="country"', async () => {
        const countryTasks = [
            { id: 't1', actionId: 'a1', title: 'FR campaign', status: 'todo', countries: ['france'], order: 0 },
            { id: 't2', actionId: 'a1', title: 'US launch', status: 'todo', countries: ['usa'], order: 0 },
            { id: 't3', actionId: 'a1', title: 'No country', status: 'todo', countries: [], order: 0 }
        ];
        const wb = await buildKanbanWorkbook(categories, actions, countryTasks, 'country');
        const ws = wb.getWorksheet('Kanban');
        const hdr = ws.getRow(1);
        const labels = [];
        hdr.eachCell(cell => labels.push(String(cell.value)));
        expect(labels).toContain('France');
        expect(labels.some(l => /united states|usa/i.test(l))).toBe(true);
        expect(labels).toContain('No country');
    });
});
