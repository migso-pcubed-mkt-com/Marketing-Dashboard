import { useState, useRef, useEffect, useCallback } from 'react';

// MentionInput — contentEditable with @mention autocomplete dropdown
// Props:
//   editableRef: ref to forward to the contentEditable div
//   members: array of { id, fullName, username, avatarUrl }
//   style: additional styles for the editable div
//   placeholder: placeholder text
//   ...rest: other props forwarded to the contentEditable div
const MentionInput = ({ editableRef, members = [], style = {}, placeholder, ...rest }) => {
    const [mentionQuery, setMentionQuery] = useState(null); // null = not mentioning, string = filter text
    const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
    const [selectedIdx, setSelectedIdx] = useState(0);
    const dropdownRef = useRef(null);
    const internalRef = useRef(null);
    const ref = editableRef || internalRef;

    const filteredMembers = mentionQuery !== null
        ? members.filter(m => {
            const q = mentionQuery.toLowerCase();
            return (m.fullName || '').toLowerCase().includes(q) || (m.username || '').toLowerCase().includes(q);
        }).slice(0, 6)
        : [];

    const detectMention = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) { setMentionQuery(null); return; }
        const range = sel.getRangeAt(0);
        if (!ref.current?.contains(range.startContainer)) { setMentionQuery(null); return; }

        // Get text content before cursor
        const textNode = range.startContainer;
        if (textNode.nodeType !== Node.TEXT_NODE) { setMentionQuery(null); return; }
        const text = textNode.textContent.substring(0, range.startOffset);

        // Find last @ not preceded by a word character
        const atIdx = text.lastIndexOf('@');
        if (atIdx < 0) { setMentionQuery(null); return; }
        // @ must be at start or after a space/newline
        if (atIdx > 0 && /[\w\u00C0-\u024F]/.test(text[atIdx - 1])) { setMentionQuery(null); return; }
        const query = text.substring(atIdx + 1);
        // Cancel if query contains space (mention completed or cancelled)
        if (query.length > 20) { setMentionQuery(null); return; }

        setMentionQuery(query);
        setSelectedIdx(0);

        // Position dropdown near caret
        try {
            const rect = range.getBoundingClientRect();
            const parentRect = ref.current.getBoundingClientRect();
            setMentionPos({
                top: rect.bottom - parentRect.top + 4,
                left: Math.max(0, rect.left - parentRect.left)
            });
        } catch (e) { /* ignore positioning errors */ }
    }, [ref, members]);

    const insertMention = useCallback((member) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const textNode = range.startContainer;
        if (textNode.nodeType !== Node.TEXT_NODE) return;

        const text = textNode.textContent;
        const cursorPos = range.startOffset;
        const atIdx = text.lastIndexOf('@', cursorPos - 1);
        if (atIdx < 0) return;

        const name = member.fullName || member.username;
        const before = text.substring(0, atIdx);
        const after = text.substring(cursorPos);
        textNode.textContent = before + '@' + name + '\u00A0' + after;

        // Set cursor after the inserted mention
        const newPos = before.length + 1 + name.length + 1;
        range.setStart(textNode, newPos);
        range.setEnd(textNode, newPos);
        sel.removeAllRanges();
        sel.addRange(range);

        setMentionQuery(null);
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (mentionQuery === null || filteredMembers.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => (i + 1) % filteredMembers.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(i => (i - 1 + filteredMembers.length) % filteredMembers.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertMention(filteredMembers[selectedIdx]);
        } else if (e.key === 'Escape') {
            setMentionQuery(null);
        }
    }, [mentionQuery, filteredMembers, selectedIdx, insertMention]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) && ref.current && !ref.current.contains(e.target)) {
                setMentionQuery(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [ref]);

    return (
        <div style={{ position: 'relative' }}>
            <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                onInput={detectMention}
                onKeyUp={detectMention}
                onKeyDown={handleKeyDown}
                style={{
                    minHeight: 60,
                    maxHeight: 200,
                    overflowY: 'auto',
                    padding: '8px 12px',
                    outline: 'none',
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--text-secondary)',
                    ...style
                }}
                {...rest}
            />
            {mentionQuery !== null && filteredMembers.length > 0 && (
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'absolute',
                        top: mentionPos.top,
                        left: mentionPos.left,
                        zIndex: 1000,
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        minWidth: 200,
                        maxWidth: 280,
                        overflow: 'hidden'
                    }}
                >
                    {filteredMembers.map((m, idx) => (
                        <div
                            key={m.id}
                            onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                            onMouseEnter={() => setSelectedIdx(idx)}
                            style={{
                                padding: '6px 10px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 13,
                                background: idx === selectedIdx ? 'var(--accent-light)' : 'transparent',
                                color: idx === selectedIdx ? 'var(--accent)' : 'var(--text-primary)',
                                transition: 'background 0.1s'
                            }}
                        >
                            {m.avatarUrl ? (
                                <img src={m.avatarUrl + '/30.png'} alt="" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }} />
                            ) : (
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                                    {(m.fullName || m.username || '?')[0].toUpperCase()}
                                </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fullName || m.username}</div>
                                {m.username && m.fullName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{m.username}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Render @mentions in text as styled spans
export const renderMentions = (text, members = []) => {
    if (!text) return text;
    // Match @Name patterns (2+ word characters, possibly with spaces for full names)
    const memberNames = members.map(m => m.fullName || m.username).filter(Boolean);
    if (memberNames.length === 0) return text;
    // Sort by length descending to match longest name first
    const sorted = [...memberNames].sort((a, b) => b.length - a.length);
    const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`@(${escaped.join('|')})`, 'g');
    return text.replace(pattern, '**@$1**');
};

export default MentionInput;
