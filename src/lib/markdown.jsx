import React from 'react';

// Escape HTML entities to prevent XSS via innerHTML
const escapeHtml = (str) => str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Convert markdown to HTML for contentEditable
export const markdownToHtml = (md) => {
    if (!md) return '';
    // Extract code blocks first (preserve raw content)
    const codeBlocks = [];
    let html = md.replace(/```([^`]*?)```/gs, (_, code) => {
        codeBlocks.push(code.trim());
        return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
    });
    // Escape HTML in all non-code content
    html = escapeHtml(html);
    // Restore code blocks with their own escaping
    html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) =>
        `<pre style="background:var(--bg-secondary);padding:8px;border-radius:4px;font-family:monospace;font-size:12px;overflow-x:auto"><code>${escapeHtml(codeBlocks[idx])}</code></pre>`
    );
    // Process line by line for block elements
    const lines = html.split('\n');
    const result = [];
    let inList = false, listType = '';
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        // Headings
        if (/^### (.+)/.test(line)) { if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; } result.push(`<h3>${line.slice(4)}</h3>`); continue; }
        if (/^## (.+)/.test(line)) { if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; } result.push(`<h2>${line.slice(3)}</h2>`); continue; }
        if (/^# (.+)/.test(line)) { if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; } result.push(`<h1>${line.slice(2)}</h1>`); continue; }
        // HR
        if (/^---+$/.test(line.trim())) { if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; } result.push('<hr/>'); continue; }
        // Blockquote
        if (/^> (.+)/.test(line)) { if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; } result.push(`<blockquote style="border-left:3px solid var(--border);padding-left:10px;color:var(--text-muted);margin:4px 0">${line.slice(2)}</blockquote>`); continue; }
        // Unordered list
        if (/^[-*] (.+)/.test(line)) { if (!inList || listType !== 'ul') { if (inList) result.push('</ol>'); result.push('<ul>'); inList = true; listType = 'ul'; } result.push(`<li>${line.replace(/^[-*] /, '')}</li>`); continue; }
        // Ordered list
        if (/^\d+\. (.+)/.test(line)) { if (!inList || listType !== 'ol') { if (inList) result.push('</ul>'); result.push('<ol>'); inList = true; listType = 'ol'; } result.push(`<li>${line.replace(/^\d+\. /, '')}</li>`); continue; }
        // Close list if needed
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        // Empty line = paragraph break
        if (!line.trim()) { result.push('<br/>'); continue; }
        result.push(`<div>${line}</div>`);
    }
    if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
    html = result.join('');
    // Inline formatting
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
    html = html.replace(/`([^`]+?)`/g, '<code style="background:var(--bg-secondary);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent)">$1</a>');
    return html;
};

// Convert HTML from contentEditable back to markdown
export const htmlToMarkdown = (html) => {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    const walk = (node) => {
        if (node.nodeType === 3) return node.textContent;
        if (node.nodeType !== 1) return '';
        const tag = node.tagName.toLowerCase();
        const children = Array.from(node.childNodes).map(walk).join('');
        switch (tag) {
            case 'strong': case 'b': return `**${children}**`;
            case 'em': case 'i': return `*${children}*`;
            case 's': case 'del': case 'strike': return `~~${children}~~`;
            case 'code': return node.parentElement?.tagName === 'PRE' ? children : `\`${children}\``;
            case 'pre': return `\`\`\`\n${children}\n\`\`\`\n`;
            case 'h1': return `# ${children}\n`;
            case 'h2': return `## ${children}\n`;
            case 'h3': return `### ${children}\n`;
            case 'blockquote': return `> ${children}\n`;
            case 'li': return node.parentElement?.tagName === 'OL' ? `1. ${children}\n` : `- ${children}\n`;
            case 'ul': case 'ol': return children;
            case 'hr': return '---\n';
            case 'a': return `[${children}](${node.getAttribute('href') || ''})`;
            case 'br': return '\n';
            case 'div': case 'p': return children + '\n';
            default: return children;
        }
    };
    return Array.from(div.childNodes).map(walk).join('').replace(/\n{3,}/g, '\n\n').trim();
};

