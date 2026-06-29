// @vitest-environment jsdom
//
// Integration smoke tests: render each top-level view with realistic seed data and
// assert it mounts without throwing and shows the expected content. This locks in the
// class of regression that only live browser recettage caught before (e.g. the
// DashboardView renderCategoryBar map-arity crash, KanbanView grouping crashes) —
// a unit test on a pure helper would have missed it because the bug only appears when
// the real component renders the real data shape.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render as rtlRender, cleanup } from '@testing-library/react';
import { BoardContext, FilterContext } from '../context.js';
import KanbanView from '../components/KanbanView.jsx';
import TimelineView from '../components/TimelineView.jsx';
import CalendarView from '../components/CalendarView.jsx';
import DashboardView from '../components/DashboardView.jsx';

// Views render TaskCard/ActionCard which read effectiveMembers via useBoard(); the real
// app always provides these contexts. Wrap every render so the views mount as they do live.
const boardCtx = { effectiveMembers: [], isReadOnly: false, allCountries: ['world', 'france', 'germany'], trelloUser: null };
const render = (ui) => rtlRender(
    <BoardContext.Provider value={boardCtx}>
        <FilterContext.Provider value={{ filters: {}, setFilters: () => {} }}>{ui}</FilterContext.Provider>
    </BoardContext.Provider>
);

