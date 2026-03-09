// Trello API client — calls /api/trello serverless proxy

const API_BASE_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin)
    : '';

const trelloFetch = async (url, options = {}) => {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        ...options
    });
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
