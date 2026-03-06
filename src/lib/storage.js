import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG, DEFAULT_ACTIONS, DEFAULT_TASKS, GITHUB_CONFIG } from '../config.js';

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

const API_BASE_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)
    : '';

export const base64EncodeUnicode = (str) => {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
};

export const base64DecodeUnicode = (str) => {
    return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
};

export const loadFromSupabase = async (setCategories, setActions, setTasks, showNotification) => {
    try {
        console.log('📥 Loading from Supabase...');
        const { data, error } = await supabaseClient.from('app_data').select('*').eq('id', 'default').single();
        if (error) {
            if (error.code === 'PGRST116') {
                console.log('📝 No data in Supabase, inserting defaults...');
                const defaultData = { id: 'default', categories: CONFIG.CATEGORIES, actions: DEFAULT_ACTIONS, tasks: DEFAULT_TASKS, updated_at: new Date().toISOString() };
                const { error: insertError } = await supabaseClient.from('app_data').insert(defaultData);
                if (insertError) throw insertError;
                showNotification('✅ Default data initialized in Supabase');
                return;
            }
            throw error;
        }
        if (data) {
            if (data.categories) setCategories(data.categories);
            if (data.actions) setActions(data.actions);
            if (data.tasks) setTasks(data.tasks);
            console.log('✅ Supabase loaded. Categories:', data.categories?.length, 'Actions:', data.actions?.length, 'Tasks:', data.tasks?.length);
            showNotification('✅ Data loaded from Supabase');
        }
    } catch (e) {
        console.error('Error loading from Supabase:', e);
        showNotification('⚠️ Supabase load error, trying fallback...');
        throw e;
    }
};

export const saveToSupabase = async (categoriesRef, actionsRef, tasksRef, setSyncing, showNotification) => {
    if (!supabaseClient) return false;
    setSyncing(true);
    try {
        const { error } = await supabaseClient.from('app_data').upsert({
            id: 'default',
            categories: categoriesRef.current,
            actions: actionsRef.current,
            tasks: tasksRef.current,
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

export const loadDataFromGitHub = async (setCategories, setActions, setTasks, setFileSha, showNotification, loadFromLocalStorageFn) => {
    try {
        console.log('📥 Loading from GitHub via Vercel API...');
        const url = `${API_BASE_URL}/api/github`;
        const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } });
        if (response.ok) {
            const data = await response.json();
            const decodedContent = base64DecodeUnicode(data.content.replace(/\n/g, '').replace(/\s/g, ''));
            const content = JSON.parse(decodedContent);
            const isValidCategories = Array.isArray(content.categories) && content.categories.every(c => c.id && c.name);
            const isValidActions = Array.isArray(content.actions) && content.actions.every(a => a.id && a.name);
            const isValidTasks = Array.isArray(content.tasks) && content.tasks.every(t => t.id && t.title);
            if (!isValidCategories || !isValidActions || !isValidTasks) {
                showNotification('⚠️ Invalid GitHub data, local backup loaded');
                loadFromLocalStorageFn();
                return;
            }
            setCategories(content.categories || CONFIG.CATEGORIES);
            setActions(content.actions || DEFAULT_ACTIONS);
            setTasks(content.tasks || DEFAULT_TASKS);
            setFileSha(data.sha);
            showNotification('✅ Data loaded from GitHub');
        } else if (response.status === 404) {
            loadFromLocalStorageFn();
            setFileSha('');
        } else {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 500 && errorData.message?.includes('GITHUB_TOKEN')) {
                alert('❌ CONFIGURATION REQUIRED\n\nGitHub token not configured in Vercel.\nPlease add GITHUB_TOKEN in Vercel Environment Variables.');
            }
            showNotification(`❌ API Error: ${response.status}`);
            loadFromLocalStorageFn();
        }
    } catch (e) {
        console.error('Error loading from GitHub:', e);
        showNotification('⚠️ GitHub load error, local backup loaded');
        loadFromLocalStorageFn();
    }
};

export const saveToGitHub = async (categoriesRef, actionsRef, tasksRef, fileShaRef, setFileSha, setSyncing, showNotification) => {
    setSyncing(true);
    try {
        const jsonString = JSON.stringify({ categories: categoriesRef.current, actions: actionsRef.current, tasks: tasksRef.current }, null, 2);
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

export const loadFromLocalStorage = (setCategories, setActions, setTasks, showNotification) => {
    try {
        const backup = localStorage.getItem('marketing_tracker_backup');
        if (backup) {
            const data = JSON.parse(backup);
            setCategories(data.categories || CONFIG.CATEGORIES);
            setActions(data.actions || DEFAULT_ACTIONS);
            setTasks(data.tasks || DEFAULT_TASKS);
            showNotification('📦 Local backup loaded');
        }
    } catch (e) {
        console.error('LocalStorage load error:', e);
    }
};

export const saveToLocalStorage = (categoriesRef, actionsRef, tasksRef) => {
    try {
        const data = { categories: categoriesRef.current, actions: actionsRef.current, tasks: tasksRef.current, timestamp: Date.now() };
        localStorage.setItem('marketing_tracker_backup', JSON.stringify(data));
    } catch (e) {
        console.error('LocalStorage save error:', e);
    }
};
