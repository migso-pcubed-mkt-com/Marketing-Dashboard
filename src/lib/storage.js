import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG, DEFAULT_ACTIONS, DEFAULT_TASKS, GITHUB_CONFIG } from '../config.js';
import { migrateToV2 } from './migration.js';

// Initialize Supabase client
const isSupabaseConfigured = SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co' && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY';
let supabaseClient = null;
if (isSupabaseConfigured) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client initialized');
} else {
    console.warn('⚠️ Supabase not configured - falling back to GitHub/localStorage storage');
}

export { supabaseClient, isSupabaseConfigured };
export const useSupabase = isSupabaseConfigured && supabaseClient;

// --- Supabase Storage (attachments) ---
const STORAGE_BUCKET = 'attachments';

export const uploadAttachment = async (file, taskId) => {
    if (!supabaseClient) return null;
    const ext = file.name.split('.').pop();
    const path = `${taskId}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) {
        console.warn('[Storage] Upload failed, falling back to base64:', error.message);
        return null; // Caller falls back to FileReader base64
    }
    const { data: urlData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
    return { path: data.path, url: urlData.publicUrl };
};

export const deleteAttachment = async (path) => {
    if (!supabaseClient || !path) return;
    await supabaseClient.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
};

const API_BASE_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)
    : '';

export const base64EncodeUnicode = (str) => {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
};

export const base64DecodeUnicode = (str) => {
    return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
};

// --- Supabase ---

export const loadFromSupabase = async (showNotification) => {
    try {
        console.log('📥 Loading from Supabase...');
        const { data, error } = await supabaseClient.from('app_data').select('*').eq('id', 'default').single();
        if (error) {
            if (error.code === 'PGRST116') {
                console.log('📝 No data in Supabase, inserting defaults...');
                const defaultV2 = migrateToV2(null);
                const defaultData = {
                    id: 'default',
                    categories: defaultV2.boards[0].categories,
                    actions: defaultV2.boards[0].actions,
                    tasks: defaultV2.boards[0].tasks,
                    board_data: defaultV2,
                    updated_at: new Date().toISOString()
                };
                const { error: insertError } = await supabaseClient.from('app_data').insert(defaultData);
                if (insertError) throw insertError;
                showNotification('✅ Default data initialized in Supabase');
                return defaultV2;
            }
            throw error;
        }
        if (data) {
            // Prefer board_data column (v2), fall back to legacy columns
            let boardData;
            if (data.board_data && data.board_data.version === 2) {
                boardData = data.board_data;
            } else {
                boardData = migrateToV2({
                    categories: data.categories,
                    actions: data.actions,
                    tasks: data.tasks
                });
            }
            const board = boardData.boards[0];
            console.log('✅ Supabase loaded. Boards:', boardData.boards.length, 'Categories:', board?.categories?.length, 'Actions:', board?.actions?.length, 'Tasks:', board?.tasks?.length);
            showNotification('✅ Data loaded from Supabase');
            return boardData;
        }
        return null;
    } catch (e) {
        console.error('Error loading from Supabase:', e);
        showNotification('⚠️ Supabase load error, trying fallback...');
        throw e;
    }
};

export const saveToSupabase = async (boardDataRef, setSyncing, showNotification) => {
    if (!supabaseClient) return false;
    setSyncing(true);
    try {
        const boardData = boardDataRef.current;
        // Find active board for backward-compatible legacy columns
        const activeBoard = boardData.boards.find(b => b.id === boardData.currentBoardId) || boardData.boards[0];
        const { error } = await supabaseClient.from('app_data').upsert({
            id: 'default',
            board_data: boardData,
            // Keep legacy columns for backward compatibility
            categories: activeBoard?.categories,
            actions: activeBoard?.actions,
            tasks: activeBoard?.tasks,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        console.log('✅ Supabase save successful');
        return true;
    } catch (e) {
        console.error('Error saving to Supabase:', e);
        showNotification(`❌ Save error: ${e.message}`);
        return false;
    } finally {
        setSyncing(false);
    }
};

// --- GitHub ---

export const loadDataFromGitHub = async (setFileSha, showNotification, loadFromLocalStorageFn) => {
    try {
        console.log('📥 Loading from GitHub via Vercel API...');
        const url = `${API_BASE_URL}/api/github`;
        const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } });
        if (response.ok) {
            const data = await response.json();
            const decodedContent = base64DecodeUnicode(data.content.replace(/\n/g, '').replace(/\s/g, ''));
            const content = JSON.parse(decodedContent);

            // Migrate to v2 (handles both old flat format and new v2 format)
            const boardData = migrateToV2(content);
            const board = boardData.boards[0];

            // Validate the first board's data
            const isValid = board &&
                Array.isArray(board.categories) && board.categories.every(c => c.id && c.name) &&
                Array.isArray(board.actions) && board.actions.every(a => a.id && a.name) &&
                Array.isArray(board.tasks) && board.tasks.every(t => t.id && t.title);

            if (!isValid) {
                showNotification('⚠️ Invalid GitHub data, local backup loaded');
                return loadFromLocalStorageFn();
            }
            setFileSha(data.sha);
            showNotification('✅ Data loaded from GitHub');
            return boardData;
        } else if (response.status === 404) {
            setFileSha('');
            return loadFromLocalStorageFn();
        } else {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 500 && errorData.message?.includes('GITHUB_TOKEN')) {
                alert('❌ CONFIGURATION REQUIRED\n\nGitHub token not configured in Vercel.\nPlease add GITHUB_TOKEN in Vercel Environment Variables.');
            }
            showNotification(`❌ API Error: ${response.status}`);
            return loadFromLocalStorageFn();
        }
    } catch (e) {
        console.error('Error loading from GitHub:', e);
        showNotification('⚠️ GitHub load error, local backup loaded');
        return loadFromLocalStorageFn();
    }
};

export const saveToGitHub = async (boardDataRef, fileShaRef, setFileSha, setSyncing, showNotification) => {
    setSyncing(true);
    try {
        const jsonString = JSON.stringify(boardDataRef.current, null, 2);
        const content = base64EncodeUnicode(jsonString);
        const body = { message: `Update data from Marketing Tracker - ${new Date().toISOString()}`, content, sha: fileShaRef.current || undefined };
        const url = `${API_BASE_URL}/api/github`;
        const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) });
        if (response.ok) {
            const data = await response.json();
            setFileSha(data.content.sha);
            return true;
        } else {
            const errorText = await response.text();
            let errorDetails;
            try { errorDetails = JSON.parse(errorText); } catch (e) { errorDetails = { message: errorText }; }
            if (response.status === 409 || errorDetails.details?.message?.includes('does not match')) {
                if (confirm('File modified elsewhere. Overwrite?\n\nYES = Overwrite\nNO = Cancel')) {
                    showNotification('⚠️ Data reloaded. Save again.');
                }
                return false;
            }
            showNotification(`❌ Error ${response.status}: ${errorDetails.error || errorDetails.message || ''}`);
            return false;
        }
    } catch (e) {
        console.error('Error saving to GitHub:', e);
        showNotification(`❌ Error: ${e.message}`);
        return false;
    } finally {
        setSyncing(false);
    }
};

// --- localStorage ---

export const loadFromLocalStorage = (showNotification) => {
    try {
        const backup = localStorage.getItem('marketing_tracker_backup');
        if (backup) {
            const data = JSON.parse(backup);
            const boardData = migrateToV2(data);
            showNotification('📦 Local backup loaded');
            return boardData;
        }
    } catch (e) {
        console.error('LocalStorage load error:', e);
    }
    return null;
};

export const saveToLocalStorage = (boardDataRef) => {
    try {
        const data = { ...boardDataRef.current, timestamp: Date.now() };
        localStorage.setItem('marketing_tracker_backup', JSON.stringify(data));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn('[Storage] localStorage quota exceeded, clearing old snapshots...');
            for (let i = 0; i < SNAPSHOT_COUNT; i++) {
                localStorage.removeItem(`${SNAPSHOT_KEY_PREFIX}${i}`);
            }
            localStorage.removeItem(SNAPSHOT_INDEX_KEY);
            try {
                const data = { ...boardDataRef.current, timestamp: Date.now() };
                localStorage.setItem('marketing_tracker_backup', JSON.stringify(data));
            } catch (e2) {
                console.error('LocalStorage save failed even after cleanup:', e2);
            }
        } else {
            console.error('LocalStorage save error:', e);
        }
    }
};

// --- Snapshot ring buffer (3 most recent snapshots) ---

const SNAPSHOT_COUNT = 3;
const SNAPSHOT_KEY_PREFIX = 'mkt_snapshot_';
const SNAPSHOT_INDEX_KEY = 'mkt_snapshot_index';
const SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48h

export const saveSnapshot = (boardData, trigger = 'auto-save') => {
    try {
        const index = parseInt(localStorage.getItem(SNAPSHOT_INDEX_KEY) || '0', 10);
        const nextIndex = (index + 1) % SNAPSHOT_COUNT;
        const snapshot = { boardData, timestamp: Date.now(), trigger };
        localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${nextIndex}`, JSON.stringify(snapshot));
        localStorage.setItem(SNAPSHOT_INDEX_KEY, String(nextIndex));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn('[Storage] localStorage quota exceeded, clearing oldest snapshot...');
            // Remove the oldest snapshot and retry
            const oldestIndex = (parseInt(localStorage.getItem(SNAPSHOT_INDEX_KEY) || '0', 10) + 1) % SNAPSHOT_COUNT;
            localStorage.removeItem(`${SNAPSHOT_KEY_PREFIX}${oldestIndex}`);
            try {
                const index = parseInt(localStorage.getItem(SNAPSHOT_INDEX_KEY) || '0', 10);
                const nextIndex = (index + 1) % SNAPSHOT_COUNT;
                const snapshot = { boardData, timestamp: Date.now(), trigger };
                localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${nextIndex}`, JSON.stringify(snapshot));
                localStorage.setItem(SNAPSHOT_INDEX_KEY, String(nextIndex));
            } catch (e2) {
                console.error('Snapshot save failed even after cleanup:', e2);
            }
        } else {
            console.error('Snapshot save error:', e);
        }
    }
};

export const listSnapshots = () => {
    const snapshots = [];
    const now = Date.now();
    for (let i = 0; i < SNAPSHOT_COUNT; i++) {
        try {
            const raw = localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${i}`);
            if (!raw) continue;
            const snapshot = JSON.parse(raw);
            if (now - snapshot.timestamp > SNAPSHOT_MAX_AGE_MS) {
                localStorage.removeItem(`${SNAPSHOT_KEY_PREFIX}${i}`);
                continue;
            }
            snapshots.push({ index: i, ...snapshot });
        } catch (e) { /* skip corrupted */ }
    }
    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
};

export const restoreSnapshot = (index) => {
    try {
        const raw = localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${index}`);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        return snapshot.boardData || null;
    } catch (e) {
        console.error('Snapshot restore error:', e);
        return null;
    }
};
