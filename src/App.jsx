import { useState, useEffect, useRef, useCallback } from 'react';
import { CONFIG, DEFAULT_ACTIONS, DEFAULT_TASKS, GITHUB_CONFIG } from './config.js';
import { AppContext } from './context.js';
import {
    supabaseClient, isSupabaseConfigured, useSupabase,
    loadFromSupabase, saveToSupabase,
    loadDataFromGitHub, saveToGitHub,
    loadFromLocalStorage as loadFromLocalStorageFn,
    saveToLocalStorage as saveToLocalStorageFn,
    base64EncodeUnicode, base64DecodeUnicode
} from './lib/storage.js';
import Header from './components/Header.jsx';
import { Icon, StatusIcon } from './components/Icons.jsx';
import KanbanView from './components/KanbanView.jsx';
import TimelineView from './components/TimelineView.jsx';
import DashboardView from './components/DashboardView.jsx';
import FilterSidebar from './components/FilterSidebar.jsx';
import TaskDetailModal from './components/TaskDetailModal.jsx';
import ActionDetailModal from './components/ActionDetailModal.jsx';
import CategoriesManagementModal from './components/CategoriesManagementModal.jsx';
import NewActionModal from './components/NewActionModal.jsx';
import NewTaskModal from './components/NewTaskModal.jsx';

