// Factory helpers for generating Trello API mock data and local board state
// Used by sync integration tests

let _counter = 0;
const nextId = () => `mock-${++_counter}`;
export const resetCounter = () => { _counter = 0; };

// ─── Trello API data factories ───

export const makeTrelloList = (overrides = {}) => ({
    id: nextId(),
    name: `List ${_counter}`,
    pos: _counter * 16384,
    closed: false,
    ...overrides
});

export const makeTrelloCard = (overrides = {}) => ({
    id: nextId(),
    name: `Card ${_counter}`,
    desc: '',
    due: null,
    start: null,
    dueComplete: false,
    closed: false,
    dateLastActivity: '2026-03-20T10:00:00.000Z',
    idList: 'list-1',
    idLabels: [],
    labels: [],
    idMembers: [],
    idChecklists: [],
    checklists: [],
    attachments: [],
    comments: [],
    pos: _counter * 1000,
    ...overrides
});

export const makeTrelloChecklist = (overrides = {}) => ({
    id: nextId(),
    name: `Checklist ${_counter}`,
    pos: _counter * 16384,
    checkItems: [],
    ...overrides
});

export const makeTrelloCheckItem = (overrides = {}) => ({
    id: nextId(),
    name: `Item ${_counter}`,
    state: 'incomplete',
    pos: _counter * 16384,
    due: null,
    idMember: null,
    ...overrides
});

export const makeTrelloLabel = (overrides = {}) => ({
    id: nextId(),
    name: `Label ${_counter}`,
    color: 'blue',
    ...overrides
});

export const makeTrelloMember = (overrides = {}) => ({
    id: nextId(),
    fullName: `Member ${_counter}`,
    username: `member${_counter}`,
    avatarUrl: null,
    ...overrides
});

// Full Trello board response (as returned by fetchTrelloBoardFull)
export const makeTrelloBoardResponse = ({ lists = [], cards = [], labels = [], members = [], board = {} } = {}) => ({
    board: { id: 'trello-board-1', name: 'Test Board', url: 'https://trello.com/b/test', ...board },
    lists,
    labels,
    cards,
    members
});

// ─── Local board data factories ───

export const makeCategory = (overrides = {}) => ({
    id: nextId(),
    name: `Category ${_counter}`,
    color: '#6366f1',
    gradient: 'from-indigo-500 to-purple-600',
    trelloListId: null,
    order: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
});

export const makeAction = (overrides = {}) => ({
    id: nextId(),
    name: `Action ${_counter}`,
    categoryId: 'cat-1',
    budget: 0,
    priority: 'medium',
    tags: [],
    status: 'active',
    isDefault: false,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
});

export const makeTask = (overrides = {}) => ({
    id: nextId(),
    actionId: 'act-1',
    title: `Task ${_counter}`,
    description: '',
    startDate: '2026-03-01',
    dueDate: '2026-03-31',
    month: 2,
    status: 'todo',
    priority: 'medium',
    budget: 0,
    checklists: [],
    comments: [],
    attachments: [],
    channels: [],
    countries: [],
    assignees: [],
    otherLabels: [],
    order: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    trelloCardId: null,
    trelloLastModified: null,
    ...overrides
});

// Full local board (v2 format — but just the board object, not the envelope)
export const makeBoard = ({ categories = [], actions = [], tasks = [], trelloSync = {}, members = [] } = {}) => ({
    id: 'board-1',
    name: 'Test Board',
    categories,
    actions,
    tasks,
    members,
    trelloSync: {
        trelloBoardId: 'trello-board-1',
        trelloBoardName: 'Test Board',
        trelloBoardUrl: 'https://trello.com/b/test',
        lastSyncAt: '2026-03-19T00:00:00.000Z',
        syncEnabled: true,
        pollIntervalMs: 120000,
        syncMode: 'card-as-task',
        labelMappings: {},
        ...trelloSync
    },
    updatedAt: '2026-03-19T00:00:00.000Z'
});

// ─── Mapping config factory ───

export const makeMappingConfig = (overrides = {}) => ({
    labelMappings: {},
    ...overrides
});
