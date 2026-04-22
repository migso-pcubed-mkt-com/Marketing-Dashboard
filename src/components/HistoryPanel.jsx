import { useEffect, memo } from 'react';
import { Icon } from './Icons.jsx';

const MAX_LABEL_LENGTH = 60;

const truncateLabel = (label) => {
    if (!label) return 'Change';
    return label.length > MAX_LABEL_LENGTH ? label.slice(0, MAX_LABEL_LENGTH - 1) + '…' : label;
};

const formatRelative = (timestamp) => {
    const diff = Date.now() - timestamp;
    const sec = Math.floor(diff / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
};

const HistoryPanel = ({ show, onClose, history, currentIndex, onJumpTo, onClear }) => {
    useEffect(() => {
        if (!show) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [show, onClose]);

    const entries = [...history].reverse();
    const hasEntries = entries.length > 0;

    return (
        <div className={`filter-sidebar ${show ? 'open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="history-panel-title">
            <div className="sidebar-header">
                <span className="sidebar-title" id="history-panel-title">History</span>
                <button className="sidebar-close" onClick={onClose} aria-label="Close history panel"><Icon.Close/></button>
            </div>

            {!hasEntries && (
                <div style={{padding:'32px 16px',textAlign:'center',color:'var(--text-secondary)',fontSize:13}}>
                    No history yet. Actions you take will appear here.
                </div>
            )}

            {hasEntries && (
                <div style={{flex:1,overflowY:'auto'}}>
                    {entries.map((entry) => {
                        const isCurrent = entry.index === currentIndex;
                        const isUndone = entry.index > currentIndex;
                        return (
                            <button
                                key={entry.index}
                                onClick={() => onJumpTo(entry.index)}
                                disabled={isCurrent}
                                className="history-entry"
                                style={{
                                    width:'100%',
                                    display:'flex',
                                    flexDirection:'column',
                                    alignItems:'flex-start',
                                    gap:2,
                                    padding:'10px 14px',
                                    border:'none',
                                    background: isCurrent ? 'var(--accent-bg, rgba(99,102,241,0.12))' : 'transparent',
                                    borderLeft: isCurrent ? '3px solid var(--accent)' : '3px solid transparent',
                                    cursor: isCurrent ? 'default' : 'pointer',
                                    opacity: isUndone ? 0.5 : 1,
                                    textAlign:'left',
                                    transition:'background 0.15s'
                                }}
                                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                                title={isCurrent ? (entry.label || 'Current state') : (entry.label || 'Jump to this point')}
                            >
                                <span style={{fontSize:13,fontWeight:isCurrent?600:500,color:'var(--text-primary)',wordBreak:'break-word'}}>
                                    {truncateLabel(entry.label)}
                                </span>
                                <span style={{fontSize:11,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:6}}>
                                    {formatRelative(entry.timestamp)}
                                    {isCurrent && <span style={{color:'var(--accent)',fontWeight:600}}>• current</span>}
                                    {isUndone && !isCurrent && <span>• undone</span>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {hasEntries && (
                <div style={{padding:12,borderTop:'1px solid var(--border)'}}>
                    <button
                        onClick={() => { if (confirm('Clear all history? This cannot be undone.')) onClear(); }}
                        className="v11-btn-secondary"
                        style={{width:'100%',fontSize:12,padding:'8px 10px',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}
                    >
                        <Icon.Trash/> Clear history
                    </button>
                </div>
            )}
        </div>
    );
};

export default memo(HistoryPanel);