const App = () => {
    const darkMode = false;
    const [currentView, setCurrentView] = useState('kanban');
    const [categories, setCategories] = useState(CONFIG.CATEGORIES);
    const [actions, setActions] = useState(DEFAULT_ACTIONS);
    const [tasks, setTasks] = useState(DEFAULT_TASKS);
    const [filters, setFilters] = useState({search:'',status:[],category:[],priority:[],channel:[],country:[]});
    const [syncing, setSyncing] = useState(false);
    const [savingStatus, setSavingStatus] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);
    const [selectedAction, setSelectedAction] = useState(null);
    const [notification, setNotification] = useState(null);
    const [githubToken, setGithubToken] = useState('');
    const [showCategoriesModal, setShowCategoriesModal] = useState(false);
    const [showNewActionModal, setShowNewActionModal] = useState(false);
    const [showNewTaskModal, setShowNewTaskModal] = useState(false);
    const [showCreateDropdown, setShowCreateDropdown] = useState(false);
    const [showExportDropdown, setShowExportDropdown] = useState(false);
    const [showFilterSidebar, setShowFilterSidebar] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [dataLoaded, setDataLoaded] = useState(false);
    const [fileSha, setFileSha] = useState(() => {
        return localStorage.getItem('github_file_sha') || '';
    });
    const [customCountries, setCustomCountries] = useState(() => {
        const saved = localStorage.getItem('customCountries');
        return saved ? JSON.parse(saved) : [];
    });
    const saveQueueRef = useRef([]);
    const isSavingRef = useRef(false);
    const createDropdownRef = useRef(null);
    const exportDropdownRef = useRef(null);
    const categoriesRef = useRef(categories);
    const actionsRef = useRef(actions);
    const tasksRef = useRef(tasks);
    const fileShaRef = useRef(fileSha);
    const isUserInteractingRef = useRef(false);
    const justSavedTimestampRef = useRef(0);

    useEffect(() => {
        if (!showCreateDropdown && !showExportDropdown) return;
        const handler = (e) => {
            if (showCreateDropdown && createDropdownRef.current && !createDropdownRef.current.contains(e.target)) {
                setShowCreateDropdown(false);
            }
            if (showExportDropdown && exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
                setShowExportDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showCreateDropdown, showExportDropdown]);

    useEffect(() => {
        localStorage.setItem('customCountries', JSON.stringify(customCountries));
    }, [customCountries]);

    const allCountries = [...CONFIG.COUNTRIES, ...customCountries];

    const addCustomCountry = (name, flag, color, region) => {
        const newCountry = {
            id: `custom-${Date.now()}`,
            name,
            flag: flag || '🌍',
            color: color || '#6366f1',
            region: region || 'Custom'
        };
        setCustomCountries(prev => [...prev, newCountry]);
        showNotification(`✅ Country "${name}" added`);
        return newCountry.id;
    };

    const autoSaveTimeoutRef = useRef(null);
    const isReceivingRealtimeRef = useRef(false);

    const saveToLocalStorage = () => {
        saveToLocalStorageFn(categoriesRef, actionsRef, tasksRef);
    };

    const saveData = async () => {
        if (useSupabase) {
            const result = await saveToSupabase(categoriesRef, actionsRef, tasksRef, setSyncing, showNotification);
            if (result) saveToLocalStorage();
            return result;
        } else if (githubToken) {
            const result = await saveToGitHub(categoriesRef, actionsRef, tasksRef, fileShaRef, setFileSha, setSyncing, showNotification);
            if (result) saveToLocalStorage();
            return result;
        } else {
            saveToLocalStorage();
            return true;
        }
    };

    useEffect(() => { document.body.className = 'light'; }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'Escape') {
                if (selectedTask) setSelectedTask(null);
                else if (selectedAction) setSelectedAction(null);
                else if (showCategoriesModal) setShowCategoriesModal(false);
                else if (showCreateDropdown) setShowCreateDropdown(false);
                else if (showFilterSidebar) setShowFilterSidebar(false);
                else if (showNewActionModal) setShowNewActionModal(false);
                else if (showNewTaskModal) setShowNewTaskModal(false);
            }
            if (e.key === 'n' && !e.ctrlKey && !e.metaKey) handleCreateNewTask();
            if ((e.key === '1' || e.key === '&') && !e.ctrlKey && !e.metaKey) setCurrentView('kanban');
            if ((e.key === '2' || e.key === 'é') && !e.ctrlKey && !e.metaKey) setCurrentView('timeline');
            if ((e.key === '3' || e.key === '"') && !e.ctrlKey && !e.metaKey) setCurrentView('dashboard');
        };
        document.addEventListener('keydown', handleKeyPress);
        return () => document.removeEventListener('keydown', handleKeyPress);
    }, [selectedTask, selectedAction, showCategoriesModal, showNewActionModal, showNewTaskModal]);

    // Data loading on mount
    useEffect(() => {
        console.log('🚀 Loading data...', useSupabase ? '(Supabase)' : '(GitHub fallback)');
        setGithubToken(useSupabase ? 'supabase' : 'vercel-api');

        const mountTimer = setTimeout(() => {
            console.log('✅ App mounted, activating interface');
            setDataLoaded(true);
        }, 100);

        const timeoutId = setTimeout(() => {
            console.warn('⏱️ Loading timeout, using default data');
            loadFromLocalStorageFn(setCategories, setActions, setTasks, showNotification);
        }, 5000);

        const loadData = async () => {
            try {
                if (useSupabase) {
                    await loadFromSupabase(setCategories, setActions, setTasks, showNotification);
                    saveToLocalStorage();
                } else {
                    await loadDataFromGitHub(setCategories, setActions, setTasks, setFileSha, showNotification, () => loadFromLocalStorageFn(setCategories, setActions, setTasks, showNotification));
                    saveToLocalStorage();
                }
                clearTimeout(timeoutId);
            } catch (err) {
                console.error('Error loading data:', err);
                clearTimeout(timeoutId);
                loadFromLocalStorageFn(setCategories, setActions, setTasks, showNotification);
            }
        };
        loadData();

        return () => { clearTimeout(mountTimer); clearTimeout(timeoutId); };
    }, []);

    useEffect(() => {
        if (fileSha) { localStorage.setItem('github_file_sha', fileSha); }
        else { localStorage.removeItem('github_file_sha'); }
    }, [fileSha]);

    useEffect(() => { categoriesRef.current = categories; }, [categories]);
    useEffect(() => { actionsRef.current = actions; }, [actions]);
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    useEffect(() => { fileShaRef.current = fileSha; }, [fileSha]);

    // Auto-save with debounce
    useEffect(() => {
        if (!dataLoaded || isReceivingRealtimeRef.current) return;
        console.log('🔄 Data modified, auto-save...');
        setSavingStatus('saving');
        if (autoSaveTimeoutRef.current) { clearTimeout(autoSaveTimeoutRef.current); }
        const delay = useSupabase ? 1000 : 2000;
        const doSave = async () => {
            if (isUserInteractingRef.current) {
                console.log('⏳ User interacting, delaying save...');
                autoSaveTimeoutRef.current = setTimeout(doSave, 500);
                return;
            }
            console.log('💾 Auto-save triggered...');
            const success = await saveData();
            setSavingStatus(success ? 'saved' : 'error');
            if (!success) saveToLocalStorage();
            if (success) justSavedTimestampRef.current = Date.now();
            setTimeout(() => setSavingStatus(null), 2000);
        };
        autoSaveTimeoutRef.current = setTimeout(doSave, delay);
        return () => { if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); };
    }, [categories, actions, tasks, dataLoaded, githubToken]);

    // Realtime sync
    useEffect(() => {
        if (!dataLoaded) return;

        if (useSupabase) {
            console.log('🔄 Supabase Realtime subscription enabled');
            const channel = supabaseClient.channel('app_data_changes')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_data', filter: 'id=eq.default' }, (payload) => {
                    if (selectedTask || selectedAction || syncing || savingStatus === 'saving' || isUserInteractingRef.current || Date.now() - justSavedTimestampRef.current < 3000) return;
                    console.log('🔄 Realtime update received from Supabase');
                    isReceivingRealtimeRef.current = true;
                    const d = payload.new;
                    if (d.categories) setCategories(d.categories);
                    if (d.actions) setActions(d.actions);
                    if (d.tasks) setTasks(d.tasks);
                    saveToLocalStorage();
                    showNotification('✅ Synced with team');
                    setTimeout(() => { isReceivingRealtimeRef.current = false; }, 2000);
                })
                .subscribe();
            return () => { supabaseClient.removeChannel(channel); };
        }

        if (githubToken) {
            console.log('🔄 GitHub polling enabled (15s)');
            const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
            const checkForUpdates = async () => {
                if (selectedTask || selectedAction || syncing || savingStatus === 'saving' || isUserInteractingRef.current || Date.now() - justSavedTimestampRef.current < 3000) return;
                try {
                    const url = `${API_BASE_URL}/api/github`;
                    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.sha && fileShaRef.current && data.sha !== fileShaRef.current) {
                            showNotification('🔄 Syncing with team...');
                            await loadDataFromGitHub(setCategories, setActions, setTasks, setFileSha, showNotification, () => loadFromLocalStorageFn(setCategories, setActions, setTasks, showNotification));
                            showNotification('✅ Synced with team');
                        }
                    }
                } catch (e) { console.log('⚠️ Polling error (silent):', e.message); }
            };
            const interval = setInterval(checkForUpdates, 15000);
            return () => clearInterval(interval);
        }
    }, [dataLoaded, githubToken, selectedTask, selectedAction, syncing, savingStatus, fileSha]);

    // Auto-initialize order and createdAt
    useEffect(() => {
        if (!dataLoaded) return;
        const needsOrder = tasks.some(t => t.order === undefined);
        const needsCreatedAt = tasks.some(t => !t.createdAt);
        if (needsOrder || needsCreatedAt) {
            console.log('🔢 Initializing task properties...');
            setTasks(prev => prev.map((t, idx) => ({
                ...t,
                order: t.order !== undefined ? t.order : idx,
                createdAt: t.createdAt || new Date().toISOString()
            })));
        }
    }, [dataLoaded, tasks.length]);

    useEffect(() => {
        if (!dataLoaded) return;
        const needsOrder = actions.some(a => a.order === undefined);
        if (needsOrder) {
            console.log('🔢 Initializing action order...');
            setActions(prev => prev.map((a, idx) => ({...a, order: a.order !== undefined ? a.order : idx})));
        }
    }, [dataLoaded, actions.length]);

    const handleSync = () => saveData();

    const handleUpdateTask = (taskId, updates) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== taskId) return t;
            const newTask = {...t, ...updates};
            if (updates.startDate) {
                const d = new Date(updates.startDate);
                newTask.month = d.getMonth();
            } else if (updates.dueDate) {
                const d = new Date(updates.dueDate);
                newTask.month = d.getMonth();
            }
            return newTask;
        }));
        showNotification('✅ Task updated');
    };

    const handleUpdateAction = (actionId, updates) => {
        setActions(prev => prev.map(a => a.id === actionId ? {...a, ...updates} : a));
        showNotification('✅ Action updated');
    };

    const handleDeleteAction = (actionId) => {
        const action = actions.find(a => a.id === actionId);
        const affectedTasks = tasks.filter(t => t.actionId === actionId).length;
        const confirmMessage = affectedTasks > 0
            ? `Are you sure you want to delete the action "${action?.name}" ?\n\nThis will also delete ${affectedTasks} associated task(s).`
            : `Are you sure you want to delete the action "${action?.name}" ?`;
        if (!confirm(confirmMessage)) return;
        setActions(prev => prev.filter(a => a.id !== actionId));
        setTasks(prev => prev.filter(t => t.actionId !== actionId));
        showNotification('🗑️ Action deleted');
    };

    const handleAddTask = (actionId, customStartDate = null, customDueDate = null) => {
        const action = actions.find(a => a.id === actionId);
        const startDate = customStartDate || new Date().toISOString().split('T')[0];
        const month = new Date(startDate).getMonth();
        let dueDate;
        if (customDueDate) {
            dueDate = customDueDate;
        } else {
            const endOfMonth = new Date(2026, month + 1, 0).getDate();
            dueDate = `2026-${String(month + 1).padStart(2, '0')}-${endOfMonth}`;
        }
        const maxOrder = Math.max(...tasks.map(t => t.order || 0), -1) + 1;
        const now = new Date().toISOString();
        const newTask = { id: `t${Date.now()}`, actionId, month, startDate, title: 'New task', description: '', status: 'todo', priority: 'medium', dueDate, budget: 0, channels: action?.tags || [], checklist: [], comments: [], attachments: [], order: maxOrder, createdAt: now };
        setTasks(prev => [...prev, newTask]);
        setSelectedTask(newTask);
        showNotification('✅ Task created');
    };

    const handleMoveTask = (taskId, direction) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        const sameTasks = tasks.filter(t => {
            if (task.month !== undefined) return t.month === task.month;
            return t.status === task.status;
        }).sort((a, b) => (a.order || 0) - (b.order || 0));
        const currentIndex = sameTasks.findIndex(t => t.id === taskId);
        if (currentIndex === -1) return;
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= sameTasks.length) return;
        const currentOrder = sameTasks[currentIndex].order || currentIndex;
        const targetOrder = sameTasks[targetIndex].order || targetIndex;
        setTasks(prev => prev.map(t => {
            if (t.id === sameTasks[currentIndex].id) return {...t, order: targetOrder};
            if (t.id === sameTasks[targetIndex].id) return {...t, order: currentOrder};
            return t;
        }));
        showNotification(direction === 'up' ? '⬆️ Task moved up' : '⬇️ Task moved down');
    };

    const handleReorderTask = (draggedId, targetId, position) => {
        if (draggedId === targetId) return;
        const draggedTask = tasks.find(t => t.id === draggedId);
        const targetTask = tasks.find(t => t.id === targetId);
        if (!draggedTask || !targetTask) return;
        const isDifferentMonth = (draggedTask.month !== undefined && targetTask.month !== undefined && draggedTask.month !== targetTask.month);
        const isDifferentStatus = (draggedTask.status !== undefined && targetTask.status !== undefined && draggedTask.status !== targetTask.status);
        const isDifferentColumn = isDifferentMonth || isDifferentStatus;
        let updatedDraggedTask = {...draggedTask};
        if (isDifferentColumn) {
            if (isDifferentMonth) {
                updatedDraggedTask.month = targetTask.month;
                const year = targetTask.startDate ? new Date(targetTask.startDate).getFullYear() : 2026;
                const monthIdx = targetTask.month;
                const startDate = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-01';
                const lastDay = new Date(year, monthIdx + 1, 0).getDate();
                const dueDate = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-' + lastDay;
                updatedDraggedTask.startDate = startDate;
                updatedDraggedTask.dueDate = dueDate;
            }
            if (isDifferentStatus) {
                updatedDraggedTask.status = targetTask.status;
            }
        }
        const targetColumnTasks = tasks.filter(t => {
            if (t.id === draggedId) return true;
            if (targetTask.month !== undefined) return t.month === targetTask.month;
            return t.status === targetTask.status;
        }).map(t => t.id === draggedId ? updatedDraggedTask : t).sort((a, b) => (a.order || 0) - (b.order || 0));
        const draggedIndex = targetColumnTasks.findIndex(t => t.id === draggedId);
        const targetIndex = targetColumnTasks.findIndex(t => t.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return;
        const reordered = [...targetColumnTasks];
        const [removed] = reordered.splice(draggedIndex, 1);
        const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
        const adjustedIndex = draggedIndex < targetIndex ? insertIndex - 1 : insertIndex;
        reordered.splice(adjustedIndex, 0, removed);
        const updatedTasks = reordered.map((t, idx) => ({...t, order: idx}));
        setTasks(prev => prev.map(t => {
            const updated = updatedTasks.find(ut => ut.id === t.id);
            return updated || t;
        }));
        showNotification(isDifferentColumn ? '✅ Task moved to new column' : '✅ Task reordered');
    };

    const handleMoveAction = (actionId, direction) => {
        const action = actions.find(a => a.id === actionId);
        if (!action) return;
        const sameActions = actions.filter(a => a.categoryId === action.categoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
        const currentIndex = sameActions.findIndex(a => a.id === actionId);
        if (currentIndex === -1) return;
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= sameActions.length) return;
        const currentOrder = sameActions[currentIndex].order || currentIndex;
        const targetOrder = sameActions[targetIndex].order || targetIndex;
        setActions(prev => prev.map(a => {
            if (a.id === sameActions[currentIndex].id) return {...a, order: targetOrder};
            if (a.id === sameActions[targetIndex].id) return {...a, order: currentOrder};
            return a;
        }));
        showNotification(direction === 'up' ? '⬆️ Action moved up' : '⬇️ Action moved down');
    };

    const handleReorderAction = (draggedId, targetId, position) => {
        if (draggedId === targetId) return;
        const draggedAction = actions.find(a => a.id === draggedId);
        const targetAction = actions.find(a => a.id === targetId);
        if (!draggedAction || !targetAction) return;
        if (draggedAction.categoryId !== targetAction.categoryId) {
            const targetActions = actions.filter(a => a.categoryId === targetAction.categoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
            const targetIndex = targetActions.findIndex(a => a.id === targetId);
            if (targetIndex !== -1) {
                const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
                const oldCategoryActions = actions.filter(a => a.categoryId === draggedAction.categoryId && a.id !== draggedId).sort((a, b) => (a.order || 0) - (b.order || 0));
                const oldUpdates = oldCategoryActions.map((a, idx) => ({...a, order: idx}));
                targetActions.splice(insertIndex, 0, {...draggedAction, categoryId: targetAction.categoryId});
                const newUpdates = targetActions.map((a, idx) => ({...a, order: idx, categoryId: targetAction.categoryId}));
                setActions(prev => prev.map(a => {
                    const updated = [...oldUpdates, ...newUpdates].find(ua => ua.id === a.id);
                    return updated || a;
                }));
                showNotification('✅ Action moved to new category');
            }
        } else {
            const sameActions = actions.filter(a => a.categoryId === draggedAction.categoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
            const draggedIndex = sameActions.findIndex(a => a.id === draggedId);
            const targetIndex = sameActions.findIndex(a => a.id === targetId);
            if (draggedIndex === -1 || targetIndex === -1) return;
            const reordered = [...sameActions];
            const [removed] = reordered.splice(draggedIndex, 1);
            const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
            const adjustedIndex = draggedIndex < targetIndex ? insertIndex - 1 : insertIndex;
            reordered.splice(adjustedIndex, 0, removed);
            const updatedActions = reordered.map((a, idx) => ({...a, order: idx}));
            setActions(prev => prev.map(a => {
                const updated = updatedActions.find(ua => ua.id === a.id);
                return updated || a;
            }));
            showNotification('✅ Action reordered');
        }
    };

    const handleDeleteTask = (taskId) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        showNotification('🗑️ Task deleted');
    };

    const handleCreateNewTask = () => setShowNewTaskModal(true);

    const handleUpdateCategory = (catId, updates) => {
        setCategories(prev => prev.map(c => c.id === catId ? {...c, ...updates} : c));
        showNotification('✅ Category updated');
    };

    const handleAddCategory = (newCat) => {
        setCategories(prev => [...prev, newCat]);
        showNotification('✅ Category created');
    };

    const handleDeleteCategory = (catId) => {
        const category = categories.find(c => c.id === catId);
        const affectedActions = actions.filter(a => a.categoryId === catId).length;
        const confirmMessage = affectedActions > 0
            ? `Are you sure you want to delete the category "${category?.name}" ?\n\nThis will also delete ${affectedActions} associated action(s).`
            : `Are you sure you want to delete the category "${category?.name}" ?`;
        if (!confirm(confirmMessage)) return;
        setCategories(prev => prev.filter(c => c.id !== catId));
        setActions(prev => prev.filter(a => a.categoryId !== catId));
        showNotification('🗑️ Category deleted');
    };

    const handleReorderCategories = (reorderedCategories) => {
        setCategories(reorderedCategories);
        showNotification('✅ Category order updated');
    };

    const handleAddAction = (newAction) => {
        setActions(prev => [...prev, newAction]);
        showNotification('✅ Action created');
    };

    const handleAddNewTask = (newTask) => {
        const maxOrder = Math.max(...tasks.map(t => t.order || 0), -1) + 1;
        const now = new Date().toISOString();
        setTasks(prev => [...prev, {...newTask, order: maxOrder, createdAt: newTask.createdAt || now}]);
        showNotification('✅ Task created');
    };

    const showNotification = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

    const exportToJSON = () => {
        const data = {categories, actions, tasks, exportDate: new Date().toISOString()};
        const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marketing-tracker-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('📥 JSON export downloaded');
    };

    const exportToCSV = () => {
        const headers = ['ID','Title','Action','Category','Status','Priority','Start date','End date','Budget','Channels','Description'];
        const rows = tasks.map(t => {
            const action = actions.find(a => a.id === t.actionId);
            const category = categories.find(c => c.id === action?.categoryId);
            return [
                t.id, t.title, action?.name || '', category?.name || '',
                CONFIG.STATUSES.find(s => s.id === t.status)?.name || t.status,
                CONFIG.PRIORITIES.find(p => p.id === t.priority)?.name || t.priority,
                t.startDate || '', t.dueDate || '', t.budget || 0,
                (t.channels || []).join(';'),
                (t.description || '').replace(/"/g, '""')
            ].map(v => `"${v}"`).join(',');
        });
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marketing-tracker-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('📊 CSV export downloaded');
    };

    const totalBudget = tasks.reduce((s, t) => s + (t.budget || 0), 0);
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const activeFilterCount = [filters.status, filters.category, filters.priority, filters.channel, filters.country].reduce((c, arr) => c + (Array.isArray(arr) ? arr.length : 0), 0) + (filters.search ? 1 : 0);

    if (!dataLoaded) return (<div className="min-h-screen flex items-center justify-center" style={{background:'var(--bg-page)'}}><div className="text-center" style={{color:'var(--text-primary)'}}><div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{borderColor:'var(--accent)',borderTopColor:'transparent'}}/><p>Loading data...</p></div></div>);

    return (
        <AppContext.Provider value={{}}>
            <div className="min-h-screen" style={{background:'var(--bg-page)'}}>
                <Header currentView={currentView} setCurrentView={setCurrentView} onSync={handleSync} syncing={syncing} githubConnected={!!githubToken} savingStatus={savingStatus}/>
                <main style={{maxWidth:1600,margin:'0 auto',padding:'var(--space-4) var(--space-6)'}}>
                    <div className="toolbar">
                        <button className={`filter-btn ${showFilterSidebar ? 'active' : ''}`} onClick={() => setShowFilterSidebar(!showFilterSidebar)}>
                            <Icon.Filter/>Filters
                            {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
                        </button>
                        <div className="stats-pills">
                            <span className="stat-pill"><strong>{tasks.length}</strong> tasks</span>
                            <span className="stat-pill"><strong>{(totalBudget/1000).toFixed(0)}k€</strong> budget</span>
                        </div>
                        <div className="toolbar-spacer"/>
                        <div className="new-btn-container" ref={exportDropdownRef}>
                            <button className="v11-btn-secondary" onClick={() => {setShowCreateDropdown(false);setShowExportDropdown(!showExportDropdown);}}><Icon.Download size={13}/><span>Export</span></button>
                            {showExportDropdown && <div className="dropdown-menu open" style={{minWidth:160}}>
                                <button onClick={() => {setShowExportDropdown(false);exportToJSON();}} className="dropdown-item">Export JSON</button>
                                <button onClick={() => {setShowExportDropdown(false);exportToCSV();}} className="dropdown-item">Export CSV</button>
                            </div>}
                        </div>
                        <div className="new-btn-container" ref={createDropdownRef}>
                            <button className={`v11-btn-primary ${showCreateDropdown ? 'open' : ''}`} onClick={() => {setShowExportDropdown(false);setShowCreateDropdown(!showCreateDropdown);}}>
                                <Icon.Plus size={13}/>Create
                                <svg className="chevron" width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            {showCreateDropdown && <div className="dropdown-menu open">
                                <button className="dropdown-item default" onClick={() => {setShowCreateDropdown(false);handleCreateNewTask();}}>
                                    <div className="dropdown-item-icon task"><Icon.Check/></div>
                                    <div className="dropdown-item-content"><div className="dropdown-item-title">New task</div><div className="dropdown-item-desc">Add a task to an action</div></div>
                                    <span className="dropdown-item-shortcut">N</span>
                                </button>
                                <button className="dropdown-item" onClick={() => {setShowCreateDropdown(false);setShowNewActionModal(true);}}>
                                    <div className="dropdown-item-icon action"><Icon.List/></div>
                                    <div className="dropdown-item-content"><div className="dropdown-item-title">New action</div><div className="dropdown-item-desc">Create a group of tasks</div></div>
                                    <span className="dropdown-item-shortcut">⇧N</span>
                                </button>
                                <div className="dropdown-divider"/>
                                <button className="dropdown-item" onClick={() => {setShowCreateDropdown(false);setShowCategoriesModal(true);}}>
                                    <div className="dropdown-item-icon category"><Icon.Folder/></div>
                                    <div className="dropdown-item-content"><div className="dropdown-item-title">Manage categories</div><div className="dropdown-item-desc">Create or reorganize groups</div></div>
                                </button>
                            </div>}
                        </div>
                    </div>
                    {activeFilterCount > 0 && (
                        <div className="active-filters">
                            <span className="active-filters-label">Filters:</span>
                            {filters.search && <div className="filter-chip">"{filters.search}"<button onClick={() => setFilters({...filters, search:''})}>✕</button></div>}
                            {filters.status.map(s => { const st = CONFIG.STATUSES.find(x => x.id === s); return <div key={s} className="filter-chip" style={{display:'flex',alignItems:'center',gap:4}}><StatusIcon statusId={s} size={10}/> {st?.name}<button onClick={() => setFilters({...filters, status: filters.status.filter(x => x !== s)})}>✕</button></div>; })}
                            {filters.category.map(c => { const cat = categories.find(x => x.id === c); return <div key={c} className="filter-chip">{cat?.name}<button onClick={() => setFilters({...filters, category: filters.category.filter(x => x !== c)})}>✕</button></div>; })}
                            {filters.priority.map(p => { const pr = CONFIG.PRIORITIES.find(x => x.id === p); return <div key={p} className="filter-chip" style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:7,height:7,borderRadius:'50%',background:pr?.color,flexShrink:0}}/> {pr?.name}<button onClick={() => setFilters({...filters, priority: filters.priority.filter(x => x !== p)})}>✕</button></div>; })}
                            {(filters.channel || []).map(c => { const ch = CONFIG.CHANNELS.find(x => x.id === c); return <div key={c} className="filter-chip">{ch?.name}<button onClick={() => setFilters({...filters, channel: filters.channel.filter(x => x !== c)})}>✕</button></div>; })}
                            {(filters.country || []).map(c => { const co = allCountries.find(x => x.id === c); return <div key={c} className="filter-chip">{co?.flag} {co?.name}<button onClick={() => setFilters({...filters, country: filters.country.filter(x => x !== c)})}>✕</button></div>; })}
                            <span className="clear-filters" onClick={() => setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[]})}>Clear all</span>
                        </div>
                    )}
                    {currentView === 'kanban' && <KanbanView categories={categories} actions={actions} tasks={tasks} onOpenTask={setSelectedTask} onOpenAction={setSelectedAction} onUpdateTask={handleUpdateTask} onUpdateAction={handleUpdateAction} onAddTask={handleAddNewTask} onAddAction={handleAddAction} onMoveTask={handleMoveTask} onReorderTask={handleReorderTask} onMoveAction={handleMoveAction} onReorderAction={handleReorderAction} filters={filters} setFilters={setFilters} allCountries={allCountries} selectedYear={selectedYear} onYearChange={setSelectedYear}/>}
                    {currentView === 'timeline' && <TimelineView categories={categories} actions={actions} tasks={tasks} onOpenTask={setSelectedTask} onOpenAction={setSelectedAction} onUpdateTask={handleUpdateTask} onUpdateAction={handleUpdateAction} onReorderAction={handleReorderAction} onAddTask={handleAddTask} filters={filters} setFilters={setFilters} selectedYear={selectedYear} onYearChange={setSelectedYear} isUserInteractingRef={isUserInteractingRef}/>}
                    {currentView === 'dashboard' && <DashboardView categories={categories} actions={actions} tasks={tasks}/>}
                </main>
                {selectedTask && <TaskDetailModal categories={categories} task={selectedTask} action={actions.find(a => a.id === selectedTask.actionId)} actions={actions} onClose={() => setSelectedTask(null)} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onBackToAction={selectedAction ? () => { setSelectedTask(null); setSelectedAction(actions.find(a => a.id === selectedTask.actionId)); } : null} allCountries={allCountries} onAddCustomCountry={addCustomCountry}/>}
                {selectedAction && !selectedTask && <ActionDetailModal categories={categories} action={selectedAction} tasks={tasks} onClose={() => setSelectedAction(null)} onUpdateAction={handleUpdateAction} onUpdateTask={handleUpdateTask} onOpenTask={t => { setSelectedTask(t); }} onAddTask={handleAddTask} onDeleteAction={handleDeleteAction}/>}
                {showCategoriesModal && <CategoriesManagementModal categories={categories} onClose={() => setShowCategoriesModal(false)} onUpdate={handleUpdateCategory} onAdd={handleAddCategory} onDelete={handleDeleteCategory} onReorder={handleReorderCategories}/>}
                {showNewActionModal && <NewActionModal categories={categories} onClose={() => setShowNewActionModal(false)} onAdd={handleAddAction}/>}
                {showNewTaskModal && <NewTaskModal actions={actions} categories={categories} onClose={() => setShowNewTaskModal(false)} onAdd={handleAddNewTask} onCreateAction={() => { setShowNewTaskModal(false); setShowNewActionModal(true); }}/>}
                <FilterSidebar show={showFilterSidebar} onClose={() => setShowFilterSidebar(false)} filters={filters} setFilters={setFilters} categories={categories} allCountries={allCountries}/>
                {notification && <div className="fixed bottom-4 right-4 px-4 py-3 animate-slide-in" style={{background:'var(--accent)',color:'white',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',fontSize:13,fontWeight:500}}>{notification}</div>}
            </div>
        </AppContext.Provider>
    );
};

export default App;
