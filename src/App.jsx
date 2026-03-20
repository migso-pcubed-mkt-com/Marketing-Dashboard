import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CONFIG, DEFAULT_ACTIONS, DEFAULT_TASKS, GITHUB_CONFIG } from './config.js';
import { AppContext } from './context.js';
import { migrateToV2 } from './lib/migration.js';
import {
    supabaseClient, isSupabaseConfigured, useSupabase,
    loadFromSupabase, saveToSupabase,
    loadDataFromGitHub, saveToGitHub,
    loadFromLocalStorage as loadFromLocalStorageFn,
    saveToLocalStorage as saveToLocalStorageFn,
    saveSnapshot,
    base64EncodeUnicode, base64DecodeUnicode
} from './lib/storage.js';
import { syncWithTrello } from './lib/trelloSync.js';
import { startTrelloLogin, validateAndLogin, restoreTrelloUser, trelloLogout } from './lib/trelloAuth.js';
import Header from './components/Header.jsx';
import TrelloImportModal from './components/TrelloImportModal.jsx';
import { Icon, StatusIcon } from './components/Icons.jsx';
import KanbanView from './components/KanbanView.jsx';
import TimelineView from './components/TimelineView.jsx';
import DashboardView from './components/DashboardView.jsx';
import CalendarView from './components/CalendarView.jsx';
import FilterSidebar from './components/FilterSidebar.jsx';
import TaskDetailModal from './components/TaskDetailModal.jsx';
import ActionDetailModal from './components/ActionDetailModal.jsx';
import CategoriesManagementModal from './components/CategoriesManagementModal.jsx';
import NewActionModal from './components/NewActionModal.jsx';
import NewTaskModal from './components/NewTaskModal.jsx';
import AuthGate from './components/AuthGate.jsx';

const API_BASE_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)
    : '';

