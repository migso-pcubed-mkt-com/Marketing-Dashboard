import { describe, it, expect, vi, beforeEach } from 'vitest';

// pptxgenjs writes to DOM (saveAs) — we intercept that in the test so the
// builder runs end-to-end but without triggering an actual download. This
// guards the happy-path + empty-data path against crashes.

class FakePptx {
    constructor() {
        this.slides = [];
        this.layout = null;
        this.title = null;
    }
    get ShapeType() { return new Proxy({}, { get: (_, k) => k }); }
    addSlide() {
        const s = { shapes: [], texts: [] };
        s.addShape = (...args) => s.shapes.push(args);
        s.addText = (...args) => s.texts.push(args);
        this.slides.push(s);
        return s;
    }
    async writeFile({ fileName }) { this.lastFileName = fileName; return fileName; }
}

vi.mock('pptxgenjs', () => ({ default: FakePptx }));

const makeSampleBoard = () => ({
    categories: [
        { id: 'cat1', name: 'Brand Awareness', color: '#6366f1', order: 0 },
        { id: 'cat2', name: 'Conversion', color: '#22c55e', order: 1 }
    ],
    actions: [
        { id: 'act1', name: 'Default', categoryId: 'cat1', isDefault: true, order: 0 },
        { id: 'act2', name: 'Linkedin Ads', categoryId: 'cat2', isDefault: false, order: 0 }
    ],
    tasks: [
        { id: 't1', actionId: 'act1', title: 'Task A', status: 'inprogress', startDate: '2026-01-10', dueDate: '2026-02-15', order: 0 },
        { id: 't2', actionId: 'act1', title: 'Task B', status: 'completed', startDate: '2026-03-01', dueDate: '2026-03-20', order: 1, budget: 2000 },
        { id: 't3', actionId: 'act2', title: 'LinkedIn Q2 Campaign', status: 'todo', startDate: '2026-04-01', dueDate: '2026-06-30', order: 0 }
    ]
});

describe('exportTimelinePPT', () => {
    beforeEach(() => { vi.resetModules(); });

    it('produces a single slide for the full year', async () => {
        const { exportTimelinePPT } = await import('../lib/pptExport.js');
        const { categories, actions, tasks } = makeSampleBoard();
        // Capture the instance used inside the function via a one-shot factory.
        let instance;
        const { default: Real } = await import('pptxgenjs');
        const Captured = class extends Real { constructor() { super(); instance = this; } };
        vi.doMock('pptxgenjs', () => ({ default: Captured }));
        const m = await import('../lib/pptExport.js');
        await m.exportTimelinePPT(categories, actions, tasks, 2026, 'Demo Board');
        expect(instance).toBeDefined();
        expect(instance.slides.length).toBe(1);
    });

    it('handles empty data gracefully (no crash, produces one "no data" slide)', async () => {
        let instance;
        const { default: Real } = await import('pptxgenjs');
        const Captured = class extends Real { constructor() { super(); instance = this; } };
        vi.doMock('pptxgenjs', () => ({ default: Captured }));
        const m = await import('../lib/pptExport.js');
        await m.exportTimelinePPT([], [], [], 2026, 'Empty');
        expect(instance.slides.length).toBe(1);
    });
});

describe('exportKanbanPPT', () => {
    beforeEach(() => { vi.resetModules(); });

    it('fits sparse data on a single slide', async () => {
        let instance;
        const { default: Real } = await import('pptxgenjs');
        const Captured = class extends Real { constructor() { super(); instance = this; } };
        vi.doMock('pptxgenjs', () => ({ default: Captured }));
        const m = await import('../lib/pptExport.js');
        const { categories, actions, tasks } = makeSampleBoard();
        await m.exportKanbanPPT(categories, actions, tasks, 'Demo');
        expect(instance.slides.length).toBe(1);
    });

    it('splits into multiple slides when there are more than 6 category columns', async () => {
        let instance;
        const { default: Real } = await import('pptxgenjs');
        const Captured = class extends Real { constructor() { super(); instance = this; } };
        vi.doMock('pptxgenjs', () => ({ default: Captured }));
        const m = await import('../lib/pptExport.js');
        const categories = Array.from({ length: 9 }, (_, i) => ({
            id: `c${i}`, name: `Cat ${i}`, color: '#6366f1', order: i
        }));
        const actions = categories.map((c, i) => ({
            id: `a${i}`, name: `Act ${i}`, categoryId: c.id, isDefault: true, order: 0
        }));
        const tasks = actions.map((a, i) => ({
            id: `t${i}`, actionId: a.id, title: `T ${i}`, status: 'todo', order: 0
        }));
        await m.exportKanbanPPT(categories, actions, tasks, 'Wide');
        expect(instance.slides.length).toBe(2); // ceil(9/6) = 2
    });
});
