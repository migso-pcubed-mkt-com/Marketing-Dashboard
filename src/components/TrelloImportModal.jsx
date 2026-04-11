import { useState, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Icon } from './Icons.jsx';
import { CONFIG, TRELLO_COLORS, TRELLO_SYNC_MODES } from '../config.js';
import { fetchTrelloBoards, fetchTrelloBoardFull, checkTrelloConnection } from '../lib/trello.js';
import { buildImportData, buildImportDataCardAsAction, matchLabelToChannel, matchLabelToCountry } from '../lib/trelloMapping.js';

// mappingOnly mode: skip board selection, load linked board directly, show mapping step
// existingMappings: pre-populate label mappings from board.trelloSync.labelMappings
// trelloBoardId: the linked Trello board ID (required for mappingOnly)
// onSaveMappings: callback when saving re-configured mappings (mappingOnly mode)
const TrelloImportModal = ({ onClose, onImport, mappingOnly = false, existingMappings = null, trelloBoardId = null, onSaveMappings = null }) => {
    const focusTrapRef = useFocusTrap(true);
    const [step, setStep] = useState('loading'); // loading | boards | mode | mapping | preview | importing | error
    const [error, setError] = useState(null);
    const [boards, setBoards] = useState([]);
    const [selectedBoardId, setSelectedBoardId] = useState(null);
    const [trelloData, setTrelloData] = useState(null);
    const [labelMappings, setLabelMappings] = useState({});
    const [importPreview, setImportPreview] = useState(null);
    const [syncMode, setSyncMode] = useState('card-as-task');

    // Step 1: Check connection and load boards (or load linked board in mappingOnly mode)
    useEffect(() => {
        (async () => {
            try {
                const { connected } = await checkTrelloConnection();
                if (!connected) {
                    setError('Cannot connect to Trello. Please configure TRELLO_API_KEY and TRELLO_TOKEN in Vercel environment variables.');
                    setStep('error');
                    return;
                }
                if (mappingOnly && trelloBoardId) {
                    // Load linked board directly
                    const data = await fetchTrelloBoardFull(trelloBoardId);
                    setTrelloData(data);
                    // Pre-populate with existing mappings, adding any new labels
                    const mappings = { ...(existingMappings || {}) };
                    for (const label of data.labels) {
                        if (!mappings[label.id]) {
                            const countryMatch = matchLabelToCountry(label);
                            const channelMatch = matchLabelToChannel(label);
                            const labelColor = TRELLO_COLORS[label.color]?.hex || '#6b7280';
                            if (countryMatch) {
                                mappings[label.id] = { type: 'country', countryId: countryMatch, labelName: label.name || '', labelColor };
                            } else if (channelMatch) {
                                mappings[label.id] = { type: 'channel', channelId: channelMatch, labelName: label.name || '', labelColor };
                            } else if (label.name) {
                                mappings[label.id] = { type: 'action', categoryId: null, labelName: label.name || '', labelColor };
                            } else {
                                mappings[label.id] = { type: 'ignore', labelName: label.name || '', labelColor };
                            }
                        }
                    }
                    setLabelMappings(mappings);
                    setStep('mapping');
                } else {
                    const boards = await fetchTrelloBoards();
                    setBoards(boards);
                    setStep('boards');
                }
            } catch (err) {
                setError(err.message);
                setStep('error');
            }
        })();
    }, [mappingOnly, trelloBoardId, existingMappings]);

    // Step 2: Load full board data when selected
    const handleSelectBoard = async (boardId) => {
        setSelectedBoardId(boardId);
        setStep('loading');
        try {
            const data = await fetchTrelloBoardFull(boardId);
            setTrelloData(data);
            setStep('mode'); // Show sync mode selection step
        } catch (err) {
            setError(err.message);
            setStep('error');
        }
    };

    // Initialize label mappings based on sync mode and proceed to mapping step
    const handleSelectMode = (mode) => {
        setSyncMode(mode);
        const mappings = {};
        for (const label of trelloData.labels) {
            const countryMatch = matchLabelToCountry(label);
            const channelMatch = matchLabelToChannel(label);
            const labelColor = TRELLO_COLORS[label.color]?.hex || '#6b7280';
            if (countryMatch) {
                mappings[label.id] = { type: 'country', countryId: countryMatch, labelName: label.name || '', labelColor };
            } else if (channelMatch) {
                mappings[label.id] = { type: 'channel', channelId: channelMatch, labelName: label.name || '', labelColor };
            } else if (label.name && mode === 'card-as-task') {
                // In card-as-task mode, named labels default to Other (no action mapping)
                mappings[label.id] = { type: 'other', labelName: label.name || '', labelColor };
            } else if (label.name) {
                // In card-as-action mode, named labels default to Other (no "action" option)
                mappings[label.id] = { type: 'other', labelName: label.name || '', labelColor };
            } else {
                mappings[label.id] = { type: 'ignore', labelName: label.name || '', labelColor };
            }
        }
        setLabelMappings(mappings);
        setStep('mapping');
    };

    // Step 3: Build preview (uses different builder depending on sync mode)
    const handleBuildPreview = () => {
        const builder = syncMode === 'card-as-action' ? buildImportDataCardAsAction : buildImportData;
        const preview = builder(trelloData, { labelMappings });
        setImportPreview(preview);
        setStep('preview');
    };

    // Step 4: Execute import
    const handleImport = () => {
        setStep('importing');
        try {
            onImport(importPreview, trelloData.board.name);
            onClose();
        } catch (err) {
            setError(err.message);
            setStep('error');
        }
    };

    const updateLabelMapping = (labelId, field, value, label) => {
        setLabelMappings(prev => {
            const updated = { ...prev[labelId], [field]: value };
            // Store label name/color for "other" type
            if (label) {
                updated.labelName = label.name || '';
                updated.labelColor = TRELLO_COLORS[label.color]?.hex || '#6b7280';
            }
            return { ...prev, [labelId]: updated };
        });
    };

    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Style constants
    const modalStyle = {
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    };
    const overlayStyle = { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' };
    const panelStyle = {
        position: 'relative', background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)',
        width: 560, maxWidth: '90vw', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', zIndex: 1
    };
    const headerStyle = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px', borderBottom: '1px solid var(--border)'
    };
    const bodyStyle = { padding: 24, overflowY: 'auto', flex: 1 };
    const footerStyle = {
        display: 'flex', justifyContent: 'flex-end', gap: 8,
        padding: '16px 24px', borderTop: '1px solid var(--border)'
    };
    const btnPrimary = {
        padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none',
        background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer'
    };
    const btnSecondary = {
        padding: '8px 16px', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)', background: 'var(--bg-primary)',
        color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer'
    };

    const stepTitle = {
        loading: 'Connecting to Trello...',
        boards: 'Select a Trello Board',
        mode: 'Choose Sync Mode',
        mapping: mappingOnly ? 'Re-configure Label Mapping' : 'Configure Label Mapping',
        preview: 'Import Preview',
        importing: 'Importing...',
        error: mappingOnly ? 'Label Mapping' : 'Trello Import'
    }[step];

    return (
        <div style={modalStyle}>
            <div style={overlayStyle} onClick={onClose}/>
            <div ref={focusTrapRef} style={panelStyle} role="dialog" aria-modal="true" aria-labelledby="trello-import-modal-title">
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <TrelloIcon/>
                        <h2 id="trello-import-modal-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{stepTitle}</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Icon.Close/>
                    </button>
                </div>

                {/* Body */}
                <div style={bodyStyle}>
                    {step === 'loading' && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: 14 }}>Loading...</div>
                        </div>
                    )}

                    {step === 'error' && (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{error}</div>
                            <button onClick={onClose} style={btnSecondary}>Close</button>
                        </div>
                    )}

                    {step === 'boards' && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                                Select a Trello board to import. Lists will become Categories, and Cards will become Tasks.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {boards.map(board => (
                                    <button
                                        key={board.id}
                                        onClick={() => handleSelectBoard(board.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '12px 16px', borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
                                            textAlign: 'left', transition: 'background 0.1s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{board.name}</div>
                                            {board.desc && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{board.desc.slice(0, 80)}</div>}
                                        </div>
                                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.4, flexShrink: 0 }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                                        </svg>
                                    </button>
                                ))}
                                {boards.length === 0 && (
                                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                        No open boards found on your Trello account.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'mode' && trelloData && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                                How are your Trello cards organized?
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <button onClick={() => handleSelectMode('card-as-task')} style={{
                                    display: 'flex', flexDirection: 'column', gap: 8,
                                    padding: '16px 20px', borderRadius: 'var(--radius-md)',
                                    border: syncMode === 'card-as-task' ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    background: 'var(--bg-primary)', cursor: 'pointer', textAlign: 'left'
                                }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Cards = Tasks</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                        Each card is a work item (task). Labels define the actions/initiatives they belong to.
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#6366f120', color: '#6366f1' }}>List → Category</span>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f59e0b20', color: '#f59e0b' }}>Label → Action</span>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#22c55e20', color: '#22c55e' }}>Card → Task</span>
                                    </div>
                                </button>
                                <button onClick={() => handleSelectMode('card-as-action')} style={{
                                    display: 'flex', flexDirection: 'column', gap: 8,
                                    padding: '16px 20px', borderRadius: 'var(--radius-md)',
                                    border: syncMode === 'card-as-action' ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    background: 'var(--bg-primary)', cursor: 'pointer', textAlign: 'left'
                                }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Cards = Actions</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                        Each card is a marketing initiative (action). Checklist items are the actual tasks.
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#6366f120', color: '#6366f1' }}>List → Category</span>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f59e0b20', color: '#f59e0b' }}>Card → Action</span>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#22c55e20', color: '#22c55e' }}>Checklist Item → Task</span>
                                    </div>
                                </button>
                            </div>
                            {/* Board stats */}
                            <div style={{
                                marginTop: 16, padding: 12, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-muted)'
                            }}>
                                This board has <strong>{trelloData.cards.length}</strong> cards,
                                {' '}<strong>{trelloData.cards.reduce((sum, c) => sum + (c.checklists?.length || 0), 0)}</strong> checklists,
                                {' '}<strong>{trelloData.cards.reduce((sum, c) => sum + (c.checklists || []).reduce((s, cl) => s + (cl.checkItems?.length || 0), 0), 0)}</strong> checklist items
                            </div>
                        </div>
                    )}

                    {step === 'mapping' && trelloData && (
                        <div>
                            {/* Lists → Categories (automatic) */}
                            <div style={{ marginBottom: 20 }}>
                                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                                    Lists → Categories ({trelloData.lists.length})
                                </h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {trelloData.lists.map(list => (
                                        <span key={list.id} style={{
                                            padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                                            background: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-primary)'
                                        }}>
                                            {list.name}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Labels mapping (configurable) */}
                            <div>
                                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                                    Labels — Choose mapping ({trelloData.labels.filter(l => l.name || l.color).length})
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {trelloData.labels.filter(l => l.name || l.color).map(label => {
                                        const mapping = labelMappings[label.id] || { type: 'ignore' };
                                        const trelloColor = TRELLO_COLORS[label.color] || TRELLO_COLORS.black;
                                        return (
                                            <div key={label.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                                background: 'var(--bg-secondary)'
                                            }}>
                                                {/* Label badge */}
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: 4,
                                                    background: trelloColor.hex, color: 'white',
                                                    fontSize: 11, fontWeight: 500, minWidth: 60, textAlign: 'center'
                                                }}>
                                                    {label.name || label.color}
                                                </span>

                                                {/* → */}
                                                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>

                                                {/* Mapping type selector */}
                                                <select
                                                    value={mapping.type}
                                                    onChange={e => updateLabelMapping(label.id, 'type', e.target.value, label)}
                                                    style={{
                                                        padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                                        color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer'
                                                    }}
                                                >
                                                    <option value="channel">Channel</option>
                                                    <option value="country">Country</option>
                                                    <option value="other">Other Label</option>
                                                    <option value="ignore">Ignore</option>
                                                </select>

                                                {/* Channel selector (if type=channel) */}
                                                {mapping.type === 'channel' && (
                                                    <select
                                                        value={mapping.channelId || ''}
                                                        onChange={e => updateLabelMapping(label.id, 'channelId', e.target.value, label)}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                                            color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', flex: 1
                                                        }}
                                                    >
                                                        <option value="">Select channel...</option>
                                                        {CONFIG.CHANNELS.map(ch => (
                                                            <option key={ch.id} value={ch.id}>{ch.name}</option>
                                                        ))}
                                                    </select>
                                                )}

                                                {/* Country selector (if type=country) */}
                                                {mapping.type === 'country' && (
                                                    <select
                                                        value={mapping.countryId || ''}
                                                        onChange={e => updateLabelMapping(label.id, 'countryId', e.target.value, label)}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                                            color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', flex: 1
                                                        }}
                                                    >
                                                        <option value="">Select country...</option>
                                                        {CONFIG.COUNTRIES.map(c => (
                                                            <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
                                                        ))}
                                                    </select>
                                                )}

                                                {/* Info for action type */}
                                                {mapping.type === 'action' && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        Auto-assigned to category
                                                    </span>
                                                )}

                                                {/* Info for country type */}
                                                {mapping.type === 'country' && !mapping.countryId && (
                                                    <span style={{ fontSize: 11, color: '#f59e0b' }}>
                                                        Select a country
                                                    </span>
                                                )}

                                                {/* Info for other label type */}
                                                {mapping.type === 'other' && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        Kept as tag on tasks
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Cards summary */}
                            <div style={{
                                marginTop: 16, padding: 12, borderRadius: 'var(--radius-md)',
                                background: 'var(--accent-light)', fontSize: 12, color: 'var(--accent)'
                            }}>
                                {syncMode === 'card-as-action'
                                    ? `${trelloData.cards.filter(c => !c.closed).length} cards → actions, ${trelloData.cards.filter(c => !c.closed).reduce((sum, c) => sum + (c.checklists || []).reduce((s, cl) => s + (cl.checkItems?.length || 0), 0), 0)} checklist items → tasks`
                                    : `${trelloData.cards.length} cards will be imported as tasks`
                                }
                            </div>
                        </div>
                    )}

                    {step === 'preview' && importPreview && (
                        <div>
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20
                            }}>
                                <StatBox label="Categories" value={importPreview.categories.length} color="#6366f1"/>
                                <StatBox label="Actions" value={importPreview.actions.length} color="#f59e0b"/>
                                <StatBox label="Tasks" value={importPreview.tasks.length} color="#22c55e"/>
                            </div>

                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Categories</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                                {importPreview.categories.map(cat => (
                                    <span key={cat.id} style={{
                                        padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                                        background: cat.color + '20', color: cat.color,
                                        fontSize: 12, fontWeight: 500
                                    }}>
                                        {cat.name}
                                    </span>
                                ))}
                            </div>

                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Sample tasks (first 5)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {importPreview.tasks.slice(0, 5).map(task => (
                                    <div key={task.id} style={{
                                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                        background: 'var(--bg-secondary)', fontSize: 12
                                    }}>
                                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{task.title}</span>
                                        {task.dueDate && (
                                            <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Due: {task.dueDate}</span>
                                        )}
                                    </div>
                                ))}
                                {importPreview.tasks.length > 5 && (
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 12px' }}>
                                        ...and {importPreview.tasks.length - 5} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'importing' && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: 14 }}>Creating board...</div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(step === 'mapping' || step === 'preview' || step === 'mode') && (
                    <div style={footerStyle}>
                        {!mappingOnly && step === 'mode' && <button onClick={() => { setStep('boards'); setTrelloData(null); }} style={btnSecondary}>Back</button>}
                        {!mappingOnly && step === 'mapping' && <button onClick={() => setStep('mode')} style={btnSecondary}>Back</button>}
                        {!mappingOnly && step === 'preview' && <button onClick={() => setStep('mapping')} style={btnSecondary}>Back</button>}
                        {mappingOnly && step === 'mapping' && (
                            <>
                                <button onClick={onClose} style={btnSecondary}>Cancel</button>
                                <button onClick={() => { if (onSaveMappings) onSaveMappings(labelMappings); onClose(); }} style={btnPrimary}>
                                    Save Mappings
                                </button>
                            </>
                        )}
                        {!mappingOnly && step === 'mapping' && (
                            <button onClick={handleBuildPreview} style={btnPrimary}>
                                Preview Import
                            </button>
                        )}
                        {step === 'preview' && (
                            <button onClick={handleImport} style={btnPrimary}>Import Board</button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const StatBox = ({ label, value, color }) => (
    <div style={{
        padding: 12, borderRadius: 'var(--radius-md)',
        background: color + '10', textAlign: 'center'
    }}>
        <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
);

const TrelloIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0079BF">
        <rect x="1" y="1" width="22" height="22" rx="3" ry="3"/>
        <rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="white"/>
        <rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="white"/>
    </svg>
);

export default TrelloImportModal;
