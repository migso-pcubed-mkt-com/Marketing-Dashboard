import { useState, useEffect } from 'react';
import { useApp } from '../context.js';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Icon } from './Icons.jsx';

const AVATAR_COLORS = ['#6366f1','#f59e0b','#22c55e','#ef4444','#3b82f6','#d97706','#8b5cf6','#ec4899','#14b8a6','#f97316'];

const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name[0].toUpperCase();
};

const getColor = (name) => {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const MemberManagementModal = ({ board, onClose, onUpdateMembers }) => {
    const { boards } = useApp();
    const [members, setMembers] = useState([...(board.members || [])]);
    const [newName, setNewName] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [showImport, setShowImport] = useState(false);
    const focusTrapRef = useFocusTrap(true);
    // Escape-to-close + focus trap + dialog ARIA (M18 — this modal had none).
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleAdd = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        const member = {
            id: crypto.randomUUID(),
            fullName: trimmed,
            username: newUsername.trim() || trimmed.toLowerCase().replace(/\s+/g, '.'),
            avatarUrl: null
        };
        setMembers(prev => [...prev, member]);
        setNewName('');
        setNewUsername('');
    };

    const handleDelete = (id) => {
        setMembers(prev => prev.filter(m => m.id !== id));
    };

    const handleStartEdit = (m) => {
        setEditingId(m.id);
        setEditName(m.fullName);
        setEditUsername(m.username || '');
    };

    const handleSaveEdit = () => {
        if (!editName.trim()) return;
        setMembers(prev => prev.map(m => m.id === editingId ? { ...m, fullName: editName.trim(), username: editUsername.trim() || editName.trim().toLowerCase().replace(/\s+/g, '.') } : m));
        setEditingId(null);
    };

    const handleSave = () => {
        onUpdateMembers(members);
        onClose();
    };

    // Other boards that have members (for import)
    const otherBoardsWithMembers = boards.filter(b => b.id !== board.id && (b.members || []).length > 0);

    const handleImportFromBoard = (sourceBoard) => {
        const existingNames = new Set(members.map(m => m.fullName.toLowerCase()));
        const toImport = (sourceBoard.members || []).filter(m => !existingNames.has(m.fullName.toLowerCase()));
        if (toImport.length === 0) return;
        // Re-ID imported members to avoid cross-board conflicts (keep avatarUrl if from Trello)
        const imported = toImport.map(m => ({
            ...m,
            id: crypto.randomUUID()
        }));
        setMembers(prev => [...prev, ...imported]);
        setShowImport(false);
    };

    const hasChanges = JSON.stringify(members) !== JSON.stringify(board.members || []);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose}/>
            <div ref={focusTrapRef} role="dialog" aria-modal="true" aria-labelledby="member-mgmt-title" style={{
                position: 'relative', background: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xl)', width: 440, maxWidth: '90vw', maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', zIndex: 1
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0' }}>
                    <h2 id="member-mgmt-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Manage Members</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Icon.Close/>
                    </button>
                </div>

                <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
                    {/* Add new member */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Add member</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                                placeholder="Full name"
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)', fontSize: 13, outline: 'none'
                                }}
                            />
                            <input
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                                placeholder="Username (opt.)"
                                style={{
                                    width: 120, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)', fontSize: 13, outline: 'none'
                                }}
                            />
                            <button
                                onClick={handleAdd}
                                disabled={!newName.trim()}
                                style={{
                                    padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none',
                                    background: !newName.trim() ? 'var(--bg-tertiary)' : 'var(--accent)',
                                    color: !newName.trim() ? 'var(--text-muted)' : 'white',
                                    fontSize: 13, fontWeight: 500, cursor: !newName.trim() ? 'default' : 'pointer'
                                }}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    {/* Import from other boards */}
                    {otherBoardsWithMembers.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <button
                                onClick={() => setShowImport(!showImport)}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)', fontSize: 12, fontWeight: 500,
                                    cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6
                                }}
                            >
                                <Icon.Download size={12}/> Import from another board
                                <svg style={{ marginLeft: 'auto', transform: showImport ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            {showImport && (
                                <div style={{ marginTop: 8, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 8 }}>
                                    {otherBoardsWithMembers.map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => handleImportFromBoard(b)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                                padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                                                border: 'none', background: 'transparent', cursor: 'pointer',
                                                color: 'var(--text-primary)', fontSize: 12, textAlign: 'left'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <span style={{ fontWeight: 500 }}>{b.name}</span>
                                            <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{b.members.length} member{b.members.length > 1 ? 's' : ''}</span>
                                            {b.trelloSync?.trelloBoardId && (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#0079BF"><rect x="1" y="1" width="22" height="22" rx="3" ry="3"/><rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="white"/><rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="white"/></svg>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Members list */}
                    {members.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                            No members yet. Add one above or import from another board.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {members.map(m => (
                                <div key={m.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                                    borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)'
                                }}>
                                    {/* Avatar */}
                                    {m.avatarUrl
                                        ? <img src={m.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}/>
                                        : <span style={{
                                            width: 32, height: 32, borderRadius: '50%', background: getColor(m.fullName),
                                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12, fontWeight: 600, flexShrink: 0
                                        }}>{getInitials(m.fullName)}</span>
                                    }

                                    {editingId === m.id ? (
                                        /* Edit mode */
                                        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <input
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                                autoFocus
                                                style={{
                                                    flex: 1, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid var(--accent)', background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)', fontSize: 12, outline: 'none'
                                                }}
                                            />
                                            <button onClick={handleSaveEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 2 }} title="Save">
                                                <Icon.Check size={14}/>
                                            </button>
                                            <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }} title="Cancel">
                                                <Icon.Close size={14}/>
                                            </button>
                                        </div>
                                    ) : (
                                        /* Display mode */
                                        <>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fullName}</div>
                                                {m.username && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{m.username}</div>}
                                            </div>
                                            <button onClick={() => handleStartEdit(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }} title="Edit">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            </button>
                                            <button onClick={() => handleDelete(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }} title="Remove">
                                                <Icon.Close size={13}/>
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges}
                        style={{
                            flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none',
                            background: hasChanges ? 'var(--accent)' : 'var(--bg-tertiary)',
                            color: hasChanges ? 'white' : 'var(--text-muted)',
                            fontSize: 13, fontWeight: 500, cursor: hasChanges ? 'pointer' : 'default'
                        }}
                    >
                        Save ({members.length} member{members.length !== 1 ? 's' : ''})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MemberManagementModal;
