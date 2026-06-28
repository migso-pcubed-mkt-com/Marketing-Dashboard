import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { CONFIG, DEFAULT_ACTIONS, DEFAULT_TASKS, GITHUB_CONFIG } from './config.js';
import { AppContext, BoardContext, FilterContext } from './context.js';
import { migrateToV2 } from './lib/migration.js';
import {
    supabaseClient, isSupabaseConfigured, useSupabase,
    loadFromSupabase, saveToSupabase, fetchServerState,
    loadDataFromGitHub, saveToGitHub,
    loadFromLocalStorage as loadFromLocalStorageFn,
    saveToLocalStorage as saveToLocalStorageFn,
    saveSnapshot,
    base64EncodeUnicode, base64DecodeUnicode
} from './lib/storage.js';
import { mergeBoardsEntityLevel } from './lib/realtimeMerge.js';
import { syncWithTrello, isSyncInProgress, validateBoardIntegrity, enrichNewTaskWithTrelloMetadata } from './lib/trelloSync.js';
import { mergePostSync } from './lib/postSyncMerge.js';
import { applyTaskUpdate, applyBatchTaskUpdate, applyActionUpdate, computeTagPropagation, applyTaskReorder } from './lib/handlers';
import { archiveTrelloList, archiveTrelloCard, deleteTrelloChecklistItem, deleteTrelloChecklist } from './lib/trello.js';
import { startTrelloLogin, validateAndLogin, restoreTrelloUser, trelloLogout } from './lib/trelloAuth.js';
import Header from './components/Header.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import OnboardingOverlay from './components/OnboardingOverlay.jsx';
import { Icon, StatusIcon } from './components/Icons.jsx';
import FilterSidebar from './components/FilterSidebar.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import AuthGate from './components/AuthGate.jsx';
import { ViewSkeleton } from './components/Skeletons.jsx';
import { useFilters } from './hooks/useFilters.js';
import useUndoRedo from './hooks/useUndoRedo.js';
import useMultiBoardData from './hooks/useMultiBoardData.js';

// Lazy-loaded views
const KanbanView = lazy(() => import('./components/KanbanView.jsx'));
const TimelineView = lazy(() => import('./components/TimelineView.jsx'));
const CalendarView = lazy(() => import('./components/CalendarView.jsx'));
const DashboardView = lazy(() => import('./components/DashboardView.jsx'));

// Lazy-loaded modals
const TaskDetailModal = lazy(() => import('./components/TaskDetailModal.jsx'));
const ActionDetailModal = lazy(() => import('./components/ActionDetailModal.jsx'));
const CategoriesManagementModal = lazy(() => import('./components/CategoriesManagementModal.jsx'));
const NewActionModal = lazy(() => import('./components/NewActionModal.jsx'));
const NewTaskModal = lazy(() => import('./components/NewTaskModal.jsx'));
const TrelloImportModal = lazy(() => import('./components/TrelloImportModal.jsx'));
const ExcelImportModal = lazy(() => import('./components/ExcelImportModal.jsx'));
const MemberManagementModal = lazy(() => import('./components/MemberManagementModal.jsx'));
const TrelloExportModal = lazy(() => import('./components/TrelloExportModal.jsx'));

const API_BASE_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)
    : '';

