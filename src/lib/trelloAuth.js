// Trello OAuth flow via popup window
import { fetchTrelloConfig, fetchTrelloMe, setTrelloUserToken } from './trello.js';

const STORAGE_KEY = 'trello_user_token';

/**
 * Start Trello OAuth login via popup.
 * Returns { token, user } on success, null on cancel.
 */
export const startTrelloLogin = async () => {
    // Get app key from server
    const { appKey } = await fetchTrelloConfig();
    if (!appKey) throw new Error('Trello API key not configured on server');

    const returnUrl = `${window.location.origin}/trello-callback.html`;
    const authUrl = `https://trello.com/1/authorize?response_type=token&key=${appKey}&scope=read,write&name=Marketing%20Dashboard&expiration=never&callback_method=fragment&return_url=${encodeURIComponent(returnUrl)}`;

    return new Promise((resolve, reject) => {
        const popup = window.open(authUrl, 'trello_auth', 'width=600,height=700,left=200,top=100');
        if (!popup) {
            reject(new Error('Popup blocked. Please allow popups for this site.'));
            return;
        }

        const handleMessage = async (event) => {
            // Trello postMessage sends the token as a plain string
            const token = (typeof event.data === 'string' && event.data.length > 20)
                ? event.data
                : event.data?.trelloToken || null;
            if (!token) return;

            window.removeEventListener('message', handleMessage);
            clearInterval(pollTimer);
            try {
                const user = await fetchTrelloMe(token);
                localStorage.setItem(STORAGE_KEY, token);
                setTrelloUserToken(token);
                resolve({
                    token,
                    user: {
                        id: user.id,
                        fullName: user.fullName,
                        username: user.username,
                        avatarUrl: user.avatarUrl ? `${user.avatarUrl}/50.png` : null
                    }
                });
            } catch (err) {
                reject(new Error('Failed to validate Trello token'));
            }
        };

        window.addEventListener('message', handleMessage);

        // Poll to detect if popup was closed without completing
        const pollTimer = setInterval(() => {
            if (popup.closed) {
                clearInterval(pollTimer);
                window.removeEventListener('message', handleMessage);
                resolve(null); // User cancelled
            }
        }, 500);
    });
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
        return {
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            avatarUrl: user.avatarUrl ? `${user.avatarUrl}/50.png` : null,
            token
        };
    } catch {
        // Token expired or invalid
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