// ── jsdom polyfills the views rely on ──
beforeAll(() => {
    if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    if (!global.IntersectionObserver) global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

// ── Realistic seed: card-as-action category + card-as-task category, mixed statuses ──
const YEAR = 2026;
const iso = (m, d) => `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const now = `${YEAR}-03-01T00:00:00.000Z`;

const makeSeed = () => {
    const categories = [
        { id: 'c1', name: 'Brand', color: '#6366f1', order: 0, updatedAt: now },
        { id: 'c2', name: 'Digital', color: '#10b981', order: 1, updatedAt: now },
    ];
    const actions = [
        // card-as-action style: non-default actions under c1
        { id: 'a1', name: 'Google Ads - Brand', categoryId: 'c1', isDefault: false, budget: 12000, priority: 'high', status: 'active', tags: ['paid'], countries: ['france'], order: 0, startDate: iso(1, 1), dueDate: iso(4, 30), updatedAt: now },
        { id: 'a2', name: 'Press Relations', categoryId: 'c1', isDefault: false, budget: 5000, priority: 'medium', status: 'active', tags: ['pr'], countries: ['germany'], order: 1, startDate: iso(2, 1), dueDate: iso(6, 30), updatedAt: now },
        // card-as-task style: default action under c2
        { id: 'a3', name: 'Digital', categoryId: 'c2', isDefault: true, budget: 0, priority: 'medium', status: 'active', tags: [], order: 0, updatedAt: now },
    ];
    const tasks = [
        { id: 't1', actionId: 'a1', title: 'Launch campaign', status: 'completed', priority: 'high', month: 0, startDate: iso(1, 5), dueDate: iso(1, 20), budget: 3000, channels: ['social'], countries: ['france'], checklist: [], comments: [], attachments: [], order: 0, trelloChecklistName: 'Tasks', updatedAt: now },
        { id: 't2', actionId: 'a1', title: 'Optimize keywords', status: 'inprogress', priority: 'medium', month: 2, startDate: iso(3, 1), dueDate: iso(3, 28), budget: 1500, channels: ['seo'], countries: ['france'], checklist: [], comments: [], attachments: [], order: 1, trelloChecklistName: 'Tasks', updatedAt: now },
        { id: 't3', actionId: 'a2', title: 'Draft press kit', status: 'todo', priority: 'low', month: 4, startDate: iso(5, 1), dueDate: iso(5, 15), budget: 800, channels: ['pr'], countries: ['germany'], checklist: [], comments: [], attachments: [], order: 0, trelloChecklistName: 'Tasks', updatedAt: now },
        { id: 't4', actionId: 'a3', title: 'Website refresh', status: 'paused', priority: 'medium', month: 6, startDate: iso(7, 1), dueDate: iso(7, 31), budget: 2000, channels: ['web'], countries: ['world'], checklist: [], comments: [], attachments: [], order: 0, updatedAt: now },
        // an overdue task (dueDate in the past relative to a fixed "today")
        { id: 't5', actionId: 'a3', title: 'SEO audit', status: 'todo', priority: 'high', month: 1, startDate: iso(2, 1), dueDate: iso(2, 10), budget: 500, channels: ['seo'], countries: ['world'], checklist: [], comments: [], attachments: [], order: 1, updatedAt: now },
    ];
    return { categories, actions, tasks };
};

const defaultFilters = { search: '', status: [], category: [], priority: [], channel: [], country: [], otherLabel: [], member: [], showArchived: false };
const noop = () => {};
const handlers = {
    onOpenTask: noop, onOpenAction: noop, onUpdateTask: noop, onUpdateAction: noop, onBatchUpdateTasks: noop,
    onAddTask: noop, onAddAction: noop, onMoveTask: noop, onReorderTask: noop, onMoveAction: noop, onReorderAction: noop,
    onReorderCategories: noop, onReorderCountryColumns: noop, onRequestNewTask: noop, onUpdateCategory: noop,
    onAddCategory: noop, onDeleteCategory: noop, onYearChange: noop, setFilters: noop,
};

describe('view integration smoke tests', () => {
    it('KanbanView renders categories and tasks without crashing', () => {
        const { categories, actions, tasks } = makeSeed();
        const ref = { current: false };
        const { container, getByText } = render(
            <KanbanView
                categories={categories} actions={actions} tasks={tasks}
                {...handlers}
                filters={defaultFilters} allCountries={['world', 'france', 'germany']}
                selectedYear={YEAR} isReadOnly={false} isCardAsTask={false}
                isUserInteractingRef={ref} boardGroups={null}
            />
        );
        expect(container).toBeTruthy();
        expect(getByText('Brand')).toBeTruthy();
        expect(getByText('Digital')).toBeTruthy();
    });

    it('TimelineView renders without crashing', () => {
        const { categories, actions, tasks } = makeSeed();
        const ref = { current: false };
        const { container } = render(
            <TimelineView
                categories={categories} actions={actions} tasks={tasks}
                {...handlers}
                filters={defaultFilters} selectedYear={YEAR} isReadOnly={false}
                isCardAsTask={false} isUserInteractingRef={ref} boardGroups={null}
            />
        );
        expect(container.querySelector('*')).toBeTruthy();
    });

    it('CalendarView renders without crashing', () => {
        const { categories, actions, tasks } = makeSeed();
        const { container } = render(
            <CalendarView
                categories={categories} actions={actions} tasks={tasks}
                onOpenTask={noop} onUpdateTask={noop} onAddTask={noop}
                filters={defaultFilters} selectedYear={YEAR} onYearChange={noop}
                isReadOnly={false} boardGroups={null}
            />
        );
        expect(container.querySelector('*')).toBeTruthy();
    });

    it('DashboardView renders KPIs and per-category bars without crashing (map-arity regression guard)', () => {
        const { categories, actions, tasks } = makeSeed();
        const { container, getByText } = render(
            <DashboardView categories={categories} actions={actions} tasks={tasks} members={[]} boardGroups={null} />
        );
        expect(container).toBeTruthy();
        // category bars render the category names
        expect(getByText('Brand')).toBeTruthy();
        expect(getByText('Digital')).toBeTruthy();
    });

    it('DashboardView renders in combined (boardGroups) mode without crashing', () => {
        const { categories, actions, tasks } = makeSeed();
        const boardGroups = [
            { boardId: 'b1', boardName: 'Board One', boardColor: '#6366f1', categories, actions, tasks },
        ];
        const { container } = render(
            <DashboardView categories={categories} actions={actions} tasks={tasks} members={[]} boardGroups={boardGroups} />
        );
        expect(container.querySelector('*')).toBeTruthy();
    });

    it('all views tolerate an empty board (no categories/actions/tasks)', () => {
        const ref = { current: false };
        expect(() => render(<DashboardView categories={[]} actions={[]} tasks={[]} members={[]} boardGroups={null} />)).not.toThrow();
        cleanup();
        expect(() => render(<KanbanView categories={[]} actions={[]} tasks={[]} {...handlers} filters={defaultFilters} allCountries={[]} selectedYear={YEAR} isReadOnly={false} isCardAsTask={false} isUserInteractingRef={ref} boardGroups={null} />)).not.toThrow();
        cleanup();
        expect(() => render(<CalendarView categories={[]} actions={[]} tasks={[]} onOpenTask={noop} onUpdateTask={noop} onAddTask={noop} filters={defaultFilters} selectedYear={YEAR} onYearChange={noop} isReadOnly={false} boardGroups={null} />)).not.toThrow();
        cleanup();
        expect(() => render(<TimelineView categories={[]} actions={[]} tasks={[]} {...handlers} filters={defaultFilters} selectedYear={YEAR} isReadOnly={false} isCardAsTask={false} isUserInteractingRef={ref} boardGroups={null} />)).not.toThrow();
    });
});
