// Shareable per-board URLs — pure helpers.
// The selected board and view are reflected in the URL as ?board=<boardId> and
// ?view=<view> so a user can copy the address bar and share a direct link to a
// specific board/view. On load, App.jsx honors both params (when valid) over the
// envelope's stored currentBoardId and the default 'kanban' view.

export const VALID_VIEWS = ['kanban', 'timeline', 'calendar', 'dashboard'];
// The dashboard view is labelled "KPIs" in the UI — accept it as a friendly alias.
const VIEW_ALIASES = { kpis: 'dashboard' };
export const DEFAULT_VIEW = 'kanban';

// Extract the board id from a location.search string. Returns null when absent.
export const getBoardIdFromSearch = (search) => {
    try {
        return new URLSearchParams(search || '').get('board') || null;
    } catch (_e) {
        return null;
    }
};

// Extract a valid view from a location.search string. Returns null when absent
// or unknown so the caller keeps its default.
export const getViewFromSearch = (search) => {
    try {
        const raw = (new URLSearchParams(search || '').get('view') || '').toLowerCase();
        const view = VIEW_ALIASES[raw] || raw;
        return VALID_VIEWS.includes(view) ? view : null;
    } catch (_e) {
        return null;
    }
};

// Build the new search string for a selected board + view, preserving any other
// params. Pass a falsy boardId to remove the param (e.g. combined multi-board
// view). The view param is omitted for the default view to keep URLs clean.
export const buildBoardSearch = (search, boardId, view) => {
    const params = new URLSearchParams(search || '');
    if (boardId) params.set('board', boardId);
    else params.delete('board');
    if (view && view !== DEFAULT_VIEW && VALID_VIEWS.includes(view)) params.set('view', view);
    else params.delete('view');
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
