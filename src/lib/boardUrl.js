// Shareable per-board URLs — pure helpers.
// The selected board is reflected in the URL as ?board=<boardId> so a user can
// copy the address bar and share a direct link to a specific board. On load,
// App.jsx honors the param (when the board exists) over the envelope's stored
// currentBoardId.

// Extract the board id from a location.search string. Returns null when absent.
export const getBoardIdFromSearch = (search) => {
    try {
        return new URLSearchParams(search || '').get('board') || null;
    } catch (_e) {
        return null;
    }
};

// Build the new search string for a selected board, preserving any other params.
// Pass a falsy boardId to remove the param (e.g. combined multi-board view).
export const buildBoardSearch = (search, boardId) => {
    const params = new URLSearchParams(search || '');
    if (boardId) params.set('board', boardId);
    else params.delete('board');
    const s = params.toString();
    return s ? `?${s}` : '';
};

// Pick the board to display on initial load: URL param wins when it points to an
// existing board, otherwise fall back to the envelope's stored currentBoardId.
export const resolveInitialBoardId = (envelope, search) => {
    const urlBoardId = getBoardIdFromSearch(search);
    if (urlBoardId && envelope?.boards?.some(b => b.id === urlBoardId)) return urlBoardId;
    return envelope?.currentBoardId || 'board-default';
};
