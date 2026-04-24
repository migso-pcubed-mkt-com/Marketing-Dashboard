import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    parseWorkbook,
    detectMonthHeader,
    analyzeSheet,
    analyzeWorkbook,
    buildBoard,
    buildBoardFromList,
    detectColumnMappings
} from '../lib/excelMapping.js';

// ─── detectMonthHeader ────────────────────────────────────

describe('detectMonthHeader', () => {
    it('returns null when no month row is present', () => {
        const data = [['A', 'B', 'C'], ['x', 'y', 'z']];
        expect(detectMonthHeader(data)).toBe(null);
    });

    it('finds an EN month header on row 0', () => {
        const data = [['Actions', 'Jan', 'Feb', 'Mar', 'Apr', 'May']];
        const h = detectMonthHeader(data);
        expect(h).not.toBe(null);
        expect(h.rowIdx).toBe(0);
        expect(Object.keys(h.monthCols).length).toBe(5);
        expect(h.monthCols[0]).toBe(1);
    });

    it('finds a FR month header further down (skips title rows)', () => {
        const data = [
            ['Marketing Plan 2026'], [''],
            ['Project', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin']
        ];
        const h = detectMonthHeader(data);
        expect(h.rowIdx).toBe(2);
        expect(Object.keys(h.monthCols).length).toBe(6);
    });

    it('only counts each month once even with duplicate headers', () => {
        const data = [['', 'Jan', 'Jan again', 'Feb', 'Mar']];
        const h = detectMonthHeader(data);
        expect(Object.keys(h.monthCols).length).toBe(3);
    });
});

// ─── analyzeSheet — synthetic cases ───────────────────────

describe('analyzeSheet', () => {
    it('classifies a category-only row as category', () => {
        const sheet = {
            data: [
                ['Actions', 'Jan', 'Feb', 'Mar'],
                ['Brand Awareness', '', '', ''],
                ['Linkedin Ads', '3000', '3000', '3000']
            ],
            merges: [], cellColors: []
        };
        const a = analyzeSheet(sheet);
        expect(a.kind).toBe('grid');
        expect(a.rows).toHaveLength(2);
        expect(a.rows[0].suggested).toBe('category');
        expect(a.rows[1].suggested).toBe('action');
        expect(a.rows[1].monthSignals).toHaveLength(3);
        expect(a.rows[1].monthSignals[0].isNumeric).toBe(true);
    });

    it('classifies an empty row as empty (skipped)', () => {
        const sheet = {
            data: [
                ['Actions', 'Jan', 'Feb'],
                ['', '', ''],
                ['Real Action', 'Task A', 'Task B']
            ],
            merges: [], cellColors: []
        };
        const a = analyzeSheet(sheet);
        expect(a.rows[0].suggested).toBe('empty');
        expect(a.rows[1].suggested).toBe('action');
    });

    it('handles horizontal merges by extending the month signal endMonthIdx', () => {
        const sheet = {
            data: [
                ['Actions', 'Jan', 'Feb', 'Mar'],
                ['Quarterly Plan', 'Q1 launch', '', '']
            ],
            merges: [{ s: { r: 1, c: 1 }, e: { r: 1, c: 3 } }],
            cellColors: []
        };
        const a = analyzeSheet(sheet);
        expect(a.rows[0].monthSignals).toHaveLength(1);
        expect(a.rows[0].monthSignals[0].monthIdx).toBe(0);
        expect(a.rows[0].monthSignals[0].endMonthIdx).toBe(2);
    });

    it('skips vertical merge fragments so later rows do not duplicate the value', () => {
        const sheet = {
            data: [
                ['Actions', 'Jan', 'Feb'],
                ['First', 'Spans both', ''],
                ['Second', '', '']
            ],
            merges: [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }],
            cellColors: []
        };
        const a = analyzeSheet(sheet);
        expect(a.rows[0].monthSignals).toHaveLength(1);
        expect(a.rows[1].monthSignals).toHaveLength(0);
        expect(a.rows[1].suggested).toBe('category');
    });
});

