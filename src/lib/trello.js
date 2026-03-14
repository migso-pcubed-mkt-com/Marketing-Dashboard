// Trello API client — calls /api/trello serverless proxy

const API_BASE_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)
    : '';

// Module-level per-user Trello token (set via setTrelloUserToken)
let _userTrelloToken = null;

export const setTrelloUserToken = (token) => { _userTrelloToken = token; };
export const getTrelloUserToken = () => _userTrelloToken;

const trelloFetch = async (url, options = {}) => {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (_userTrelloToken) {
        headers['X-Trello-Token'] = _userTrelloToken;
    }
    const response = await fetch(url, { headers, ...options });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || error.message || `Trello API error: ${response.status}`);
    }
    return response.json();
};

// List user's open Trello boards
export const fetchTrelloBoards = () =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=boards`);

// Fetch full board data (board, lists, labels, cards with checklists)
export const fetchTrelloBoardFull = (boardId) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=board&boardId=${encodeURIComponent(boardId)}`);

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

// Update a checklist item's state (complete/incomplete)
export const updateTrelloChecklistItem = (cardId, checkItemId, state) =>
    trelloFetch(`${API_BASE_URL}/api/trello?action=updateCheckItem`, {
        method: 'POST',
        body: JSON.stringify({ cardId, checkItemId, state })
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
