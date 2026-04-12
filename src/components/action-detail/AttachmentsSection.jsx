import { memo, useRef } from 'react';

const AttachmentsSection = ({
    attachments, isReadOnly, sectionCard, sectionLabel,
    onFileSelect, onRemove,
}) => {
    const fileRef = useRef(null);

    return (
        <div className="rounded-xl mb-5" style={sectionCard}>
            <div className="flex items-center justify-between mb-2">
                <span style={sectionLabel}>Attachments ({(attachments || []).length})</span>
                {!isReadOnly && (
                    <button onClick={() => fileRef.current?.click()} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Add</button>
                )}
            </div>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={onFileSelect} />
            {(attachments || []).length > 0 ? (
                <div className="space-y-2">
                    {(attachments || []).map(att => {
                        const thumb = att.thumbnailUrl || att.data || null;
                        return (
                            <div key={att.id || att.name} className="flex items-center gap-3 p-2 rounded" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                                {thumb ? <img src={thumb} alt={att.name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} /> : <span style={{ fontSize: 16, flexShrink: 0 }}>📎</span>}
                                <a href={att.url || att.data || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                    <span className="truncate">{att.name}</span>
                                </a>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                    {att.size && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(att.size / 1024).toFixed(0)}KB</span>}
                                    {att.date && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(att.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>}
                                    {!isReadOnly && <button onClick={() => onRemove(att.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 2 }}>&times;</button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No attachments</p>
            )}
        </div>
    );
};

export default memo(AttachmentsSection);