const App = () => {
    const darkMode = false;
    const [currentView, setCurrentView] = useState('kanban');

    // --- Multi-board state ---
    const [boardData, setBoardData] = useState(null);
    const [currentBoardId, setCurrentBoardId] = useState('board-default');

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
    // (showFilterSidebar, searchInputRef, filteredTasks etc. are in useFilters hook)
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [dataLoaded, setDataLoaded] = useState(false);
    const [loadCompleted, setLoadCompleted] = useState(false); // true only after cloud/local data fully loaded — gates auto-save
    const [loadFailed, setLoadFailed] = useState(false); // true when cloud load failed AND no local backup → boardData stays null (degraded preview)
    const [realtimeFlushNonce, setRealtimeFlushNonce] = useState(0); // bumped to flush a save deferred during the realtime guard window (M5)
    const [fileSha, setFileSha] = useState(() => {
        return localStorage.getItem('github_file_sha') || '';
    });
    const [customCountries, setCustomCountries] = useState(() => {
        const saved = localStorage.getItem('customCountries');
        return saved ? JSON.parse(saved) : [];
    });
    const [showTrelloImportModal, setShowTrelloImportModal] = useState(false);
    const [showTrelloRemapModal, setShowTrelloRemapModal] = useState(false);
    const [showExcelImport, setShowExcelImport] = useState(false);
    const [showMemberManagement, setShowMemberManagement] = useState(false);
    const [showTrelloExport, setShowTrelloExport] = useState(false);
    const [multiBoardMode, setMultiBoardMode] = useState(false);
    const [selectedBoardIds, setSelectedBoardIds] = useState([]);
    // Session-only flag: board IDs the current user has no Trello access to (403/404). Not persisted.
    const [accessDeniedBoardIds, setAccessDeniedBoardIds] = useState(() => new Set());
    const [trelloSyncStatus, setTrelloSyncStatus] = useState('idle'); // idle | syncing | synced | error
    const [trelloUser, setTrelloUser] = useState(null); // null = guest, or { id, fullName, username, avatarUrl, token }
    const [authenticated, setAuthenticated] = useState(() => {
        return !!(sessionStorage.getItem('guest_auth') || localStorage.getItem('trello_user_token'));
    });
    const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
    const [otherTabActive, setOtherTabActive] = useState(false);
    const [realtimeConnected, setRealtimeConnected] = useState(null); // null = not applicable, true = connected, false = disconnected
    const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('onboarding_done'));
    const trelloSyncIntervalRef = useRef(null);
    const handleTrelloSyncRef = useRef(null);

    const createDropdownRef = useRef(null);
    const exportDropdownRef = useRef(null);
    const boardDataRef = useRef(boardData);
    const fileShaRef = useRef(fileSha);
    const isUserInteractingRef = useRef(false);
    const justSavedTimestampRef = useRef(0);
    // Restore last save ID from sessionStorage to detect echoes after page reload
    const lastSaveIdRef = useRef(sessionStorage.getItem('mkt_last_save_id') || null);
    const loadCompletedRef = useRef(false);

    // --- Derive active board data ---
    const currentBoard = useMemo(() => {
        if (!boardData?.boards) return null;
        return boardData.boards.find(b => b.id === currentBoardId) || boardData.boards[0];
    }, [boardData, currentBoardId]);

    const boards = boardData?.boards || [];

    // --- Multi-board merged data ---
    const multiBoardData = useMultiBoardData(
        multiBoardMode ? selectedBoardIds : [],
        boardData?.boards || []
    );
    const effectiveMembers = multiBoardMode
        ? multiBoardData.members
        : (currentBoard?.members || []);

    // When multi-board mode is active, views read from the merged read-only data.
    // Otherwise they read from the active board.
    const categories = multiBoardMode
        ? multiBoardData.categories
        : (currentBoard?.categories || CONFIG.CATEGORIES);
    const actions = multiBoardMode
        ? multiBoardData.actions
        : (currentBoard?.actions || DEFAULT_ACTIONS);
    const tasks = multiBoardMode
        ? multiBoardData.tasks
        : (currentBoard?.tasks || DEFAULT_TASKS);

    // --- Filters, archive filtering, and derived filter state ---
    const { filters, setFilters, showFilterSidebar, setShowFilterSidebar, searchInputRef, visibleTasks, visibleActions, activeFilterCount, filteredTasks, filteredBudget, isFiltered } = useFilters(tasks, actions);

    // --- Undo/Redo + History panel ---
    const { pushState, undo, redo, jumpTo, clear: clearHistory, getHistory, suspend: suspendHistory, resume: resumeHistory, canUndo, canRedo, isUndoRedoRef, recentUndoRef, currentIndex: historyCurrentIndex } = useUndoRedo(setBoardData, () => boardDataRef.current);
    // Window (ms) during which incoming Realtime events + pre-save merge fetches are
    // blocked after an undo/redo/jumpTo. Without this guard, the server echo of the
    // pre-undo state would silently overwrite the restored board before the user
    // could push the new state back to Trello.
    const RECENT_UNDO_WINDOW_MS = 10000;
    const isRecentUndo = () => Date.now() - (recentUndoRef?.current || 0) < RECENT_UNDO_WINDOW_MS;
    const [showHistoryPanel, setShowHistoryPanel] = useState(false);

    // Read-only when: (a) guest on Trello-linked board, (b) user has no access to linked Trello board, or (c) multi-board combined view
    const isAccessDenied = currentBoard?.id ? accessDeniedBoardIds.has(currentBoard.id) : false;
    const isReadOnly = (!trelloUser && !!currentBoard?.trelloSync?.trelloBoardId)
        || isAccessDenied
        || multiBoardMode;

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
                setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[],showArchived:false});
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
            // Regenerate IDs to avoid cross-board conflicts. Categories must be remapped too
            // (and action.categoryId rewritten), otherwise the copy shares category ids with
            // the source and the two cross-contaminate in combined view (M7).
            const categoryIdMap = {};
            cloned.categories = cloned.categories.map(c => {
                const newCId = `cat-${crypto.randomUUID()}`;
                categoryIdMap[c.id] = newCId;
                return { ...c, id: newCId };
            });
            const actionIdMap = {};
            cloned.actions = cloned.actions.map(a => {
                const newAId = `a-${crypto.randomUUID()}`;
                actionIdMap[a.id] = newAId;
                return { ...a, id: newAId, categoryId: categoryIdMap[a.categoryId] || a.categoryId };
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
            cloned.actions.forEach(a => { delete a.trelloCardId; delete a.trelloListId; delete a.trelloArchived; });
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
    const pendingRealtimeRef = useRef(null);
    const serverUpdatedAtRef = useRef(null);
    // M5: the exact boardData object applied by the last Realtime merge (reference identity),
    // a flag for a genuine user edit made during the 2s realtime guard window, and a nonce
    // that re-runs the auto-save effect once the window closes so that edit gets persisted.
    const lastRealtimeBoardRef = useRef(null);
    const pendingRealtimeEditRef = useRef(false);

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
            const result = await saveToSupabase(boardDataRef, setSyncing, showNotification, serverUpdatedAtRef);
            if (result) {
                saveToLocalStorage();
                return true;
            }
            // Supabase failed — try GitHub as fallback
            console.warn('⚠️ Supabase save failed, trying GitHub fallback...');
            if (githubToken) {
                const ghResult = await saveToGitHub(boardDataRef, fileShaRef, setFileSha, setSyncing, showNotification);
                if (ghResult) {
                    saveToLocalStorage();
                    showNotification('⚠️ Saved to GitHub (Supabase unavailable)');
                    return true;
                }
            }
            // Both failed — save to localStorage and warn user
            saveToLocalStorage();
            showNotification('⚠️ Cloud save failed — data saved locally only');
            return false;
        } else if (githubToken) {
            const result = await saveToGitHub(boardDataRef, fileShaRef, setFileSha, setSyncing, showNotification);
            if (result) saveToLocalStorage();
            return result;
        } else {
            saveToLocalStorage();
            return true;
        }
    };

    // Pre-save optimistic-concurrency check. If another client saved since our last known
    // server timestamp, fetch and merge their changes into boardDataRef (and the UI) BEFORE
    // we overwrite the cloud. Shared by the debounced auto-save, the manual Sync button, and
    // the reconnect ("back online") save so none of them clobbers concurrent remote edits
    // (M3). No-op without Supabase, inside the recent-undo window, or when nothing changed.
    const preSaveOccMerge = async () => {
        if (!useSupabase || !serverUpdatedAtRef.current || isRecentUndo()) return;
        try {
            const server = await fetchServerState(serverUpdatedAtRef.current);
            if (server && server.updated_at !== serverUpdatedAtRef.current && server.board_data?.version === 2) {
                const merged = mergeBoardsEntityLevel(boardDataRef.current, server.board_data);
                boardDataRef.current = merged;
                serverUpdatedAtRef.current = server.updated_at;
                setBoardData(merged);
            }
        } catch (e) {
            console.warn('Pre-save conflict check failed (continuing):', e.message);
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
            // Undo: Ctrl+Z / Cmd+Z — blocked in read-only (combined view / guest) so the
            // keyboard shortcut can't mutate board data that the UI otherwise locks.
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (isReadOnly) return;
                const label = undo();
                if (label) { setNotification('↩ Undo: ' + label); setTimeout(() => setNotification(null), 3000); }
                return;
            }
            // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
            if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
                e.preventDefault();
                if (isReadOnly) return;
                const label = redo();
                if (label) { setNotification('↪ Redo: ' + label); setTimeout(() => setNotification(null), 3000); }
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
        // Note: handleCreateNewTask is a stable useCallback([]) so it's intentionally
        // omitted from deps (and would be a TDZ reference here — it's defined later).
    }, [selectedTask, selectedAction, showCategoriesModal, showNewActionModal, showNewTaskModal, showFilterSidebar, showCreateDropdown, undo, redo, isReadOnly]);

    // Data loading on mount
    useEffect(() => {
        setGithubToken(useSupabase ? 'supabase' : 'vercel-api');

        const mountTimer = setTimeout(() => {
            setDataLoaded(true);
        }, 100);

        const timeoutId = setTimeout(() => {
            console.warn('⏱️ Loading timeout, using default data');
            const fallbackData = loadFromLocalStorageFn(showNotification);
            if (fallbackData) {
                setBoardData(fallbackData);
                setCurrentBoardId(fallbackData.currentBoardId || 'board-default');
            } else {
                // No cloud data loaded and no local backup → don't pretend the seed
                // data is editable (mutations would silently no-op). Surface it instead.
                setLoadFailed(true);
            }
            setLoadCompleted(true);
        }, 5000);

        const loadData = async () => {
            try {
                let result;
                if (useSupabase) {
                    result = await loadFromSupabase(showNotification, serverUpdatedAtRef);
                } else {
                    result = await loadDataFromGitHub(setFileSha, showNotification, () => loadFromLocalStorageFn(showNotification));
                }
                if (result) {
                    setBoardData(result);
                    setCurrentBoardId(result.currentBoardId || 'board-default');
                    // Save to localStorage as backup
                    boardDataRef.current = result;
                    saveToLocalStorage();
                } else {
                    setLoadFailed(true);
                }
                clearTimeout(timeoutId);
                setLoadCompleted(true);
            } catch (err) {
                console.error('Error loading data:', err);
                clearTimeout(timeoutId);
                const fallbackData = loadFromLocalStorageFn(showNotification);
                if (fallbackData) {
                    setBoardData(fallbackData);
                    setCurrentBoardId(fallbackData.currentBoardId || 'board-default');
                } else {
                    // Cloud load threw (network/RLS) and no local backup exists: keep
                    // boardData null and warn the user instead of silently no-opping edits.
                    setLoadFailed(true);
                }
                setLoadCompleted(true);
            }
        };
        loadData();

        return () => { clearTimeout(mountTimer); clearTimeout(timeoutId); };
    }, []);

    // Restore Trello user from localStorage on mount
    useEffect(() => {
        // The initial `authenticated` state is optimistic (true if a trello_user_token
        // string exists, regardless of validity). restoreTrelloUser validates it against
        // Trello and removes it if invalid/expired. If validation fails and the user is
        // not a guest, downgrade to unauthenticated so an expired/forged token can't
        // bypass the AuthGate (M4). Guests (sessionStorage.guest_auth) stay authenticated.
        const hadToken = !!localStorage.getItem('trello_user_token');
        const failAuth = () => { if (!sessionStorage.getItem('guest_auth')) setAuthenticated(false); };
        restoreTrelloUser().then(user => {
            if (user) { setTrelloUser(user); setAuthenticated(true); }
            else if (hadToken) failAuth();
        }).catch(failAuth);
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

    // Keep refs in sync with state
    useEffect(() => { boardDataRef.current = boardData; }, [boardData]);
    useEffect(() => { fileShaRef.current = fileSha; }, [fileSha]);
    useEffect(() => { loadCompletedRef.current = loadCompleted; }, [loadCompleted]);

    // Auto-save with debounce
    useEffect(() => {
        if (!dataLoaded || !loadCompleted || !boardData) return;
        if (isReceivingRealtimeRef.current) {
            // Inside the Realtime guard window. If this boardData is the very object the
            // Realtime merge just applied, it's not a local edit — skip. If it's a different
            // object, the user edited during the window; remember it so the save is flushed
            // when the window closes (M5) instead of being silently dropped.
            if (boardData !== lastRealtimeBoardRef.current) pendingRealtimeEditRef.current = true;
            return;
        }
        setSavingStatus('saving');
        if (autoSaveTimeoutRef.current) { clearTimeout(autoSaveTimeoutRef.current); }
        const delay = useSupabase ? 1000 : 2000;
        const doSave = async () => {
            // The scheduled timer has fired — this save is now executing, not "pending".
            // Clear the ref so the Realtime / GitHub-poll / visibilitychange guards (which
            // treat a truthy autoSaveTimeoutRef as "unsaved local changes pending → ignore
            // remote data") don't stay permanently blocked after the first save. The retry
            // branch below re-sets it because a save is then genuinely still scheduled.
            autoSaveTimeoutRef.current = null;
            if (isUserInteractingRef.current || isSyncInProgress()) {
                autoSaveTimeoutRef.current = setTimeout(doSave, 500);
                return;
            }
            // Pre-save conflict check (shared helper): merge any concurrent remote save
            // into boardDataRef + the UI before we overwrite the cloud. Skipped inside the
            // recent-undo window so the server echo of the pre-undo state can't sneak back.
            await preSaveOccMerge();
            // Stamp a save ID so Realtime can detect our own echo
            const saveId = crypto.randomUUID();
            lastSaveIdRef.current = saveId;
            try { sessionStorage.setItem('mkt_last_save_id', saveId); } catch (_) {}
            boardDataRef.current = { ...boardDataRef.current, _saveId: saveId };
            const success = await saveData();
            setSavingStatus(success ? 'saved' : 'error');
            if (!success) saveToLocalStorage();
            if (success) {
                justSavedTimestampRef.current = Date.now();
                saveSnapshot(boardDataRef.current, 'auto-save');
                // Auto-trigger Trello sync after save — ONLY for user-initiated changes.
                // Skip when syncRealtimeGuardRef is active (= save was triggered by sync result)
                // to prevent infinite save → sync → save → sync loop.
                if (!syncRealtimeGuardRef.current) {
                    const board = boardDataRef.current?.boards?.find(b => b.id === currentBoardId);
                    if (board?.trelloSync?.syncEnabled && board?.trelloSync?.trelloBoardId) {
                        if (postSaveSyncTimeoutRef.current) clearTimeout(postSaveSyncTimeoutRef.current);
                        // Use ref to avoid stale closure — handleTrelloSync depends on currentBoard
                        postSaveSyncTimeoutRef.current = setTimeout(() => { handleTrelloSyncRef.current?.(); }, 5000);
                    }
                }
            }
            setTimeout(() => setSavingStatus(null), 2000);
        };
        autoSaveTimeoutRef.current = setTimeout(doSave, delay);
        return () => { if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); };
    }, [boardData, dataLoaded, loadCompleted, githubToken, realtimeFlushNonce]);

    // Flush pending save on tab close / navigation away
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (postSaveSyncTimeoutRef.current) {
                clearTimeout(postSaveSyncTimeoutRef.current);
                postSaveSyncTimeoutRef.current = null;
            }
            if (autoSaveTimeoutRef.current && boardDataRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
                autoSaveTimeoutRef.current = null;
                // Synchronous localStorage save — guaranteed to complete before page unloads
                saveToLocalStorage();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Cleanup pending post-save sync on unmount
            if (postSaveSyncTimeoutRef.current) {
                clearTimeout(postSaveSyncTimeoutRef.current);
                postSaveSyncTimeoutRef.current = null;
            }
        };
    }, []);

    // visibilitychange handler — two roles:
    //   hidden  → mirror pending edits to localStorage as a safety net
    //             (browsers may suspend the tab mid cloud-save).
    //   visible → catch up on Realtime events the browser may have throttled while hidden.
    //             Chrome/Safari batch or delay WebSocket messages aggressively on background
    //             tabs, so the next Realtime UPDATE can be many seconds (or minutes) late.
    //             Doing a 2-pass OCC fetch on return is cheap (~50 bytes when nothing changed)
    //             and routes through the same merge path as the Realtime handler.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                if (autoSaveTimeoutRef.current && boardDataRef.current) {
                    saveToLocalStorage();
                }
                return;
            }
            if (!useSupabase || !loadCompletedRef.current || !serverUpdatedAtRef.current) return;
            if (isRecentUndo()) return;
            fetchServerState(serverUpdatedAtRef.current).then(server => {
                if (!server) return;
                if (server.updated_at === serverUpdatedAtRef.current) return;
                if (!server.board_data || server.board_data.version !== 2) return;
                // Echo filter — same logic as the Realtime handler.
                const incomingSaveId = server.board_data._saveId;
                if (incomingSaveId && incomingSaveId === lastSaveIdRef.current) {
                    serverUpdatedAtRef.current = server.updated_at;
                    return;
                }
                const payload = { new: { board_data: server.board_data, updated_at: server.updated_at } };
                // Same guards as the Realtime handler — queue if active, the drain useEffect picks it up.
                if (selectedTask || selectedAction || syncing || savingStatus === 'saving' || isUserInteractingRef.current || isSyncInProgress() || syncRealtimeGuardRef.current || autoSaveTimeoutRef.current || Date.now() - justSavedTimestampRef.current < 3000 || isRecentUndo()) {
                    pendingRealtimeRef.current = payload;
                    return;
                }
                processRealtimePayload(payload);
            }).catch(() => { /* network error — next Realtime event will catch up */ });
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [selectedTask, selectedAction, syncing, savingStatus]);

    // Network online/offline detection
    useEffect(() => {
        const goOffline = () => {
            setIsOffline(true);
            showNotification('📡 You are offline — changes saved locally');
        };
        const goOnline = () => {
            setIsOffline(false);
            showNotification('✅ Back online — syncing...');
            // Delay save to let Realtime reconnect and deliver pending events first
            setTimeout(async () => {
                if (boardDataRef.current && dataLoaded) {
                    // Merge any remote edits made while we were offline before overwriting (M3).
                    await preSaveOccMerge();
                    saveData();
                }
            }, 2000);
        };
        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, [dataLoaded]);

    // Concurrent tab detection via BroadcastChannel
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel('mkt_dashboard_tabs');
        // Announce this tab
        channel.postMessage({ type: 'tab-open' });
        channel.onmessage = (e) => {
            if (e.data?.type === 'tab-open') {
                setOtherTabActive(true);
                // Reply so the other tab also knows
                channel.postMessage({ type: 'tab-ack' });
            } else if (e.data?.type === 'tab-ack') {
                setOtherTabActive(true);
            } else if (e.data?.type === 'tab-close') {
                setOtherTabActive(false);
            }
        };
        const handleUnload = () => channel.postMessage({ type: 'tab-close' });
        window.addEventListener('beforeunload', handleUnload);
        return () => {
            channel.postMessage({ type: 'tab-close' });
            window.removeEventListener('beforeunload', handleUnload);
            channel.close();
        };
    }, []);

    // Process a Realtime payload: validate, entity-level merge, save backup
    const processRealtimePayload = (payload) => {
        const d = payload.new;
        isReceivingRealtimeRef.current = true;
        let incoming = null;
        if (d.board_data && d.board_data.version === 2) {
            incoming = d.board_data;
        } else if (d.categories) {
            incoming = migrateToV2({ categories: d.categories, actions: d.actions, tasks: d.tasks });
        }
        if (incoming) {
            incoming = {
                ...incoming,
                boards: incoming.boards.map(b => {
                    const integrity = validateBoardIntegrity(b);
                    if (integrity.warnings?.length) console.warn('[Realtime] Repaired incoming board:', integrity.warnings);
                    return integrity.board;
                })
            };
            // Entity-level merge: preserves local edits to different entities
            setBoardData(prev => {
                const merged = !prev?.boards ? incoming : mergeBoardsEntityLevel(prev, incoming);
                // Remember the exact object applied so the auto-save effect can tell this
                // Realtime update apart from a genuine user edit during the guard window (M5).
                lastRealtimeBoardRef.current = merged;
                return merged;
            });
        }
        if (d.updated_at) serverUpdatedAtRef.current = d.updated_at;
        saveToLocalStorage();
        showNotification('✅ Synced with team');
        setTimeout(() => {
            isReceivingRealtimeRef.current = false;
            // If the user edited during the window, the save was deferred — flush it now.
            if (pendingRealtimeEditRef.current) {
                pendingRealtimeEditRef.current = false;
                setRealtimeFlushNonce(n => n + 1);
            }
        }, 2000);
    };

    // Realtime sync
    useEffect(() => {
        if (!dataLoaded) return;

        if (useSupabase) {
            const channel = supabaseClient.channel('app_data_changes')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_data', filter: 'id=eq.default' }, (payload) => {
                    const d = payload.new;
                    // Skip our own echo — compare _saveId (always check, regardless of guards)
                    const incomingSaveId = d.board_data?._saveId;
                    if (incomingSaveId && incomingSaveId === lastSaveIdRef.current) {
                        return;
                    }
                    // Guard: queue events arriving before initial load completes
                    if (!loadCompletedRef.current) {
                        pendingRealtimeRef.current = payload;
                        return;
                    }
                    // Guards active → queue event for later instead of dropping it
                    if (selectedTask || selectedAction || syncing || savingStatus === 'saving' || isUserInteractingRef.current || isSyncInProgress() || syncRealtimeGuardRef.current || autoSaveTimeoutRef.current || Date.now() - justSavedTimestampRef.current < 3000 || isRecentUndo()) {
                        pendingRealtimeRef.current = payload;
                        return;
                    }
                    processRealtimePayload(payload);
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') setRealtimeConnected(true);
                    else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeConnected(false);
                    else if (status === 'TIMED_OUT') setRealtimeConnected(false);
                });
            return () => { supabaseClient.removeChannel(channel); setRealtimeConnected(null); };
        }

        if (githubToken) {
            const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
            const checkForUpdates = async () => {
                if (selectedTask || selectedAction || syncing || savingStatus === 'saving' || isReceivingRealtimeRef.current || isUserInteractingRef.current || syncRealtimeGuardRef.current || autoSaveTimeoutRef.current || Date.now() - justSavedTimestampRef.current < 3000 || isRecentUndo()) return;
                try {
                    const url = `${API_BASE_URL}/api/github`;
                    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.sha && fileShaRef.current && data.sha !== fileShaRef.current) {
                            showNotification('🔄 Syncing with team...');
                            const result = await loadDataFromGitHub(setFileSha, showNotification, () => loadFromLocalStorageFn(showNotification));
                            if (result) {
                                // Entity-level merge for GitHub polling too
                                setBoardData(prev => prev?.boards ? mergeBoardsEntityLevel(prev, result) : result);
                            }
                            showNotification('✅ Synced with team');
                        }
                    }
                } catch (_) { /* polling error — silent */ }
            };
            const interval = setInterval(checkForUpdates, 15000);
            return () => clearInterval(interval);
        }
    }, [dataLoaded, githubToken, selectedTask, selectedAction, syncing, savingStatus, fileSha]);

    // Process pending Realtime events when guards clear
    useEffect(() => {
        const tryProcessPending = () => {
            if (!pendingRealtimeRef.current) return true;
            if (selectedTask || selectedAction || syncing || savingStatus === 'saving') return false;
            if (isUserInteractingRef.current || isSyncInProgress() || syncRealtimeGuardRef.current) return false;
            if (autoSaveTimeoutRef.current || Date.now() - justSavedTimestampRef.current < 3000) return false;
            // Still inside the post-undo window: keep the event queued so the user's
            // restored state isn't silently overwritten by a delayed server echo.
            if (isRecentUndo()) return false;
            const payload = pendingRealtimeRef.current;
            pendingRealtimeRef.current = null;
            // Re-verify echo (our save might have completed while queued)
            const incomingSaveId = payload.new?.board_data?._saveId;
            if (incomingSaveId && incomingSaveId === lastSaveIdRef.current) return true;
            processRealtimePayload(payload);
            return true;
        };
        if (tryProcessPending()) return;
        // Poll for ref-based guards that don't trigger re-renders
        const interval = setInterval(() => { if (tryProcessPending()) clearInterval(interval); }, 500);
        return () => clearInterval(interval);
    }, [selectedTask, selectedAction, syncing, savingStatus, dataLoaded]);

    // Auto-initialize order and createdAt
    useEffect(() => {
        if (!dataLoaded || !currentBoard) return;
        const needsOrder = tasks.some(t => t.order === undefined);
        const needsCreatedAt = tasks.some(t => !t.createdAt);
        if (needsOrder || needsCreatedAt) {
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
            setActions(prev => prev.map((a, idx) => ({...a, order: a.order !== undefined ? a.order : idx})));
        }
    }, [dataLoaded, currentBoard, actions.length]);

    const showNotification = useCallback((msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); }, []);

    const handleSync = useCallback(async () => { await preSaveOccMerge(); return saveData(); }, []);

    // Pick a label suffix from the diff between current entity and incoming
    // updates, so distinct user actions get distinct history labels and never
    // coalesce into each other. Two consecutive "schedule" pushes still
    // coalesce (one drag = one entry). A "schedule" push followed by a
    // "description" push lives on its own entry.
    // The diff is needed because TaskDetailModal sends the whole form object on
    // close — we must ignore the keys that didn't actually change.
    const stableJSON = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
    const changedKeys = (current, updates) => {
        if (!updates || typeof updates !== 'object') return [];
        const out = [];
        for (const k of Object.keys(updates)) {
            const a = current ? current[k] : undefined;
            const b = updates[k];
            if (stableJSON(a) !== stableJSON(b)) out.push(k);
        }
        return out;
    };
    const labelSuffixForTaskDiff = (changed) => {
        const set = new Set(changed);
        if (set.has('description')) return 'description edited';
        if (changed.some(x => ['startDate','dueDate','month'].includes(x))) return 'schedule changed';
        if (set.has('swimLane') || set.has('order')) return 'reordered';
        if (set.has('actionId')) return 'moved';
        if (set.has('status')) return 'status changed';
        if (set.has('priority')) return 'priority changed';
        if (set.has('title')) return 'renamed';
        if (set.has('checklist') || set.has('checklists')) return 'checklist edited';
        if (changed.some(x => ['comments','attachments'].includes(x))) return 'extras edited';
        if (changed.some(x => ['channels','countries','otherLabels','assignees'].includes(x))) return 'tags changed';
        if (set.has('budget')) return 'budget changed';
        return 'updated';
    };
    const labelSuffixForActionDiff = (changed) => {
        const set = new Set(changed);
        if (set.has('description')) return 'description edited';
        if (set.has('name')) return 'renamed';
        if (set.has('categoryId')) return 'moved';
        if (set.has('status')) return 'status changed';
        if (changed.some(x => ['startDate','dueDate'].includes(x))) return 'schedule changed';
        if (changed.some(x => ['tags','channels','countries','otherLabels','assignees'].includes(x))) return 'tags changed';
        if (set.has('budget')) return 'budget changed';
        if (set.has('order')) return 'reordered';
        return 'updated';
    };

    const handleUpdateTask = useCallback((taskId, updates) => {
        if (!isUndoRedoRef.current) {
            const task = tasks.find(t => t.id === taskId);
            const title = task?.title || 'Task';
            const changed = changedKeys(task, updates);
            if (changed.length === 0) {
                // No-op update (e.g. modal close with no edits) — don't pollute history.
                setTasks(prev => applyTaskUpdate(prev, taskId, updates));
                return;
            }
            // Typed label = one entry per distinct kind of edit. Same kind of
            // edit on the same task within 400ms still coalesces (the drag
            // gesture keeps producing one snapshot of the pre-drag state).
            pushState(boardDataRef.current, `Task "${title}" — ${labelSuffixForTaskDiff(changed)}`);
        }
        setTasks(prev => applyTaskUpdate(prev, taskId, updates));
        showNotification('✅ Task updated');
    }, [tasks, setTasks, showNotification, pushState]);

    const handleBatchUpdateTasks = useCallback((updates) => {
        if (!isUndoRedoRef.current) {
            const count = Array.isArray(updates) ? updates.length : 0;
            // Use the keys actually present in the first entry's changes object
            // — batch updates rarely include unchanged fields, so the keys map
            // 1:1 to the user's intent.
            const firstChanges = Array.isArray(updates) && updates[0]?.changes;
            const keys = firstChanges ? Object.keys(firstChanges) : [];
            const suffix = labelSuffixForTaskDiff(keys);
            pushState(boardDataRef.current, `Batch ${suffix} (${count} task${count === 1 ? '' : 's'})`);
        }
        setTasks(prev => applyBatchTaskUpdate(prev, updates));
    }, [setTasks, pushState]);

    const handleUpdateAction = useCallback((actionId, updates) => {
        const oldAction = actions.find(a => a.id === actionId);
        if (!isUndoRedoRef.current) {
            const changed = changedKeys(oldAction, updates);
            if (changed.length === 0) {
                setActions(prev => applyActionUpdate(prev, actionId, updates));
                return;
            }
            pushState(boardDataRef.current, `Action "${oldAction?.name || 'Action'}" — ${labelSuffixForActionDiff(changed)}`);
        }
        setActions(prev => applyActionUpdate(prev, actionId, updates));
        const linkedTasks = tasks.filter(t => t.actionId === actionId);
        const batchUpdates = computeTagPropagation(oldAction, updates, linkedTasks);
        // Apply tag propagation directly (no separate pushState): the action's snapshot
        // above already captured the whole board pre-change, so a second history entry
        // would force the user to press undo twice for one logical edit. (M7)
        if (batchUpdates.length > 0) setTasks(prev => applyBatchTaskUpdate(prev, batchUpdates));
        showNotification('✅ Action updated');
    }, [actions, tasks, setActions, setTasks, showNotification, pushState]);

    const handleDeleteAction = useCallback(async (actionId) => {
        const actionForLabel = actions.find(a => a.id === actionId);
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Action "${actionForLabel?.name || 'Action'}" deleted`);
        // No confirm() here — caller (ActionDetailModal) handles confirmation popup
        const action = actions.find(a => a.id === actionId);
        // Prevent deletion of default action in card-as-task mode (would orphan all tasks)
        if (action?.isDefault && currentBoard?.trelloSync?.syncMode !== 'card-as-action') {
            showNotification('Cannot delete the default action — tasks depend on it');
            return;
        }
        const syncMode = currentBoard?.trelloSync?.syncMode;
        // Track deleted card ID to prevent re-import race condition (card-as-action mode)
        if (syncMode === 'card-as-action' && action?.trelloCardId) {
            const deletedCardEntry = { id: action.trelloCardId, at: Date.now() };
            // Also collect trelloCardIds from child tasks (same card, but belt-and-suspenders)
            updateCurrentBoard(b => ({
                ...b,
                actions: b.actions.filter(a => a.id !== actionId),
                tasks: b.tasks.filter(t => t.actionId !== actionId),
                trelloSync: {
                    ...b.trelloSync,
                    _recentlyDeletedCardIds: [
                        ...(b.trelloSync?._recentlyDeletedCardIds || []),
                        deletedCardEntry
                    ]
                }
            }));
            if (!isReadOnly) {
                try { await archiveTrelloCard(action.trelloCardId); }
                catch(e) { console.warn('Failed to archive Trello card:', e); }
            }
            showNotification('🗑️ Action deleted');
            return;
        }
        // Archive linked Trello card in card-as-action mode (fallback for no trelloCardId)
        if (action?.trelloCardId && !isReadOnly && syncMode === 'card-as-action') {
            try { await archiveTrelloCard(action.trelloCardId); }
            catch(e) { console.warn('Failed to archive Trello card:', e); }
        }
        setActions(prev => prev.filter(a => a.id !== actionId));
        setTasks(prev => prev.filter(t => t.actionId !== actionId));
        showNotification('🗑️ Action deleted');
    }, [actions, currentBoard, isReadOnly, updateCurrentBoard, setActions, setTasks, showNotification, pushState]);

    const handleAddTask = useCallback((actionId, customStartDate = null, customDueDate = null) => {
        const action = actions.find(a => a.id === actionId);
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Task created in "${action?.name || 'Action'}"`);
        const startDate = customStartDate || new Date().toISOString().split('T')[0];
        const month = new Date(startDate).getMonth();
        let dueDate;
        if (customDueDate) {
            dueDate = customDueDate;
        } else {
            const year = new Date(startDate).getFullYear();
            const endOfMonth = new Date(year, month + 1, 0).getDate();
            dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${endOfMonth}`;
        }
        const maxOrder = Math.max(...tasks.map(t => t.order || 0), -1) + 1;
        const now = new Date().toISOString();
        // In card-as-action mode, use existing checklist name from sibling tasks (mirrors handleAddTaskInGroup)
        const siblingTask = tasks.find(t => t.actionId === actionId && t.trelloChecklistName);
        const trelloChecklistName = siblingTask?.trelloChecklistName || 'Tasks';
        const trelloChecklistId = siblingTask?.trelloChecklistId || null;
        const newTask = { id: `t-${crypto.randomUUID()}`, actionId, month, startDate, title: 'New task', description: '', status: 'todo', priority: 'medium', dueDate, budget: 0, channels: action?.tags || [], checklist: [], comments: [], attachments: [], order: maxOrder, createdAt: now, updatedAt: now, trelloChecklistName, trelloCardId: siblingTask?.trelloCardId || action?.trelloCardId || null, trelloChecklistId };
        setTasks(prev => [...prev, newTask]);
        setSelectedTask(newTask);
        showNotification('✅ Task created');
    }, [actions, tasks, setTasks, setSelectedTask, showNotification, pushState]);

    const handleMoveTask = useCallback((taskId, direction) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Task "${task.title || 'Task'}" moved ${direction}`);
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
    }, [tasks, setTasks, showNotification, pushState]);

    const handleReorderTask = useCallback((draggedId, targetId, position) => {
        const draggedTask = tasks.find(t => t.id === draggedId);
        const targetTask = tasks.find(t => t.id === targetId);
        if (!draggedTask || !targetTask || draggedId === targetId) return;
        const isDifferentColumn = (draggedTask.month !== undefined && targetTask.month !== undefined && draggedTask.month !== targetTask.month) ||
            (draggedTask.status !== undefined && targetTask.status !== undefined && draggedTask.status !== targetTask.status);
        if (!isUndoRedoRef.current) {
            const label = isDifferentColumn
                ? `Task "${draggedTask.title || 'Task'}" moved to new column`
                : `Task "${draggedTask.title || 'Task'}" reordered`;
            pushState(boardDataRef.current, label);
        }
        setTasks(prev => applyTaskReorder(prev, draggedId, targetId, position));
        showNotification(isDifferentColumn ? '✅ Task moved to new column' : '✅ Task reordered');
    }, [tasks, setTasks, showNotification, pushState]);

    const handleMoveAction = useCallback((actionId, direction) => {
        const action = actions.find(a => a.id === actionId);
        if (!action) return;
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Action "${action.name || 'Action'}" moved ${direction}`);
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
    }, [actions, setActions, showNotification, pushState]);

    const handleReorderAction = useCallback((draggedId, targetId, position) => {
        if (draggedId === targetId) return;
        const draggedAction = actions.find(a => a.id === draggedId);
        const targetAction = actions.find(a => a.id === targetId);
        if (!draggedAction || !targetAction) return;
        if (!isUndoRedoRef.current) {
            const label = draggedAction.categoryId !== targetAction.categoryId
                ? `Action "${draggedAction.name || 'Action'}" moved to new category`
                : `Action "${draggedAction.name || 'Action'}" reordered`;
            pushState(boardDataRef.current, label);
        }
        if (draggedAction.categoryId !== targetAction.categoryId) {
            const targetActions = actions.filter(a => a.categoryId === targetAction.categoryId).sort((a, b) => (a.order || 0) - (b.order || 0));
            const targetIndex = targetActions.findIndex(a => a.id === targetId);
            if (targetIndex !== -1) {
                const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
                const oldCategoryActions = actions.filter(a => a.categoryId === draggedAction.categoryId && a.id !== draggedId).sort((a, b) => (a.order || 0) - (b.order || 0));
                const oldUpdates = oldCategoryActions.map((a, idx) => ({...a, order: idx}));
                targetActions.splice(insertIndex, 0, {...draggedAction, categoryId: targetAction.categoryId, updatedAt: new Date().toISOString()});
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
    }, [actions, setActions, showNotification, pushState]);

    const handleDeleteTask = useCallback(async (taskId) => {
        const task = tasks.find(t => t.id === taskId);
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Task "${task?.title || 'Task'}" deleted`);
        // Archive linked Trello card (card-as-task) or delete checklist item (card-as-action)
        if (task && !isReadOnly) {
            const syncMode = currentBoard?.trelloSync?.syncMode;
            if (syncMode === 'card-as-task' && task.trelloCardId) {
                // Track deleted card ID to prevent re-import during sync race condition
                updateCurrentBoard(b => ({
                    ...b,
                    tasks: b.tasks.filter(t => t.id !== taskId),
                    trelloSync: { ...b.trelloSync, _recentlyDeletedCardIds: [...(b.trelloSync?._recentlyDeletedCardIds || []), { id: task.trelloCardId, at: Date.now() }] }
                }));
                try { await archiveTrelloCard(task.trelloCardId); }
                catch(e) { console.warn('Failed to archive Trello card:', e); }
                showNotification('🗑️ Task deleted');
                return;
            } else if (syncMode === 'card-as-action' && task.trelloCheckItemId && task.trelloChecklistId) {
                try { await deleteTrelloChecklistItem(task.trelloChecklistId, task.trelloCheckItemId); }
                catch(e) { console.warn('Failed to delete Trello checklist item:', e); }
            }
        }
        setTasks(prev => prev.filter(t => t.id !== taskId));
        showNotification('🗑️ Task deleted');
    }, [tasks, currentBoard, isReadOnly, updateCurrentBoard, setTasks, showNotification, pushState]);

    const handleCreateNewTask = useCallback((initialValues = null) => { setNewTaskInitialValues(initialValues); setShowNewTaskModal(true); }, []);

    const handleOpenTask = useCallback((task) => {
        if (task.trelloLinkedCardUrl) {
            window.open(task.trelloLinkedCardUrl, '_blank');
            return;
        }
        setSelectedTask(task);
    }, []);

    const handleUpdateCategory = useCallback((catId, updates) => {
        if (!isUndoRedoRef.current) {
            const cat = categories.find(c => c.id === catId);
            pushState(boardDataRef.current, `Category "${cat?.name || 'Category'}" updated`);
        }
        setCategories(prev => prev.map(c => c.id === catId ? {...c, ...updates, updatedAt: new Date().toISOString()} : c));
        showNotification('✅ Category updated');
    }, [categories, setCategories, showNotification, pushState]);

    const handleAddCategory = useCallback((newCat) => {
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Category "${newCat?.name || 'Category'}" created`);
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
    }, [currentBoard, setCategories, setActions, showNotification, pushState]);

    const handleDeleteCategory = useCallback(async (catId) => {
        const category = categories.find(c => c.id === catId);
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Category "${category?.name || 'Category'}" deleted`);
        const catActions = actions.filter(a => a.categoryId === catId);
        const affectedTaskCount = tasks.filter(t => catActions.some(a => a.id === t.actionId)).length;
        const confirmMessage = catActions.length > 0
            ? `Are you sure you want to delete the category "${category?.name}" ?\n\nThis will also delete ${catActions.length} associated action(s) and ${affectedTaskCount} task(s).`
            : `Are you sure you want to delete the category "${category?.name}" ?`;
        if (!confirm(confirmMessage)) return;
        // Track deleted list/card IDs to prevent re-import during sync race condition
        const actionIds = new Set(catActions.map(a => a.id));
        const deletedCardIds = tasks.filter(t => actionIds.has(t.actionId) && t.trelloCardId).map(t => ({ id: t.trelloCardId, at: Date.now() }));
        const deletedListId = category?.trelloListId ? [{ id: category.trelloListId, at: Date.now() }] : [];
        updateCurrentBoard(b => ({
            ...b,
            categories: b.categories.filter(c => c.id !== catId),
            actions: b.actions.filter(a => a.categoryId !== catId),
            tasks: b.tasks.filter(t => !actionIds.has(t.actionId)),
            trelloSync: {
                ...b.trelloSync,
                _recentlyDeletedCardIds: [...(b.trelloSync?._recentlyDeletedCardIds || []), ...deletedCardIds],
                _recentlyDeletedListIds: [...(b.trelloSync?._recentlyDeletedListIds || []), ...deletedListId]
            }
        }));
        // Archive linked Trello list (if not guest/read-only)
        if (category?.trelloListId && !isReadOnly) {
            try { await archiveTrelloList(category.trelloListId); }
            catch(e) { console.warn('Failed to archive Trello list:', e); }
        }
        showNotification('🗑️ Category deleted');
    }, [categories, actions, tasks, isReadOnly, updateCurrentBoard, showNotification, pushState]);

    const handleReorderCategories = useCallback((reorderedCategories) => {
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Categories reordered (${reorderedCategories.length})`);
        const now = new Date().toISOString();
        setCategories(reorderedCategories.map((c, i) => ({...c, order: i, updatedAt: now})));
        showNotification('✅ Category order updated');
    }, [setCategories, showNotification, pushState]);

    const handleAddAction = useCallback((newAction) => {
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Action "${newAction?.name || 'Action'}" created`);
        const now = new Date().toISOString();
        setActions(prev => [...prev, { ...newAction, createdAt: newAction.createdAt || now, updatedAt: newAction.updatedAt || now }]);
        showNotification('✅ Action created');
    }, [setActions, showNotification, pushState]);

    // Rename checklist group (task category) — updates trelloChecklistName on all tasks in group
    // If oldName is null, creates a new empty group (no tasks to update)
    const handleRenameChecklistGroup = useCallback((oldName, newName) => {
        if (!oldName) {
            // Creating a new group — nothing to update yet, but we'll use this name when creating tasks
            showNotification(`✅ Group "${newName}" created`);
            return;
        }
        setTasks(prev => prev.map(t => t.trelloChecklistName === oldName ? {...t, trelloChecklistName: newName, updatedAt: new Date().toISOString()} : t));
        showNotification(`✅ Group renamed to "${newName}"`);
    }, [setTasks, showNotification]);

    // Delete an entire checklist group (all tasks in the group + Trello checklist)
    const handleDeleteTaskGroup = useCallback(async (actionId, groupName) => {
        const groupTasks = tasks.filter(t => t.actionId === actionId && (t.trelloChecklistName || 'Tasks') === groupName);
        const syncMode = currentBoard?.trelloSync?.syncMode;
        if (syncMode === 'card-as-action' && !isReadOnly) {
            for (const task of groupTasks) {
                if (task.trelloChecklistId && task.trelloCheckItemId) {
                    try { await deleteTrelloChecklistItem(task.trelloChecklistId, task.trelloCheckItemId); }
                    catch(e) { console.warn('Failed to delete Trello checklist item:', e); }
                }
            }
            const checklistId = groupTasks.find(t => t.trelloChecklistId)?.trelloChecklistId;
            if (checklistId) {
                try { await deleteTrelloChecklist(checklistId); }
                catch(e) { console.warn('Failed to delete Trello checklist:', e); }
            }
        }
        const groupTaskIds = new Set(groupTasks.map(t => t.id));
        setTasks(prev => prev.filter(t => !groupTaskIds.has(t.id)));
        showNotification(`🗑️ Group "${groupName}" deleted (${groupTasks.length} task(s))`);
    }, [tasks, currentBoard, isReadOnly, setTasks, showNotification]);

    // Add a task within a specific checklist group in an action card
    const handleAddTaskInGroup = useCallback((actionId, groupName, title) => {
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
    }, [actions, tasks, setTasks, showNotification]);

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

    // --- Excel import ---
    // Accepts either a single preview (legacy single-board form) or an array of
    // pre-built boards. The modal's new multi-sheet path passes an array; old
    // single-board callers still work via the first branch.
    const handleExcelImport = useCallback((payload, boardNameMaybe) => {
        const list = Array.isArray(payload) ? payload : [{
            name: boardNameMaybe || 'Excel Import',
            categories: payload.categories,
            actions: payload.actions,
            tasks: payload.tasks
        }];

        const now = new Date().toISOString();
        const newBoards = list.map(b => ({
            id: `board-${crypto.randomUUID()}`,
            name: b.name || 'Excel Import',
            createdAt: now,
            updatedAt: now,
            categories: b.categories || [],
            actions: b.actions || [],
            tasks: b.tasks || [],
            members: []
        }));

        setBoardData(prev => ({
            ...prev,
            currentBoardId: newBoards[newBoards.length - 1].id,
            boards: [...prev.boards, ...newBoards]
        }));
        setCurrentBoardId(newBoards[newBoards.length - 1].id);
        setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[]});
        const verb = newBoards.length === 1 ? `Imported "${newBoards[0].name}"` : `Imported ${newBoards.length} boards`;
        showNotification(`✅ ${verb} from Excel`);
    }, []);

    // --- Member management ---
    const handleUpdateMembers = useCallback((members) => {
        updateCurrentBoard(b => ({ ...b, members }));
        showNotification(`✅ Members updated (${members.length})`);
    }, [updateCurrentBoard, showNotification]);

    // --- Trello export connected ---
    const handleTrelloExportConnected = useCallback((syncData) => {
        updateCurrentBoard(b => ({
            ...b,
            categories: syncData.categories || b.categories,
            actions: syncData.actions || b.actions,
            tasks: syncData.tasks || b.tasks,
            trelloSync: syncData.trelloSync || b.trelloSync
        }));
        showNotification('✅ Board exported to Trello and linked for sync');
    }, [updateCurrentBoard, showNotification]);

    // --- Multi-board toggle ---
    const handleToggleMultiBoard = useCallback((enabled, ids) => {
        setMultiBoardMode(enabled);
        setSelectedBoardIds(ids || []);
        // Reset filters: a category/member/channel filter scoped to one board can hide
        // everything in the combined set (or the board switched to) (M6).
        setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[],showArchived:false});
    }, []);

    // --- Trello sync ---
    const handleTrelloSync = useCallback(async () => {
        if (!currentBoard?.trelloSync?.trelloBoardId) return;
        if (!navigator.onLine) return; // Skip sync when offline
        if (trelloSyncStatus === 'syncing') return; // Prevent concurrent syncs
        setTrelloSyncStatus('syncing');
        suspendHistory();
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
            // Capture pre-sync timestamps to detect local edits made during sync
            const preSyncTaskMap = new Map((currentBoard.tasks || []).map(t => [t.id, t.updatedAt]));
            const preSyncActionMap = new Map((currentBoard.actions || []).map(a => [a.id, a.updatedAt]));
            const preSyncCategoryMap = new Map((currentBoard.categories || []).map(c => [c.id, c.updatedAt]));
            const preSyncTaskIds = new Set((currentBoard.tasks || []).map(t => t.id));
            const preSyncActionIds = new Set((currentBoard.actions || []).map(a => a.id));
            const preSyncCategoryIds = new Set((currentBoard.categories || []).map(c => c.id));
            const { board: syncedBoard, result } = await syncWithTrello(currentBoard, mappingConfig, { readOnly: isGuest });
            // Block Realtime events during post-sync save window to prevent overwrites.
            // DO NOT set isReceivingRealtimeRef here — that blocks auto-save, preventing
            // synced data from being persisted. Use syncRealtimeGuardRef instead (checked by Realtime handler).
            syncRealtimeGuardRef.current = true;
            // Merge sync results with current state — preserve local edits made during sync
            setBoardData(prev => {
                const liveBoard = prev.boards.find(b => b.id === syncedBoard.id);
                if (!liveBoard) return { ...prev, boards: prev.boards.map(b => b.id === syncedBoard.id ? syncedBoard : b) };

                const { categories: mergedCategories, tasks: mergedTasks, actions: mergedActions } = mergePostSync({
                    syncedBoard, liveBoard,
                    preSyncCategoryIds, preSyncTaskIds, preSyncActionIds,
                    preSyncTaskMap, preSyncActionMap, preSyncCategoryMap
                });

                return {
                    ...prev,
                    boards: prev.boards.map(b => b.id === syncedBoard.id
                        ? { ...syncedBoard, categories: mergedCategories, tasks: mergedTasks, actions: mergedActions }
                        : b
                    )
                };
            });
            // Clear stale access-denied flag on successful sync
            setAccessDeniedBoardIds(prev => {
                if (!prev.has(syncedBoard.id)) return prev;
                const next = new Set(prev);
                next.delete(syncedBoard.id);
                return next;
            });
            // Clear guard after auto-save has had time to complete (save debounce + network)
            setTimeout(() => { syncRealtimeGuardRef.current = false; }, 8000);
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
                        const freshData = await loadFromSupabase(() => {}, serverUpdatedAtRef);
                        if (freshData && freshData.boards) {
                            // Only apply if there are boards we don't know about
                            const localBoardIds = new Set(boardDataRef.current?.boards?.map(b => b.id) || []);
                            const hasNewBoards = freshData.boards.some(b => !localBoardIds.has(b.id));
                            if (hasNewBoards) {
                                isReceivingRealtimeRef.current = true;
                                setBoardData(freshData);
                                setTimeout(() => { isReceivingRealtimeRef.current = false; }, 2000);
                            }
                        }
                    } catch (e) {
                        // Silent — best effort refresh
                    }
                }, 4000);
            }
        } catch (err) {
            console.error('Trello sync error:', err);
            setTrelloSyncStatus('error');

            // 401: token invalid/expired — global Trello logout
            if (err.status === 401) {
                showNotification('❌ Trello session expired — please reconnect');
                handleTrelloLogout();
                setTimeout(() => setTrelloSyncStatus('idle'), 5000);
                return;
            }

            // 403/404: user OK but has no access to THIS board — switch to read-only, don't retry
            if (err.status === 403 || err.status === 404) {
                setAccessDeniedBoardIds(prev => {
                    const next = new Set(prev);
                    if (currentBoard?.id) next.add(currentBoard.id);
                    return next;
                });
                showNotification(`⚠️ No access to linked Trello board — switched to read-only`);
                setTimeout(() => setTrelloSyncStatus('idle'), 5000);
                return;
            }

            // Other errors: attempt auto-restore from snapshot on critical failure
            try {
                const snapshot = JSON.parse(localStorage.getItem('trello_sync_snapshot'));
                if (snapshot?.board && Date.now() - snapshot.timestamp < 86400000) {
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
        } finally {
            resumeHistory();
        }
        // trelloUser is read as `isGuest = !trelloUser` inside — must be a dep so the
        // ref-based polling picks up login/logout (guest read-only ↔ full sync) (M3-minor).
    }, [currentBoard, trelloSyncStatus, suspendHistory, resumeHistory, handleTrelloLogout, trelloUser]);

    // Keep ref pointing to latest handleTrelloSync (avoids stale closure in setInterval)
    useEffect(() => { handleTrelloSyncRef.current = handleTrelloSync; }, [handleTrelloSync]);

    // Watchdog: if the Trello sync indicator stays on 'syncing' for more than
    // 45s, force-reset it to 'idle'. Covers any path that forgets to clear the
    // status (unhandled rejection, torn DOM, unmounted component) and keeps the
    // user-visible spinner from running forever.
    useEffect(() => {
        if (trelloSyncStatus !== 'syncing') return;
        const t = setTimeout(() => {
            console.warn('[Trello sync] UI status stuck in "syncing" for 45s — forcing reset to "idle"');
            setTrelloSyncStatus('idle');
        }, 45000);
        return () => clearTimeout(t);
    }, [trelloSyncStatus]);

    // Safety net: clear `isUserInteractingRef` after 60s. The ref is set on
    // Kanban/Timeline drag start and cleared on dragEnd — but if a drag is
    // interrupted (browser-level cancel, modal ate the drag-end event, mouse
    // released outside the window), the ref can get stuck TRUE and silently
    // block auto-save indefinitely. A slow watchdog notices and resets.
    useEffect(() => {
        let firstSeenAt = 0;
        const interval = setInterval(() => {
            if (!isUserInteractingRef.current) { firstSeenAt = 0; return; }
            if (!firstSeenAt) { firstSeenAt = Date.now(); return; }
            if (Date.now() - firstSeenAt > 60000) {
                console.warn('[UX] isUserInteractingRef stuck > 60s — force-clearing so auto-save can resume');
                isUserInteractingRef.current = false;
                firstSeenAt = 0;
            }
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    // --- Trello polling lifecycle ---
    // IMPORTANT: Does NOT depend on handleTrelloSync — uses ref instead.
    // Without this, every board change or sync status change would recreate
    // handleTrelloSync → reset the interval timer → auto-sync never fires.
    useEffect(() => {
        // Clear previous interval
        if (trelloSyncIntervalRef.current) {
            clearInterval(trelloSyncIntervalRef.current);
            trelloSyncIntervalRef.current = null;
        }
        // Start polling if current board has Trello sync enabled
        if (currentBoard?.trelloSync?.syncEnabled && currentBoard?.trelloSync?.trelloBoardId) {
            const intervalMs = currentBoard.trelloSync.pollIntervalMs || 60000;
            trelloSyncIntervalRef.current = setInterval(() => handleTrelloSyncRef.current(), intervalMs);
        }
        return () => {
            if (trelloSyncIntervalRef.current) clearInterval(trelloSyncIntervalRef.current);
        };
    }, [currentBoard?.trelloSync?.syncEnabled, currentBoard?.trelloSync?.pollIntervalMs, currentBoard?.id]);

    const handleUpdateTrelloSyncSettings = useCallback((updates) => {
        updateCurrentBoard(b => ({
            ...b,
            trelloSync: { ...b.trelloSync, ...updates }
        }));
    }, [updateCurrentBoard]);

    // Remove Trello link from current board — returns it to fully-editable local mode
    const handleUnlinkTrello = useCallback(() => {
        if (!confirm('Unlink this board from Trello? Tasks and data will remain; sync will stop.')) return;
        const boardId = currentBoard?.id;
        updateCurrentBoard(b => {
            const { trelloSync: _trelloSync, ...rest } = b;
            return rest;
        });
        if (boardId) {
            setAccessDeniedBoardIds(prev => {
                if (!prev.has(boardId)) return prev;
                const next = new Set(prev);
                next.delete(boardId);
                return next;
            });
        }
        showNotification('✅ Board unlinked from Trello');
    }, [currentBoard, updateCurrentBoard]);

    const handleAddNewTask = useCallback((newTask) => {
        if (!isUndoRedoRef.current) pushState(boardDataRef.current, `Task "${newTask?.title || 'Task'}" created`);
        const maxOrder = Math.max(...tasks.map(t => t.order || 0), -1) + 1;
        const now = new Date().toISOString();
        const enriched = enrichNewTaskWithTrelloMetadata({id: newTask.id || `t-${crypto.randomUUID()}`, status: 'todo', priority: 'medium', description: '', checklist: [], comments: [], attachments: [], channels: [], month: new Date().getMonth(), ...newTask, order: maxOrder, createdAt: newTask.createdAt || now, updatedAt: newTask.updatedAt || now}, tasks, actions);
        setTasks(prev => [...prev, enriched]);
        showNotification('✅ Task created');
    }, [tasks, actions, setTasks, showNotification, pushState]);

    const exportToJSON = useCallback(() => {
        const data = {categories, actions, tasks, exportDate: new Date().toISOString()};
        const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marketing-tracker-${currentBoard?.name || 'export'}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('📥 JSON export downloaded');
    }, [categories, actions, tasks, currentBoard, showNotification]);

    const exportToCSV = useCallback(() => {
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
    }, [categories, actions, tasks, currentBoard, showNotification]);

    const totalBudget = tasks.reduce((s, t) => s + (t.budget || 0), 0);

    // --- Context values (split for targeted re-renders) ---
    const boardContextValue = useMemo(() => ({
        boards,
        currentBoardId,
        currentBoard,
        categories,
        actions,
        tasks,
        isReadOnly,
        allCountries,
        effectiveMembers,
        multiBoardMode,
        selectedBoardIds,
        onToggleMultiBoard: handleToggleMultiBoard,
        onSwitchBoard: handleSwitchBoard,
        onCreateBoard: handleCreateBoard,
        onRenameBoard: handleRenameBoard,
        onDeleteBoard: handleDeleteBoard,
        onDuplicateBoard: handleDuplicateBoard,
        onShowTrelloImport: () => setShowTrelloImportModal(true),
        onOpenRemapLabels: () => setShowTrelloRemapModal(true),
        onShowTrelloExport: () => setShowTrelloExport(true),
        onShowMemberManagement: () => setShowMemberManagement(true),
        onShowExcelImport: () => setShowExcelImport(true),
        onTrelloSync: handleTrelloSync,
        onUpdateTrelloSyncSettings: handleUpdateTrelloSyncSettings,
        trelloSyncStatus,
        trelloUser,
        onTrelloLogin: handleTrelloLogin,
        onTrelloLogout: handleTrelloLogout,
        canUndo, canRedo,
        onUndo: undo, onRedo: redo
    }), [boards, currentBoardId, currentBoard, categories, actions, tasks, isReadOnly, allCountries, effectiveMembers, multiBoardMode, selectedBoardIds, handleToggleMultiBoard, handleSwitchBoard, handleCreateBoard, handleRenameBoard, handleDeleteBoard, handleDuplicateBoard, handleTrelloSync, handleUpdateTrelloSyncSettings, trelloSyncStatus, trelloUser, handleTrelloLogin, handleTrelloLogout, canUndo, canRedo, undo, redo]);

    const filterContextValue = useMemo(() => ({
        filters,
        setFilters
    }), [filters]);

    // Legacy unified context (backward compat — will be removed after migration)
    const contextValue = useMemo(() => ({
        ...boardContextValue,
        filters,
        setFilters
    }), [boardContextValue, filters]);

    if (!authenticated) return <AuthGate onTrelloLogin={handleTrelloLogin} onValidateToken={handleValidateToken} onGuestLogin={handleGuestLogin}/>;

    if (!dataLoaded) return (<div className="min-h-screen flex items-center justify-center" style={{background:'var(--bg-page)'}}><div className="text-center" style={{color:'var(--text-primary)'}}><div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{borderColor:'var(--accent)',borderTopColor:'transparent'}}/><p>Loading data...</p></div></div>);

    return (
        <BoardContext.Provider value={boardContextValue}>
        <FilterContext.Provider value={filterContextValue}>
        <AppContext.Provider value={contextValue}>
            <div className="min-h-screen" style={{background:'var(--bg-page)'}}>
                {isOffline && (
                    <div style={{background:'#f59e0b',color:'#fff',textAlign:'center',padding:'6px 12px',fontSize:13,fontWeight:600}}>
                        📡 Offline — changes saved locally. Will sync when back online.
                    </div>
                )}
                {loadFailed && !boardData && (
                    <div style={{background:'#ef4444',color:'#fff',textAlign:'center',padding:'6px 12px',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
                        <span>⚠️ Your data could not be loaded (network/server issue). This is a preview — changes will NOT be saved.</span>
                        <button onClick={() => window.location.reload()} style={{background:'#fff',color:'#ef4444',border:'none',borderRadius:4,padding:'3px 10px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Reload</button>
                    </div>
                )}
                {otherTabActive && !isOffline && (
                    <div style={{background:'#f97316',color:'#fff',textAlign:'center',padding:'6px 12px',fontSize:13,fontWeight:600}}>
                        ⚠️ This app is open in another tab — simultaneous edits may cause data conflicts.
                    </div>
                )}
                {isAccessDenied && (
                    <div style={{background:'#f97316',color:'#fff',textAlign:'center',padding:'6px 12px',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
                        <span>🔒 You don't have access to the linked Trello board — read-only mode.</span>
                        <button onClick={handleUnlinkTrello} style={{background:'#fff',color:'#f97316',border:'none',borderRadius:4,padding:'3px 10px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Unlink Trello</button>
                    </div>
                )}
                {multiBoardMode && (
                    <div style={{background:'#f97316',color:'#fff',textAlign:'center',padding:'6px 12px',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
                        <span>👁 Combined view — read-only. Changes are disabled while viewing multiple boards.</span>
                        <button onClick={() => handleToggleMultiBoard(false, [])} style={{background:'#fff',color:'#f97316',border:'none',borderRadius:4,padding:'3px 10px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Exit combined view</button>
                    </div>
                )}
                <Header currentView={currentView} setCurrentView={setCurrentView} onSync={handleSync} syncing={syncing} githubConnected={!!githubToken} savingStatus={savingStatus} trelloSync={currentBoard?.trelloSync} trelloSyncStatus={trelloSyncStatus} onTrelloSync={handleTrelloSync} isOffline={isOffline} realtimeConnected={realtimeConnected}/>
                <main style={{maxWidth:1600,margin:'0 auto',padding:'var(--space-4) var(--space-6)'}}>
                    <div className="toolbar">
                        <button className={`filter-btn ${showFilterSidebar ? 'active' : ''}`} onClick={() => setShowFilterSidebar(!showFilterSidebar)}>
                            <Icon.Filter/>Filters
                            {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
                        </button>
                        {trelloUser && <button className={`filter-btn ${filters.member?.includes(trelloUser.id) ? 'active' : ''}`} onClick={() => { const isMine = filters.member?.includes(trelloUser.id); setFilters({...filters, member: isMine ? filters.member.filter(m => m !== trelloUser.id) : [...(filters.member||[]), trelloUser.id]}); }} style={{fontSize:11,padding:'4px 10px'}} title="Show only my tasks">My tasks</button>}
                        <div className="stats-pills">
                            <span className="stat-pill"><strong>{isFiltered ? `${filteredTasks.length} / ${tasks.length}` : tasks.length}</strong> tasks</span>
                            <span className="stat-pill"><strong>{isFiltered ? `${(filteredBudget/1000).toFixed(0)}k / ${(totalBudget/1000).toFixed(0)}k€` : `${(totalBudget/1000).toFixed(0)}k€`}</strong> budget</span>
                        </div>
                        <div className="toolbar-spacer"/>
                        {!isReadOnly && <button className="v11-btn-icon" onClick={() => setShowHistoryPanel(true)} title="History" style={{padding:'6px 8px',marginRight:4,color:'var(--text-secondary)'}}><Icon.History size={14}/></button>}
                        <div className="new-btn-container" ref={exportDropdownRef}>
                            <button className="v11-btn-secondary" onClick={() => {setShowCreateDropdown(false);setShowExportDropdown(!showExportDropdown);}}><Icon.Download size={13}/><span>Export</span></button>
                            {showExportDropdown && <div className="dropdown-menu open" style={{minWidth:180}}>
                                <button onClick={() => {setShowExportDropdown(false);exportToJSON();}} className="dropdown-item">Export JSON</button>
                                <button onClick={() => {setShowExportDropdown(false);exportToCSV();}} className="dropdown-item">Export CSV</button>
                                <div className="dropdown-divider"/>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportTimelineXlsx } = await import('./lib/excelExport.js'); exportTimelineXlsx(categories, actions, tasks, selectedYear, currentBoard?.name);}} className="dropdown-item">Export Timeline (Excel)</button>
                                <div className="dropdown-item" style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,letterSpacing:0.3,textTransform:'uppercase',padding:'6px 12px 2px',cursor:'default'}}>Kanban (Excel)</div>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportKanbanXlsx } = await import('./lib/excelExport.js'); exportKanbanXlsx(categories, actions, tasks, currentBoard?.name, 'category');}} className="dropdown-item" style={{paddingLeft:24}}>By category</button>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportKanbanXlsx } = await import('./lib/excelExport.js'); exportKanbanXlsx(categories, actions, tasks, currentBoard?.name, 'status');}} className="dropdown-item" style={{paddingLeft:24}}>By status</button>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportKanbanXlsx } = await import('./lib/excelExport.js'); exportKanbanXlsx(categories, actions, tasks, currentBoard?.name, 'month');}} className="dropdown-item" style={{paddingLeft:24}}>By month</button>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportKanbanXlsx } = await import('./lib/excelExport.js'); exportKanbanXlsx(categories, actions, tasks, currentBoard?.name, 'quarter');}} className="dropdown-item" style={{paddingLeft:24}}>By quarter</button>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportKanbanXlsx } = await import('./lib/excelExport.js'); exportKanbanXlsx(categories, actions, tasks, currentBoard?.name, 'country');}} className="dropdown-item" style={{paddingLeft:24}}>By country</button>
                                <div className="dropdown-divider"/>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportTimelinePPT } = await import('./lib/pptExport.js'); exportTimelinePPT(categories, actions, tasks, selectedYear, currentBoard?.name);}} className="dropdown-item">Export Timeline (PowerPoint)</button>
                                <button onClick={async () => {setShowExportDropdown(false); const { exportKanbanPPT } = await import('./lib/pptExport.js'); exportKanbanPPT(categories, actions, tasks, currentBoard?.name);}} className="dropdown-item">Export Kanban (PowerPoint)</button>
                                <div className="dropdown-divider"/>
                                <button onClick={() => {setShowExportDropdown(false);setShowExcelImport(true);}} className="dropdown-item">Import from Excel</button>
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
                                    <div className="dropdown-item-content"><div className="dropdown-item-title">New task</div><div className="dropdown-item-desc">{currentBoard?.trelloSync?.syncMode === 'card-as-task' ? 'Add a task to a category' : 'Add a task to an action'}</div></div>
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
                            {(filters.member || []).map(memberId => { const m = effectiveMembers.find(x => x.id === memberId); return <div key={memberId} className="filter-chip" style={{display:'flex',alignItems:'center',gap:4}}>{m?.avatarUrl ? <img src={m.avatarUrl} alt="" style={{width:14,height:14,borderRadius:'50%'}}/> : null} {m?.fullName||m?.username||'Member'}<button onClick={() => setFilters({...filters, member: filters.member.filter(x => x !== memberId)})}>✕</button></div>; })}
                            <span className="clear-filters" onClick={() => setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[]})}>Clear all</span>
                        </div>
                    )}
                    <ErrorBoundary>
                    <Suspense fallback={<ViewSkeleton view={currentView} />}>
                    {currentView === 'kanban' && <KanbanView categories={categories} actions={visibleActions} tasks={visibleTasks} onOpenTask={handleOpenTask} onOpenAction={setSelectedAction} onUpdateTask={handleUpdateTask} onUpdateAction={handleUpdateAction} onBatchUpdateTasks={handleBatchUpdateTasks} onAddTask={handleAddNewTask} onAddAction={handleAddAction} onMoveTask={handleMoveTask} onReorderTask={handleReorderTask} onMoveAction={handleMoveAction} onReorderAction={handleReorderAction} filters={filters} setFilters={setFilters} allCountries={allCountries} selectedYear={selectedYear} onYearChange={setSelectedYear} isReadOnly={isReadOnly} onRequestNewTask={handleCreateNewTask} onUpdateCategory={handleUpdateCategory} onAddCategory={handleAddCategory} onDeleteCategory={handleDeleteCategory} isCardAsTask={currentBoard?.trelloSync?.syncMode === 'card-as-task'} isUserInteractingRef={isUserInteractingRef} boardGroups={multiBoardMode ? multiBoardData.boardGroups : null}/>}
                    {currentView === 'timeline' && <TimelineView categories={categories} actions={visibleActions} tasks={visibleTasks} onOpenTask={handleOpenTask} onOpenAction={setSelectedAction} onUpdateTask={handleUpdateTask} onBatchUpdateTasks={handleBatchUpdateTasks} onUpdateAction={handleUpdateAction} onReorderAction={isReadOnly ? null : handleReorderAction} onAddTask={handleAddTask} filters={filters} setFilters={setFilters} selectedYear={selectedYear} onYearChange={setSelectedYear} isUserInteractingRef={isUserInteractingRef} isReadOnly={isReadOnly} onRequestNewTask={handleCreateNewTask} isCardAsTask={currentBoard?.trelloSync?.syncMode === 'card-as-task'} boardGroups={multiBoardMode ? multiBoardData.boardGroups : null}/>}
                    {currentView === 'calendar' && <CalendarView categories={categories} actions={visibleActions} tasks={visibleTasks} onOpenTask={handleOpenTask} onUpdateTask={handleUpdateTask} onAddTask={handleAddNewTask} filters={filters} selectedYear={selectedYear} onYearChange={setSelectedYear} isReadOnly={isReadOnly} boardGroups={multiBoardMode ? multiBoardData.boardGroups : null}/>}
                    {currentView === 'dashboard' && <DashboardView categories={categories} actions={visibleActions} tasks={visibleTasks} members={effectiveMembers} boardGroups={multiBoardMode ? multiBoardData.boardGroups : null}/>}
                    </Suspense>
                    </ErrorBoundary>
                </main>
                <Suspense fallback={null}>
                {selectedTask && <TaskDetailModal categories={categories} task={tasks.find(t => t.id === selectedTask.id) || selectedTask} action={actions.find(a => a.id === selectedTask.actionId)} actions={actions} onClose={() => setSelectedTask(null)} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onBackToAction={selectedAction ? () => { setSelectedTask(null); setSelectedAction(actions.find(a => a.id === selectedTask.actionId)); } : null} allCountries={allCountries} onAddCustomCountry={addCustomCountry} onCreateAction={handleAddAction} onAddCategory={handleAddCategory} members={effectiveMembers} isReadOnly={isReadOnly} isTrelloBoard={!!currentBoard?.trelloSync?.trelloBoardId} isCardAsTask={currentBoard?.trelloSync?.syncMode === 'card-as-task'} availableOtherLabels={(() => { const map = new Map(); tasks.forEach(t => (t.otherLabels||[]).forEach(l => { if (!map.has(l.id)) map.set(l.id, l); })); return Array.from(map.values()); })()}/>}
                {selectedAction && !selectedTask && <ActionDetailModal categories={categories} action={actions.find(a => a.id === selectedAction.id) || selectedAction} tasks={visibleTasks} onClose={() => setSelectedAction(null)} onUpdateAction={handleUpdateAction} onUpdateTask={handleUpdateTask} onBatchUpdateTasks={handleBatchUpdateTasks} onOpenTask={handleOpenTask} onAddTask={(actionId) => handleCreateNewTask({ actionId })} onDeleteAction={handleDeleteAction} onDeleteTask={handleDeleteTask} allCountries={allCountries} onAddCustomCountry={addCustomCountry} members={effectiveMembers} isTrelloBoard={!!currentBoard?.trelloSync?.trelloBoardId} availableOtherLabels={(() => { const map = new Map(); tasks.forEach(t => (t.otherLabels||[]).forEach(l => { if (!map.has(l.id)) map.set(l.id, l); })); actions.forEach(a => (a.otherLabels||[]).forEach(l => { if (!map.has(l.id)) map.set(l.id, l); })); return Array.from(map.values()); })()} isReadOnly={isReadOnly} onRenameChecklistGroup={handleRenameChecklistGroup} onAddTaskInGroup={handleAddTaskInGroup} onDeleteTaskGroup={handleDeleteTaskGroup}/>}
                {showCategoriesModal && <CategoriesManagementModal categories={categories} onClose={() => setShowCategoriesModal(false)} onUpdate={handleUpdateCategory} onAdd={handleAddCategory} onDelete={handleDeleteCategory} onReorder={handleReorderCategories}/>}
                {showNewActionModal && <NewActionModal categories={categories} onClose={() => setShowNewActionModal(false)} onAdd={handleAddAction} onAddCategory={handleAddCategory}/>}
                {showNewTaskModal && <NewTaskModal actions={actions} categories={categories} onClose={() => { setShowNewTaskModal(false); setNewTaskInitialValues(null); }} onAdd={handleAddNewTask} onCreateAction={(newAction) => { if (newAction && newAction.id) { handleAddAction(newAction); } else { setShowNewTaskModal(false); setNewTaskInitialValues(null); setShowNewActionModal(true); } }} onAddCategory={handleAddCategory} initialValues={newTaskInitialValues} isCardAsTask={currentBoard?.trelloSync?.syncMode === 'card-as-task'}/>}
                {showTrelloImportModal && <TrelloImportModal onClose={() => setShowTrelloImportModal(false)} onImport={handleTrelloImport}/>}
                {showTrelloRemapModal && currentBoard?.trelloSync?.trelloBoardId && <TrelloImportModal mappingOnly trelloBoardId={currentBoard.trelloSync.trelloBoardId} existingMappings={currentBoard.trelloSync.labelMappings} onClose={() => setShowTrelloRemapModal(false)} onSaveMappings={(mappings) => handleUpdateTrelloSyncSettings({ labelMappings: mappings })}/>}
                {showExcelImport && <ExcelImportModal onClose={() => setShowExcelImport(false)} onImport={handleExcelImport}/>}
                {showMemberManagement && <MemberManagementModal board={currentBoard} onClose={() => setShowMemberManagement(false)} onUpdateMembers={handleUpdateMembers}/>}
                {showTrelloExport && <TrelloExportModal board={currentBoard} onClose={() => setShowTrelloExport(false)} onConnected={handleTrelloExportConnected}/>}
                </Suspense>
                <FilterSidebar show={showFilterSidebar} onClose={() => setShowFilterSidebar(false)} filters={filters} setFilters={setFilters} categories={categories} allCountries={allCountries} tasks={tasks} members={effectiveMembers} searchInputRef={searchInputRef} boardSources={multiBoardMode ? multiBoardData.boardSources : []}/>
                <HistoryPanel show={showHistoryPanel} onClose={() => setShowHistoryPanel(false)} history={getHistory()} currentIndex={historyCurrentIndex} onJumpTo={(idx) => { const label = jumpTo(idx); if (label) showNotification('⏱ Jumped to: ' + label); }} onClear={() => { clearHistory(); showNotification('History cleared'); setShowHistoryPanel(false); }}/>
                {notification && <div className="fixed bottom-4 right-4 px-4 py-3 animate-slide-in" style={{background:'var(--accent)',color:'white',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',fontSize:13,fontWeight:500}}>{notification}</div>}
                {showOnboarding && <OnboardingOverlay onClose={() => { setShowOnboarding(false); localStorage.setItem('onboarding_done', '1'); }}/>}
            </div>
        </AppContext.Provider>
        </FilterContext.Provider>
        </BoardContext.Provider>
    );
};

export default App;
