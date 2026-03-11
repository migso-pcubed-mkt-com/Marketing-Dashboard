import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context.js';
import { Icon } from './Icons.jsx';
import BoardSettingsModal from './BoardSettingsModal.jsx';

const BoardSelector = () => {
    const { boards, currentBoardId, currentBoard, onSwitchBoard, onCreateBoard, onShowTrelloImport } = useApp();
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [settingsBoard, setSettingsBoard] = useState(null);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

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
                    {currentBoard?.name || 'Board'}
                </span>
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
                    <div style={{ padding: '6px 12px 4px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Boards</span>
                    </div>
                    <div style={{ padding: '4px 0', maxHeight: 300, overflowY: 'auto' }}>
                        {boards.map(board => (
                            <div
                                key={board.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    background: board.id === currentBoardId ? 'var(--accent-light)' : 'transparent',
                                    transition: 'background 0.1s'
                                }}
                                onMouseEnter={e => { if (board.id !== currentBoardId) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                onMouseLeave={e => { if (board.id !== currentBoardId) e.currentTarget.style.background = 'transparent'; }}
                                onClick={() => { onSwitchBoard(board.id); setIsOpen(false); }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1 }}>
                                    {board.id === currentBoardId && (
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
                                    )}
                                    <span style={{
                                        fontSize: 13,
                                        fontWeight: board.id === currentBoardId ? 600 : 400,
                                        color: board.id === currentBoardId ? 'var(--accent)' : 'var(--text-primary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {board.name}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                                        {board.tasks?.length || 0}
                                    </span>
                                </div>
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
                            </div>
                        ))}
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
                    </div>
                </div>
            )}

            {settingsBoard && (
                <BoardSettingsModal
                    board={settingsBoard}
                    onClose={() => setSettingsBoard(null)}
                />
            )}
        </div>
    );
};

export default BoardSelector;
