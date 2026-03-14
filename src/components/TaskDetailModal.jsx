import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { CONFIG } from '../config.js';
import { normalizeTaskChecklists } from '../lib/migration.js';
import { useApp } from '../context.js';
import { Icon, StatusIcon, PriorityIcon, StatusOption, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';
import CountryTags from './CountryTags.jsx';

// Convert markdown to HTML for contentEditable
const markdownToHtml = (md) => {
    if (!md) return '';
    let html = md;
    // Code blocks (must be before inline processing)
    html = html.replace(/```([^`]*?)```/gs, (_, code) => `<pre style="background:var(--bg-secondary);padding:8px;border-radius:4px;font-family:monospace;font-size:12px;overflow-x:auto"><code>${code.trim().replace(/</g,'&lt;')}</code></pre>`);
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
const htmlToMarkdown = (html) => {
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
const WysiwygToolbar = ({ editableRef }) => {
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
        </div>
    );
};

// Enhanced Markdown renderer — Trello-level quality, React elements only (no dangerouslySetInnerHTML)
const SimpleMarkdown = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');
    let key = 0;

    const renderInline = (line) => {
        const parts = [];
        let remaining = line;
        let k = 0;
        const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|\[(.+?)\]\((.+?)\))/;
        while (remaining) {
            const match = remaining.match(inlineRegex);
            if (!match) { parts.push(remaining); break; }
            if (match.index > 0) parts.push(remaining.slice(0, match.index));
            if (match[2]) parts.push(React.createElement('strong', { key: k++ }, match[2]));
            else if (match[3]) parts.push(React.createElement('em', { key: k++ }, match[3]));
            else if (match[4]) parts.push(React.createElement('del', { key: k++, style: { color: 'var(--text-muted)' } }, match[4]));
            else if (match[5]) parts.push(React.createElement('code', { key: k++, style: { background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3, fontSize: '0.88em', fontFamily: 'var(--font-mono, monospace)' } }, match[5]));
            else if (match[6] && match[7]) parts.push(React.createElement('a', { key: k++, href: match[7], target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)', textDecoration: 'underline' } }, match[6]));
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

const TaskDetailModal=({categories,task,action,actions,onClose,onUpdate,onDelete,onBackToAction,allCountries,onAddCustomCountry,onCreateAction,onAddCategory,members=[],isReadOnly=false,availableOtherLabels=[]})=>{
    const { trelloUser } = useApp();
    const[form,setForm]=useState(()=>{
        const normalized={...task,checklists:normalizeTaskChecklists(task)};
        delete normalized.checklist; // Remove old format
        return normalized;
    });
    const[previewAttachment,setPreviewAttachment]=useState(null);
    const[descriptionDraft,setDescriptionDraft]=useState(task.description||'');
    const[descriptionSaved,setDescriptionSaved]=useState(true);
    const[descriptionEditing,setDescriptionEditing]=useState(false);
    const descTextareaRef=useRef(null);
    const descEditableRef=useRef(null);
    const[newComment,setNewComment]=useState('');
    const[newChecklistItems,setNewChecklistItems]=useState({}); // Per-checklist new item text
    const[newChecklistName,setNewChecklistName]=useState('');
    const[showAddChecklist,setShowAddChecklist]=useState(false);
    const[showAddOtherLabel,setShowAddOtherLabel]=useState(false);
    const[showCreateOtherLabel,setShowCreateOtherLabel]=useState(false);
    const[newOtherLabelName,setNewOtherLabelName]=useState('');
    const[newOtherLabelColor,setNewOtherLabelColor]=useState('#6366f1');
    const[showMemberPicker,setShowMemberPicker]=useState(false);
    const[showInlineCreateAction,setShowInlineCreateAction]=useState(false);
    const[newActionName,setNewActionName]=useState('');
    const[newActionCategoryId,setNewActionCategoryId]=useState(categories?.[0]?.id||'');
    const[showInlineCreateCategory,setShowInlineCreateCategory]=useState(false);
    const[newCategoryName,setNewCategoryName]=useState('');
    const newActionInputRef=useRef(null);
    const currentAction=actions?.find(a=>a.id===form.actionId)||action;
    const category=categories?.find(c=>c.id===currentAction?.categoryId);

    useEffect(()=>{
        if(showInlineCreateAction&&newActionInputRef.current)newActionInputRef.current.focus();
    },[showInlineCreateAction]);

    // Initialize contentEditable when editing starts
    useEffect(()=>{
        if(descriptionEditing&&descEditableRef.current){
            const html=markdownToHtml(descriptionDraft);
            if(descEditableRef.current.innerHTML!==html){
                descEditableRef.current.innerHTML=html;
            }
        }
    },[descriptionEditing]);

    const handleInlineCreateAction=()=>{
        const name=newActionName.trim();
        if(!name||!newActionCategoryId)return;
        const newAction={id:`a${Date.now()}`,name,categoryId:newActionCategoryId,budget:0,priority:'medium',tags:[]};
        if(onCreateAction)onCreateAction(newAction);
        setForm({...form,actionId:newAction.id});
        setNewActionName('');
        setNewActionCategoryId(categories?.[0]?.id||'');
        setShowInlineCreateAction(false);
    };

    const handleClose=()=>{if(!isReadOnly)onUpdate(task.id,form);onClose();}; // Auto-save on close (Trello-style), skip in read-only
    const saveDescription=()=>{setForm({...form,description:descriptionDraft});setDescriptionSaved(true);};
    const addComment=()=>{if(!newComment.trim())return;const author=trelloUser?.fullName||'Guest';setForm({...form,comments:[...(form.comments||[]),{id:`cm${Date.now()}`,author,text:newComment,date:new Date().toISOString()}]});setNewComment('');};
    const addChecklistItem=(checklistId)=>{const text=(newChecklistItems[checklistId]||'').trim();if(!text)return;setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:[...cl.items,{id:`cli${Date.now()}`,text,done:false}]}:cl)});setNewChecklistItems({...newChecklistItems,[checklistId]:''});};
    const toggleChecklistItem=(checklistId,itemId)=>setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:cl.items.map(i=>i.id===itemId?{...i,done:!i.done}:i)}:cl)});
    const removeChecklistItem=(checklistId,itemId)=>setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:cl.items.filter(i=>i.id!==itemId)}:cl)});
    const addNewChecklist=()=>{const name=newChecklistName.trim();if(!name)return;setForm({...form,checklists:[...(form.checklists||[]),{id:`cl${Date.now()}`,name,items:[]}]});setNewChecklistName('');setShowAddChecklist(false);};
    const removeChecklist=(checklistId)=>setForm({...form,checklists:(form.checklists||[]).filter(cl=>cl.id!==checklistId)});
    const addChannel=(id)=>setForm({...form,channels:[...(form.channels||[]),id]});
    const removeChannel=(id)=>setForm({...form,channels:(form.channels||[]).filter(c=>c!==id)});
    const addCountry=(id)=>setForm({...form,countries:[...(form.countries||[]),id]});
    const removeCountry=(id)=>setForm({...form,countries:(form.countries||[]).filter(c=>c!==id)});
    const allChecklistItems=(form.checklists||[]).flatMap(cl=>cl.items||[]);
    const checklistPct=allChecklistItems.length>0?Math.round((allChecklistItems.filter(c=>c.done).length/allChecklistItems.length)*100):0;

    // Handle Delete key to delete task
    useEffect(()=>{
        const handleKeyDown=(e)=>{
            // Don't trigger if user is typing in input/textarea
            const target=e.target;
            if(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable){
                return;
            }

            // Delete key (or Backspace on Mac)
            if(e.key==='Delete'||e.key==='Backspace'){
                e.preventDefault();
                if(window.confirm('Are you sure you want to delete this task?')){
                    onDelete(task.id);
                    onClose();
                }
            }
        };

        document.addEventListener('keydown',handleKeyDown);
        return()=>document.removeEventListener('keydown',handleKeyDown);
    },[task.id,onDelete,onClose]);

    return(
        <React.Fragment>
        <div className="v11-modal-overlay" onClick={handleClose} style={{alignItems:'flex-start',paddingTop:64,overflowY:'auto'}}>
            <div className="v11-modal animate-slide-up" style={{maxWidth:672,marginBottom:32}} onClick={e=>e.stopPropagation()}>
                <div className={`h-2 rounded-t-2xl bg-gradient-to-r ${category?.gradient||'from-gray-400 to-gray-500'}`}/>
                <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3 flex-1">
                            <button onClick={()=>!isReadOnly&&setForm({...form,status:form.status==='completed'?'todo':'completed'})} className="mt-2 flex-shrink-0" style={{width:22,height:22,borderRadius:6,border:form.status==='completed'?'none':'2px solid var(--border-strong)',background:form.status==='completed'?'var(--success)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:isReadOnly?'default':'pointer',transition:'all 0.2s',opacity:isReadOnly?0.7:1}} title={form.status==='completed'?'Mark as not completed':'Mark as completed'}>{form.status==='completed'&&<svg width="12" height="12" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}</button>
                            <div className="flex-1">
                                <input type="text" value={form.title} onChange={e=>!isReadOnly&&setForm({...form,title:e.target.value})} className="v11-input" style={{fontSize:'1.25rem',fontWeight:700,textDecoration:form.status==='completed'?'line-through':'none'}} readOnly={isReadOnly}/>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm" style={{color:'var(--text-muted)'}}>📁 {action?.name} • {CONFIG.MONTHS_FULL[task.month]}</p>
                                    {onBackToAction&&<button onClick={onBackToAction} className="text-xs text-secondary hover:underline flex items-center gap-1">← Back to action</button>}
                                </div>
                            </div>
                        </div>
                        <button onClick={handleClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    <div className="flex flex-wrap gap-3 mb-6">
                        {actions&&<div className="w-full"><label className="v11-label">📋 Action</label>{!showInlineCreateAction?(<><select value={form.actionId} onChange={e=>{if(isReadOnly)return;const newAction=actions.find(a=>a.id===e.target.value);setForm({...form,actionId:e.target.value,channels:newAction?.tags||form.channels});}} className="v11-select" style={{width:'100%'}} disabled={isReadOnly}>{actions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{onCreateAction&&<button onClick={()=>setShowInlineCreateAction(true)} style={{marginTop:4,fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4}}><Icon.Plus size={10}/> Create a new action</button>}</>):(<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:12,background:'var(--bg-secondary)'}}><div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:6}}>New action</div><input ref={newActionInputRef} type="text" value={newActionName} onChange={e=>setNewActionName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleInlineCreateAction();if(e.key==='Escape')setShowInlineCreateAction(false);}} placeholder="Action name..." className="v11-input" style={{marginBottom:8}}/>{!showInlineCreateCategory?(<><select value={newActionCategoryId} onChange={e=>setNewActionCategoryId(e.target.value)} className="v11-input" style={{marginBottom:4}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{onAddCategory&&<button onClick={()=>setShowInlineCreateCategory(true)} style={{marginBottom:8,fontSize:10,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:3}}><Icon.Plus size={9}/> New category</button>}</>):(<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:8,background:'var(--bg-primary)',marginBottom:8}}><input type="text" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newCategoryName.trim()){const nc={id:`cat${Date.now()}`,name:newCategoryName.trim(),color:'#6366f1',gradient:'from-indigo-500 to-purple-500'};onAddCategory(nc);setNewActionCategoryId(nc.id);setNewCategoryName('');setShowInlineCreateCategory(false);}if(e.key==='Escape')setShowInlineCreateCategory(false);}} placeholder="Category name..." className="v11-input" style={{marginBottom:6,fontSize:12}} autoFocus/><div style={{display:'flex',gap:4}}><button onClick={()=>{if(!newCategoryName.trim())return;const nc={id:`cat${Date.now()}`,name:newCategoryName.trim(),color:'#6366f1',gradient:'from-indigo-500 to-purple-500'};onAddCategory(nc);setNewActionCategoryId(nc.id);setNewCategoryName('');setShowInlineCreateCategory(false);}} style={{padding:'3px 8px',fontSize:10,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Add</button><button onClick={()=>{setShowInlineCreateCategory(false);setNewCategoryName('');}} style={{padding:'3px 8px',fontSize:10,background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button></div></div>)}<div style={{display:'flex',gap:6}}><button onClick={handleInlineCreateAction} style={{padding:'5px 10px',fontSize:11,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Create</button><button onClick={()=>{setShowInlineCreateAction(false);setNewActionName('');setShowInlineCreateCategory(false);}} style={{padding:'5px 10px',fontSize:11,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button></div></div>)}</div>}
                        <div><label className="v11-label">Status</label><IconSelect value={form.status} options={CONFIG.STATUSES} onChange={v=>setForm({...form,status:v})} renderOption={o=><StatusOption status={o}/>} disabled={isReadOnly}/></div>
                        <div><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v=>setForm({...form,priority:v})} renderOption={o=><PriorityOption priority={o}/>} disabled={isReadOnly}/></div>
                        <div><label className="v11-label">Start</label><input type="date" value={form.startDate||''} onChange={e=>setForm({...form,startDate:e.target.value})} className="v11-input" readOnly={isReadOnly}/></div>
                        <div><label className="v11-label">End</label><input type="date" value={form.dueDate||''} onChange={e=>setForm({...form,dueDate:e.target.value})} className="v11-input" readOnly={isReadOnly}/></div>
                        <div><label className="v11-label">Budget €</label><input type="number" value={form.budget||0} onChange={e=>setForm({...form,budget:parseInt(e.target.value)||0})} className="v11-input" style={{width:96}} readOnly={isReadOnly}/></div>
                    </div>
                    <div className="mb-4"><label className="v11-label">🏷️ Channel Tags</label><ChannelTags channels={form.channels||[]} onAdd={addChannel} onRemove={removeChannel} editable={!isReadOnly}/></div>
                    <div className="mb-4"><label className="v11-label">🌍 Country Tags</label><CountryTags countries={form.countries||[]} onAdd={addCountry} onRemove={removeCountry} allCountries={allCountries} onAddCustomCountry={onAddCustomCountry} editable={!isReadOnly}/></div>
                    {members.length > 0 && (
                        <div className="mb-4">
                            <label className="v11-label">👥 Members</label>
                            <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',position:'relative'}}>
                                {(form.assignees||[]).map(id => {
                                    const m = members.find(m => m.id === id);
                                    if (!m) return null;
                                    return (
                                        <button key={m.id} onClick={() => !isReadOnly && setForm({...form, assignees: (form.assignees||[]).filter(aid=>aid!==m.id)})} title={isReadOnly ? (m.fullName||m.username) : `${m.fullName||m.username} — click to remove`} style={{width:30,height:30,borderRadius:'50%',border:'2px solid var(--accent)',cursor:isReadOnly?'default':'pointer',padding:0,background:'none',flexShrink:0,overflow:'hidden'}}>
                                            {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/> : <span style={{width:'100%',height:'100%',borderRadius:'50%',background:'var(--accent)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                        </button>
                                    );
                                })}
                                {!isReadOnly && <div style={{position:'relative'}}>
                                    <button onClick={() => setShowMemberPicker(!showMemberPicker)} style={{width:30,height:30,borderRadius:'50%',border:'1px dashed var(--border-strong)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-secondary)',flexShrink:0}} title="Add member">
                                        <Icon.Plus size={12}/>
                                    </button>
                                    {showMemberPicker && (
                                        <>
                                            <div style={{position:'fixed',inset:0,zIndex:98}} onClick={() => setShowMemberPicker(false)}/>
                                            <div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',zIndex:99,minWidth:180,padding:4,maxHeight:200,overflowY:'auto'}}>
                                                {members.filter(m => !(form.assignees||[]).includes(m.id)).map(m => (
                                                    <button key={m.id} onClick={() => {setForm({...form, assignees: [...(form.assignees||[]), m.id]});setShowMemberPicker(false);}} style={{width:'100%',padding:'6px 10px',fontSize:12,color:'var(--text-primary)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                        {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{width:22,height:22,borderRadius:'50%'}}/> : <span style={{width:22,height:22,borderRadius:'50%',background:'var(--accent)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600,flexShrink:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                                        <span>{m.fullName || m.username}</span>
                                                    </button>
                                                ))}
                                                {members.filter(m => !(form.assignees||[]).includes(m.id)).length === 0 && (
                                                    <div style={{padding:'8px 10px',fontSize:12,color:'var(--text-muted)',textAlign:'center'}}>All members assigned</div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>}
                                {(form.assignees||[]).length === 0 && <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:4}}>No members assigned</span>}
                            </div>
                        </div>
                    )}
                    <div className="mb-4">
                        <label className="v11-label">🏷️ Other Labels</label>
                        <div style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}>
                            {(form.otherLabels || []).map(label => (
                                <span key={label.id} style={{
                                    padding:'2px 8px',borderRadius:4,
                                    background:(label.color||'#64748b')+'20',color:label.color||'#64748b',
                                    fontSize:11,fontWeight:500,display:'inline-flex',alignItems:'center',gap:4
                                }}>
                                    {label.name || 'Label'}
                                    {!isReadOnly && <button onClick={()=>setForm({...form,otherLabels:(form.otherLabels||[]).filter(l=>l.id!==label.id)})} style={{background:'none',border:'none',cursor:'pointer',color:'inherit',fontSize:10,padding:0,lineHeight:1}}>&times;</button>}
                                </span>
                            ))}
                            {!isReadOnly && <div style={{position:'relative'}}>
                                <button onClick={()=>setShowAddOtherLabel(!showAddOtherLabel)} style={{padding:'2px 8px',borderRadius:4,border:'1px dashed var(--border)',background:'none',cursor:'pointer',fontSize:11,color:'var(--text-muted)'}}>+ Label</button>
                                {showAddOtherLabel && (
                                    <>
                                        <div style={{position:'fixed',inset:0,zIndex:98}} onClick={()=>{setShowAddOtherLabel(false);setShowCreateOtherLabel(false);}}/>
                                        <div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',zIndex:99,minWidth:180,padding:4,maxHeight:220,overflowY:'auto'}}>
                                            {availableOtherLabels.filter(l=>!(form.otherLabels||[]).some(fl=>fl.id===l.id)).map(label => (
                                                <button key={label.id} onClick={()=>{setForm({...form,otherLabels:[...(form.otherLabels||[]),label]});setShowAddOtherLabel(false);}} style={{width:'100%',padding:'6px 10px',fontSize:12,color:'var(--text-primary)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                    <div style={{width:10,height:10,borderRadius:3,background:label.color||'#64748b',flexShrink:0}}/>
                                                    <span>{label.name||'Label'}</span>
                                                </button>
                                            ))}
                                            {availableOtherLabels.filter(l=>!(form.otherLabels||[]).some(fl=>fl.id===l.id)).length===0 && !showCreateOtherLabel && (
                                                <div style={{padding:'6px 10px',fontSize:12,color:'var(--text-muted)',textAlign:'center'}}>No labels available</div>
                                            )}
                                            <div style={{borderTop:'1px solid var(--border)',marginTop:4,paddingTop:4}}>
                                                {!showCreateOtherLabel ? (
                                                    <button onClick={()=>setShowCreateOtherLabel(true)} style={{width:'100%',padding:'6px 10px',fontSize:12,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:6}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                        <Icon.Plus size={10}/> Create new label
                                                    </button>
                                                ) : (
                                                    <div style={{padding:'6px 8px'}}>
                                                        <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:6}}>
                                                            <input type="text" value={newOtherLabelName} onChange={e=>setNewOtherLabelName(e.target.value)} placeholder="Label name" autoFocus onKeyDown={e=>{if(e.key==='Enter'&&newOtherLabelName.trim()){const nl={id:'ol-'+Date.now(),name:newOtherLabelName.trim(),color:newOtherLabelColor};setForm({...form,otherLabels:[...(form.otherLabels||[]),nl]});setNewOtherLabelName('');setShowAddOtherLabel(false);setShowCreateOtherLabel(false);}if(e.key==='Escape'){setShowCreateOtherLabel(false);setNewOtherLabelName('');}}} style={{flex:1,padding:'4px 6px',borderRadius:4,border:'1px solid var(--border)',fontSize:11}}/>
                                                            <input type="color" value={newOtherLabelColor} onChange={e=>setNewOtherLabelColor(e.target.value)} style={{width:24,height:24,border:'none',padding:0,cursor:'pointer',borderRadius:4}}/>
                                                        </div>
                                                        <div style={{display:'flex',gap:4}}>
                                                            <button onClick={()=>{if(newOtherLabelName.trim()){const nl={id:'ol-'+Date.now(),name:newOtherLabelName.trim(),color:newOtherLabelColor};setForm({...form,otherLabels:[...(form.otherLabels||[]),nl]});setNewOtherLabelName('');setShowAddOtherLabel(false);setShowCreateOtherLabel(false);}}} style={{padding:'3px 8px',borderRadius:4,background:'var(--accent)',color:'white',border:'none',cursor:'pointer',fontSize:11}}>Create</button>
                                                            <button onClick={()=>{setShowCreateOtherLabel(false);setNewOtherLabelName('');}} style={{padding:'3px 8px',borderRadius:4,background:'var(--bg-secondary)',border:'1px solid var(--border)',cursor:'pointer',fontSize:11}}>Cancel</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>}
                        </div>
                    </div>
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium">📝 Description</label>
                            {descriptionDraft&&!descriptionEditing&&!isReadOnly&&<button onClick={()=>{setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML=markdownToHtml(descriptionDraft);descEditableRef.current.focus();}},0);}} className="text-xs" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer'}}>Edit</button>}
                        </div>
                        {descriptionEditing?(
                            <div>
                                <WysiwygToolbar editableRef={descEditableRef}/>
                                <div ref={descEditableRef} contentEditable suppressContentEditableWarning onInput={()=>setDescriptionSaved(false)} onFocus={()=>setDescriptionEditing(true)} className="v11-input" style={{minHeight:80,maxHeight:400,overflowY:'auto',width:'100%',lineHeight:1.6,outline:'none',whiteSpace:'pre-wrap',wordBreak:'break-word'}}/>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={()=>{const md=htmlToMarkdown(descEditableRef.current?.innerHTML||'');setDescriptionDraft(md);setForm(f=>({...f,description:md}));setDescriptionSaved(true);setDescriptionEditing(false);}} className="px-4 py-1.5 bg-secondary text-white rounded-lg text-sm">Save</button>
                                    <button onClick={()=>{setDescriptionEditing(false);setDescriptionSaved(true);}} className="px-4 py-1.5 rounded-lg text-sm" style={{border:'1px solid var(--border)'}}>Cancel</button>
                                </div>
                            </div>
                        ):!descriptionDraft&&!isReadOnly?(
                            <div onClick={()=>{setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML='';descEditableRef.current.focus();}},0);}} className="v11-input" style={{cursor:'text',minHeight:40,color:'var(--text-muted)',padding:8}}>Add a description...</div>
                        ):(
                            <div onClick={()=>{if(isReadOnly)return;setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML=markdownToHtml(descriptionDraft);descEditableRef.current.focus();}},0);}} style={{cursor:isReadOnly?'default':'pointer',padding:8,borderRadius:'var(--radius-md)',border:'1px solid transparent',transition:'border-color 0.2s'}} onMouseEnter={e=>{if(!isReadOnly)e.currentTarget.style.borderColor='var(--border)';}} onMouseLeave={e=>e.currentTarget.style.borderColor='transparent'}>
                                <SimpleMarkdown text={descriptionDraft}/>
                            </div>
                        )}
                    </div>
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">✅ Checklists</label>
                            <div className="flex items-center gap-3">
                                {allChecklistItems.length>0&&<span className="text-sm" style={{color:'var(--text-muted)'}}>{checklistPct}%</span>}
                                {!isReadOnly && <button onClick={()=>setShowAddChecklist(true)} className="text-xs flex items-center gap-1" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:500}}><Icon.Plus size={10}/> Add checklist</button>}
                            </div>
                        </div>
                        {allChecklistItems.length>0&&<div className="v11-progress-bar" style={{height:8,marginBottom:12}}><div className={`v11-progress-fill ${checklistPct>=70?'high':checklistPct>=40?'medium':'low'}`} style={{width:`${checklistPct}%`}}/></div>}
                        {showAddChecklist&&<div className="flex space-x-2 mb-3"><input type="text" value={newChecklistName} onChange={e=>setNewChecklistName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addNewChecklist();if(e.key==='Escape'){setShowAddChecklist(false);setNewChecklistName('');}}} placeholder="Checklist name..." className="v11-input" style={{flex:1}} autoFocus/><button onClick={addNewChecklist} className="px-3 py-2 bg-secondary text-white rounded-lg text-sm">Add</button><button onClick={()=>{setShowAddChecklist(false);setNewChecklistName('');}} className="px-2 py-2 rounded-lg text-sm" style={{border:'1px solid var(--border)'}}>Cancel</button></div>}
                        {(form.checklists||[]).map(cl=>{const clPct=cl.items.length>0?Math.round((cl.items.filter(i=>i.done).length/cl.items.length)*100):0;return(
                            <div key={cl.id} className="mb-4">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium" style={{color:'var(--text-secondary)'}}>{cl.name}</span>
                                    <div className="flex items-center gap-2">
                                        {cl.items.length>0&&<span className="text-xs" style={{color:'var(--text-muted)'}}>{clPct}%</span>}
                                        {!isReadOnly && <button onClick={()=>removeChecklist(cl.id)} className="hover:text-accent-red" style={{color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',fontSize:11}} title="Remove checklist"><Icon.Trash size={12}/></button>}
                                    </div>
                                </div>
                                {cl.items.length>0&&<div className="v11-progress-bar" style={{height:4,marginBottom:8}}><div className={`v11-progress-fill ${clPct>=70?'high':clPct>=40?'medium':'low'}`} style={{width:`${clPct}%`}}/></div>}
                                <div className="space-y-2 mb-2">{cl.items.map(item=>(<div key={item.id} className="flex items-center space-x-3 p-2 rounded-lg" style={{background:'var(--bg-secondary)'}}><button onClick={()=>!isReadOnly&&toggleChecklistItem(cl.id,item.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center ${item.done?'bg-accent-green border-accent-green text-white':''}`} style={!item.done?{borderColor:'var(--border-strong)'}:{cursor:isReadOnly?'default':'pointer'}}>{item.done&&<Icon.Check/>}</button><span className={`flex-1 text-sm ${item.done?'line-through':''}`} style={item.done?{color:'var(--text-muted)'}:{}}>{item.text}</span>{!isReadOnly&&<button onClick={()=>removeChecklistItem(cl.id,item.id)} className="hover:text-accent-red" style={{color:'var(--text-muted)'}}><Icon.Trash/></button>}</div>))}</div>
                                {!isReadOnly && <div className="flex space-x-2"><input type="text" value={newChecklistItems[cl.id]||''} onChange={e=>setNewChecklistItems({...newChecklistItems,[cl.id]:e.target.value})} onKeyPress={e=>e.key==='Enter'&&addChecklistItem(cl.id)} placeholder="Add item..." className="v11-input" style={{flex:1}}/><button onClick={()=>addChecklistItem(cl.id)} className="px-3 py-2 bg-secondary text-white rounded-lg"><Icon.Plus/></button></div>}
                            </div>
                        );})}
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">💬 Comments ({form.comments?.length||0})</label>
                        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">{[...(form.comments||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(c=>(<div key={c.id} className="p-3 rounded-lg" style={{background:'var(--bg-secondary)'}}><div className="flex justify-between mb-1"><span className="font-medium text-sm">{c.author}</span><span className="text-xs" style={{color:'var(--text-muted)'}}>{new Date(c.date).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div><p className="text-sm" style={{color:'var(--text-secondary)'}}>{c.text}</p></div>))}</div>
                        {!isReadOnly && <div className="flex space-x-2"><input type="text" value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyPress={e=>e.key==='Enter'&&addComment()} placeholder="Write..." className="v11-input" style={{flex:1}}/><button onClick={addComment} className="px-4 py-2 bg-secondary text-white rounded-lg text-sm">Send</button></div>}
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">📎 Attachments ({(form.attachments||[]).length})</label>
                        {(form.attachments||[]).length>0&&<div className="space-y-2 mb-3">
                            {(form.attachments||[]).map(att=>{
                                const isImage = (att.type||att.mimeType||'').startsWith('image/');
                                const src = att.data || att.url;
                                return (
                                <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg" style={{background:'var(--bg-secondary)',cursor:'pointer'}} onClick={()=>att.url ? window.open(att.url,'_blank') : setPreviewAttachment(att)}>
                                    {isImage && src ?
                                        <img src={src} alt={att.name} style={{width:40,height:40,objectFit:'cover',borderRadius:'var(--radius-sm)',flexShrink:0}}/>:
                                        <div style={{width:40,height:40,borderRadius:'var(--radius-sm)',background:'var(--accent-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:16}}>📄</div>
                                    }
                                    <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</div>
                                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{att.size?`${(att.size/1024).toFixed(1)} KB`:''}{att.date?` • ${new Date(att.date).toLocaleDateString('en-US')}`:''}</div>
                                    </div>
                                    {(att.data||att.url)&&<a href={att.data||att.url} download={att.data?att.name:undefined} target={att.url?'_blank':undefined} rel={att.url?'noopener noreferrer':undefined} onClick={e=>e.stopPropagation()} style={{color:'var(--accent)',fontSize:12,fontWeight:500,flexShrink:0,cursor:'pointer'}} title={att.url?'Open':'Download'}>{att.url?'↗':'↓'}</a>}
                                    {!isReadOnly && <button onClick={(e)=>{e.stopPropagation();setForm({...form,attachments:(form.attachments||[]).filter(a=>a.id!==att.id)});}} style={{color:'var(--text-muted)',cursor:'pointer',flexShrink:0,background:'none',border:'none',fontSize:14}} title="Delete">✕</button>}
                                </div>
                            );})}
                        </div>}
                        {!isReadOnly && <div
                            onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.background='var(--accent-light)';}}
                            onDragLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='transparent';}}
                            onDrop={e=>{
                                e.preventDefault();
                                e.currentTarget.style.borderColor='var(--border)';
                                e.currentTarget.style.background='transparent';
                                const files=Array.from(e.dataTransfer.files);
                                files.forEach(file=>{
                                    if(file.size>5*1024*1024)return; // 5MB limit
                                    const reader=new FileReader();
                                    reader.onload=(ev)=>{
                                        setForm(prev=>({...prev,attachments:[...(prev.attachments||[]),{id:`att${Date.now()}_${Math.random().toString(36).slice(2,6)}`,name:file.name,type:file.type,size:file.size,data:ev.target.result,date:new Date().toISOString()}]}));
                                    };
                                    reader.readAsDataURL(file);
                                });
                            }}
                            className="border-2 border-dashed rounded-lg p-4 text-center" style={{borderColor:'var(--border)',cursor:'pointer',transition:'all 0.2s'}}
                            onClick={()=>document.getElementById('file-upload-input')?.click()}
                        >
                            <input id="file-upload-input" type="file" multiple style={{display:'none'}} onChange={e=>{
                                const files=Array.from(e.target.files||[]);
                                files.forEach(file=>{
                                    if(file.size>5*1024*1024)return;
                                    const reader=new FileReader();
                                    reader.onload=(ev)=>{
                                        setForm(prev=>({...prev,attachments:[...(prev.attachments||[]),{id:`att${Date.now()}_${Math.random().toString(36).slice(2,6)}`,name:file.name,type:file.type,size:file.size,data:ev.target.result,date:new Date().toISOString()}]}));
                                    };
                                    reader.readAsDataURL(file);
                                });
                                e.target.value='';
                            }}/>
                            <p style={{fontSize:13,color:'var(--text-muted)'}}>Glissez des fichiers ici ou cliquez pour parcourir</p>
                            <p style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Max 5 Mo par fichier</p>
                        </div>}
                    </div>
                    <div className="flex items-center justify-between pt-4" style={{borderTop:'1px solid var(--border)'}}>
                        {!isReadOnly && <button onClick={()=>{onDelete(task.id);onClose();}} className="px-4 py-2 text-accent-red hover:bg-red-50 rounded-lg text-sm flex items-center space-x-2"><Icon.Trash/><span>Delete</span></button>}
                        {isReadOnly && <span style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>Read-only (guest mode)</span>}
                        <button onClick={handleClose} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium">Close</button>
                    </div>
                </div>
            </div>
        </div>
        {previewAttachment&&(
            <div onClick={()=>setPreviewAttachment(null)} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.85)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'zoom-out',padding:24}}>
                <div style={{position:'absolute',top:16,right:16,display:'flex',gap:8}}>
                    {previewAttachment.data&&<a href={previewAttachment.data} download={previewAttachment.name} onClick={e=>e.stopPropagation()} style={{padding:'8px 16px',background:'rgba(255,255,255,0.15)',color:'white',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:500,textDecoration:'none',cursor:'pointer',backdropFilter:'blur(8px)'}}>↓ Download</a>}
                    <button onClick={()=>setPreviewAttachment(null)} style={{padding:'8px 16px',background:'rgba(255,255,255,0.15)',color:'white',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:500,border:'none',cursor:'pointer',backdropFilter:'blur(8px)'}}>✕ Close</button>
                </div>
                {previewAttachment.type?.startsWith('image/')?
                    <img src={previewAttachment.data} alt={previewAttachment.name} onClick={e=>e.stopPropagation()} style={{maxWidth:'90vw',maxHeight:'85vh',objectFit:'contain',borderRadius:'var(--radius-lg)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',cursor:'default'}}/>:
                    previewAttachment.type==='application/pdf'?
                    <iframe src={previewAttachment.data} onClick={e=>e.stopPropagation()} style={{width:'80vw',height:'85vh',borderRadius:'var(--radius-lg)',border:'none',background:'white',cursor:'default'}}/>:
                    <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-primary)',borderRadius:'var(--radius-lg)',padding:40,textAlign:'center',cursor:'default',maxWidth:400}}>
                        <div style={{fontSize:48,marginBottom:16}}>📄</div>
                        <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>{previewAttachment.name}</div>
                        <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>{previewAttachment.size?`${(previewAttachment.size/1024).toFixed(1)} KB`:''}</div>
                        <p style={{fontSize:12,color:'var(--text-muted)'}}>Preview not available for this file type</p>
                        {previewAttachment.data&&<a href={previewAttachment.data} download={previewAttachment.name} style={{display:'inline-block',marginTop:16,padding:'10px 20px',background:'var(--accent)',color:'white',borderRadius:'var(--radius-md)',fontSize:13,fontWeight:600,textDecoration:'none'}}>Download</a>}
                    </div>
                }
                <div style={{color:'rgba(255,255,255,0.7)',fontSize:12,marginTop:12}}>{previewAttachment.name}</div>
            </div>
        )}
        </React.Fragment>
    );
};

export default TaskDetailModal;
