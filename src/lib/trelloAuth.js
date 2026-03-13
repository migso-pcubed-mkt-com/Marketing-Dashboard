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
 * Returns { token, user } on success, { needsManualToken: true } if popup closed without token, null on error.
 */
export const startTrelloLogin = async () => {
    const { appKey } = await fetchTrelloConfig();
    if (!appKey) throw new Error('Trello API key not configured on server');

    // Use postMessage with return_url (origin only) — matches the official Trello client.js pattern.
    // The origin must be whitelisted in Trello Power-Up settings for postMessage to work.
    // If not whitelisted, Trello shows the token on screen and the user can paste it manually.
    const returnUrl = window.location.origin;
    const authUrl = `https://trello.com/1/authorize?response_type=token&key=${appKey}&scope=read,write&name=Marketing%20Dashboard&expiration=never&callback_method=postMessage&return_url=${encodeURIComponent(returnUrl)}`;

    return new Promise((resolve, reject) => {
        const popup = window.open(authUrl, 'trello_auth', 'width=600,height=700,left=200,top=100');
        if (!popup) {
            reject(new Error('Popup blocked. Please allow popups for this site.'));
            return;
        }

        let resolved = false;

        const handleMessage = async (event) => {
            // Accept token as: plain hex string (Trello postMessage) or { trelloToken } (our callback page)
            const token = (typeof event.data === 'string' && /^[0-9a-f]{32,64}$/.test(event.data))
                ? event.data
                : event.data?.trelloToken || null;
            if (!token || resolved) return;

            resolved = true;
            window.removeEventListener('message', handleMessage);
            clearInterval(pollTimer);
            try { popup.close(); } catch {}
            try {
                const user = await fetchTrelloMe(token);
                localStorage.setItem(STORAGE_KEY, token);
                setTrelloUserToken(token);
                resolve(buildUserResult(user, token));
            } catch {
                reject(new Error('Failed to validate Trello token'));
            }
        };

        window.addEventListener('message', handleMessage);

        // Poll to detect if popup was closed without completing
        const pollTimer = setInterval(() => {
            if (popup.closed && !resolved) {
                clearInterval(pollTimer);
                window.removeEventListener('message', handleMessage);
                // Popup closed without receiving token — show manual paste fallback
                resolve({ needsManualToken: true });
            }
        }, 500);
    });
};

/**
 * Validate a manually pasted token and log in.
 * Returns { token, user } on success, throws on invalid token.
 */
export const validateAndLogin = async (token) => {
    const trimmed = token.trim();
    if (!/^[0-9a-f]{32,64}$/.test(trimmed)) {
        throw new Error('Invalid token format');
    }
    const user = await fetchTrelloMe(trimmed);
    localStorage.setItem(STORAGE_KEY, trimmed);
    setTrelloUserToken(trimmed);
    return buildUserResult(user, trimmed);
};

/**
 * Restore Trello user from localStorage token.
 * Returns user object or null.
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
