import { describe, it, expect } from 'vitest';
import { buildKanbanWorkbook, buildTimelineWorkbook } from '../lib/excelExport.js';

const categories = [
    { id: 'c1', name: 'Brand', color: '#6366f1', order: 0 },
    { id: 'c2', name: 'Conversion', color: '#22c55e', order: 1 }
];

const actions = [
    { id: 'a1', name: 'Default Brand', categoryId: 'c1', isDefault: true, order: 0 },
    { id: 'a2', name: 'Linkedin Ads', categoryId: 'c1', isDefault: false, order: 1 },
    { id: 'a3', name: 'Default Conversion', categoryId: 'c2', isDefault: true, order: 0 }
];

const tasks = [
    { id: 't1', actionId: 'a1', title: 'Campaign A', status: 'inprogress', priority: 'high', startDate: '2026-02-01', dueDate: '2026-04-30', order: 0 },
    { id: 't2', actionId: 'a2', title: 'LinkedIn Q2', status: 'todo', priority: 'medium', startDate: '2026-05-01', dueDate: '2026-06-30', order: 0 },
    { id: 't3', actionId: 'a3', title: 'Landing Page', status: 'completed', priority: 'low', startDate: '2026-01-10', dueDate: '2026-01-20', order: 0 }
];

describe('buildKanbanWorkbook', () => {
    it('creates a worksheet with one column per category and a header row styled with category color', async () => {
        const wb = await buildKanbanWorkbook(categories, actions, tasks);
        const ws = wb.getWorksheet('Kanban');
        expect(ws).toBeDefined();

        const headerRow = ws.getRow(1);
        expect(headerRow.getCell(1).value).toBe('Brand');
        expect(headerRow.getCell(2).value).toBe('Conversion');

        // Fill colors must match category.color (exceljs stores ARGB as uppercase, no '#')
        expect(headerRow.getCell(1).fill.fgColor.argb).toBe('FF6366F1');
        expect(headerRow.getCell(2).fill.fgColor.argb).toBe('FF22C55E');
    });

    it('renders each task in its column and applies a status-colored left border', async () => {
        const wb = await buildKanbanWorkbook(categories, actions, tasks);
        const ws = wb.getWorksheet('Kanban');

        // Row 2 = first task per column
        const r2 = ws.getRow(2);
        expect(String(r2.getCell(1).value)).toContain('Campaign A');
        expect(String(r2.getCell(2).value)).toContain('Landing Page');

        // Status colors: inprogress=#3b82f6, completed=#22c55e
        expect(r2.getCell(1).border.left.color.argb).toBe('FF3B82F6');
        expect(r2.getCell(2).border.left.color.argb).toBe('FF22C55E');
    });
});

describe('buildTimelineWorkbook', () => {
    it('emits a Gantt bar merged across the task month range, colored with status', async () => {
        const wb = await buildTimelineWorkbook(categories, actions, tasks, 2026);
        const ws = wb.getWorksheet('Timeline');
        expect(ws).toBeDefined();

        // Header row
        const hdr = ws.getRow(1);
        expect(hdr.getCell(1).value).toBe('Category');
        expect(hdr.getCell(4).value).toBe('Jan');
        expect(hdr.getCell(15).value).toBe('Dec');

        // Find a row whose col 3 contains "Campaign A" — it should have Feb/Mar/Apr merged with status color
        let campaignRow = null;
        ws.eachRow(row => {
            if (String(row.getCell(3).value || '').includes('Campaign A')) campaignRow = row;
        });
        expect(campaignRow).not.toBeNull();

        // Feb = col 5, Apr = col 7 → startCol 5, endCol 7
        const barCell = campaignRow.getCell(5);
        expect(barCell.fill.fgColor.argb).toBe('FF3B82F6'); // inprogress
    });

    it('writes a category band row filled with the category color, merged across 15 columns', async () => {
        const wb = await buildTimelineWorkbook(categories, actions, tasks, 2026);
        const ws = wb.getWorksheet('Timeline');

        // Row 2 = first category band (Brand)
        const r2 = ws.getRow(2);
        expect(r2.getCell(1).value).toBe('Brand');
        expect(r2.getCell(1).fill.fgColor.argb).toBe('FF6366F1');
    });
});
