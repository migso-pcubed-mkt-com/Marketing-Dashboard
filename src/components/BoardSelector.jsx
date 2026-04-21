import { useState, useRef, useEffect } from 'react';
import { useBoard } from '../context.js';
import { Icon } from './Icons.jsx';
import BoardSettingsModal from './BoardSettingsModal.jsx';

const BoardSelector = () => {
    const { boards, currentBoardId, currentBoard, onSwitchBoard, onCreateBoard, onShowTrelloImport, onOpenRemapLabels, onShowExcelImport, onToggleMultiBoard, multiBoardMode, selectedBoardIds } = useBoard();
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [settingsBoard, setSettingsBoard] = useState(null);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    const toggleBoardSelection = (boardId) => {
        if (!onToggleMultiBoard) return;
        const set = new Set(selectedBoardIds || []);
        if (set.has(boardId)) set.delete(boardId); else set.add(boardId);
        const next = Array.from(set);
        if (next.length === 0) {
            onToggleMultiBoard(false, []);
        } else {
            onToggleMultiBoard(true, next);
        }
    };

    const handleToggleCombinedView = () => {
        if (!onToggleMultiBoard) return;
        if (multiBoardMode) {
            onToggleMultiBoard(false, []);
        } else {
            // Start combined view with the current board pre-selected
            onToggleMultiBoard(true, currentBoardId ? [currentBoardId] : []);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
                setIsCreating(false);
                setNewName('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    useEffect(() => {
        if (isCreating && inputRef.current) inputRef.current.focus();
    }, [isCreating]);

    const handleCreate = () => {
        const name = newName.trim();
        if (!name) return;
        onCreateBoard(name);
        setNewName('');
        setIsCreating(false);
        setIsOpen(false);
    };

    if (!boards.length) return null;

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    maxWidth: 480,
                    transition: 'background 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
            >
                <div className="v11-logo" style={{ width: 28, height: 28, fontSize: 12, flexShrink: 0 }}>M</div>
                <span style={{
                    fontSize: 15,
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                }}>
                    {multiBoardMode
                        ? `Combined view (${selectedBoardIds?.length || 0})`
                        : (currentBoard?.name || 'Board')}
                </span>
                {multiBoardMode && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} title="Combined view is read-only">
                        Read-only
                    </span>
                )}
                {!multiBoardMode && currentBoard?.trelloSync?.trelloBoardId && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{flexShrink:0,opacity:0.6}} title="Synced with Trello">
                        <rect x="1" y="1" width="22" height="22" rx="3" fill="#0079BF"/>
                        <rect x="4" y="4" width="7" height="14" rx="1.5" fill="white"/>
                        <rect x="13" y="4" width="7" height="9" rx="1.5" fill="white"/>
                    </svg>
                )}
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', opacity: 0.5 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    minWidth: 260,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 1000,
                    overflow: 'hidden'
                }}>
                    <div style={{ padding: '6px 12px 4px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Boards</span>
                        {onToggleMultiBoard && boards.length > 1 && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }} title="Read-only view combining tasks from multiple boards">
                                <input
                                    type="checkbox"
                                    checked={!!multiBoardMode}
                                    onChange={handleToggleCombinedView}
                                    style={{ cursor: 'pointer' }}
                                />
                                Combined view
                            </label>
                        )}
                    </div>
                    <div style={{ padding: '4px 0', maxHeight: 300, overflowY: 'auto' }}>
                        {boards.map(board => {
                            const isSelectedInCombined = multiBoardMode && (selectedBoardIds || []).includes(board.id);
                            const rowActive = multiBoardMode ? isSelectedInCombined : board.id === currentBoardId;
                            const onRowClick = () => {
                                if (multiBoardMode) {
                                    toggleBoardSelection(board.id);
                                } else {
                                    onSwitchBoard(board.id);
                                    setIsOpen(false);
                                }
                            };
                            return (
                            <div
                                key={board.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    background: rowActive ? 'var(--accent-light)' : 'transparent',
                                    transition: 'background 0.1s'
                                }}
                                onMouseEnter={e => { if (!rowActive) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                onMouseLeave={e => { if (!rowActive) e.currentTarget.style.background = 'transparent'; }}
                                onClick={onRowClick}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1 }}>
                                    {multiBoardMode ? (
                                        <input
                                            type="checkbox"
                                            checked={isSelectedInCombined}
                                            onChange={() => toggleBoardSelection(board.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ cursor: 'pointer', flexShrink: 0 }}
                                        />
                                    ) : board.id === currentBoardId && (
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
                                    )}
                                    <span style={{
                                        fontSize: 13,
                                        fontWeight: rowActive ? 600 : 400,
                                        color: rowActive ? 'var(--accent)' : 'var(--text-primary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {board.name}
                                    </span>
                                    {board.trelloSync?.trelloBoardId && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{flexShrink:0,opacity:0.5}} title="Synced with Trello">
                                            <rect x="1" y="1" width="22" height="22" rx="3" fill="#0079BF"/>
                                            <rect x="4" y="4" width="7" height="14" rx="1.5" fill="white"/>
                                            <rect x="13" y="4" width="7" height="9" rx="1.5" fill="white"/>
                                        </svg>
                                    )}
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                                        {board.tasks?.length || 0}
                                    </span>
                                </div>
                                {!multiBoardMode && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setSettingsBoard(board); setIsOpen(false); }}
                                        style={{
                                            padding: 4,
                                            borderRadius: 'var(--radius-sm)',
                                            border: 'none',
                                            background: 'transparent',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            flexShrink: 0
                                        }}
                                        title="Board settings"
                                    >
                                        <Icon.Settings size={13}/>
                                    </button>
                                )}
                            </div>
                            );
                        })}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
                        {isCreating ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                    ref={inputRef}
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setIsCreating(false); setNewName(''); } }}
                                    placeholder="Board name..."
                                    style={{
                                        flex: 1,
                                        padding: '6px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: 12,
                                        outline: 'none'
                                    }}
                                />
                                <button
                                    onClick={handleCreate}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: 'var(--radius-sm)',
                                        border: 'none',
                                        background: 'var(--accent)',
                                        color: 'white',
                                        fontSize: 12,
                                        fontWeight: 500,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Add
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsCreating(true)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: 'var(--radius-sm)',
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--accent)',
                                    fontSize: 13,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <Icon.Plus size={13}/> New board
                            </button>
                        )}
                        <button
                            onClick={() => { setIsOpen(false); onShowTrelloImport(); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                border: 'none',
                                background: 'transparent',
                                color: '#0079BF',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                textAlign: 'left'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="#0079BF">
                                <rect x="1" y="1" width="22" height="22" rx="3" ry="3"/>
                                <rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="white"/>
                                <rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="white"/>
                            </svg>
                            Import from Trello
                        </button>
                        <button
                            onClick={() => { setIsOpen(false); onShowExcelImport(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                width: '100%', padding: '8px 12px',
                                background: 'transparent', border: 'none',
                                color: 'var(--text-secondary)', fontSize: 12,
                                fontWeight: 500, cursor: 'pointer', textAlign: 'left'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <Icon.Upload size={13}/>
                            Import from Excel
                        </button>
                    </div>
                </div>
            )}

            {settingsBoard && (
                <BoardSettingsModal
                    board={settingsBoard}
                    onClose={() => setSettingsBoard(null)}
                    onOpenRemapLabels={() => { setSettingsBoard(null); onOpenRemapLabels(); }}
                />
            )}
        </div>
    );
};

export default BoardSelector;
