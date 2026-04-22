import { describe, it, expect } from 'vitest';
import { analyzeGridRows, autoAssignLevels, buildGridHierarchy, parseGrid, detectFormat } from '../lib/excelMapping.js';

/**
 * Helpers for building test sheets. Columns: 0..n = label columns, then month columns.
 * `merges` follows the xlsx shape: { s: {r,c}, e: {r,c} }.
 */

const monthHeader = ['Category', '', '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

describe('detectFormat', () => {
    it('detects grid format with month headers', () => {
        const data = [monthHeader, ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']];
        expect(detectFormat(data)).toBe('grid');
    });

    it('falls back to list when no month header', () => {
        const data = [['Title', 'Owner'], ['Task 1', 'Alice']];
        expect(detectFormat(data)).toBe('list');
    });
});

describe('analyzeGridRows', () => {
    it('returns null when no month header is present', () => {
        const data = [['Title', 'Owner'], ['Task 1', 'Alice']];
        expect(analyzeGridRows(data, [])).toBeNull();
    });

    it('tags rows with month content as having hasMonthContent=true', () => {
        const data = [
            monthHeader,
            ['Brand Awareness', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Campaign A', '', 'x', 'x', 'x', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        expect(analysis).not.toBeNull();
        expect(analysis.rows.length).toBe(2);
        const [superLike, task] = analysis.rows;
        expect(superLike.hasMonthContent).toBe(false);
        expect(task.hasMonthContent).toBe(true);
        expect(task.startMonthCol.month).toBe(0);
        expect(task.endMonthCol.month).toBe(2);
    });

    it('detects country labels case-insensitively and with French aliases', () => {
        const data = [
            monthHeader,
            ['France', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['Royaume-Uni', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['SPAIN', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['États-Unis', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const countryIds = analysis.rows.map(r => r.countryId);
        expect(countryIds).toEqual(['france', 'uk', 'spain', 'usa']);
    });

    it('captures a wide horizontal merge as wideMerge=true', () => {
        const data = [
            monthHeader,
            ['Corporate / Global', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
        ];
        const merges = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 14 } }];
        const analysis = analyzeGridRows(data, merges);
        expect(analysis.rows[0].wideMerge).toBe(true);
        expect(analysis.rows[0].mergeSpan).toBe(15);
    });

    it('flags colored month cells as task signal even without text', () => {
        const data = [
            monthHeader,
            ['Campaign X', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
        ];
        // Row 1: fill Feb (col 4) + Mar (col 5) in red, no text.
        const cellColors = [
            [],
            [null, null, null, null, 'FFEF4444', 'FFEF4444', null, null, null, null, null, null, null, null, null]
        ];
        const analysis = analyzeGridRows(data, [], cellColors);
        expect(analysis.rows[0].hasMonthColor).toBe(true);
        expect(analysis.rows[0].hasMonthSignal).toBe(true);
        expect(analysis.rows[0].startMonthCol.month).toBe(1); // Feb
        expect(analysis.rows[0].endMonthCol.month).toBe(2);   // Mar
    });

    it('ignores white/transparent/black fills as non-meaningful', () => {
        const data = [
            monthHeader,
            ['Placeholder', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
        ];
        const cellColors = [
            [],
            [null, null, null, 'FFFFFFFF', '00000000', 'FF000000', null, null, null, null, null, null, null, null, null]
        ];
        const analysis = analyzeGridRows(data, [], cellColors);
        expect(analysis.rows[0].hasMonthColor).toBe(false);
        expect(analysis.rows[0].hasMonthSignal).toBe(false);
    });
});

describe('autoAssignLevels', () => {
    it('infers task for rows with month content', () => {
        const data = [
            monthHeader,
            ['Brand Awareness', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Campaign A', '', 'x', 'x', 'x', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        expect(leveled.map(r => r.level)).toEqual(['category', 'task']);
    });

    it('assigns super/category/action when three header depths exist', () => {
        const data = [
            monthHeader,
            ['France', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Internal Coms', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', 'Newsletter', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', '', 'x', '', '', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        expect(leveled.map(r => r.level)).toEqual(['super', 'category', 'action', 'task']);
        expect(leveled[0].countryId).toBe('france');
    });
});

describe('autoAssignLevels — extra heuristics', () => {
    it('uses month-content as the only discriminator when all header rows share a single depth', () => {
        const data = [
            monthHeader,
            ['Brand Awareness', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['Conversion',      '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['Retention',       '', '', 'x', 'x', '', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        expect(leveled.map(r => r.level)).toEqual(['category', 'category', 'task']);
    });

    it('does not promote a lone country row to super when no deeper headers exist', () => {
        const data = [
            monthHeader,
            ['France',       '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['Spain',        '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['Launch event', '', '', 'x', '', '', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        // Only one header depth → even country rows stay categories so tasks have a parent.
        expect(leveled.map(r => r.level)).toEqual(['category', 'category', 'task']);
    });
});

describe('autoAssignLevels — flat-category pattern', () => {
    it('tags rows whose own label + distinct month-cell texts as flat-category', () => {
        const data = [
            monthHeader,
            // "FR Marketing Campaign" is the category; each month cell is a task title of its own.
            ['FR Marketing Campaign', '', '', 'Webinar: data', '', 'Webinar: project', '', '', '', '', '', '', '', '', '']
        ];
        const leveled = autoAssignLevels(analyzeGridRows(data, []));
        expect(leveled.map(r => r.level)).toEqual(['flat-category']);
    });

    it('keeps uniform markers (e.g. all "x") as a single task spanning the months', () => {
        const data = [
            monthHeader,
            // Same label + repeated 'x' markers → one multi-month task, not several distinct ones.
            ['Campaign A', '', '', 'x', 'x', 'x', '', '', '', '', '', '', '', '', '']
        ];
        const leveled = autoAssignLevels(analyzeGridRows(data, []));
        expect(leveled.map(r => r.level)).toEqual(['task']);
    });

    it('marks rows whose label came only from a vertical merge as ignore', () => {
        const data = [
            monthHeader,
            ['Section Header', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
        ];
        // A vertical merge spanning rows 1..2 leaks "Section Header" into row 2, which
        // has no real data of its own. Expect row 2 → ignore (skipped on build).
        const merges = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
        // Create the second, empty row explicitly so the merge has something to project onto.
        data.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        const leveled = autoAssignLevels(analyzeGridRows(data, merges));
        const secondRow = leveled.find(r => r.rowIdx === 2);
        expect(secondRow.level).toBe('ignore');
    });
});

describe('buildGridHierarchy — flat-category', () => {
    it('emits one task per month signal when a row is flat-category', () => {
        const data = [
            monthHeader,
            ['FR Marketing Campaign', '', '', 'Webinar: data', '', 'Webinar: project', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        const result = buildGridHierarchy(data, analysis, leveled);
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].name).toBe('FR Marketing Campaign');
        expect(result.tasks).toHaveLength(2);
        const titles = result.tasks.map(t => t.title).sort();
        expect(titles).toEqual(['Webinar: data', 'Webinar: project']);
        // Task months map onto their source columns. monthHeader starts at col 3 so
        // col 3 = Jan (month 0) and col 5 = Mar (month 2).
        const months = result.tasks.map(t => t.month).sort();
        expect(months).toEqual([0, 2]);
    });
});

describe('buildGridHierarchy', () => {
    it('propagates country tag to descendant tasks when super-category is a country', () => {
        const data = [
            monthHeader,
            ['France', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Internal Coms', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', 'Newsletter', 'x', 'x', '', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        const result = buildGridHierarchy(data, analysis, leveled);
        expect(result).not.toBeNull();
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].name).toBe('Internal Coms'); // country supers don't prefix
        expect(result.actions.length).toBeGreaterThan(0);
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].countries).toContain('france');
    });

    it('prefixes non-country super names into child category names by default', () => {
        const data = [
            monthHeader,
            ['Corporate', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Marketing', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', 'Plan launch', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', '', 'x', '', '', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        const result = buildGridHierarchy(data, analysis, leveled);
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].name).toBe('Corporate - Marketing');
    });

    it('splits super into its own category when flattenSuper is true', () => {
        const data = [
            monthHeader,
            ['Corporate', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Marketing', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', 'Plan launch', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', '', 'x', '', '', '', '', '', '', '', '', '', '', '']
        ];
        const analysis = analyzeGridRows(data, []);
        const leveled = autoAssignLevels(analysis);
        const result = buildGridHierarchy(data, analysis, leveled, { flattenSuper: true });
        const names = result.categories.map(c => c.name);
        expect(names).toContain('Corporate');
        expect(names).toContain('Marketing');
    });
});

describe('parseGrid (end-to-end default)', () => {
    it('produces a valid hierarchy from a simple single-level sheet', () => {
        const data = [
            monthHeader,
            ['Brand Awareness', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['', 'Campaign A', '', 'x', 'x', 'x', '', '', '', '', '', '', '', '', '']
        ];
        const result = parseGrid(data, []);
        expect(result).not.toBeNull();
        expect(result.categories.length).toBe(1);
        expect(result.categories[0].name).toBe('Brand Awareness');
        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].startDate).toBe(`${new Date().getFullYear()}-01-01`);
    });
});