// ─── buildBoard — synthetic cases ─────────────────────────

describe('buildBoard', () => {
    const buildSyntheticSheet = () => ({
        name: 'Plan',
        data: [
            ['Actions', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            ['Brand Awareness', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['Linkedin Ads', '3000', '3000', '3000', '', '', '', '', '', '', '', '', ''],
            ['Press Relations', '', '', 'Article #1', '', '', 'Article #2', '', '', '', '', '', ''],
            ['Engagement', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['Webinars', 'Webinar Q1', '', '', 'Webinar Q2', '', '', 'Webinar Q3', '', '', 'Webinar Q4', '', '']
        ],
        merges: [], cellColors: []
    });

    it('builds the full hierarchy from a clean grid', () => {
        const sheet = buildSyntheticSheet();
        const a = analyzeSheet(sheet);
        const board = buildBoard(sheet, a, { year: 2026 });
        expect(board.categories.map(c => c.name)).toEqual(['Brand Awareness', 'Engagement']);
        expect(board.actions.map(a => a.name)).toEqual(['Linkedin Ads', 'Press Relations', 'Webinars']);
        expect(board.tasks).toHaveLength(3 + 2 + 4);
    });

    it('numeric cells become budget tasks named by row + month', () => {
        const sheet = buildSyntheticSheet();
        const board = buildBoard(sheet, analyzeSheet(sheet), { year: 2026 });
        const lkdTasks = board.tasks.filter(t => t.actionId === board.actions.find(a => a.name === 'Linkedin Ads').id);
        expect(lkdTasks).toHaveLength(3);
        expect(lkdTasks[0].title).toMatch(/Linkedin Ads.*Jan/);
        expect(lkdTasks[0].budget).toBe(3000);
    });

    it('text cells become titled tasks (cell value is the title)', () => {
        const sheet = buildSyntheticSheet();
        const board = buildBoard(sheet, analyzeSheet(sheet), { year: 2026 });
        const webinarTasks = board.tasks.filter(t => t.actionId === board.actions.find(a => a.name === 'Webinars').id);
        expect(webinarTasks.map(t => t.title)).toEqual(['Webinar Q1', 'Webinar Q2', 'Webinar Q3', 'Webinar Q4']);
        expect(webinarTasks[0].budget).toBe(0);
    });

    it('falls back to a "General" category for actions with no preceding category', () => {
        const sheet = {
            data: [
                ['Actions', 'Jan', 'Feb'],
                ['Standalone Action', 'Task X', '']
            ],
            merges: [], cellColors: []
        };
        const board = buildBoard(sheet, analyzeSheet(sheet), { year: 2026 });
        expect(board.categories).toHaveLength(1);
        expect(board.categories[0].name).toBe('General');
    });

    it('honours user overrides from the review step', () => {
        const sheet = buildSyntheticSheet();
        const a = analyzeSheet(sheet);
        const engagementRowIdx = a.rows.find(r => r.label === 'Engagement').rowIdx;
        const board = buildBoard(sheet, a, { year: 2026, overrides: { [engagementRowIdx]: 'empty' } });
        expect(board.categories.map(c => c.name)).toEqual(['Brand Awareness']);
        const webinars = board.actions.find(a => a.name === 'Webinars');
        expect(webinars.categoryId).toBe(board.categories[0].id);
    });

    it('always gives empty categories a default action so the data model stays consistent', () => {
        const sheet = {
            data: [
                ['Actions', 'Jan', 'Feb'],
                ['Empty Section', '', '']
            ],
            merges: [], cellColors: []
        };
        const board = buildBoard(sheet, analyzeSheet(sheet), { year: 2026 });
        expect(board.categories).toHaveLength(1);
        expect(board.actions).toHaveLength(1);
        expect(board.actions[0].isDefault).toBe(true);
    });
});

// ─── List format ──────────────────────────────────────────

describe('detectColumnMappings + buildBoardFromList', () => {
    it('maps standard task list columns', () => {
        const m = detectColumnMappings(['Title', 'Description', 'Status', 'Due Date', 'Category']);
        expect(m.title).toBe(0);
        expect(m.description).toBe(1);
        expect(m.status).toBe(2);
        expect(m.dueDate).toBe(3);
        expect(m.category).toBe(4);
    });

    it('builds a board from a list-shaped sheet', () => {
        const sheet = {
            name: 'Tasks',
            data: [
                ['Title', 'Status', 'Category'],
                ['Task A', 'In Progress', 'Marketing'],
                ['Task B', 'Done', 'Marketing'],
                ['Task C', 'To Do', 'Sales']
            ],
            merges: [], cellColors: []
        };
        const m = detectColumnMappings(sheet.data[0]);
        const board = buildBoardFromList(sheet, m);
        expect(board.categories.map(c => c.name).sort()).toEqual(['Marketing', 'Sales']);
        expect(board.tasks).toHaveLength(3);
        expect(board.tasks[1].status).toBe('completed');
    });
});

// ─── Reference files (regression guard) ───────────────────

const loadFixture = (name) => readFileSync(resolve(process.cwd(), 'public', name));

describe('reference: 2026 Country Marketing Plan framework.xlsx', () => {
    it('produces one board per sheet, each with > 5 categories and > 20 tasks', async () => {
        const buf = loadFixture('2026 Country Marketing Plan framework.xlsx');
        const wb = await parseWorkbook(buf);
        const analyzed = analyzeWorkbook(wb);
        expect(analyzed.length).toBeGreaterThanOrEqual(2);
        for (const { sheet, analysis, name } of analyzed) {
            const board = buildBoard(sheet, analysis, { year: 2026, boardName: name });
            expect(board.categories.length).toBeGreaterThanOrEqual(3);
            expect(board.actions.length).toBeGreaterThan(8);
            expect(board.tasks.length).toBeGreaterThan(20);
        }
    });

    it('first sheet starts with a Brand-Awareness-ish category', async () => {
        const buf = loadFixture('2026 Country Marketing Plan framework.xlsx');
        const wb = await parseWorkbook(buf);
        const analyzed = analyzeWorkbook(wb);
        const first = analyzed[0];
        const board = buildBoard(first.sheet, first.analysis, { year: 2026 });
        expect(board.categories[0].name.toLowerCase()).toMatch(/brand|content/);
    });

    it('numeric monthly budgets become budget-bearing tasks', async () => {
        const buf = loadFixture('2026 Country Marketing Plan framework.xlsx');
        const wb = await parseWorkbook(buf);
        const analyzed = analyzeWorkbook(wb);
        const first = analyzed[0];
        const board = buildBoard(first.sheet, first.analysis, { year: 2026 });
        const budgetTasks = board.tasks.filter(t => t.budget > 0);
        expect(budgetTasks.length).toBeGreaterThan(5);
    });
});

describe('reference: 2026 MC Strategy Roadmap.xlsx', () => {
    it('detects the single sheet and at least 8 categories', async () => {
        const buf = loadFixture('2026 MC Strategy Roadmap.xlsx');
        const wb = await parseWorkbook(buf);
        const analyzed = analyzeWorkbook(wb);
        expect(analyzed.length).toBe(1);
        const { sheet, analysis } = analyzed[0];
        expect(analysis.kind).toBe('grid');
        const board = buildBoard(sheet, analysis, { year: 2026 });
        expect(board.categories.length).toBeGreaterThanOrEqual(8);
    });

    it('horizontally merged cells become multi-month tasks', async () => {
        const buf = loadFixture('2026 MC Strategy Roadmap.xlsx');
        const wb = await parseWorkbook(buf);
        const { sheet, analysis } = analyzeWorkbook(wb)[0];
        const board = buildBoard(sheet, analysis, { year: 2026 });
        const multiMonth = board.tasks.filter(t => {
            if (!t.startDate || !t.dueDate) return false;
            const start = new Date(t.startDate);
            const end = new Date(t.dueDate);
            return end.getMonth() > start.getMonth();
        });
        expect(multiMonth.length).toBeGreaterThan(0);
    });
});