const App = () => {
    const darkMode = false;
    const [currentView, setCurrentView] = useState('kanban');

    // --- Multi-board state ---
    const [boardData, setBoardData] = useState(null);
    const [currentBoardId, setCurrentBoardId] = useState('board-default');

    const [filters, setFilters] = useState({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[],showArchived:false});
    const [syncing, setSyncing] = useState(false);
    const [savingStatus, setSavingStatus] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);
    const [selectedAction, setSelectedAction] = useState(null);
    const [notification, setNotification] = useState(null);
    const [githubToken, setGithubToken] = useState('');
    const [showCategoriesModal, setShowCategoriesModal] = useState(false);
    const [showNewActionModal, setShowNewActionModal] = useState(false);
    const [showNewTaskModal, setShowNewTaskModal] = useState(false);
    const [newTaskInitialValues, setNewTaskInitialValues] = useState(null);
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
    const [showTrelloImportModal, setShowTrelloImportModal] = useState(false);
    const [showTrelloRemapModal, setShowTrelloRemapModal] = useState(false);
    const [trelloSyncStatus, setTrelloSyncStatus] = useState('idle'); // idle | syncing | synced | error
    const [trelloUser, setTrelloUser] = useState(null); // null = guest, or { id, fullName, username, avatarUrl, token }
    const [authenticated, setAuthenticated] = useState(() => {
        return !!(sessionStorage.getItem('guest_auth') || localStorage.getItem('trello_user_token'));
    });
    const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
    const trelloSyncIntervalRef = useRef(null);

    const saveQueueRef = useRef([]);
    const isSavingRef = useRef(false);
    const createDropdownRef = useRef(null);
    const exportDropdownRef = useRef(null);
    const boardDataRef = useRef(boardData);
    const fileShaRef = useRef(fileSha);
    const isUserInteractingRef = useRef(false);
    const justSavedTimestampRef = useRef(0);
    const searchInputRef = useRef(null);

    // --- Derive active board data ---
    const currentBoard = useMemo(() => {
        if (!boardData?.boards) return null;
        return boardData.boards.find(b => b.id === currentBoardId) || boardData.boards[0];
    }, [boardData, currentBoardId]);

    const categories = currentBoard?.categories || CONFIG.CATEGORIES;
    const actions = currentBoard?.actions || DEFAULT_ACTIONS;
    const tasks = currentBoard?.tasks || DEFAULT_TASKS;
    const boards = boardData?.boards || [];

    // Filter out archived tasks unless "Show archived" filter is active
    const visibleTasks = useMemo(() => {
        if (filters.showArchived) return tasks;
        return tasks.filter(t => !t.trelloArchived);
    }, [tasks, filters.showArchived]);

    // Guest users are read-only on Trello-linked boards (can edit non-Trello boards)
    const isReadOnly = !trelloUser && !!currentBoard?.trelloSync?.trelloBoardId;

    // --- Board-aware setters (wrapper functions) ---
    const updateCurrentBoard = useCallback((updater) => {
        setBoardData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                boards: prev.boards.map(b =>
                    b.id === currentBoardId
                        ? { ...updater(b), updatedAt: new Date().toISOString() }
                        : b
                )
            };
        });
    }, [currentBoardId]);

    const setCategories = useCallback((v) => {
        updateCurrentBoard(b => ({
            ...b,
            categories: typeof v === 'function' ? v(b.categories) : v
        }));
    }, [updateCurrentBoard]);

    const setActions = useCallback((v) => {
        updateCurrentBoard(b => ({
            ...b,
            actions: typeof v === 'function' ? v(b.actions) : v
        }));
    }, [updateCurrentBoard]);

    const setTasks = useCallback((v) => {
        updateCurrentBoard(b => ({
            ...b,
            tasks: typeof v === 'function' ? v(b.tasks) : v
        }));
    }, [updateCurrentBoard]);

    // --- Board management functions ---
    const handleCreateBoard = useCallback((name) => {
        const newBoard = {
            id: `board-${crypto.randomUUID()}`,
            name: name || 'New Board',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            categories: [...CONFIG.CATEGORIES],
            actions: [],
            tasks: []
        };
        setBoardData(prev => ({
            ...prev,
            currentBoardId: newBoard.id,
            boards: [...prev.boards, newBoard]
        }));
        setCurrentBoardId(newBoard.id);
        setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[]});
        showNotification('✅ Board created');
    }, []);

    const handleSwitchBoard = useCallback((boardId) => {
        setCurrentBoardId(boardId);
        setBoardData(prev => ({ ...prev, currentBoardId: boardId }));
        setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[],showArchived:false});
        setSelectedTask(null);
        setSelectedAction(null);
    }, []);

    const handleRenameBoard = useCallback((boardId, newName) => {
        setBoardData(prev => ({
            ...prev,
            boards: prev.boards.map(b => b.id === boardId ? { ...b, name: newName, updatedAt: new Date().toISOString() } : b)
        }));
        showNotification('✅ Board renamed');
    }, []);

    const handleDeleteBoard = useCallback((boardId) => {
        setBoardData(prev => {
            if (prev.boards.length <= 1) return prev;
            const remaining = prev.boards.filter(b => b.id !== boardId);
            const newCurrentId = boardId === currentBoardId ? remaining[0].id : currentBoardId;
            if (boardId === currentBoardId) {
                setCurrentBoardId(newCurrentId);
                setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[]});
            }
            return { ...prev, currentBoardId: newCurrentId, boards: remaining };
        });
        showNotification('🗑️ Board deleted');
    }, [currentBoardId]);

    const handleDuplicateBoard = useCallback((boardId) => {
        setBoardData(prev => {
            const source = prev.boards.find(b => b.id === boardId);
            if (!source) return prev;
            const cloned = JSON.parse(JSON.stringify(source));
            const newId = `board-${crypto.randomUUID()}`;
            // Regenerate IDs to avoid cross-board conflicts
            const actionIdMap = {};
            cloned.actions = cloned.actions.map(a => {
                const newAId = `a-${crypto.randomUUID()}`;
                actionIdMap[a.id] = newAId;
                return { ...a, id: newAId };
            });
            cloned.tasks = cloned.tasks.map(t => ({
                ...t,
                id: `t-${crypto.randomUUID()}`,
                actionId: actionIdMap[t.actionId] || t.actionId
            }));
            // Strip Trello metadata — duplicated board must not sync to the same Trello board
            delete cloned.trelloSync;
            delete cloned.trelloBoardId;
            delete cloned.trelloBoardName;
            cloned.categories.forEach(c => { delete c.trelloListId; });
            cloned.actions.forEach(a => { delete a.trelloCardId; delete a.trelloListId; });
            cloned.tasks.forEach(t => {
                delete t.trelloCardId; delete t.trelloCheckItemId;
                delete t.trelloChecklistName; delete t.trelloLastModified;
                delete t.trelloArchived;
            });
            const newBoard = {
                ...cloned,
                id: newId,
                name: `${source.name} (copy)`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            setCurrentBoardId(newId);
            setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[],showArchived:false});
            return { ...prev, currentBoardId: newId, boards: [...prev.boards, newBoard] };
        });
        showNotification('✅ Board duplicated');
    }, []);

    // --- Dropdowns ---
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
            id: `custom-${crypto.randomUUID()}`,
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
    const postSaveSyncTimeoutRef = useRef(null);
    const syncRealtimeGuardRef = useRef(false);

    const saveToLocalStorage = () => {
        saveToLocalStorageFn(boardDataRef);
    };

    const saveData = async () => {
        // In offline mode, only save to localStorage
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            saveToLocalStorage();
            return true;
        }
        if (useSupabase) {
            const result = await saveToSupabase(boardDataRef, setSyncing, showNotification);
            if (result) saveToLocalStorage();
            return result;
        } else if (githubToken) {
            const result = await saveToGitHub(boardDataRef, fileShaRef, setFileSha, setSyncing, showNotification);
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
            // Ctrl+F / Cmd+F opens app search filter (works even from inputs)
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                if (showFilterSidebar) {
                    setShowFilterSidebar(false);
                } else {
                    setShowFilterSidebar(true);
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                }
                return;
            }
            // Escape closes filter sidebar even from inputs (search field)
            if (e.key === 'Escape' && showFilterSidebar) {
                setShowFilterSidebar(false);
                return;
            }
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'Escape') {
                if (selectedTask) setSelectedTask(null);
                else if (selectedAction) setSelectedAction(null);
                else if (showCategoriesModal) setShowCategoriesModal(false);
                else if (showCreateDropdown) setShowCreateDropdown(false);
                else if (showNewActionModal) setShowNewActionModal(false);
                else if (showNewTaskModal) setShowNewTaskModal(false);
            }
            if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !isReadOnly) handleCreateNewTask();
            if ((e.key === '1' || e.key === '&') && !e.ctrlKey && !e.metaKey) setCurrentView('kanban');
            if ((e.key === '2' || e.key === 'é') && !e.ctrlKey && !e.metaKey) setCurrentView('timeline');
            if ((e.key === '3' || e.key === '"') && !e.ctrlKey && !e.metaKey) setCurrentView('calendar');
            if ((e.key === '4' || e.key === "'") && !e.ctrlKey && !e.metaKey) setCurrentView('dashboard');
        };
        document.addEventListener('keydown', handleKeyPress);
        return () => document.removeEventListener('keydown', handleKeyPress);
    }, [selectedTask, selectedAction, showCategoriesModal, showNewActionModal, showNewTaskModal, showFilterSidebar, showCreateDropdown]);

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
            const fallbackData = loadFromLocalStorageFn(showNotification);
            if (fallbackData) {
                setBoardData(fallbackData);
                setCurrentBoardId(fallbackData.currentBoardId || 'board-default');
            }
        }, 5000);

        const loadData = async () => {
            try {
                let result;
                if (useSupabase) {
                    result = await loadFromSupabase(showNotification);
                } else {
                    result = await loadDataFromGitHub(setFileSha, showNotification, () => loadFromLocalStorageFn(showNotification));
                }
                if (result) {
                    setBoardData(result);
                    setCurrentBoardId(result.currentBoardId || 'board-default');
                    // Save to localStorage as backup
                    boardDataRef.current = result;
                    saveToLocalStorage();
                }
                clearTimeout(timeoutId);
            } catch (err) {
                console.error('Error loading data:', err);
                clearTimeout(timeoutId);
                const fallbackData = loadFromLocalStorageFn(showNotification);
                if (fallbackData) {
                    setBoardData(fallbackData);
                    setCurrentBoardId(fallbackData.currentBoardId || 'board-default');
                }
            }
        };
        loadData();

        return () => { clearTimeout(mountTimer); clearTimeout(timeoutId); };
    }, []);

    // Restore Trello user from localStorage on mount
    useEffect(() => {
        restoreTrelloUser().then(user => { if (user) { setTrelloUser(user); setAuthenticated(true); } }).catch(() => {});
    }, []);

    const handleTrelloLogin = useCallback(async () => {
        const result = await startTrelloLogin();
        if (result?.needsManualToken) {
            return result; // Let AuthGate show paste fallback
        }
        if (result?.token) {
            setTrelloUser({ ...result.user, token: result.token });
            setAuthenticated(true);
        }
        return result;
    }, []);

    const handleValidateToken = useCallback(async (token) => {
        const result = await validateAndLogin(token);
        setTrelloUser({ ...result.user, token: result.token });
        setAuthenticated(true);
    }, []);

    const handleGuestLogin = useCallback(async (password) => {
        const res = await fetch(`${API_BASE_URL}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verifyGuest', password })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Invalid password');
        }
        sessionStorage.setItem('guest_auth', 'true');
        setAuthenticated(true);
    }, []);

    const handleTrelloLogout = useCallback(() => {
        trelloLogout();
        setTrelloUser(null);
    }, []);

    useEffect(() => {
        if (fileSha) { localStorage.setItem('github_file_sha', fileSha); }
        else { localStorage.removeItem('github_file_sha'); }
    }, [fileSha]);

    // Keep boardDataRef in sync
    useEffect(() => { boardDataRef.current = boardData; }, [boardData]);
    useEffect(() => { fileShaRef.current = fileSha; }, [fileSha]);

    // Auto-save with debounce
    useEffect(() => {
        if (!dataLoaded || !boardData || isReceivingRealtimeRef.current) return;
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
            if (success) {
                justSavedTimestampRef.current = Date.now();
                saveSnapshot(boardDataRef.current, 'auto-save');
                // Clear Realtime guard after synced data is saved
                if (syncRealtimeGuardRef.current) {
                    syncRealtimeGuardRef.current = false;
                    setTimeout(() => { isReceivingRealtimeRef.current = false; }, 2000);
                }
                // Auto-trigger Trello sync after save (debounced 5s)
                const board = boardDataRef.current?.boards?.find(b => b.id === currentBoardId);
                if (board?.trelloSync?.syncEnabled && board?.trelloSync?.trelloBoardId) {
                    if (postSaveSyncTimeoutRef.current) clearTimeout(postSaveSyncTimeoutRef.current);
                    postSaveSyncTimeoutRef.current = setTimeout(() => { handleTrelloSync(); }, 5000);
                }
            }
            setTimeout(() => setSavingStatus(null), 2000);
        };
        autoSaveTimeoutRef.current = setTimeout(doSave, delay);
        return () => { if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); };
    }, [boardData, dataLoaded, githubToken]);

    // Flush pending save on tab close / navigation away
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (autoSaveTimeoutRef.current && boardDataRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
                autoSaveTimeoutRef.current = null;
                // Synchronous localStorage save — guaranteed to complete before page unloads
                saveToLocalStorage();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    // Network online/offline detection
    useEffect(() => {
        const goOffline = () => {
            setIsOffline(true);
            showNotification('📡 You are offline — changes saved locally');
        };
        const goOnline = () => {
            setIsOffline(false);
            showNotification('✅ Back online — syncing...');
            // Trigger a save to push any offline changes
            if (boardDataRef.current && dataLoaded) {
                saveData();
            }
        };
        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, [dataLoaded]);

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
                    // Prefer board_data column (v2)
                    let incoming = null;
                    if (d.board_data && d.board_data.version === 2) {
                        incoming = d.board_data;
                    } else if (d.categories) {
                        // Legacy format from another client
                        incoming = migrateToV2({ categories: d.categories, actions: d.actions, tasks: d.tasks });
                    }
                    if (incoming) {
                        // Protect critical Trello sync fields from being overwritten by stale Realtime data
                        setBoardData(prev => {
                            if (!prev?.boards) return incoming;
                            const merged = {
                                ...incoming,
                                boards: incoming.boards.map(incomingBoard => {
                                    const localBoard = prev.boards.find(b => b.id === incomingBoard.id);
                                    if (!localBoard?.trelloSync) return incomingBoard;
                                    // Preserve local syncMode/syncEnabled if incoming is missing them
                                    const localSync = localBoard.trelloSync;
                                    const incomingSync = incomingBoard.trelloSync;
                                    if (localSync.syncMode && (!incomingSync || !incomingSync.syncMode)) {
                                        console.warn('[Realtime] Preserving local trelloSync.syncMode — incoming data missing it');
                                        return {
                                            ...incomingBoard,
                                            trelloSync: { ...incomingSync, syncMode: localSync.syncMode }
                                        };
                                    }
                                    return incomingBoard;
                                })
                            };
                            return merged;
                        });
                    }
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
                            const result = await loadDataFromGitHub(setFileSha, showNotification, () => loadFromLocalStorageFn(showNotification));
                            if (result) {
                                setBoardData(result);
                            }
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
        if (!dataLoaded || !currentBoard) return;
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
    }, [dataLoaded, currentBoard, tasks.length]);

    useEffect(() => {
        if (!dataLoaded || !currentBoard) return;
        const needsOrder = actions.some(a => a.order === undefined);
        if (needsOrder) {
            console.log('🔢 Initializing action order...');
            setActions(prev => prev.map((a, idx) => ({...a, order: a.order !== undefined ? a.order : idx})));
        }
    }, [dataLoaded, currentBoard, actions.length]);

    const handleSync = () => saveData();

    const handleUpdateTask = (taskId, updates) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== taskId) return t;
            const newTask = {...t, ...updates, updatedAt: new Date().toISOString()};
            if (updates.dueDate) {
                const d = new Date(updates.dueDate);
                newTask.month = d.getMonth();
            } else if (updates.startDate) {
                const d = new Date(updates.startDate);
                newTask.month = d.getMonth();
            }
            return newTask;
        }));
        showNotification('✅ Task updated');
    };

    const handleBatchUpdateTasks = (updates) => {
        // updates: [{id, changes}, ...] — apply all in one atomic setTasks call
        setTasks(prev => prev.map(t => {
            const u = updates.find(u => u.id === t.id);
            if (!u) return t;
            const newTask = {...t, ...u.changes, updatedAt: new Date().toISOString()};
            if (u.changes.dueDate) {
                newTask.month = new Date(u.changes.dueDate).getMonth();
            } else if (u.changes.startDate) {
                newTask.month = new Date(u.changes.startDate).getMonth();
            }
            return newTask;
        }));
    };

    const handleUpdateAction = (actionId, updates) => {
        setActions(prev => prev.map(a => a.id === actionId ? {...a, ...updates, updatedAt: new Date().toISOString()} : a));
        showNotification('✅ Action updated');
    };

    const handleDeleteAction = (actionId) => {
        // No confirm() here — caller (ActionDetailModal) handles confirmation popup
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
        const newTask = { id: `t-${crypto.randomUUID()}`, actionId, month, startDate, title: 'New task', description: '', status: 'todo', priority: 'medium', dueDate, budget: 0, channels: action?.tags || [], checklist: [], comments: [], attachments: [], order: maxOrder, createdAt: now };
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
        // Recalculate target index AFTER removal (indices shifted)
        const adjustedTargetIdx = reordered.findIndex(t => t.id === targetId);
        if (adjustedTargetIdx === -1) return;
        const insertIndex = position === 'before' ? adjustedTargetIdx : adjustedTargetIdx + 1;
        reordered.splice(insertIndex, 0, removed);
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

    const handleCreateNewTask = (initialValues = null) => { setNewTaskInitialValues(initialValues); setShowNewTaskModal(true); };

    const handleUpdateCategory = (catId, updates) => {
        setCategories(prev => prev.map(c => c.id === catId ? {...c, ...updates, updatedAt: new Date().toISOString()} : c));
        showNotification('✅ Category updated');
    };

    const handleAddCategory = (newCat) => {
        const now = new Date().toISOString();
        if (!newCat.createdAt) newCat.createdAt = now;
        if (!newCat.updatedAt) newCat.updatedAt = now;
        setCategories(prev => [...prev, newCat]);
        // Auto-create default action for card-as-task boards so directTasks works
        if (currentBoard?.trelloSync?.syncMode === 'card-as-task') {
            const defaultAction = {
                id: `a-${crypto.randomUUID()}`,
                name: newCat.name,
                categoryId: newCat.id,
                isDefault: true,
                budget: 0, priority: 'medium', tags: [], status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            setActions(prev => [...prev, defaultAction]);
        }
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
        const now = new Date().toISOString();
        setCategories(reorderedCategories.map((c, i) => ({...c, order: i, updatedAt: now})));
        showNotification('✅ Category order updated');
    };

    const handleAddAction = (newAction) => {
        setActions(prev => [...prev, newAction]);
        showNotification('✅ Action created');
    };

    // Rename checklist group (task category) — updates trelloChecklistName on all tasks in group
    // If oldName is null, creates a new empty group (no tasks to update)
    const handleRenameChecklistGroup = (oldName, newName) => {
        if (!oldName) {
            // Creating a new group — nothing to update yet, but we'll use this name when creating tasks
            showNotification(`✅ Group "${newName}" created`);
            return;
        }
        setTasks(prev => prev.map(t => t.trelloChecklistName === oldName ? {...t, trelloChecklistName: newName, updatedAt: new Date().toISOString()} : t));
        showNotification(`✅ Group renamed to "${newName}"`);
    };

    // Add a task within a specific checklist group in an action card
    const handleAddTaskInGroup = (actionId, groupName, title) => {
        const action = actions.find(a => a.id === actionId);
        const now = new Date().toISOString();
        const startDate = action?.startDate || now.split('T')[0];
        const dueDate = action?.dueDate || startDate;
        const maxOrder = Math.max(...tasks.map(t => t.order || 0), -1) + 1;
        // Find the trelloCardId and trelloChecklistId from sibling tasks in same group
        const siblingTask = tasks.find(t => t.actionId === actionId && t.trelloChecklistName === groupName);
        const newTask = {
            id: `t-${crypto.randomUUID()}`,
            actionId,
            title,
            description: '',
            status: 'todo',
            priority: 'medium',
            month: new Date(dueDate).getMonth(),
            startDate,
            dueDate,
            budget: 0,
            channels: action?.tags || [],
            checklist: [],
            checklists: [],
            comments: [],
            attachments: [],
            order: maxOrder,
            createdAt: now,
            updatedAt: now,
            trelloChecklistName: groupName,
            trelloCardId: siblingTask?.trelloCardId || action?.trelloCardId || null,
            trelloChecklistId: siblingTask?.trelloChecklistId || null
        };
        setTasks(prev => [...prev, newTask]);
        showNotification('✅ Task created');
    };

    // --- Trello import ---
    const handleTrelloImport = useCallback((importData, boardName) => {
        const newBoard = {
            id: `board-${crypto.randomUUID()}`,
            name: boardName || 'Trello Import',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            categories: importData.categories,
            actions: importData.actions,
            tasks: importData.tasks,
            members: importData.members || [],
            trelloSync: importData.trelloSync
        };
        setBoardData(prev => ({
            ...prev,
            currentBoardId: newBoard.id,
            boards: [...prev.boards, newBoard]
        }));
        setCurrentBoardId(newBoard.id);
        setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[]});
        showNotification(`✅ Imported "${boardName}" from Trello`);
    }, []);

    // --- Trello sync ---
    const handleTrelloSync = useCallback(async () => {
        if (!currentBoard?.trelloSync?.trelloBoardId) return;
        if (trelloSyncStatus === 'syncing') return; // Prevent concurrent syncs
        setTrelloSyncStatus('syncing');
        try {
            // Snapshot board before sync — allows recovery if sync corrupts data
            try {
                localStorage.setItem('trello_sync_snapshot', JSON.stringify({
                    board: currentBoard,
                    timestamp: Date.now()
                }));
            } catch (e) { console.warn('Failed to save pre-sync snapshot:', e); }

            // Build mappingConfig from current board data
            const mappingConfig = { labelMappings: {} };
            const syncMode = currentBoard.trelloSync?.syncMode || 'card-as-task';
            // In card-as-task mode, reconstruct action mappings from label IDs
            if (syncMode === 'card-as-task') {
                for (const action of (currentBoard.actions || [])) {
                    if (action.trelloLabelId) {
                        mappingConfig.labelMappings[action.trelloLabelId] = { type: 'action', categoryId: action.categoryId };
                    }
                }
            }
            // Reconstruct channel and other label mappings from existing tasks
            for (const task of (currentBoard.tasks || [])) {
                if (task.channels) {
                    // Channel mappings already handled by task data
                }
                if (task.otherLabels) {
                    for (const ol of task.otherLabels) {
                        if (ol.id && !mappingConfig.labelMappings[ol.id]) {
                            mappingConfig.labelMappings[ol.id] = { type: 'other', labelName: ol.name, labelColor: ol.color };
                        }
                    }
                }
            }
            // Store label mapping config on board for persistence
            if (currentBoard.trelloSync?.labelMappings) {
                for (const [labelId, mapping] of Object.entries(currentBoard.trelloSync.labelMappings)) {
                    if (!mappingConfig.labelMappings[labelId]) {
                        mappingConfig.labelMappings[labelId] = mapping;
                    }
                }
            }
            // In guest mode (no Trello user), sync is read-only — pull from Trello but never push
            const isGuest = !trelloUser;
            const { board: syncedBoard, result } = await syncWithTrello(currentBoard, mappingConfig, { readOnly: isGuest });
            // Prevent Supabase Realtime from overwriting freshly synced data
            isReceivingRealtimeRef.current = true;
            // Update the board in boardData
            setBoardData(prev => ({
                ...prev,
                boards: prev.boards.map(b => b.id === syncedBoard.id ? syncedBoard : b)
            }));
            // Guard stays active until auto-save completes for synced data (see syncRealtimeGuardRef)
            syncRealtimeGuardRef.current = true;
            // Fallback: if auto-save doesn't fire within 8s, clear guard anyway
            setTimeout(() => { if (syncRealtimeGuardRef.current) { syncRealtimeGuardRef.current = false; isReceivingRealtimeRef.current = false; } }, 8000);
            setTrelloSyncStatus(result.errors > 0 ? 'error' : 'synced');
            const msg = [];
            if (result.created) msg.push(`${result.created} new`);
            if (result.updated) msg.push(`${result.updated} updated`);
            if (result.pushed) msg.push(`${result.pushed} pushed`);
            if (result.errors > 0) {
                const failedNames = (result.errorDetails || []).slice(0, 3).map(e => e.name).join(', ');
                const extra = result.errors > 3 ? ` +${result.errors - 3} more` : '';
                msg.push(`${result.errors} failed (${failedNames}${extra})`);
                showNotification(`⚠️ Trello sync: ${msg.join(', ')}`);
            } else {
                showNotification(`✅ Trello sync: ${msg.join(', ') || 'up to date'}`);
            }
            // Log integrity warnings if any
            if (result.integrityWarnings?.length > 0) {
                console.warn('[Post-sync integrity]', result.integrityWarnings);
            }
            setTimeout(() => setTrelloSyncStatus('idle'), 3000);
            // After sync completes, schedule a light refresh from Supabase to catch
            // any changes from other tabs that were ignored during the sync
            if (useSupabase) {
                setTimeout(async () => {
                    try {
                        const freshData = await loadFromSupabase(() => {});
                        if (freshData && freshData.boards) {
                            // Only apply if there are boards we don't know about
                            const localBoardIds = new Set(boardDataRef.current?.boards?.map(b => b.id) || []);
                            const hasNewBoards = freshData.boards.some(b => !localBoardIds.has(b.id));
                            if (hasNewBoards) {
                                console.log('[Post-sync refresh] Found new boards from Supabase');
                                isReceivingRealtimeRef.current = true;
                                setBoardData(freshData);
                                setTimeout(() => { isReceivingRealtimeRef.current = false; }, 2000);
                            }
                        }
                    } catch (e) {
                        // Silent — best effort refresh
                        console.log('[Post-sync refresh] Skipped:', e.message);
                    }
                }, 4000);
            }
        } catch (err) {
            console.error('Trello sync error:', err);
            setTrelloSyncStatus('error');
            // Attempt auto-restore from snapshot on critical failure
            try {
                const snapshot = JSON.parse(localStorage.getItem('trello_sync_snapshot'));
                if (snapshot?.board && Date.now() - snapshot.timestamp < 86400000) {
                    console.log('[Trello sync] Restoring board from pre-sync snapshot');
                    setBoardData(prev => ({
                        ...prev,
                        boards: prev.boards.map(b => b.id === snapshot.board.id ? snapshot.board : b)
                    }));
                    showNotification(`❌ Trello sync failed: ${err.message} — board restored from snapshot`);
                } else {
                    showNotification(`❌ Trello sync failed: ${err.message}`);
                }
            } catch (restoreErr) {
                showNotification(`❌ Trello sync failed: ${err.message}`);
            }
            setTimeout(() => setTrelloSyncStatus('idle'), 5000);
        }
    }, [currentBoard, trelloSyncStatus]);

    // --- Trello polling lifecycle ---
    useEffect(() => {
        // Clear previous interval
        if (trelloSyncIntervalRef.current) {
            clearInterval(trelloSyncIntervalRef.current);
            trelloSyncIntervalRef.current = null;
        }
        // Start polling if current board has Trello sync enabled
        if (currentBoard?.trelloSync?.syncEnabled && currentBoard?.trelloSync?.trelloBoardId) {
            const intervalMs = currentBoard.trelloSync.pollIntervalMs || 60000;
            console.log(`Trello polling started (${intervalMs / 1000}s)`);
            trelloSyncIntervalRef.current = setInterval(handleTrelloSync, intervalMs);
        }
        return () => {
            if (trelloSyncIntervalRef.current) clearInterval(trelloSyncIntervalRef.current);
        };
    }, [currentBoard?.trelloSync?.syncEnabled, currentBoard?.trelloSync?.pollIntervalMs, currentBoard?.id, handleTrelloSync]);

    const handleUpdateTrelloSyncSettings = useCallback((updates) => {
        updateCurrentBoard(b => ({
            ...b,
            trelloSync: { ...b.trelloSync, ...updates }
        }));
    }, [updateCurrentBoard]);

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
        a.download = `marketing-tracker-${currentBoard?.name || 'export'}-${new Date().toISOString().split('T')[0]}.json`;
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
        a.download = `marketing-tracker-${currentBoard?.name || 'export'}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('📊 CSV export downloaded');
    };

    const totalBudget = tasks.reduce((s, t) => s + (t.budget || 0), 0);
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const activeFilterCount = [filters.status, filters.category, filters.priority, filters.channel, filters.country, filters.otherLabel, filters.member].reduce((c, arr) => c + (Array.isArray(arr) ? arr.length : 0), 0) + (filters.search ? 1 : 0) + (filters.showArchived ? 1 : 0);

    // Filtered tasks for stats — same logic as views (visibleTasks already excludes archived)
    const filteredTasks = useMemo(() => {
        if (!activeFilterCount) return visibleTasks;
        return visibleTasks.filter(t => {
            const act = actions.find(a => a.id === t.actionId);
            if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
            if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
            if (filters.category.length > 0 && !filters.category.includes(act?.categoryId)) return false;
            if (filters.priority.length > 0 && !filters.priority.includes(t.priority)) return false;
            if (filters.channel?.length > 0 && !(t.channels||[]).some(c => filters.channel.includes(c))) return false;
            if (filters.country?.length > 0 && !(t.countries||[]).some(c => filters.country.includes(c))) return false;
            if (filters.otherLabel?.length > 0 && !(t.otherLabels||[]).some(l => filters.otherLabel.includes(l.id))) return false;
            if (filters.member?.length > 0 && !(t.assignees||[]).some(m => filters.member.includes(m))) return false;
            return true;
        });
    }, [visibleTasks, actions, filters, activeFilterCount]);
    const filteredBudget = filteredTasks.reduce((s, t) => s + (t.budget || 0), 0);
    const isFiltered = activeFilterCount > 0;

    // --- AppContext value ---
    const contextValue = useMemo(() => ({
        boards,
        currentBoardId,
        currentBoard,
        onSwitchBoard: handleSwitchBoard,
        onCreateBoard: handleCreateBoard,
        onRenameBoard: handleRenameBoard,
        onDeleteBoard: handleDeleteBoard,
        onDuplicateBoard: handleDuplicateBoard,
        onShowTrelloImport: () => setShowTrelloImportModal(true),
        onOpenRemapLabels: () => setShowTrelloRemapModal(true),
        onTrelloSync: handleTrelloSync,
        onUpdateTrelloSyncSettings: handleUpdateTrelloSyncSettings,
        trelloSyncStatus,
        trelloUser,
        onTrelloLogin: handleTrelloLogin,
        onTrelloLogout: handleTrelloLogout
    }), [boards, currentBoardId, currentBoard, handleSwitchBoard, handleCreateBoard, handleRenameBoard, handleDeleteBoard, handleDuplicateBoard, handleTrelloSync, handleUpdateTrelloSyncSettings, trelloSyncStatus, trelloUser, handleTrelloLogin, handleTrelloLogout]);

    if (!authenticated) return <AuthGate onTrelloLogin={handleTrelloLogin} onValidateToken={handleValidateToken} onGuestLogin={handleGuestLogin}/>;

    if (!dataLoaded) return (<div className="min-h-screen flex items-center justify-center" style={{background:'var(--bg-page)'}}><div className="text-center" style={{color:'var(--text-primary)'}}><div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{borderColor:'var(--accent)',borderTopColor:'transparent'}}/><p>Loading data...</p></div></div>);

    return (
        <AppContext.Provider value={contextValue}>
            <div className="min-h-screen" style={{background:'var(--bg-page)'}}>
                {isOffline && (
                    <div style={{background:'#f59e0b',color:'#fff',textAlign:'center',padding:'6px 12px',fontSize:13,fontWeight:600}}>
                        📡 Offline — changes saved locally. Will sync when back online.
                    </div>
                )}
                <Header currentView={currentView} setCurrentView={setCurrentView} onSync={handleSync} syncing={syncing} githubConnected={!!githubToken} savingStatus={savingStatus} trelloSync={currentBoard?.trelloSync} trelloSyncStatus={trelloSyncStatus} onTrelloSync={handleTrelloSync}/>
                <main style={{maxWidth:1600,margin:'0 auto',padding:'var(--space-4) var(--space-6)'}}>
                    <div className="toolbar">
                        <button className={`filter-btn ${showFilterSidebar ? 'active' : ''}`} onClick={() => setShowFilterSidebar(!showFilterSidebar)}>
                            <Icon.Filter/>Filters
                            {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
                        </button>
                        <div className="stats-pills">
                            <span className="stat-pill"><strong>{isFiltered ? `${filteredTasks.length} / ${tasks.length}` : tasks.length}</strong> tasks</span>
                            <span className="stat-pill"><strong>{isFiltered ? `${(filteredBudget/1000).toFixed(0)}k / ${(totalBudget/1000).toFixed(0)}k€` : `${(totalBudget/1000).toFixed(0)}k€`}</strong> budget</span>
                        </div>
                        <div className="toolbar-spacer"/>
                        <div className="new-btn-container" ref={exportDropdownRef}>
                            <button className="v11-btn-secondary" onClick={() => {setShowCreateDropdown(false);setShowExportDropdown(!showExportDropdown);}}><Icon.Download size={13}/><span>Export</span></button>
                            {showExportDropdown && <div className="dropdown-menu open" style={{minWidth:160}}>
                                <button onClick={() => {setShowExportDropdown(false);exportToJSON();}} className="dropdown-item">Export JSON</button>
                                <button onClick={() => {setShowExportDropdown(false);exportToCSV();}} className="dropdown-item">Export CSV</button>
                            </div>}
                        </div>
                        {!isReadOnly && <div className="new-btn-container" ref={createDropdownRef}>
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
                                {currentBoard?.trelloSync?.syncMode !== 'card-as-task' && <button className="dropdown-item" onClick={() => {setShowCreateDropdown(false);setShowNewActionModal(true);}}>
                                    <div className="dropdown-item-icon action"><Icon.List/></div>
                                    <div className="dropdown-item-content"><div className="dropdown-item-title">New action</div><div className="dropdown-item-desc">Create a group of tasks</div></div>
                                    <span className="dropdown-item-shortcut">⇧N</span>
                                </button>}
                                <div className="dropdown-divider"/>
                                <button className="dropdown-item" onClick={() => {setShowCreateDropdown(false);setShowCategoriesModal(true);}}>
                                    <div className="dropdown-item-icon category"><Icon.Folder/></div>
                                    <div className="dropdown-item-content"><div className="dropdown-item-title">Manage categories</div><div className="dropdown-item-desc">Create or reorganize groups</div></div>
                                </button>
                            </div>}
                        </div>}
                        {isReadOnly && <span style={{fontSize:11,color:'var(--text-tertiary)',background:'var(--bg-secondary)',padding:'4px 10px',borderRadius:'var(--radius-sm)',fontWeight:500}}>Read-only</span>}
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
                            {(filters.otherLabel || []).map(labelId => { const label = tasks.flatMap(t => t.otherLabels || []).find(l => l.id === labelId); return <div key={labelId} className="filter-chip" style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:7,height:7,borderRadius:'50%',background:label?.color||'#888',flexShrink:0}}/> {label?.name||'Label'}<button onClick={() => setFilters({...filters, otherLabel: filters.otherLabel.filter(x => x !== labelId)})}>✕</button></div>; })}
                            {(filters.member || []).map(memberId => { const m = (currentBoard?.members || []).find(x => x.id === memberId); return <div key={memberId} className="filter-chip" style={{display:'flex',alignItems:'center',gap:4}}>{m?.avatarUrl ? <img src={m.avatarUrl} alt="" style={{width:14,height:14,borderRadius:'50%'}}/> : null} {m?.fullName||m?.username||'Member'}<button onClick={() => setFilters({...filters, member: filters.member.filter(x => x !== memberId)})}>✕</button></div>; })}
                            <span className="clear-filters" onClick={() => setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[]})}>Clear all</span>
                        </div>
                    )}
                    {currentView === 'kanban' && <KanbanView categories={categories} actions={actions} tasks={visibleTasks} onOpenTask={setSelectedTask} onOpenAction={setSelectedAction} onUpdateTask={handleUpdateTask} onUpdateAction={handleUpdateAction} onBatchUpdateTasks={handleBatchUpdateTasks} onAddTask={handleAddNewTask} onAddAction={handleAddAction} onMoveTask={handleMoveTask} onReorderTask={handleReorderTask} onMoveAction={handleMoveAction} onReorderAction={handleReorderAction} filters={filters} setFilters={setFilters} allCountries={allCountries} selectedYear={selectedYear} onYearChange={setSelectedYear} isReadOnly={isReadOnly} onRequestNewTask={handleCreateNewTask} onUpdateCategory={handleUpdateCategory} onAddCategory={handleAddCategory} onDeleteCategory={handleDeleteCategory} isCardAsTask={currentBoard?.trelloSync?.syncMode === 'card-as-task'}/>}
                    {currentView === 'timeline' && <TimelineView categories={categories} actions={actions} tasks={visibleTasks} onOpenTask={setSelectedTask} onOpenAction={setSelectedAction} onUpdateTask={handleUpdateTask} onUpdateAction={handleUpdateAction} onReorderAction={isReadOnly ? null : handleReorderAction} onAddTask={handleAddTask} filters={filters} setFilters={setFilters} selectedYear={selectedYear} onYearChange={setSelectedYear} isUserInteractingRef={isUserInteractingRef} isReadOnly={isReadOnly} onRequestNewTask={handleCreateNewTask}/>}
                    {currentView === 'calendar' && <CalendarView categories={categories} actions={actions} tasks={visibleTasks} onOpenTask={setSelectedTask} onUpdateTask={handleUpdateTask} onAddTask={handleAddNewTask} filters={filters} selectedYear={selectedYear} onYearChange={setSelectedYear} isReadOnly={isReadOnly}/>}
                    {currentView === 'dashboard' && <DashboardView categories={categories} actions={actions} tasks={visibleTasks} members={currentBoard?.members || []}/>}
                </main>
                {selectedTask && <TaskDetailModal categories={categories} task={selectedTask} action={actions.find(a => a.id === selectedTask.actionId)} actions={actions} onClose={() => setSelectedTask(null)} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onBackToAction={selectedAction ? () => { setSelectedTask(null); setSelectedAction(actions.find(a => a.id === selectedTask.actionId)); } : null} allCountries={allCountries} onAddCustomCountry={addCustomCountry} onCreateAction={handleAddAction} onAddCategory={handleAddCategory} members={currentBoard?.members || []} isReadOnly={isReadOnly} isTrelloBoard={!!currentBoard?.trelloSync?.trelloBoardId} isCardAsTask={currentBoard?.trelloSync?.syncMode === 'card-as-task'} availableOtherLabels={(() => { const map = new Map(); tasks.forEach(t => (t.otherLabels||[]).forEach(l => { if (!map.has(l.id)) map.set(l.id, l); })); return Array.from(map.values()); })()}/>}
                {selectedAction && !selectedTask && <ActionDetailModal categories={categories} action={selectedAction} tasks={visibleTasks} onClose={() => setSelectedAction(null)} onUpdateAction={handleUpdateAction} onUpdateTask={handleUpdateTask} onBatchUpdateTasks={handleBatchUpdateTasks} onOpenTask={t => { setSelectedTask(t); }} onAddTask={(actionId) => handleCreateNewTask({ actionId })} onDeleteAction={handleDeleteAction} onDeleteTask={handleDeleteTask} allCountries={allCountries} onAddCustomCountry={addCustomCountry} members={currentBoard?.members || []} isTrelloBoard={!!currentBoard?.trelloSync?.trelloBoardId} availableOtherLabels={(() => { const map = new Map(); tasks.forEach(t => (t.otherLabels||[]).forEach(l => { if (!map.has(l.id)) map.set(l.id, l); })); actions.forEach(a => (a.otherLabels||[]).forEach(l => { if (!map.has(l.id)) map.set(l.id, l); })); return Array.from(map.values()); })()} isReadOnly={isReadOnly} onRenameChecklistGroup={handleRenameChecklistGroup} onAddTaskInGroup={handleAddTaskInGroup}/>}
                {showCategoriesModal && <CategoriesManagementModal categories={categories} onClose={() => setShowCategoriesModal(false)} onUpdate={handleUpdateCategory} onAdd={handleAddCategory} onDelete={handleDeleteCategory} onReorder={handleReorderCategories}/>}
                {showNewActionModal && <NewActionModal categories={categories} onClose={() => setShowNewActionModal(false)} onAdd={handleAddAction} onAddCategory={handleAddCategory}/>}
                {showNewTaskModal && <NewTaskModal actions={actions} categories={categories} onClose={() => { setShowNewTaskModal(false); setNewTaskInitialValues(null); }} onAdd={handleAddNewTask} onCreateAction={(newAction) => { if (newAction && newAction.id) { handleAddAction(newAction); } else { setShowNewTaskModal(false); setNewTaskInitialValues(null); setShowNewActionModal(true); } }} onAddCategory={handleAddCategory} initialValues={newTaskInitialValues} isCardAsTask={currentBoard?.trelloSync?.syncMode === 'card-as-task'}/>}
                {showTrelloImportModal && <TrelloImportModal onClose={() => setShowTrelloImportModal(false)} onImport={handleTrelloImport}/>}
                {showTrelloRemapModal && currentBoard?.trelloSync?.trelloBoardId && <TrelloImportModal mappingOnly trelloBoardId={currentBoard.trelloSync.trelloBoardId} existingMappings={currentBoard.trelloSync.labelMappings} onClose={() => setShowTrelloRemapModal(false)} onSaveMappings={(mappings) => handleUpdateTrelloSyncSettings({ labelMappings: mappings })}/>}
                <FilterSidebar show={showFilterSidebar} onClose={() => setShowFilterSidebar(false)} filters={filters} setFilters={setFilters} categories={categories} allCountries={allCountries} tasks={tasks} members={currentBoard?.members || []} searchInputRef={searchInputRef}/>
                {notification && <div className="fixed bottom-4 right-4 px-4 py-3 animate-slide-in" style={{background:'var(--accent)',color:'white',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',fontSize:13,fontWeight:500}}>{notification}</div>}
            </div>
        </AppContext.Provider>
    );
};

export default App;
