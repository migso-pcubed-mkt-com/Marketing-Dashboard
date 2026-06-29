import { useState, useRef, useMemo } from 'react';

const DEFAULT_FILTERS = { search: '', status: [], category: [], priority: [], channel: [], country: [], otherLabel: [], member: [], board: [], showArchived: false };

export function useFilters(tasks, actions) {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [showFilterSidebar, setShowFilterSidebar] = useState(false);
    const searchInputRef = useRef(null);

    // Archive filtering (previously in App.jsx as separate useMemos)
    const visibleTasks = useMemo(() => {
        if (filters.showArchived) return tasks;
        return tasks.filter(t => !t.trelloArchived);
    }, [tasks, filters.showArchived]);

    const visibleActions = useMemo(() => {
        if (filters.showArchived) return actions;
        return actions.filter(a => !a.trelloArchived);
    }, [actions, filters.showArchived]);

    const activeFilterCount = [filters.status, filters.category, filters.priority, filters.channel, filters.country, filters.otherLabel, filters.member, filters.board].reduce((c, arr) => c + (Array.isArray(arr) ? arr.length : 0), 0) + (filters.search ? 1 : 0) + (filters.showArchived ? 1 : 0);

    const filteredTasks = useMemo(() => {
        if (!activeFilterCount) return visibleTasks;
        return visibleTasks.filter(t => {
            const act = actions.find(a => a.id === t.actionId);
            // Match the parent action name too, so the toolbar count agrees with the Kanban
            // (which surfaces actions whose name matches the search) (M24).
            if (filters.search) { const q = filters.search.toLowerCase(); if (!t.title.toLowerCase().includes(q) && !(act?.name || '').toLowerCase().includes(q)) return false; }
            if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
            if (filters.category.length > 0 && !filters.category.includes(act?.categoryId)) return false;
            if (filters.priority.length > 0 && !filters.priority.includes(t.priority)) return false;
            if (filters.channel?.length > 0 && !(t.channels || []).some(c => filters.channel.includes(c))) return false;
            if (filters.country?.length > 0 && !(t.countries || []).some(c => filters.country.includes(c))) return false;
            if (filters.otherLabel?.length > 0 && !(t.otherLabels || []).some(l => filters.otherLabel.includes(l.id))) return false;
            if (filters.member?.length > 0 && !(t.assignees || []).some(m => filters.member.includes(m))) return false;
            return true;
        });
    }, [visibleTasks, actions, filters, activeFilterCount]);

    const filteredBudget = filteredTasks.reduce((s, t) => s + (t.budget || 0), 0);
    const isFiltered = activeFilterCount > 0;

    return {
        filters,
        setFilters,
        showFilterSidebar,
        setShowFilterSidebar,
        searchInputRef,
        visibleTasks,
        visibleActions,
        activeFilterCount,
        filteredTasks,
        filteredBudget,
        isFiltered,
    };
}
