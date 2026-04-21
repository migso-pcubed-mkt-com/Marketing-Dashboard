// Trello API client — calls /api/trello serverless proxy

const API_BASE_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)
    : '';

// Module-level per-user Trello token (set via setTrelloUserToken)
let _userTrelloToken = null;

export const setTrelloUserToken = (token) => { _userTrelloToken = token; };
export const getTrelloUserToken = () => _userTrelloToken;

// Retry with exponential backoff for rate limits (429) and network errors
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const trelloFetch = async (url, options = {}, retries = 3) => {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (_userTrelloToken) {
        headers['X-Trello-Token'] = _userTrelloToken;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        try {
            const response = await fetch(url, { headers, signal: controller.signal, ...options });
            clearTimeout(timeoutId);

            // Retry on 429 (rate limit) or 502/503/504 (server overload)
            if ((response.status === 429 || response.status >= 502) && attempt < retries) {
                const retryAfter = response.headers.get('Retry-After');
                const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (1000 * Math.pow(2, attempt));
                console.warn(`[Trello] ${response.status} on attempt ${attempt + 1}/${retries + 1} — retrying in ${delayMs}ms`);
                await sleep(delayMs);
                continue;
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }));
                const baseMsg = error.error || error.message || `Trello API error: ${response.status}`;
                const detail = error.details ? ` (${typeof error.details === 'string' ? error.details : JSON.stringify(error.details)})` : '';
                const err = new Error(baseMsg + detail);
                err.status = response.status;
                throw err;
            }
            return response.json();
        } catch (err) {
            clearTimeout(timeoutId);
            // Retry on network errors (TypeError: Failed to fetch) and timeouts (AbortError)
            if ((err instanceof TypeError || err.name === 'AbortError') && attempt < retries) {
                const delayMs = 1000 * Math.pow(2, attempt);
                console.warn(`[Trello] ${err.name === 'AbortError' ? 'Timeout' : 'Network error'} on attempt ${attempt + 1}/${retries + 1} — retrying in ${delayMs}ms`);
                await sleep(delayMs);
                continue;
            }
            if (err.name === 'AbortError') throw new Error('Trello request timed out after 30s');
            throw err;
        }
    }
};

// List user's open Trello boards
export const fetchTrelloBoards = () =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=boards`);

// Fetch full board data (board, lists, labels, cards with checklists) — comments fetched separately
export const fetchTrelloBoardFull = (boardId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=board&boardId=${encodeURIComponent(boardId)}&skipComments=true`);

// Fetch comments for a batch of card IDs (max ~30 per call)
export const fetchCardCommentsBatch = (cardIds) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=cardComments&cardIds=${encodeURIComponent(cardIds.join(','))}`);

// Fetch a single card by ID or shortLink (for cross-board URL resolution)
export const fetchTrelloCard = (idOrShortLink) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=getCard&cardId=${encodeURIComponent(idOrShortLink)}`);

// Update a Trello card
export const updateTrelloCard = (cardId, updates) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=updateCard`, {
        method: 'PUT',
        body: JSON.stringify({ cardId, updates })
    });

// Create a new Trello card
export const createTrelloCard = (listId, data) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=createCard`, {
        method: 'POST',
        body: JSON.stringify({ listId, ...data })
    });

// Add a comment to a Trello card
export const addTrelloComment = (cardId, text) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=addComment`, {
        method: 'POST',
        body: JSON.stringify({ cardId, text })
    });

// Add a checklist to a Trello card
export const addTrelloChecklist = (cardId, name, items) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=addChecklist`, {
        method: 'POST',
        body: JSON.stringify({ cardId, name, items })
    });

// Update a checklist item (state, name, due, idMember)
// `updates` can be a string (backward compat: state only) or an object { state, name, due, idMember }
export const updateTrelloChecklistItem = (cardId, checkItemId, updates) => {
    const body = typeof updates === 'string'
        ? { cardId, checkItemId, state: updates }
        : { cardId, checkItemId, ...updates };
    return trelloFetch(`${API_BASE_URL}/api/trello?action=updateCheckItem`, {
        method: 'POST',
        body: JSON.stringify(body)
    });
};

// Update a checklist (name, pos)
export const updateTrelloChecklist = (checklistId, updates) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=updateChecklist`, {
        method: 'POST',
        body: JSON.stringify({ checklistId, ...updates })
    });

// Add items to an EXISTING Trello checklist (by checklist ID)
export const addTrelloChecklistItems = (checklistId, items) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=addChecklistItems`, {
        method: 'POST',
        body: JSON.stringify({ checklistId, items })
    });

