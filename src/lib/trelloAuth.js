// Trello OAuth flow via popup window
import { fetchTrelloConfig, fetchTrelloMe, setTrelloUserToken } from './trello.js';

const STORAGE_KEY = 'trello_user_token';

const buildUserResult = (user, token) => ({
    token,
    user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        avatarUrl: user.avatarUrl ? `${user.avatarUrl}/50.png` : null
    }
});

/**
 * Start Trello OAuth login via popup.
 * Uses callback_method=fragment with return_url to our callback page.
 * After authorization, Trello redirects popup to trello-callback.html#token=xxx.
 * The callback page extracts the token and postMessages it back to us.
 *
 * Requires the production domain to be whitelisted in Trello Power-Up settings
 * (Clé d'API / API Key → Allowed Origins).
 */
const OAUTH_STORAGE_KEY = 'mkt_trello_oauth_token';

export const startTrelloLogin = async () => {
    const { appKey } = await fetchTrelloConfig();
    if (!appKey) throw new Error('Trello API key not configured on server');

    // callback_method=fragment + return_url:
    // Trello redirects popup to return_url#token=REAL_TOKEN
    // trello-callback.html delivers it via BroadcastChannel, localStorage, and postMessage.
    // Multiple channels are needed because trello.com sets COOP: same-origin, which
    // severs window.opener — postMessage alone is no longer reliable in modern browsers.
    const returnUrl = `${window.location.origin}/trello-callback.html`;
    const authUrl = `https://trello.com/1/authorize?response_type=token&key=${appKey}&scope=read,write&name=Marketing%20Dashboard&expiration=never&callback_method=fragment&return_url=${encodeURIComponent(returnUrl)}`;

    // Clear any stale OAuth token from a previous attempt before opening the popup
    try { localStorage.removeItem(OAUTH_STORAGE_KEY); } catch {}

    return new Promise((resolve, reject) => {
        const popup = window.open(authUrl, 'trello_auth', 'width=600,height=700,left=200,top=100');
        if (!popup) {
            reject(new Error('Popup blocked. Please allow popups for this site.'));
            return;
        }

        let resolved = false;
        let bc = null;

        const cleanup = () => {
            resolved = true;
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorage);
            clearInterval(pollTimer);
            if (bc) { try { bc.close(); } catch {} }
            try { localStorage.removeItem(OAUTH_STORAGE_KEY); } catch {}
        };

        const acceptToken = async (token) => {
            if (resolved || !token) return;
            cleanup();
            try { popup.close(); } catch {}
            try {
                const user = await fetchTrelloMe(token);
                localStorage.setItem(STORAGE_KEY, token);
                setTrelloUserToken(token);
                resolve(buildUserResult(user, token));
            } catch (err) {
                reject(new Error(err.message || 'Failed to validate Trello token'));
            }
        };

        const extractToken = (data) => {
            if (typeof data === 'string') {
                const match = data.match(/[0-9a-zA-Z]{32,256}/);
                return match ? match[0] : null;
            }
            if (data && typeof data === 'object') {
                return data.trelloToken || data.token || null;
            }
            return null;
        };

        const handleMessage = (event) => {
            // Only accept the token from our own callback page (same origin). Without this,
            // any window/iframe able to postMessage during the OAuth window could inject a
            // token (login CSRF / token fixation). The callback posts from window.location.origin.
            if (event.origin !== window.location.origin) return;
            const token = extractToken(event.data);
            if (token) acceptToken(token);
        };

        const handleStorage = (event) => {
            if (event.key !== OAUTH_STORAGE_KEY || !event.newValue) return;
            try {
                const parsed = JSON.parse(event.newValue);
                if (parsed?.token) acceptToken(parsed.token);
            } catch {}
        };

        window.addEventListener('message', handleMessage);
        window.addEventListener('storage', handleStorage);

        try {
            if (typeof BroadcastChannel !== 'undefined') {
                bc = new BroadcastChannel('mkt_trello_oauth');
                bc.onmessage = (event) => {
                    const token = extractToken(event.data);
                    if (token) acceptToken(token);
                };
            }
        } catch {}

        // Poll for popup closure AND for localStorage fallback (storage event doesn't
        // fire in the tab that wrote the value, so same-tab flows need polling).
        const pollTimer = setInterval(() => {
            if (resolved) return;
            try {
                const raw = localStorage.getItem(OAUTH_STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed?.token) { acceptToken(parsed.token); return; }
                }
            } catch {}
            if (popup.closed) {
                cleanup();
                resolve({ needsManualToken: true });
            }
        }, 500);
    });
};

/**
 * Validate a manually pasted token and log in.
 * No strict format validation — let the Trello API decide if the token is valid.
 */
export const validateAndLogin = async (token) => {
    const trimmed = token.trim();
    if (!trimmed) throw new Error('Please paste your token');
    const user = await fetchTrelloMe(trimmed);
    localStorage.setItem(STORAGE_KEY, trimmed);
    setTrelloUserToken(trimmed);
    return buildUserResult(user, trimmed);
};

/**
 * Restore Trello user from localStorage token.
 */
export const restoreTrelloUser = async () => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return null;

    try {
        const user = await fetchTrelloMe(token);
        setTrelloUserToken(token);
        return { ...buildUserResult(user, token).user, token };
    } catch (e) {
        // Only a confirmed auth rejection (401/403) means the token is invalid → remove it
        // and signal "not authenticated". A transient failure (network error, 5xx, timeout)
        // must NOT log a valid user out — keep the token and throw a transient error so the
        // caller can stay optimistically authenticated.
        const status = e?.status ?? e?.trelloStatus;
        if (status === 401 || status === 403) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        const transient = new Error('Trello temporarily unreachable');
        transient.transient = true;
        throw transient;
    }
};

/**
 * Logout — clear stored token.
 */
export const trelloLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTrelloUserToken(null);
};
