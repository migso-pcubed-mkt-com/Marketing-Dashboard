import { useState } from 'react';
import { useApp } from '../context.js';
import { Icon } from './Icons.jsx';

const BoardSettingsModal = ({ board, onClose }) => {
    const { onRenameBoard, onDeleteBoard, onDuplicateBoard, boards } = useApp();
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

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
                onClick={onClose}
            />
            <div style={{
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
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Board Settings</h2>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tasks</span>
                        <span style={{ color: 'var(--text-primary)' }}>{board.tasks?.length || 0}</span>
                    </div>
                </div>

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
