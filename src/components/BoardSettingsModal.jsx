import { useState, useEffect } from 'react';
import { useBoard } from '../context.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { Icon } from './Icons.jsx';
import { TRELLO_SYNC_INTERVALS } from '../config.js';

const BoardSettingsModal = ({ board, onClose, onOpenRemapLabels }) => {
    const { onRenameBoard, onDeleteBoard, onDuplicateBoard, boards, onTrelloSync, onUpdateTrelloSyncSettings, trelloSyncStatus } = useBoard();
    const focusTrapRef = useFocusTrap(true);
    const [name, setName] = useState(board.name);
    const isLastBoard = boards.length <= 1;

    const handleRename = () => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== board.name) {
            onRenameBoard(board.id, trimmed);
        }
        onClose();
    };

    const handleDuplicate = () => {
        onDuplicateBoard(board.id);
        onClose();
    };

    const handleDelete = () => {
        if (isLastBoard) return;
        if (!confirm(`Delete board "${board.name}"? All its data will be lost.`)) return;
        onDeleteBoard(board.id);
        onClose();
    };

    const formatDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
                onClick={onClose}
            />
            <div ref={focusTrapRef} role="dialog" aria-modal="true" aria-labelledby="board-settings-modal-title" style={{
                position: 'relative',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xl)',
                width: 400,
                maxWidth: '90vw',
                padding: 24,
                zIndex: 1
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 id="board-settings-modal-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Board Settings</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Icon.Close/>
                    </button>
                </div>

                {/* Name */}
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Board name</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: 13,
                                outline: 'none'
                            }}
                        />
                        <button
                            onClick={handleRename}
                            disabled={!name.trim() || name.trim() === board.name}
                            style={{
                                padding: '8px 14px',
                                borderRadius: 'var(--radius-md)',
                                border: 'none',
                                background: (!name.trim() || name.trim() === board.name) ? 'var(--bg-tertiary)' : 'var(--accent)',
                                color: (!name.trim() || name.trim() === board.name) ? 'var(--text-muted)' : 'white',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: (!name.trim() || name.trim() === board.name) ? 'default' : 'pointer'
                            }}
                        >
                            Save
                        </button>
                    </div>
                </div>

                {/* Metadata */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                    marginBottom: 16,
                    fontSize: 12,
                    color: 'var(--text-muted)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Created</span>
                        <span style={{ color: 'var(--text-primary)' }}>{formatDate(board.createdAt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Last updated</span>
                        <span style={{ color: 'var(--text-primary)' }}>{formatDate(board.updatedAt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Categories</span>
                        <span style={{ color: 'var(--text-primary)' }}>{board.categories?.length || 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Actions</span>
                        <span style={{ color: 'var(--text-primary)' }}>{board.actions?.length || 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Tasks</span>
                        <span style={{ color: 'var(--text-primary)' }}>{board.tasks?.length || 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Members</span>
                        <span style={{ color: 'var(--text-primary)' }}>{board.members?.length || 0}</span>
                    </div>
                </div>

                {/* Members */}
                {(board.members || []).length > 0 && (
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 12,
                        marginBottom: 16,
                        fontSize: 12
                    }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Members</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {board.members.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {m.avatarUrl
                                        ? <img src={m.avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }}/>
                                        : <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600 }}>{(m.fullName || m.username || '?')[0].toUpperCase()}</span>
                                    }
                                    <span style={{ color: 'var(--text-primary)' }}>{m.fullName || m.username}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Trello Sync */}
                {board.trelloSync?.trelloBoardId && (
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 12,
                        marginBottom: 16,
                        fontSize: 12
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#0079BF">
                                <rect x="1" y="1" width="22" height="22" rx="3" ry="3"/>
                                <rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="white"/>
                                <rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="white"/>
                            </svg>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Trello Sync</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)' }}>
                            <span>Board</span>
                            <a href={board.trelloSync.trelloBoardUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0079BF', textDecoration: 'none' }}>
                                {board.trelloSync.trelloBoardName}
                            </a>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)' }}>
                            <span>Last sync</span>
                            <span style={{ color: 'var(--text-primary)' }}>
                                {board.trelloSync.lastSyncAt ? new Date(board.trelloSync.lastSyncAt).toLocaleString() : 'Never'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, color: 'var(--text-muted)' }}>
                            <span>Auto-sync</span>
                            <button
                                onClick={() => onUpdateTrelloSyncSettings({ syncEnabled: !board.trelloSync.syncEnabled })}
                                style={{
                                    padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: 'none',
                                    background: board.trelloSync.syncEnabled ? '#dcfce7' : 'var(--bg-tertiary)',
                                    color: board.trelloSync.syncEnabled ? '#16a34a' : 'var(--text-muted)',
                                    fontSize: 11, fontWeight: 500, cursor: 'pointer'
                                }}
                            >
                                {board.trelloSync.syncEnabled ? 'On' : 'Off'}
                            </button>
                        </div>
                        {board.trelloSync.syncEnabled && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, color: 'var(--text-muted)' }}>
                                <span>Interval</span>
                                <select
                                    value={board.trelloSync.pollIntervalMs || 120000}
                                    onChange={e => onUpdateTrelloSyncSettings({ pollIntervalMs: Number(e.target.value) })}
                                    style={{
                                        padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer'
                                    }}
                                >
                                    {TRELLO_SYNC_INTERVALS.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button
                                onClick={onTrelloSync}
                                disabled={trelloSyncStatus === 'syncing'}
                                style={{
                                    flex: 1, padding: '6px 0', borderRadius: 'var(--radius-sm)',
                                    border: '1px solid #0079BF', background: 'white',
                                    color: '#0079BF', fontSize: 11, fontWeight: 500,
                                    cursor: trelloSyncStatus === 'syncing' ? 'default' : 'pointer'
                                }}
                            >
                                {trelloSyncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('Unlink this board from Trello? Existing data will be kept.')) {
                                        onUpdateTrelloSyncSettings({ syncEnabled: false, trelloBoardId: null });
                                    }
                                }}
                                style={{
                                    padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                                    border: 'none', background: '#fef2f2',
                                    color: '#dc2626', fontSize: 11, fontWeight: 500, cursor: 'pointer'
                                }}
                            >
                                Unlink
                            </button>
                        </div>
                        {board.trelloSync?.labelMappings && (
                            <button
                                onClick={() => { if (onOpenRemapLabels) onOpenRemapLabels(); }}
                                style={{
                                    width: '100%', padding: '6px 0', marginTop: 6,
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)', fontSize: 11, fontWeight: 500, cursor: 'pointer'
                                }}
                            >
                                Re-configure Labels
                            </button>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={handleDuplicate}
                        style={{
                            flex: 1,
                            padding: '10px 0',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        Duplicate
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={isLastBoard}
                        title={isLastBoard ? 'Cannot delete the last board' : ''}
                        style={{
                            flex: 1,
                            padding: '10px 0',
                            borderRadius: 'var(--radius-md)',
                            border: 'none',
                            background: isLastBoard ? 'var(--bg-tertiary)' : '#fef2f2',
                            color: isLastBoard ? 'var(--text-muted)' : '#dc2626',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: isLastBoard ? 'default' : 'pointer'
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BoardSettingsModal;