// Add a URL attachment to a Trello card
export const addTrelloAttachment = (cardId, url, name) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=addAttachment`, {
        method: 'POST',
        body: JSON.stringify({ cardId, url, name })
    });

// Upload a file (base64) to a Trello card
export const uploadTrelloAttachment = (cardId, data, name, mimeType) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=uploadAttachment`, {
        method: 'POST',
        body: JSON.stringify({ cardId, data, name, mimeType })
    });

// Delete a checklist from Trello
export const deleteTrelloChecklist = (checklistId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=deleteChecklist&checklistId=${encodeURIComponent(checklistId)}`, { method: 'DELETE' });

// Delete a checklist item from Trello
export const deleteTrelloChecklistItem = (checklistId, itemId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=deleteChecklistItem&checklistId=${encodeURIComponent(checklistId)}&itemId=${encodeURIComponent(itemId)}`, { method: 'DELETE' });

// Delete an attachment from a Trello card
export const deleteTrelloAttachment = (cardId, attachmentId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=deleteAttachment&cardId=${encodeURIComponent(cardId)}&attachmentId=${encodeURIComponent(attachmentId)}`, { method: 'DELETE' });

// Create a label on a Trello board
export const createTrelloBoardLabel = (boardId, name, color) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=createBoardLabel`, {
        method: 'POST',
        body: JSON.stringify({ boardId, name, color })
    });

// Add a label to a Trello card
export const addTrelloCardLabel = (cardId, labelId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=addCardLabel`, {
        method: 'POST',
        body: JSON.stringify({ cardId, labelId })
    });

// Remove a label from a Trello card
export const removeTrelloCardLabel = (cardId, labelId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=removeCardLabel&cardId=${encodeURIComponent(cardId)}&labelId=${encodeURIComponent(labelId)}`, { method: 'DELETE' });

// Delete a Trello card
export const deleteTrelloCard = (cardId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=deleteCard&cardId=${encodeURIComponent(cardId)}`, {
        method: 'DELETE'
    });

// Update a Trello list (name, pos)
export const updateTrelloList = (listId, updates) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=updateList`, {
        method: 'PUT',
        body: JSON.stringify({ listId, updates })
    });

// Archive a Trello list (set closed=true)
export const archiveTrelloList = (listId) =>
    updateTrelloList(listId, { closed: 'true' });

// Archive a Trello card (set closed=true) — reversible, unlike deleteTrelloCard
export const archiveTrelloCard = (cardId) =>
    updateTrelloCard(cardId, { closed: 'true' });

// Create a new list on a Trello board
export const createTrelloList = (boardId, name, pos) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=createList`, {
        method: 'POST',
        body: JSON.stringify({ boardId, name, pos })
    });

// Create a new Trello board. Accepts legacy positional defaultLists boolean, or an options object.
export const createTrelloBoard = (name, optionsOrDefaultLists = false) => {
    const opts = typeof optionsOrDefaultLists === 'object' && optionsOrDefaultLists !== null
        ? optionsOrDefaultLists
        : { defaultLists: optionsOrDefaultLists };
    return trelloFetch(`${API_BASE_URL}/api/trello?action=createBoard`, {
        method: 'POST',
        body: JSON.stringify({
            name,
            defaultLists: !!opts.defaultLists,
            ...(opts.idOrganization ? { idOrganization: opts.idOrganization } : {})
        })
    });
};

// List the authenticated user's Trello workspaces (organizations)
export const fetchTrelloOrganizations = () =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=organizations`);

// Update a Trello board's fields (currently: name)
export const updateTrelloBoard = (boardId, { name } = {}) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=updateBoard`, {
        method: 'PUT',
        body: JSON.stringify({ boardId, ...(name !== undefined ? { name } : {}) })
    });

// Check if Trello is configured (try fetching boards)
export const checkTrelloConnection = async () => {
    try {
        const boards = await fetchTrelloBoards();
        return { connected: true, boardCount: boards.length };
    } catch {
        return { connected: false, boardCount: 0 };
    }
};

// Get Trello app key (for OAuth)
export const fetchTrelloConfig = () =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=config`);

// Get current member profile (requires token)
export const fetchTrelloMe = async (token) => {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) headers['X-Trello-Token'] = token;
    const r = await fetch(`${API_BASE_URL}/api/trello?action=me`, { headers });
    if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        // Build a helpful error message from the server diagnostics
        const parts = [body.error || `Trello API error ${r.status}`];
        if (body.hint) parts.push(body.hint);
        if (body.details && body.details !== body.error) parts.push(`(${body.details})`);
        const err = new Error(parts.join(' — '));
        err.tokenLength = body.tokenLength;
        err.trelloStatus = body.trelloStatus;
        throw err;
    }
    return r.json();
};
