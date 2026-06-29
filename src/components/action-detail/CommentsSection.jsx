import { memo, useRef } from 'react';
import { WysiwygToolbar, SimpleMarkdown, sanitizeUrl } from '../../lib/markdown.jsx';
import MentionInput from '../MentionInput.jsx';

const CommentsSection = ({
    comments, isReadOnly, members, sectionCard, sectionLabel,
    commentAttachments, setCommentAttachments,
    onAddComment, onCommentFileSelect,
    newCommentEditableRef,
}) => {
    const commentFileRef = useRef(null);

    return (
        <div className="rounded-xl mb-5" style={sectionCard}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>💬 Comments ({(comments || []).length})</div>
            {!isReadOnly && (
                <div style={{ marginBottom: (comments || []).length > 0 ? 12 : 0 }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)' }}>
                        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
                            <WysiwygToolbar editableRef={newCommentEditableRef} onAttach={() => commentFileRef.current?.click()} />
                        </div>
                        <MentionInput editableRef={newCommentEditableRef} members={members} style={{ padding: '8px 12px', minHeight: 48 }} placeholder="Write a comment..." onSubmit={onAddComment} />
                    </div>
                    <input ref={commentFileRef} type="file" multiple style={{ display: 'none' }} onChange={onCommentFileSelect} />
                    {commentAttachments.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                            {commentAttachments.map((att, i) => (
                                <span key={i} style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg-secondary)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    📎 {att.name}
                                    <button onClick={() => setCommentAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)', padding: 0 }}>&times;</button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <button onClick={onAddComment} className="px-3 py-1 text-white rounded-lg text-xs font-medium" style={{ background: '#d97706' }}>Comment</button>
                    </div>
                </div>
            )}
            {(comments || []).length > 0 && (
                <div className="space-y-2">
                    {(comments || []).slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map((comment, idx) => (
                        <div key={comment.id || idx} className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                            <div className="flex justify-between mb-2">
                                <span className="font-medium text-sm">{comment.author}</span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{comment.date ? new Date(comment.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}><SimpleMarkdown text={comment.text} /></div>
                            {comment.attachments?.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                                    {comment.attachments.map(att => (
                                        <a key={att.id || att.name} href={sanitizeUrl(att.url || att.data, { allowData: true })} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, background: 'var(--accent-light)', textDecoration: 'none' }}>📎 {att.name}</a>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default memo(CommentsSection);