// WYSIWYG toolbar for contentEditable
export const WysiwygToolbar = ({ editableRef, onAttach }) => {
    const exec = (cmd, value = null) => {
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        editableRef.current?.focus();
        if (range) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
        document.execCommand(cmd, false, value);
    };

    const btnStyle = { background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 7px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28 };
    const sep = { width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 0 6px', flexWrap: 'wrap' }}>
            <select onChange={e => { if (e.target.value) { exec('formatBlock', e.target.value); e.target.selectedIndex = 0; } }} style={{ ...btnStyle, padding: '3px 4px', minWidth: 36, fontSize: 11 }} title="Heading">
                <option value="">Tt</option>
                <option value="<h1>">H1</option>
                <option value="<h2>">H2</option>
                <option value="<h3>">H3</option>
                <option value="<div>">Normal</option>
            </select>
            <button onMouseDown={e=>e.preventDefault()} onClick={() => exec('bold')} style={btnStyle} title="Bold"><strong>B</strong></button>
            <button onMouseDown={e=>e.preventDefault()} onClick={() => exec('italic')} style={btnStyle} title="Italic"><em>I</em></button>
            <button onMouseDown={e=>e.preventDefault()} onClick={() => exec('strikeThrough')} style={btnStyle} title="Strikethrough"><span style={{ textDecoration: 'line-through' }}>S</span></button>
            <div style={sep} />
            <button onMouseDown={e=>e.preventDefault()} onClick={() => exec('insertUnorderedList')} style={btnStyle} title="Bullet list">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
            </button>
            <button onMouseDown={e=>e.preventDefault()} onClick={() => exec('insertOrderedList')} style={btnStyle} title="Numbered list">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">1</text><text x="2" y="14" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">2</text><text x="2" y="20" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">3</text></svg>
            </button>
            <div style={sep} />
            <button onMouseDown={e=>e.preventDefault()} onClick={() => { const url = prompt('URL:'); if (url) exec('createLink', url); }} style={btnStyle} title="Link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <button onMouseDown={e=>e.preventDefault()} onClick={() => exec('formatBlock', '<blockquote>')} style={btnStyle} title="Quote">"</button>
            <button onMouseDown={e=>e.preventDefault()} onClick={() => exec('insertHorizontalRule')} style={btnStyle} title="Horizontal rule">—</button>
            <div style={sep} />
            <button onMouseDown={e=>e.preventDefault()} onClick={() => { exec('removeFormat'); exec('formatBlock', '<div>'); }} style={btnStyle} title="Clear formatting"><span style={{textDecoration:'line-through',opacity:0.6}}>T</span></button>
            {onAttach && <><div style={sep} /><button onMouseDown={e=>e.preventDefault()} onClick={onAttach} style={btnStyle} title="Attach file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg></button></>}
        </div>
    );
};

// Enhanced Markdown renderer — React elements only (no dangerouslySetInnerHTML)
export const SimpleMarkdown = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');
    let key = 0;

    const renderInline = (line) => {
        const parts = [];
        let remaining = line;
        let k = 0;
        const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|\[(.+?)\]\((.+?)\)|@([\w\u00C0-\u024F][\w\u00C0-\u024F\s]{0,30}[\w\u00C0-\u024F]))/;
        while (remaining) {
            const match = remaining.match(inlineRegex);
            if (!match) { parts.push(remaining); break; }
            if (match.index > 0) parts.push(remaining.slice(0, match.index));
            if (match[2]) parts.push(React.createElement('strong', { key: k++ }, match[2]));
            else if (match[3]) parts.push(React.createElement('em', { key: k++ }, match[3]));
            else if (match[4]) parts.push(React.createElement('del', { key: k++, style: { color: 'var(--text-muted)' } }, match[4]));
            else if (match[5]) parts.push(React.createElement('code', { key: k++, style: { background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3, fontSize: '0.88em', fontFamily: 'var(--font-mono, monospace)' } }, match[5]));
            else if (match[6] && match[7]) parts.push(React.createElement('a', { key: k++, href: match[7], target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)', textDecoration: 'underline' } }, match[6]));
            else if (match[8]) parts.push(React.createElement('span', { key: k++, style: { color: 'var(--accent)', fontWeight: 600, background: 'var(--accent-light)', borderRadius: 3, padding: '0 3px' } }, '@' + match[8]));
            remaining = remaining.slice(match.index + match[0].length);
        }
        return parts;
    };

    // Parse into block structures
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Fenced code block
        if (line.match(/^```/)) {
            const lang = line.slice(3).trim();
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].match(/^```$/)) { codeLines.push(lines[i]); i++; }
            i++; // skip closing ```
            blocks.push({ type: 'codeblock', content: codeLines.join('\n'), lang });
            continue;
        }
        // Heading
        const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) { blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] }); i++; continue; }
        // Horizontal rule
        if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) { blocks.push({ type: 'hr' }); i++; continue; }
        // Blockquote (group consecutive > lines)
        if (line.match(/^>\s?/)) {
            const quoteLines = [];
            while (i < lines.length && lines[i].match(/^>\s?/)) { quoteLines.push(lines[i].replace(/^>\s?/, '')); i++; }
            blocks.push({ type: 'blockquote', lines: quoteLines });
            continue;
        }
        // Unordered list (group consecutive - or * lines)
        if (line.match(/^[-*]\s+/)) {
            const items = [];
            while (i < lines.length && lines[i].match(/^[-*]\s+/)) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
            blocks.push({ type: 'ul', items });
            continue;
        }
        // Ordered list (group consecutive numbered lines)
        if (line.match(/^\d+\.\s+/)) {
            const items = [];
            while (i < lines.length && lines[i].match(/^\d+\.\s+/)) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
            blocks.push({ type: 'ol', items });
            continue;
        }
        // Blank line
        if (line.trim() === '') { blocks.push({ type: 'blank' }); i++; continue; }
        // Paragraph
        blocks.push({ type: 'paragraph', content: line });
        i++;
    }

    // Render blocks
    const headingStyles = {
        1: { fontSize: 20, fontWeight: 700, margin: '16px 0 8px', color: 'var(--text-primary)' },
        2: { fontSize: 16, fontWeight: 600, margin: '14px 0 6px', color: 'var(--text-primary)' },
        3: { fontSize: 14, fontWeight: 600, margin: '12px 0 4px', color: 'var(--text-primary)' }
    };

    const elements = blocks.map(block => {
        switch (block.type) {
            case 'heading':
                return React.createElement(`h${block.level}`, { key: key++, style: headingStyles[block.level] }, ...renderInline(block.content));
            case 'hr':
                return React.createElement('hr', { key: key++, style: { border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' } });
            case 'codeblock':
                return React.createElement('pre', { key: key++, style: { background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 6, overflow: 'auto', margin: '8px 0', fontSize: 12, lineHeight: 1.5, fontFamily: 'var(--font-mono, monospace)', border: '1px solid var(--border)' } },
                    React.createElement('code', null, block.content)
                );
            case 'blockquote':
                return React.createElement('div', { key: key++, style: { borderLeft: '3px solid var(--accent)', paddingLeft: 12, margin: '8px 0', color: 'var(--text-muted)', fontStyle: 'italic' } },
                    ...block.lines.map((l, j) => React.createElement('div', { key: j }, ...renderInline(l)))
                );
            case 'ul':
                return React.createElement('ul', { key: key++, style: { margin: '4px 0', paddingLeft: 20, listStyleType: 'disc' } },
                    ...block.items.map((item, j) => React.createElement('li', { key: j, style: { marginBottom: 2 } }, ...renderInline(item)))
                );
            case 'ol':
                return React.createElement('ol', { key: key++, style: { margin: '4px 0', paddingLeft: 20, listStyleType: 'decimal' } },
                    ...block.items.map((item, j) => React.createElement('li', { key: j, style: { marginBottom: 2 } }, ...renderInline(item)))
                );
            case 'blank':
                return React.createElement('div', { key: key++, style: { height: 8 } });
            case 'paragraph':
            default:
                return React.createElement('p', { key: key++, style: { margin: '4px 0' } }, ...renderInline(block.content));
        }
    });

    return React.createElement('div', { style: { fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' } }, ...elements);
};
