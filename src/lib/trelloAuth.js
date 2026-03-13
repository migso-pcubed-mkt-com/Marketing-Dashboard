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
export const startTrelloLogin = async () => {
    const { appKey } = await fetchTrelloConfig();
    if (!appKey) throw new Error('Trello API key not configured on server');

    // callback_method=fragment + return_url:
    // Trello redirects popup to return_url#token=REAL_64_CHAR_TOKEN
    // Our trello-callback.html extracts it and postMessages { trelloToken } to opener
    // Domain must be in "Allowed Origins" of the Trello API key settings
    const returnUrl = `${window.location.origin}/trello-callback.html`;
    const authUrl = `https://trello.com/1/authorize?response_type=token&key=${appKey}&scope=read,write&name=Marketing%20Dashboard&expiration=never&callback_method=fragment&return_url=${encodeURIComponent(returnUrl)}`;

    return new Promise((resolve, reject) => {
        const popup = window.open(authUrl, 'trello_auth', 'width=600,height=700,left=200,top=100');
        if (!popup) {
            reject(new Error('Popup blocked. Please allow popups for this site.'));
            return;
        }

        let resolved = false;

        const cleanup = () => {
            resolved = true;
            window.removeEventListener('message', handleMessage);
            clearInterval(pollTimer);
        };

        const handleMessage = async (event) => {
            if (resolved) return;

            // Extract token from various postMessage formats:
            // 1. Plain hex string (Trello's native postMessage)
            // 2. { trelloToken: "xxx" } (from our callback page)
            // 3. { token: "xxx" } (alternative format)
            // 4. String containing a hex token somewhere
            let token = null;

            if (typeof event.data === 'string') {
                const match = event.data.match(/[0-9a-f]{32,128}/i);
                if (match) token = match[0];
            } else if (event.data && typeof event.data === 'object') {
                token = event.data.trelloToken || event.data.token || null;
            }

            if (!token) return;

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

        window.addEventListener('message', handleMessage);

        // Poll to detect if popup was closed without completing auth
        const pollTimer = setInterval(() => {
            if (popup.closed && !resolved) {
                cleanup();
                // Popup closed without receiving token — offer manual paste
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
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
};

/**
 * Logout — clear stored token.
 */
export const trelloLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTrelloUserToken(null);
};
