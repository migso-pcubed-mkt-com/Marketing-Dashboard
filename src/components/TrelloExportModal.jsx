import { useState, useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { CONFIG, TRELLO_SYNC_MODES } from '../config.js';
import {
    createTrelloBoard, createTrelloList, createTrelloCard,
    createTrelloBoardLabel, addTrelloCardLabel,
    addTrelloChecklist, fetchTrelloOrganizations
} from '../lib/trello.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Map channel hex colors to closest Trello color name
const HEX_TO_TRELLO = {
    '#3b82f6': 'blue', '#ea4335': 'red', '#0077b5': 'blue', '#8b5cf6': 'purple',
    '#f59e0b': 'yellow', '#6366f1': 'purple', '#14b8a6': 'sky', '#22c55e': 'green',
    '#f97316': 'orange', '#ec4899': 'pink', '#ef4444': 'red', '#d97706': 'orange'
};
const hexToTrelloColor = (hex) => HEX_TO_TRELLO[(hex || '').toLowerCase()] || null;

const TrelloExportModal = ({ board, onClose, onConnected }) => {
    // step: mode | workspace | preview | pushing | done | error
    const [step, setStep] = useState('mode');
    const [syncMode, setSyncMode] = useState('card-as-task');
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
    const [workspaces, setWorkspaces] = useState(null); // null = loading, [] = none, [...] = loaded
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
    const [workspaceError, setWorkspaceError] = useState(null);

    // Fetch workspaces once when the modal opens
    useEffect(() => {
        let cancelled = false;
        fetchTrelloOrganizations()
            .then(orgs => {
                if (cancelled) return;
                const list = Array.isArray(orgs) ? orgs : [];
                setWorkspaces(list);
                if (list.length === 1) setSelectedWorkspaceId(list[0].id);
            })
            .catch(err => {
                if (cancelled) return;
                console.warn('Failed to fetch Trello workspaces:', err);
                setWorkspaceError(err.message || 'Could not load Trello workspaces');
                setWorkspaces([]);
            });
        return () => { cancelled = true; };
    }, []);

    const categories = board.categories || [];
    const actions = board.actions || [];
    const tasks = board.tasks || [];

    // Compute counts for preview
    const cardAsTask = syncMode === 'card-as-task';
    const listCount = categories.length;
    const cardCount = cardAsTask ? tasks.length : actions.length;
    // Count distinct checklist groups (not individual tasks) for accurate progress
    const checklistCount = cardAsTask ? 0 : actions.reduce((sum, a) => {
        const groups = new Set(tasks.filter(t => t.actionId === a.id).map(t => t.trelloChecklistName || 'Tasks'));
        return sum + groups.size;
    }, 0);

    // Collect unique channels/countries for label creation
    const uniqueChannels = new Set();
    const uniqueCountries = new Set();
    const allEntities = cardAsTask ? tasks : actions;
    allEntities.forEach(e => {
        (e.channels || e.tags || []).forEach(c => uniqueChannels.add(c));
        (e.countries || []).forEach(c => uniqueCountries.add(c));
    });
    // Also from tasks in card-as-action
    if (!cardAsTask) {
        tasks.forEach(t => {
            (t.channels || []).forEach(c => uniqueChannels.add(c));
        });
    }
    const labelCount = uniqueChannels.size + uniqueCountries.size;

    // ─── Push Logic ──────────────────────────────────────

    const handlePush = async () => {
        setStep('pushing');
        setError(null);

        // Use dynamic progress: increment as we go, estimate total loosely
        const estimatedTotal = 1 + listCount + labelCount + cardCount + checklistCount;
        let currentOp = 0;
        const updateProgress = (label) => {
            currentOp++;
            setProgress({ current: Math.min(currentOp, estimatedTotal), total: estimatedTotal, label });
        };

        try {
            // 1. Create the Trello board
            updateProgress('Creating Trello board...');
            const trelloBoard = await createTrelloBoard(board.name, {
                defaultLists: false,
                idOrganization: selectedWorkspaceId || undefined
            });
            await sleep(200);

            // 2. Create lists (one per category)
            const listMap = {}; // catId → trelloListId
            for (const cat of categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
                updateProgress(`Creating list "${cat.name}"...`);
                const list = await createTrelloList(trelloBoard.id, cat.name);
                listMap[cat.id] = list.id;
                await sleep(200);
            }

            // 3. Create labels on the board
            const labelMappings = {}; // { trelloLabelId: { type, channelId|countryId, labelName, labelColor } }
            const channelLabelMap = {}; // channelId → trelloLabelId
            const countryLabelMap = {}; // countryId → trelloLabelId

            for (const channelId of uniqueChannels) {
                const ch = CONFIG.CHANNELS.find(c => c.id === channelId);
                if (!ch) continue;
                updateProgress(`Creating label "${ch.name}"...`);
                const trelloColor = hexToTrelloColor(ch.color);
                const label = await createTrelloBoardLabel(trelloBoard.id, ch.name, trelloColor);
                channelLabelMap[channelId] = label.id;
                labelMappings[label.id] = { type: 'channel', channelId, labelName: ch.name, labelColor: ch.color };
                await sleep(200);
            }

            for (const countryId of uniqueCountries) {
                const co = CONFIG.COUNTRIES.find(c => c.id === countryId);
                if (!co) continue;
                updateProgress(`Creating label "${co.name}"...`);
                const label = await createTrelloBoardLabel(trelloBoard.id, `${co.flag} ${co.name}`, null);
                countryLabelMap[countryId] = label.id;
                labelMappings[label.id] = { type: 'country', countryId, labelName: co.name, labelColor: co.color || '#888' };
                await sleep(200);
            }

            // 4. Create cards + assign labels
            const updatedCategories = categories.map(c => ({ ...c, trelloListId: listMap[c.id] || null }));
            let updatedActions = [...actions];
            let updatedTasks = [...tasks];

            if (cardAsTask) {
                // card-as-task: one card per task
                for (const task of tasks) {
                    const action = actions.find(a => a.id === task.actionId);
                    const listId = listMap[action?.categoryId];
                    if (!listId) continue;

                    updateProgress(`Creating card "${task.title}"...`);
                    const cardData = {
                        name: task.title,
                        desc: task.description || '',
                    };
                    if (task.startDate) cardData.start = task.startDate;
                    if (task.dueDate) cardData.due = task.dueDate;
                    cardData.dueComplete = (task.status === 'completed').toString();

                    const card = await createTrelloCard(listId, cardData);

                    // Assign labels
                    const taskChannels = task.channels || [];
                    const taskCountries = task.countries || [];
                    for (const ch of taskChannels) {
                        if (channelLabelMap[ch]) {
                            try { await addTrelloCardLabel(card.id, channelLabelMap[ch]); } catch (e) { /* 409 OK */ }
                            await sleep(100);
                        }
                    }
                    for (const co of taskCountries) {
                        if (countryLabelMap[co]) {
                            try { await addTrelloCardLabel(card.id, countryLabelMap[co]); } catch (e) { /* 409 OK */ }
                            await sleep(100);
                        }
                    }

                    // Update local task with Trello IDs
                    updatedTasks = updatedTasks.map(t => t.id === task.id ? {
                        ...t,
                        trelloCardId: card.id,
                        trelloLastModified: new Date().toISOString()
                    } : t);

                    await sleep(200);
                }
            } else {
                // card-as-action: one card per action, checklists per task group
                for (const action of actions) {
                    const listId = listMap[action.categoryId];
                    if (!listId) continue;

                    updateProgress(`Creating card "${action.name}"...`);
                    const cardData = {
                        name: action.name,
                        desc: action.description || '',
                    };
                    if (action.startDate) cardData.start = action.startDate;
                    if (action.dueDate) cardData.due = action.dueDate;
                    cardData.dueComplete = (action.status === 'completed').toString();

                    const card = await createTrelloCard(listId, cardData);

                    // Assign labels from action tags
                    for (const ch of (action.tags || [])) {
                        if (channelLabelMap[ch]) {
                            try { await addTrelloCardLabel(card.id, channelLabelMap[ch]); } catch (e) { /* 409 OK */ }
                            await sleep(100);
                        }
                    }
                    for (const co of (action.countries || [])) {
                        if (countryLabelMap[co]) {
                            try { await addTrelloCardLabel(card.id, countryLabelMap[co]); } catch (e) { /* 409 OK */ }
                            await sleep(100);
                        }
                    }

                    // Update local action with Trello IDs
                    updatedActions = updatedActions.map(a => a.id === action.id ? {
                        ...a,
                        trelloCardId: card.id,
                        trelloLastModified: new Date().toISOString()
                    } : a);

                    // Create checklists for tasks grouped by trelloChecklistName or default "Tasks"
                    const actionTasks = tasks.filter(t => t.actionId === action.id);
                    const groups = {};
                    actionTasks.forEach(t => {
                        const groupName = t.trelloChecklistName || 'Tasks';
                        if (!groups[groupName]) groups[groupName] = [];
                        groups[groupName].push(t);
                    });

                    for (const [groupName, groupTasks] of Object.entries(groups)) {
                        updateProgress(`Creating checklist "${groupName}"...`);
                        const items = groupTasks
                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            .map(t => ({
                                text: t.title,
                                done: t.status === 'completed'
                            }));
                        const checklist = await addTrelloChecklist(card.id, groupName, items);

                        // Update local tasks with Trello IDs
                        if (checklist && checklist.checkItems) {
                            groupTasks.forEach((t, idx) => {
                                const checkItem = checklist.checkItems[idx];
                                if (checkItem) {
                                    updatedTasks = updatedTasks.map(ut => ut.id === t.id ? {
                                        ...ut,
                                        trelloCardId: card.id,
                                        trelloChecklistId: checklist.id,
                                        trelloCheckItemId: checkItem.id,
                                        trelloChecklistName: groupName,
                                        trelloLastModified: new Date().toISOString()
                                    } : ut);
                                }
                            });
                        }
                        await sleep(200);
                    }

                    await sleep(200);
                }
            }

            // 5. Build trelloSync config
            const trelloSync = {
                trelloBoardId: trelloBoard.id,
                trelloBoardUrl: trelloBoard.url,
                trelloBoardName: trelloBoard.name,
                trelloBoardNameBaseline: trelloBoard.name, // baseline for bidirectional rename sync
                syncEnabled: true,
                syncMode,
                pollIntervalMs: 120000,
                lastSyncAt: new Date().toISOString(),
                labelMappings
            };

            // 6. Callback with all updated data
            onConnected({
                categories: updatedCategories,
                actions: updatedActions,
                tasks: updatedTasks,
                trelloSync
            });

            setStep('done');
        } catch (err) {
            console.error('Trello export error:', err);
            setError(err.message || 'Failed to push to Trello');
            setStep('error');
        }
    };

    // ─── Rendering ───────────────────────────────────────

    const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={step !== 'pushing' ? onClose : undefined}/>
            <div style={{
                position: 'relative', background: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xl)', width: 480, maxWidth: '90vw',
                display: 'flex', flexDirection: 'column', zIndex: 1
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#0079BF">
                            <rect x="1" y="1" width="22" height="22" rx="3" ry="3"/>
                            <rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="white"/>
                            <rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="white"/>
                        </svg>
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Connect to Trello</h2>
                    </div>
                    {step !== 'pushing' && (
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                            <Icon.Close/>
                        </button>
                    )}
                </div>

                <div style={{ padding: '16px 24px' }}>
                    {error && (
                        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 16 }}>
                            {error}
                        </div>
                    )}

                    {/* ─── MODE STEP ─── */}
                    {step === 'mode' && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                                This will create a new Trello board from <strong style={{ color: 'var(--text-primary)' }}>"{board.name}"</strong> and enable bidirectional sync.
                            </p>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>Sync mode</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {TRELLO_SYNC_MODES.map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setSyncMode(mode.id)}
                                        style={{
                                            display: 'flex', flexDirection: 'column', gap: 2,
                                            padding: '12px 14px', borderRadius: 'var(--radius-md)',
                                            border: `2px solid ${syncMode === mode.id ? 'var(--accent)' : 'var(--border)'}`,
                                            background: syncMode === mode.id ? 'rgba(99,102,241,0.05)' : 'var(--bg-primary)',
                                            cursor: 'pointer', textAlign: 'left'
                                        }}
                                    >
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{mode.label}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mode.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── WORKSPACE STEP ─── */}
                    {step === 'workspace' && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                                Choose the Trello workspace that will own the new board.
                            </p>
                            {workspaceError && (
                                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, marginBottom: 12 }}>
                                    {workspaceError}
                                </div>
                            )}
                            {workspaces === null && (
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>Loading workspaces…</div>
                            )}
                            {workspaces && workspaces.length === 0 && !workspaceError && (
                                <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-muted)' }}>
                                    No workspaces found. The board will be created on your personal account.
                                </div>
                            )}
                            {workspaces && workspaces.length > 0 && (
                                <>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>Workspace</label>
                                    <select
                                        value={selectedWorkspaceId}
                                        onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)', fontSize: 13
                                        }}
                                    >
                                        <option value="">— Personal (no workspace) —</option>
                                        {workspaces.map(ws => (
                                            <option key={ws.id} value={ws.id}>{ws.displayName || ws.name}</option>
                                        ))}
                                    </select>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                        Note: the workspace of a Trello board cannot be changed after creation on the free plan.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {/* ─── PREVIEW STEP ─── */}
                    {step === 'preview' && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                                The following will be created on Trello:
                            </p>
                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 14, fontSize: 13 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Trello board</span>
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>"{board.name}"</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Workspace</span>
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                        {selectedWorkspaceId
                                            ? (workspaces?.find(w => w.id === selectedWorkspaceId)?.displayName || workspaces?.find(w => w.id === selectedWorkspaceId)?.name || 'Selected')
                                            : 'Personal'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Lists (categories)</span>
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{listCount}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Cards ({cardAsTask ? 'tasks' : 'actions'})</span>
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{cardCount}</span>
                                </div>
                                {!cardAsTask && checklistCount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Checklist items (tasks)</span>
                                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{checklistCount}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Labels</span>
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{labelCount}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Sync mode</span>
                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{syncMode === 'card-as-task' ? 'Cards = Tasks' : 'Cards = Actions'}</span>
                                </div>
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
                                Estimated time: ~{Math.ceil((1 + listCount + labelCount + cardCount + checklistCount) * 0.3)}s (rate limited to respect Trello API)
                            </p>
                        </div>
                    )}

                    {/* ─── PUSHING STEP ─── */}
                    {step === 'pushing' && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                                Pushing to Trello... please don't close this window.
                            </p>
                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{progress.label}</span>
                                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{progressPercent}%</span>
                                </div>
                                <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${progressPercent}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }}/>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
                                    {progress.current} / {progress.total} operations
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── DONE STEP ─── */}
                    {step === 'done' && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                                Connected to Trello!
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                Board "{board.name}" is now synced with Trello.<br/>
                                Auto-sync is enabled — changes will be pushed and pulled automatically.
                            </p>
                        </div>
                    )}

                    {/* ─── ERROR STEP ─── */}
                    {step === 'error' && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
                                Push failed
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                Some items may have been partially created on Trello. You can retry or close and try again later.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
                    {step === 'mode' && (
                        <>
                            <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={() => setStep('workspace')} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none', background: '#0079BF', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Next
                            </button>
                        </>
                    )}
                    {step === 'workspace' && (
                        <>
                            <button onClick={() => setStep('mode')} style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                                Back
                            </button>
                            <div style={{ flex: 1 }}/>
                            <button
                                onClick={() => setStep('preview')}
                                disabled={workspaces === null}
                                style={{ padding: '10px 24px', borderRadius: 'var(--radius-md)', border: 'none', background: '#0079BF', color: 'white', fontSize: 13, fontWeight: 600, cursor: workspaces === null ? 'default' : 'pointer', opacity: workspaces === null ? 0.6 : 1 }}
                            >
                                Next
                            </button>
                        </>
                    )}
                    {step === 'preview' && (
                        <>
                            <button onClick={() => setStep('workspace')} style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                                Back
                            </button>
                            <div style={{ flex: 1 }}/>
                            <button onClick={handlePush} style={{ padding: '10px 24px', borderRadius: 'var(--radius-md)', border: 'none', background: '#0079BF', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Push to Trello
                            </button>
                        </>
                    )}
                    {step === 'done' && (
                        <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            Done
                        </button>
                    )}
                    {step === 'error' && (
                        <>
                            <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                                Close
                            </button>
                            <button onClick={handlePush} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none', background: '#0079BF', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Retry
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrelloExportModal;
