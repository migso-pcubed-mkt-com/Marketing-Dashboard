import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { CONFIG } from '../config.js';
import { normalizeTaskChecklists } from '../lib/migration.js';
import { useApp } from '../context.js';
import { Icon, StatusIcon, PriorityIcon, StatusOption, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';
import CountryTags from './CountryTags.jsx';

// Simple Markdown renderer — builds React elements (no dangerouslySetInnerHTML)
const SimpleMarkdown = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let key = 0;

    const renderInline = (line) => {
        const parts = [];
        let remaining = line;
        let k = 0;
        // Process inline patterns: **bold**, *italic*, `code`, [link](url)
        const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/;
        while (remaining) {
            const match = remaining.match(inlineRegex);
            if (!match) { parts.push(remaining); break; }
            if (match.index > 0) parts.push(remaining.slice(0, match.index));
            if (match[2]) parts.push(React.createElement('strong', { key: k++ }, match[2]));
            else if (match[3]) parts.push(React.createElement('em', { key: k++ }, match[3]));
            else if (match[4]) parts.push(React.createElement('code', { key: k++, style: { background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3, fontSize: '0.9em' } }, match[4]));
            else if (match[5] && match[6]) parts.push(React.createElement('a', { key: k++, href: match[6], target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)', textDecoration: 'underline' } }, match[5]));
            remaining = remaining.slice(match.index + match[0].length);
        }
        return parts;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^---+$/)) {
            elements.push(React.createElement('hr', { key: key++, style: { border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' } }));
        } else if (line.match(/^- /)) {
            elements.push(React.createElement('div', { key: key++, style: { display: 'flex', gap: 6, marginLeft: 4 } },
                React.createElement('span', null, '\u2022'),
                React.createElement('span', null, ...renderInline(line.slice(2)))
            ));
        } else if (line.trim() === '') {
            elements.push(React.createElement('div', { key: key++, style: { height: 8 } }));
        } else {
            elements.push(React.createElement('div', { key: key++ }, ...renderInline(line)));
        }
    }
    return React.createElement('div', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' } }, ...elements);
};

const TaskDetailModal=({categories,task,action,actions,onClose,onUpdate,onDelete,onBackToAction,allCountries,onAddCustomCountry,onCreateAction,onAddCategory,members=[]})=>{
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
    const[newComment,setNewComment]=useState('');
    const[newChecklistItems,setNewChecklistItems]=useState({}); // Per-checklist new item text
    const[newChecklistName,setNewChecklistName]=useState('');
    const[showAddChecklist,setShowAddChecklist]=useState(false);
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

    // Auto-resize description textarea
    const autoResizeDesc=useCallback(()=>{
        const el=descTextareaRef.current;
        if(!el)return;
        el.style.height='auto';
        el.style.height=Math.min(Math.max(el.scrollHeight,80),400)+'px';
    },[]);
    useEffect(()=>{if(descriptionEditing)autoResizeDesc();},[descriptionEditing,autoResizeDesc]);

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

    const handleClose=()=>{onUpdate(task.id,form);onClose();}; // Auto-save on close (Trello-style)
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
                            <button onClick={()=>setForm({...form,status:form.status==='completed'?'todo':'completed'})} className="mt-2 flex-shrink-0" style={{width:22,height:22,borderRadius:6,border:form.status==='completed'?'none':'2px solid var(--border-strong)',background:form.status==='completed'?'var(--success)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all 0.2s'}} title={form.status==='completed'?'Mark as not completed':'Mark as completed'}>{form.status==='completed'&&<svg width="12" height="12" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}</button>
                            <div className="flex-1">
                                <input type="text" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="v11-input" style={{fontSize:'1.25rem',fontWeight:700,textDecoration:form.status==='completed'?'line-through':'none'}}/>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm" style={{color:'var(--text-muted)'}}>📁 {action?.name} • {CONFIG.MONTHS_FULL[task.month]}</p>
                                    {onBackToAction&&<button onClick={onBackToAction} className="text-xs text-secondary hover:underline flex items-center gap-1">← Back to action</button>}
                                </div>
                            </div>
                        </div>
                        <button onClick={handleClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    <div className="flex flex-wrap gap-3 mb-6">
                        {actions&&<div className="w-full"><label className="v11-label">📋 Action</label>{!showInlineCreateAction?(<><select value={form.actionId} onChange={e=>{const newAction=actions.find(a=>a.id===e.target.value);setForm({...form,actionId:e.target.value,channels:newAction?.tags||form.channels});}} className="v11-select" style={{width:'100%'}}>{actions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{onCreateAction&&<button onClick={()=>setShowInlineCreateAction(true)} style={{marginTop:4,fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4}}><Icon.Plus size={10}/> Create a new action</button>}</>):(<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:12,background:'var(--bg-secondary)'}}><div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:6}}>New action</div><input ref={newActionInputRef} type="text" value={newActionName} onChange={e=>setNewActionName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleInlineCreateAction();if(e.key==='Escape')setShowInlineCreateAction(false);}} placeholder="Action name..." className="v11-input" style={{marginBottom:8}}/>{!showInlineCreateCategory?(<><select value={newActionCategoryId} onChange={e=>setNewActionCategoryId(e.target.value)} className="v11-input" style={{marginBottom:4}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{onAddCategory&&<button onClick={()=>setShowInlineCreateCategory(true)} style={{marginBottom:8,fontSize:10,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:3}}><Icon.Plus size={9}/> New category</button>}</>):(<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:8,background:'var(--bg-primary)',marginBottom:8}}><input type="text" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newCategoryName.trim()){const nc={id:`cat${Date.now()}`,name:newCategoryName.trim(),color:'#6366f1',gradient:'from-indigo-500 to-purple-500'};onAddCategory(nc);setNewActionCategoryId(nc.id);setNewCategoryName('');setShowInlineCreateCategory(false);}if(e.key==='Escape')setShowInlineCreateCategory(false);}} placeholder="Category name..." className="v11-input" style={{marginBottom:6,fontSize:12}} autoFocus/><div style={{display:'flex',gap:4}}><button onClick={()=>{if(!newCategoryName.trim())return;const nc={id:`cat${Date.now()}`,name:newCategoryName.trim(),color:'#6366f1',gradient:'from-indigo-500 to-purple-500'};onAddCategory(nc);setNewActionCategoryId(nc.id);setNewCategoryName('');setShowInlineCreateCategory(false);}} style={{padding:'3px 8px',fontSize:10,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Add</button><button onClick={()=>{setShowInlineCreateCategory(false);setNewCategoryName('');}} style={{padding:'3px 8px',fontSize:10,background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button></div></div>)}<div style={{display:'flex',gap:6}}><button onClick={handleInlineCreateAction} style={{padding:'5px 10px',fontSize:11,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Create</button><button onClick={()=>{setShowInlineCreateAction(false);setNewActionName('');setShowInlineCreateCategory(false);}} style={{padding:'5px 10px',fontSize:11,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button></div></div>)}</div>}
                        <div><label className="v11-label">Status</label><IconSelect value={form.status} options={CONFIG.STATUSES} onChange={v=>setForm({...form,status:v})} renderOption={o=><StatusOption status={o}/>}/></div>
                        <div><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v=>setForm({...form,priority:v})} renderOption={o=><PriorityOption priority={o}/>}/></div>
                        <div><label className="v11-label">Start</label><input type="date" value={form.startDate||''} onChange={e=>setForm({...form,startDate:e.target.value})} className="v11-input"/></div>
                        <div><label className="v11-label">End</label><input type="date" value={form.dueDate||''} onChange={e=>setForm({...form,dueDate:e.target.value})} className="v11-input"/></div>
                        <div><label className="v11-label">Budget €</label><input type="number" value={form.budget||0} onChange={e=>setForm({...form,budget:parseInt(e.target.value)||0})} className="v11-input" style={{width:96}}/></div>
                    </div>
                    <div className="mb-4"><label className="v11-label">🏷️ Channel Tags</label><ChannelTags channels={form.channels||[]} onAdd={addChannel} onRemove={removeChannel}/></div>
                    <div className="mb-4"><label className="v11-label">🌍 Country Tags</label><CountryTags countries={form.countries||[]} onAdd={addCountry} onRemove={removeCountry} allCountries={allCountries} onAddCustomCountry={onAddCustomCountry}/></div>
                    {members.length > 0 && (
                        <div className="mb-4">
                            <label className="v11-label">👥 Members</label>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                                {members.map(m => {
                                    const isAssigned = (form.assignees || []).includes(m.id);
                                    return (
                                        <button key={m.id} onClick={() => {
                                            const assignees = form.assignees || [];
                                            setForm({...form, assignees: isAssigned ? assignees.filter(id=>id!==m.id) : [...assignees, m.id]});
                                        }} style={{
                                            display:'flex',alignItems:'center',gap:6,padding:'4px 10px',
                                            borderRadius:'var(--radius-sm)',border:isAssigned?'2px solid var(--accent)':'1px solid var(--border)',
                                            background:isAssigned?'var(--accent-light)':'var(--bg-secondary)',
                                            cursor:'pointer',fontSize:12,color:'var(--text-primary)'
                                        }}>
                                            {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{width:20,height:20,borderRadius:'50%'}}/> : <span style={{width:20,height:20,borderRadius:'50%',background:'var(--accent)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                            <span>{m.fullName || m.username}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {(form.otherLabels || []).length > 0 && (
                        <div className="mb-4">
                            <label className="v11-label">🏷️ Other Labels</label>
                            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                                {form.otherLabels.map(label => (
                                    <span key={label.id} style={{
                                        padding:'2px 8px',borderRadius:4,
                                        background:label.color+'20',color:label.color,
                                        fontSize:11,fontWeight:500
                                    }}>
                                        {label.name || 'Label'}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium">📝 Description</label>
                            {descriptionDraft&&!descriptionEditing&&<button onClick={()=>setDescriptionEditing(true)} className="text-xs" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer'}}>Edit</button>}
                        </div>
                        {descriptionEditing||!descriptionDraft?(
                            <div>
                                <textarea ref={descTextareaRef} value={descriptionDraft} onChange={e=>{setDescriptionDraft(e.target.value);setDescriptionSaved(false);autoResizeDesc();}} onFocus={()=>setDescriptionEditing(true)} placeholder="Add a description... (Markdown supported)" className="v11-input" style={{resize:'none',minHeight:80,maxHeight:400,width:'100%'}}/>
                                {descriptionEditing&&<div className="flex gap-2 mt-2">
                                    <button onClick={()=>{saveDescription();setDescriptionEditing(false);}} className="px-4 py-1.5 bg-secondary text-white rounded-lg text-sm">Save</button>
                                    <button onClick={()=>{setDescriptionDraft(form.description||'');setDescriptionEditing(false);setDescriptionSaved(true);}} className="px-4 py-1.5 rounded-lg text-sm" style={{border:'1px solid var(--border)'}}>Cancel</button>
                                </div>}
                            </div>
                        ):(
                            <div onClick={()=>setDescriptionEditing(true)} style={{cursor:'pointer',padding:8,borderRadius:'var(--radius-md)',border:'1px solid transparent',transition:'border-color 0.2s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border)'} onMouseLeave={e=>e.currentTarget.style.borderColor='transparent'}>
                                <SimpleMarkdown text={descriptionDraft}/>
                            </div>
                        )}
                    </div>
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">✅ Checklists</label>
                            <div className="flex items-center gap-3">
                                {allChecklistItems.length>0&&<span className="text-sm" style={{color:'var(--text-muted)'}}>{checklistPct}%</span>}
                                <button onClick={()=>setShowAddChecklist(true)} className="text-xs flex items-center gap-1" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:500}}><Icon.Plus size={10}/> Add checklist</button>
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
                                        <button onClick={()=>removeChecklist(cl.id)} className="hover:text-accent-red" style={{color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',fontSize:11}} title="Remove checklist"><Icon.Trash size={12}/></button>
                                    </div>
                                </div>
                                {cl.items.length>0&&<div className="v11-progress-bar" style={{height:4,marginBottom:8}}><div className={`v11-progress-fill ${clPct>=70?'high':clPct>=40?'medium':'low'}`} style={{width:`${clPct}%`}}/></div>}
                                <div className="space-y-2 mb-2">{cl.items.map(item=>(<div key={item.id} className="flex items-center space-x-3 p-2 rounded-lg" style={{background:'var(--bg-secondary)'}}><button onClick={()=>toggleChecklistItem(cl.id,item.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center ${item.done?'bg-accent-green border-accent-green text-white':''}`} style={!item.done?{borderColor:'var(--border-strong)'}:{}}>{item.done&&<Icon.Check/>}</button><span className={`flex-1 text-sm ${item.done?'line-through':''}`} style={item.done?{color:'var(--text-muted)'}:{}}>{item.text}</span><button onClick={()=>removeChecklistItem(cl.id,item.id)} className="hover:text-accent-red" style={{color:'var(--text-muted)'}}><Icon.Trash/></button></div>))}</div>
                                <div className="flex space-x-2"><input type="text" value={newChecklistItems[cl.id]||''} onChange={e=>setNewChecklistItems({...newChecklistItems,[cl.id]:e.target.value})} onKeyPress={e=>e.key==='Enter'&&addChecklistItem(cl.id)} placeholder="Add item..." className="v11-input" style={{flex:1}}/><button onClick={()=>addChecklistItem(cl.id)} className="px-3 py-2 bg-secondary text-white rounded-lg"><Icon.Plus/></button></div>
                            </div>
                        );})}
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">💬 Comments ({form.comments?.length||0})</label>
                        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">{form.comments?.map(c=>(<div key={c.id} className="p-3 rounded-lg" style={{background:'var(--bg-secondary)'}}><div className="flex justify-between mb-1"><span className="font-medium text-sm">{c.author}</span><span className="text-xs" style={{color:'var(--text-muted)'}}>{new Date(c.date).toLocaleDateString('en-US')}</span></div><p className="text-sm" style={{color:'var(--text-secondary)'}}>{c.text}</p></div>))}</div>
                        <div className="flex space-x-2"><input type="text" value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyPress={e=>e.key==='Enter'&&addComment()} placeholder="Write..." className="v11-input" style={{flex:1}}/><button onClick={addComment} className="px-4 py-2 bg-secondary text-white rounded-lg text-sm">Send</button></div>
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
                                    <button onClick={(e)=>{e.stopPropagation();setForm({...form,attachments:(form.attachments||[]).filter(a=>a.id!==att.id)});}} style={{color:'var(--text-muted)',cursor:'pointer',flexShrink:0,background:'none',border:'none',fontSize:14}} title="Delete">✕</button>
                                </div>
                            );})}
                        </div>}
                        <div
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
                        </div>
                    </div>
                    <div className="flex items-center justify-between pt-4" style={{borderTop:'1px solid var(--border)'}}>
                        <button onClick={()=>{onDelete(task.id);onClose();}} className="px-4 py-2 text-accent-red hover:bg-red-50 rounded-lg text-sm flex items-center space-x-2"><Icon.Trash/><span>Delete</span></button>
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
