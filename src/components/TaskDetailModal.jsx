import React from 'react';
import ReactDOM from 'react-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { CONFIG } from '../config.js';
import { normalizeTaskChecklists } from '../lib/migration.js';
import { uploadAttachment, deleteAttachment } from '../lib/storage.js';
import { markdownToHtml, htmlToMarkdown, WysiwygToolbar, SimpleMarkdown } from '../lib/markdown.jsx';
import { useApp } from '../context.js';
import MentionInput from './MentionInput.jsx';
import { Icon, StatusIcon, PriorityIcon, StatusOption, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';
import CountryTags from './CountryTags.jsx';



const TaskDetailModal=({categories,task,action,actions,onClose,onUpdate,onDelete,onBackToAction,allCountries,onAddCustomCountry,onCreateAction,onAddCategory,members=[],isReadOnly=false,availableOtherLabels=[],isTrelloBoard=false,isCardAsTask=false})=>{
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
    const modalScrollRef=useRef(null);
    const[newComment,setNewComment]=useState('');
    const[newChecklistItems,setNewChecklistItems]=useState({}); // Per-checklist new item text
    const[newChecklistName,setNewChecklistName]=useState('');
    const[showAddChecklist,setShowAddChecklist]=useState(false);
    const[showAddOtherLabel,setShowAddOtherLabel]=useState(false);
    const[showCreateOtherLabel,setShowCreateOtherLabel]=useState(false);
    const[newOtherLabelName,setNewOtherLabelName]=useState('');
    const[newOtherLabelColor,setNewOtherLabelColor]=useState('#6366f1');
    const[showMemberPicker,setShowMemberPicker]=useState(false);
    const[editingChecklistId,setEditingChecklistId]=useState(null);
    const[editingChecklistName,setEditingChecklistName]=useState('');
    const[uploading,setUploading]=useState(false);

    const handleFileUpload = async (file) => {
        if (file.size > 10 * 1024 * 1024) return; // 10MB limit
        setUploading(true);
        try {
            // Try Supabase Storage first
            const result = await uploadAttachment(file, task.id);
            if (result) {
                setForm(prev => ({...prev, attachments: [...(prev.attachments || []), {
                    id: `att-${crypto.randomUUID()}`, name: file.name, type: file.type,
                    size: file.size, url: result.url, storagePath: result.path,
                    date: new Date().toISOString()
                }]}));
                return;
            }
        } catch (e) { /* fall through to base64 */ }
        // Fallback: base64 (5MB limit for inline storage)
        if (file.size > 5 * 1024 * 1024) { setUploading(false); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            setForm(prev => ({...prev, attachments: [...(prev.attachments || []), {
                id: `att-${crypto.randomUUID()}`, name: file.name, type: file.type,
                size: file.size, data: ev.target.result, date: new Date().toISOString()
            }]}));
            setUploading(false);
        };
        reader.readAsDataURL(file);
        return; // uploading set to false in onload
    };
    const[editingItemId,setEditingItemId]=useState(null);
    const[editingItemText,setEditingItemText]=useState('');
    const[draggingChecklistIdx,setDraggingChecklistIdx]=useState(null);
    const[dragOverChecklistIdx,setDragOverChecklistIdx]=useState(null);
    const[draggingItemKey,setDraggingItemKey]=useState(null);
    const[dragOverItemKey,setDragOverItemKey]=useState(null);
    const[showItemMemberPicker,setShowItemMemberPicker]=useState(null);
    const[memberPickerPos,setMemberPickerPos]=useState(null);
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
        const newAction={id:`a-${crypto.randomUUID()}`,name,categoryId:newActionCategoryId,budget:0,priority:'medium',tags:[],status:'active',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        if(onCreateAction)onCreateAction(newAction);
        setForm({...form,actionId:newAction.id});
        setNewActionName('');
        setNewActionCategoryId(categories?.[0]?.id||'');
        setShowInlineCreateAction(false);
    };

    const handleClose=()=>{if(!isReadOnly)onUpdate(task.id,form);onClose();}; // Auto-save on close (Trello-style), skip in read-only

    // Escape key to close
    useEffect(()=>{
        const handleKeyDown=(e)=>{if(e.key==='Escape'){e.preventDefault();handleClose();}};
        window.addEventListener('keydown',handleKeyDown);
        return()=>window.removeEventListener('keydown',handleKeyDown);
    },[]);
    // Toggle sticky header border on scroll
    useEffect(()=>{
        const el=modalScrollRef.current;
        if(!el)return;
        const onScroll=()=>{
            const header=el.querySelector('.modal-sticky-header');
            if(header){
                if(el.scrollTop>8){header.style.borderColor='var(--border-light)';header.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)';}
                else{header.style.borderColor='transparent';header.style.boxShadow='none';}
            }
        };
        el.addEventListener('scroll',onScroll,{passive:true});
        return()=>el.removeEventListener('scroll',onScroll);
    },[]);
    const saveDescription=()=>{setForm({...form,description:descriptionDraft});setDescriptionSaved(true);};
    const[commentEditing,setCommentEditing]=useState(false);
    const commentEditableRef=useRef(null);
    const[commentAttachments,setCommentAttachments]=useState([]);
    const addComment=()=>{
        const md = commentEditing && commentEditableRef.current ? htmlToMarkdown(commentEditableRef.current.innerHTML || '') : newComment.trim();
        if(!md)return;
        const author=trelloUser?.fullName||'Guest';
        const comment = {id:`cm-${crypto.randomUUID()}`,author,text:md,date:new Date().toISOString()};
        if (commentAttachments.length > 0) comment.attachments = [...commentAttachments];
        const updatedForm = {...form, comments:[...(form.comments||[]),comment]};
        // Also add comment attachments to the task's attachment list
        if (commentAttachments.length > 0) {
            updatedForm.attachments = [...(form.attachments||[]), ...commentAttachments.map(att => ({
                id: att.id || `att-${crypto.randomUUID()}`,
                name: att.name, type: att.type, size: att.size,
                data: att.data, url: att.url, date: att.date
            }))];
        }
        setForm(updatedForm);
        setNewComment('');
        setCommentAttachments([]);
        setCommentEditing(false);
        if(commentEditableRef.current) commentEditableRef.current.innerHTML='';
    };
    const addChecklistItem=(checklistId)=>{const text=(newChecklistItems[checklistId]||'').trim();if(!text)return;setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:[...cl.items,{id:`cli-${crypto.randomUUID()}`,text,done:false}]}:cl)});setNewChecklistItems({...newChecklistItems,[checklistId]:''});};
    const toggleChecklistItem=(checklistId,itemId)=>setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:cl.items.map(i=>i.id===itemId?{...i,done:!i.done}:i)}:cl)});
    const removeChecklistItem=(checklistId,itemId)=>setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:cl.items.filter(i=>i.id!==itemId)}:cl)});
    const addNewChecklist=()=>{const name=newChecklistName.trim();if(!name)return;setForm({...form,checklists:[...(form.checklists||[]),{id:`cl-${crypto.randomUUID()}`,name,items:[]}]});setNewChecklistName('');setShowAddChecklist(false);};
    const removeChecklist=(checklistId)=>setForm({...form,checklists:(form.checklists||[]).filter(cl=>cl.id!==checklistId)});
    const renameChecklist=(checklistId,newName)=>{if(!newName.trim())return;setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,name:newName.trim()}:cl)});setEditingChecklistId(null);};
    const renameChecklistItem=(checklistId,itemId,newText)=>{if(!newText.trim())return;setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:cl.items.map(i=>i.id===itemId?{...i,text:newText.trim()}:i)}:cl)});setEditingItemId(null);};
    const reorderChecklists=(fromIdx,toIdx)=>{setForm(prev=>{const cls=[...(prev.checklists||[])];const[moved]=cls.splice(fromIdx,1);cls.splice(toIdx,0,moved);return{...prev,checklists:cls};});};
    const reorderChecklistItems=(checklistId,fromItemId,toItemId)=>{setForm(prev=>({...prev,checklists:(prev.checklists||[]).map(cl=>{if(cl.id!==checklistId)return cl;const items=[...cl.items];const fromIdx=items.findIndex(i=>i.id===fromItemId);const toIdx=items.findIndex(i=>i.id===toItemId);if(fromIdx<0||toIdx<0||fromIdx===toIdx)return cl;const[moved]=items.splice(fromIdx,1);items.splice(toIdx,0,moved);return{...cl,items};})}));};
    // Touch drag for checklists and items
    const clTouchRef=useRef({type:null,clIdx:null,itemKey:null,timeout:null,startPos:null});
    const handleClTouchStart=useCallback((e,clIdx)=>{
        if(isReadOnly)return;
        const touch=e.touches[0];
        clTouchRef.current={type:'checklist',clIdx,itemKey:null,timeout:setTimeout(()=>{
            setDraggingChecklistIdx(clIdx);
            if(navigator.vibrate)navigator.vibrate(50);
        },300),startPos:{x:touch.clientX,y:touch.clientY}};
    },[isReadOnly]);
    const handleItemTouchStart=useCallback((e,clId,itemId)=>{
        if(isReadOnly)return;
        e.stopPropagation();
        const touch=e.touches[0];
        const key=`${clId}:${itemId}`;
        clTouchRef.current={type:'item',clIdx:null,itemKey:key,clId,timeout:setTimeout(()=>{
            setDraggingItemKey(key);
            if(navigator.vibrate)navigator.vibrate(50);
        },300),startPos:{x:touch.clientX,y:touch.clientY}};
    },[isReadOnly]);
    const handleClTouchMove=useCallback((e)=>{
        const ref=clTouchRef.current;
        if(!ref.type){
            if(ref.timeout&&ref.startPos){
                const t=e.touches[0];
                if(Math.abs(t.clientX-ref.startPos.x)>10||Math.abs(t.clientY-ref.startPos.y)>10){
                    clearTimeout(ref.timeout);ref.timeout=null;
                }
            }
            return;
        }
        if(draggingChecklistIdx===null&&!draggingItemKey)return;
        e.preventDefault();
        const touch=e.touches[0];
        const el=document.elementFromPoint(touch.clientX,touch.clientY);
        if(!el)return;
        if(ref.type==='checklist'){
            const target=el.closest('[data-cl-idx]');
            if(target){
                const idx=parseInt(target.getAttribute('data-cl-idx'));
                if(!isNaN(idx)&&idx!==draggingChecklistIdx)setDragOverChecklistIdx(idx);
            }
        }else if(ref.type==='item'){
            const target=el.closest('[data-item-key]');
            if(target){
                const key=target.getAttribute('data-item-key');
                if(key&&key!==draggingItemKey&&key.startsWith(ref.clId+':'))setDragOverItemKey(key);
            }
        }
    },[draggingChecklistIdx,draggingItemKey]);
    const handleClTouchEnd=useCallback(()=>{
        const ref=clTouchRef.current;
        if(ref.timeout)clearTimeout(ref.timeout);
        if(ref.type==='checklist'&&draggingChecklistIdx!==null&&dragOverChecklistIdx!==null&&draggingChecklistIdx!==dragOverChecklistIdx){
            reorderChecklists(draggingChecklistIdx,dragOverChecklistIdx);
        }else if(ref.type==='item'&&draggingItemKey&&dragOverItemKey){
            const[fromClId,fromItemId]=draggingItemKey.split(':');
            const[toClId,toItemId]=dragOverItemKey.split(':');
            if(fromClId===toClId&&fromItemId!==toItemId)reorderChecklistItems(fromClId,fromItemId,toItemId);
        }
        setDraggingChecklistIdx(null);setDragOverChecklistIdx(null);
        setDraggingItemKey(null);setDragOverItemKey(null);
        clTouchRef.current={type:null,clIdx:null,itemKey:null,timeout:null,startPos:null};
    },[draggingChecklistIdx,dragOverChecklistIdx,draggingItemKey,dragOverItemKey]);
    const updateChecklistItemAssignee=(checklistId,itemId,assignee)=>{setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:cl.items.map(i=>i.id===itemId?{...i,assignee}:i)}:cl)});setShowItemMemberPicker(null);};
    const updateChecklistItemDue=(checklistId,itemId,due)=>{setForm({...form,checklists:(form.checklists||[]).map(cl=>cl.id===checklistId?{...cl,items:cl.items.map(i=>i.id===itemId?{...i,due}:i)}:cl)});};
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
                <div ref={modalScrollRef} className="p-6" style={{maxHeight:'calc(90vh - 80px)',overflowY:'auto'}}>
                    {/* Header — sticky on scroll */}
                    <div className="modal-sticky-header" style={{position:'sticky',top:-24,zIndex:10,background:'var(--bg-primary)',paddingTop:24,paddingBottom:8,marginTop:-24,marginBottom:8}}>
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                            <button onClick={()=>!isReadOnly&&setForm({...form,status:form.status==='completed'?'todo':'completed'})} className="mt-2 flex-shrink-0" style={{width:22,height:22,borderRadius:6,border:form.status==='completed'?'none':'2px solid var(--border-strong)',background:form.status==='completed'?'var(--success)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:isReadOnly?'default':'pointer',transition:'all 0.2s',opacity:isReadOnly?0.7:1}} title={form.status==='completed'?'Mark as not completed':'Mark as completed'}>{form.status==='completed'&&<svg width="12" height="12" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}</button>
                            <div className="flex-1">
                                <input type="text" value={form.title} onChange={e=>!isReadOnly&&setForm({...form,title:e.target.value})} className="v11-input" style={{fontSize:'1.25rem',fontWeight:700,textDecoration:form.status==='completed'?'line-through':'none'}} readOnly={isReadOnly}/>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm" style={{color:'var(--text-muted)'}}>📁 {action?.name} • {CONFIG.MONTHS_FULL[task.month]}</p>
                                    {onBackToAction&&!isCardAsTask&&<button onClick={onBackToAction} className="text-xs text-secondary hover:underline flex items-center gap-1">← Back to action</button>}
                                    {task.trelloLinkedCardUrl && <a href={task.trelloLinkedCardUrl} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} title="Open linked Trello card" style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11,color:'#0079bf',fontWeight:500,textDecoration:'none'}} onMouseEnter={e=>{e.currentTarget.style.textDecoration='underline';}} onMouseLeave={e=>{e.currentTarget.style.textDecoration='none';}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M14 4h6m0 0v6m0-6L10 14"/></svg>Open in Trello</a>}
                                </div>
                            </div>
                        </div>
                        <button onClick={handleClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    </div>
                    {/* Details section */}
                    <div className="rounded-xl mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'}}>
                        <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Details</div>
                        {actions&&!isCardAsTask&&<div style={{marginBottom:10}}><label className="v11-label">📋 Action</label>{!showInlineCreateAction?(<><select value={form.actionId} onChange={e=>{if(isReadOnly)return;const newAction=actions.find(a=>a.id===e.target.value);setForm({...form,actionId:e.target.value,channels:newAction?.tags||form.channels});}} className="v11-select" style={{width:'100%'}} disabled={isReadOnly}>{actions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{onCreateAction&&!isCardAsTask&&<button onClick={()=>setShowInlineCreateAction(true)} style={{marginTop:4,fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4}}><Icon.Plus size={10}/> Create a new action</button>}</>):(<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:12,background:'var(--bg-primary)'}}><div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:6}}>New action</div><input ref={newActionInputRef} type="text" value={newActionName} onChange={e=>setNewActionName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleInlineCreateAction();if(e.key==='Escape')setShowInlineCreateAction(false);}} placeholder="Action name..." className="v11-input" style={{marginBottom:8}}/>{!showInlineCreateCategory?(<><select value={newActionCategoryId} onChange={e=>setNewActionCategoryId(e.target.value)} className="v11-input" style={{marginBottom:4}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{onAddCategory&&<button onClick={()=>setShowInlineCreateCategory(true)} style={{marginBottom:8,fontSize:10,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:3}}><Icon.Plus size={9}/> New category</button>}</>):(<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:8,background:'var(--bg-primary)',marginBottom:8}}><input type="text" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newCategoryName.trim()){const nc={id:`cat-${crypto.randomUUID()}`,name:newCategoryName.trim(),color:'#6366f1',gradient:'from-indigo-500 to-purple-500'};onAddCategory(nc);setNewActionCategoryId(nc.id);setNewCategoryName('');setShowInlineCreateCategory(false);}if(e.key==='Escape')setShowInlineCreateCategory(false);}} placeholder="Category name..." className="v11-input" style={{marginBottom:6,fontSize:12}} autoFocus/><div style={{display:'flex',gap:4}}><button onClick={()=>{if(!newCategoryName.trim())return;const nc={id:`cat-${crypto.randomUUID()}`,name:newCategoryName.trim(),color:'#6366f1',gradient:'from-indigo-500 to-purple-500'};onAddCategory(nc);setNewActionCategoryId(nc.id);setNewCategoryName('');setShowInlineCreateCategory(false);}} style={{padding:'3px 8px',fontSize:10,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Add</button><button onClick={()=>{setShowInlineCreateCategory(false);setNewCategoryName('');}} style={{padding:'3px 8px',fontSize:10,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button></div></div>)}<div style={{display:'flex',gap:6}}><button onClick={handleInlineCreateAction} style={{padding:'5px 10px',fontSize:11,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Create</button><button onClick={()=>{setShowInlineCreateAction(false);setNewActionName('');setShowInlineCreateCategory(false);}} style={{padding:'5px 10px',fontSize:11,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button></div></div>)}</div>}
                        <div className="flex flex-wrap gap-3">
                            <div><label className="v11-label">Status</label><IconSelect value={form.status} options={CONFIG.STATUSES} onChange={v=>setForm({...form,status:v})} renderOption={o=><StatusOption status={o}/>} disabled={isReadOnly}/></div>
                            <div><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v=>setForm({...form,priority:v})} renderOption={o=><PriorityOption priority={o}/>} disabled={isReadOnly}/></div>
                            <div><label className="v11-label">Start</label><input type="date" value={form.startDate||''} onChange={e=>setForm({...form,startDate:e.target.value})} className="v11-input" readOnly={isReadOnly}/></div>
                            <div><label className="v11-label">End</label><input type="date" value={form.dueDate||''} onChange={e=>setForm({...form,dueDate:e.target.value})} className="v11-input" readOnly={isReadOnly}/></div>
                            <div><label className="v11-label">Budget €</label><input type="number" value={form.budget||0} onChange={e=>setForm({...form,budget:parseInt(e.target.value)||0})} className="v11-input" style={{width:96}} readOnly={isReadOnly}/></div>
                        </div>
                    </div>
                    {/* Tags & People section */}
                    <div className="rounded-xl mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'}}>
                        <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Tags & People</div>
                        <div style={{marginBottom:10}}><label className="v11-label">🏷️ Channel Tags</label><ChannelTags channels={form.channels||[]} onAdd={addChannel} onRemove={removeChannel} editable={!isReadOnly}/></div>
                        <div style={{marginBottom:10}}><label className="v11-label">🌍 Country Tags</label><CountryTags countries={form.countries||[]} onAdd={addCountry} onRemove={removeCountry} allCountries={allCountries} onAddCustomCountry={onAddCustomCountry} editable={!isReadOnly}/></div>
                    {(isTrelloBoard || members.length > 0) && (
                        <div style={{marginBottom:10}}>
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
                    <div>
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
                                <button onClick={()=>setShowAddOtherLabel(!showAddOtherLabel)} className="px-2 py-0.5 rounded-full text-xs flex items-center space-x-1" style={{background:'var(--bg-secondary)'}}><Icon.Plus/><span>Label</span></button>
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
                                                            <input type="text" value={newOtherLabelName} onChange={e=>setNewOtherLabelName(e.target.value)} placeholder="Label name" autoFocus onKeyDown={e=>{if(e.key==='Enter'&&newOtherLabelName.trim()){const nl={id:'ol-'+crypto.randomUUID(),name:newOtherLabelName.trim(),color:newOtherLabelColor};setForm({...form,otherLabels:[...(form.otherLabels||[]),nl]});setNewOtherLabelName('');setShowAddOtherLabel(false);setShowCreateOtherLabel(false);}if(e.key==='Escape'){setShowCreateOtherLabel(false);setNewOtherLabelName('');}}} style={{flex:1,padding:'4px 6px',borderRadius:4,border:'1px solid var(--border)',fontSize:11}}/>
                                                            <input type="color" value={newOtherLabelColor} onChange={e=>setNewOtherLabelColor(e.target.value)} style={{width:24,height:24,border:'none',padding:0,cursor:'pointer',borderRadius:4}}/>
                                                        </div>
                                                        <div style={{display:'flex',gap:4}}>
                                                            <button onClick={()=>{if(newOtherLabelName.trim()){const nl={id:'ol-'+crypto.randomUUID(),name:newOtherLabelName.trim(),color:newOtherLabelColor};setForm({...form,otherLabels:[...(form.otherLabels||[]),nl]});setNewOtherLabelName('');setShowAddOtherLabel(false);setShowCreateOtherLabel(false);}}} style={{padding:'3px 8px',borderRadius:4,background:'var(--accent)',color:'white',border:'none',cursor:'pointer',fontSize:11}}>Create</button>
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
                    </div>
                    <div className="rounded-xl mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'}}>
                        <div className="flex items-center justify-between mb-2">
                            <span style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px'}}>📝 Description</span>
                            {descriptionDraft&&!descriptionEditing&&!isReadOnly&&<button onClick={()=>{setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML=markdownToHtml(descriptionDraft);descEditableRef.current.focus();}},0);}} className="text-xs" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer'}}>Edit</button>}
                        </div>
                        <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',background:'var(--bg-primary)',padding:12}}>
                        {descriptionEditing?(
                            <div>
                                <WysiwygToolbar editableRef={descEditableRef}/>
                                <div ref={descEditableRef} contentEditable suppressContentEditableWarning onInput={()=>setDescriptionSaved(false)} onFocus={()=>setDescriptionEditing(true)} style={{minHeight:80,maxHeight:400,overflowY:'auto',width:'100%',lineHeight:1.6,outline:'none',whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:13,color:'var(--text-secondary)'}}/>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={()=>{const md=htmlToMarkdown(descEditableRef.current?.innerHTML||'');setDescriptionDraft(md);setForm(f=>({...f,description:md}));setDescriptionSaved(true);setDescriptionEditing(false);}} className="px-4 py-1.5 bg-secondary text-white rounded-lg text-sm">Save</button>
                                    <button onClick={()=>{setDescriptionEditing(false);setDescriptionSaved(true);}} className="px-4 py-1.5 rounded-lg text-sm" style={{border:'1px solid var(--border)'}}>Cancel</button>
                                </div>
                            </div>
                        ):!descriptionDraft&&!isReadOnly?(
                            <div onClick={()=>{setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML='';descEditableRef.current.focus();}},0);}} style={{cursor:'text',minHeight:40,color:'var(--text-muted)',fontSize:13}}>Add a description...</div>
                        ):(
                            <div onClick={()=>{if(isReadOnly)return;setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML=markdownToHtml(descriptionDraft);descEditableRef.current.focus();}},0);}} style={{cursor:isReadOnly?'default':'pointer'}}>
                                <SimpleMarkdown text={descriptionDraft}/>
                            </div>
                        )}
                        </div>
                    </div>
                    <div className="rounded-xl mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'}}>
                        <div className="flex items-center justify-between mb-2">
                            <span style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px'}}>✅ Checklists</span>
                            <div className="flex items-center gap-3">
                                {allChecklistItems.length>0&&<span className="text-sm" style={{color:'var(--text-muted)'}}>{checklistPct}%</span>}
                                {!isReadOnly && <button onClick={()=>setShowAddChecklist(true)} className="text-xs flex items-center gap-1" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:500}}><Icon.Plus size={10}/> Add checklist</button>}
                            </div>
                        </div>
                        {allChecklistItems.length>0&&<div className="v11-progress-bar" style={{height:8,marginBottom:12}}><div className={`v11-progress-fill ${checklistPct>=70?'high':checklistPct>=40?'medium':'low'}`} style={{width:`${checklistPct}%`}}/></div>}
                        {showAddChecklist&&<div className="flex space-x-2 mb-3"><input type="text" value={newChecklistName} onChange={e=>setNewChecklistName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addNewChecklist();if(e.key==='Escape'){setShowAddChecklist(false);setNewChecklistName('');}}} placeholder="Checklist name..." className="v11-input" style={{flex:1}} autoFocus/><button onClick={addNewChecklist} className="px-3 py-2 bg-secondary text-white rounded-lg text-sm">Add</button><button onClick={()=>{setShowAddChecklist(false);setNewChecklistName('');}} className="px-2 py-2 rounded-lg text-sm" style={{border:'1px solid var(--border)'}}>Cancel</button></div>}
                        {(form.checklists||[]).map((cl,clIdx)=>{const clPct=cl.items.length>0?Math.round((cl.items.filter(i=>i.done).length/cl.items.length)*100):0;return(
                            <div key={cl.id} className="mb-3" data-cl-idx={clIdx} style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',background:'var(--bg-primary)',overflow:'hidden',opacity:draggingChecklistIdx===clIdx?0.5:1}} draggable={!isReadOnly} onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','checklist');setDraggingChecklistIdx(clIdx);}} onDragEnd={()=>{if(draggingChecklistIdx!==null&&dragOverChecklistIdx!==null&&draggingChecklistIdx!==dragOverChecklistIdx)reorderChecklists(draggingChecklistIdx,dragOverChecklistIdx);setDraggingChecklistIdx(null);setDragOverChecklistIdx(null);}} onDragOver={e=>{e.preventDefault();if(draggingChecklistIdx!==null&&e.dataTransfer.types.includes('text/plain'))setDragOverChecklistIdx(clIdx);}} onDragLeave={e=>{if(draggingChecklistIdx!==null&&!e.currentTarget.contains(e.relatedTarget))setDragOverChecklistIdx(null);}} onTouchStart={isReadOnly?undefined:e=>handleClTouchStart(e,clIdx)} onTouchMove={isReadOnly?undefined:handleClTouchMove} onTouchEnd={isReadOnly?undefined:handleClTouchEnd}>
                                {dragOverChecklistIdx===clIdx&&draggingChecklistIdx!==null&&draggingChecklistIdx!==clIdx&&<div style={{height:2,background:'var(--accent)',borderRadius:1}}/>}
                                <div style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                                    {!isReadOnly&&<span style={{cursor:'grab',color:'var(--text-muted)',fontSize:12,flexShrink:0,userSelect:'none'}} title="Drag to reorder">⋮⋮</span>}
                                    {editingChecklistId===cl.id?(
                                        <input type="text" value={editingChecklistName} onChange={e=>setEditingChecklistName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')renameChecklist(cl.id,editingChecklistName);if(e.key==='Escape')setEditingChecklistId(null);}} onBlur={()=>renameChecklist(cl.id,editingChecklistName)} className="text-sm font-semibold" style={{flex:1,border:'none',borderBottom:'1px solid var(--accent)',outline:'none',background:'transparent',padding:'0 0 1px',color:'var(--text-primary)'}} autoFocus/>
                                    ):(
                                        <span className="text-sm font-semibold" style={{flex:1,color:'var(--text-primary)',cursor:isReadOnly?'default':'pointer'}} onClick={()=>{if(isReadOnly)return;setEditingChecklistId(cl.id);setEditingChecklistName(cl.name);}}>{cl.name}</span>
                                    )}
                                    <div className="flex items-center gap-2">
                                        {cl.items.length>0&&<span className="text-xs" style={{color:'var(--text-muted)'}}>{clPct}%</span>}
                                        {!isReadOnly && <button onClick={()=>removeChecklist(cl.id)} className="hover:text-accent-red" style={{color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',fontSize:11}} title="Remove checklist"><Icon.Trash size={12}/></button>}
                                    </div>
                                </div>
                                {cl.items.length>0&&<div style={{padding:'0 12px'}}><div className="v11-progress-bar" style={{height:3,margin:'8px 0'}}><div className={`v11-progress-fill ${clPct>=70?'high':clPct>=40?'medium':'low'}`} style={{width:`${clPct}%`}}/></div></div>}
                                <div style={{padding:'4px 8px'}}>{cl.items.map((item,itemIdx)=>{const itemKey=`${cl.id}:${item.id}`;const assigneeMember=item.assignee?members.find(m=>m.id===item.assignee):null;return(
                                    <div key={item.id} data-item-key={itemKey} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 4px',borderRadius:6,background:dragOverItemKey===itemKey?'var(--accent-light)':'transparent',opacity:draggingItemKey===itemKey?0.4:1,transition:'background 0.15s'}} draggable={!isReadOnly} onDragStart={e=>{e.stopPropagation();e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','item');setDraggingItemKey(itemKey);}} onDragEnd={e=>{e.stopPropagation();if(draggingItemKey&&dragOverItemKey){const[fromClId,fromItemId]=draggingItemKey.split(':');const[toClId,toItemId]=dragOverItemKey.split(':');if(fromClId===toClId&&fromItemId!==toItemId)reorderChecklistItems(fromClId,fromItemId,toItemId);}setDraggingItemKey(null);setDragOverItemKey(null);}} onDragOver={e=>{e.preventDefault();if(draggingChecklistIdx!==null)return;e.stopPropagation();if(draggingItemKey&&draggingItemKey.startsWith(cl.id+':'))setDragOverItemKey(itemKey);}} onDragLeave={()=>dragOverItemKey===itemKey&&setDragOverItemKey(null)} onTouchStart={isReadOnly?undefined:e=>handleItemTouchStart(e,cl.id,item.id)} onTouchMove={isReadOnly?undefined:handleClTouchMove} onTouchEnd={isReadOnly?undefined:handleClTouchEnd}>
                                        {!isReadOnly&&<span style={{cursor:'grab',color:'var(--text-muted)',fontSize:10,flexShrink:0,userSelect:'none'}}>⋮⋮</span>}
                                        <button onClick={()=>!isReadOnly&&toggleChecklistItem(cl.id,item.id)} style={{width:18,height:18,borderRadius:4,border:item.done?'none':'2px solid var(--border-strong)',background:item.done?'var(--success)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:isReadOnly?'default':'pointer',flexShrink:0,transition:'all 0.2s'}}>{item.done&&<svg width="10" height="10" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}</button>
                                        {editingItemId===item.id?(
                                            <input type="text" value={editingItemText} onChange={e=>setEditingItemText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')renameChecklistItem(cl.id,item.id,editingItemText);if(e.key==='Escape')setEditingItemId(null);}} onBlur={()=>renameChecklistItem(cl.id,item.id,editingItemText)} style={{flex:1,border:'none',borderBottom:'1px solid var(--accent)',outline:'none',background:'transparent',fontSize:13,padding:'0 0 1px',color:'var(--text-primary)'}} autoFocus/>
                                        ):(
                                            <span onClick={()=>{if(item.trelloLinkedCardUrl){window.open(item.trelloLinkedCardUrl,'_blank');return;}if(isReadOnly)return;setEditingItemId(item.id);setEditingItemText(item.text);}} style={{flex:1,fontSize:13,textDecoration:item.done?'line-through':'none',color:item.done?'var(--text-muted)':'var(--text-secondary)',cursor:item.trelloLinkedCardUrl?'pointer':isReadOnly?'default':'pointer',display:'flex',alignItems:'center',gap:4}}>{item.trelloLinkedCardUrl&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0079bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.7}}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>}{item.text}</span>
                                        )}
                                        {/* Assignee badge */}
                                        <div style={{flexShrink:0}}>
                                            <button onClick={e=>{e.stopPropagation();if(isReadOnly)return;if(showItemMemberPicker===itemKey){setShowItemMemberPicker(null);setMemberPickerPos(null);}else{const rect=e.currentTarget.getBoundingClientRect();const dropH=Math.min(members.length*30+40,180);const flipUp=rect.bottom+dropH+8>window.innerHeight;setMemberPickerPos({top:flipUp?rect.top-dropH-4:rect.bottom+4,left:Math.min(rect.left,window.innerWidth-170)});setShowItemMemberPicker(itemKey);}}} style={{width:22,height:22,borderRadius:'50%',border:assigneeMember?'2px solid var(--accent)':'1px dashed var(--border)',background:assigneeMember?'none':'transparent',cursor:isReadOnly?'default':'pointer',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0,padding:0}} title={assigneeMember?(assigneeMember.fullName||assigneeMember.username):'Assign member'}>
                                                {assigneeMember?(assigneeMember.avatarUrl?<img src={assigneeMember.avatarUrl} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:<span style={{width:'100%',height:'100%',borderRadius:'50%',background:'var(--accent)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600}}>{(assigneeMember.fullName||assigneeMember.username||'?')[0].toUpperCase()}</span>):<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                                            </button>
                                            {showItemMemberPicker===itemKey&&memberPickerPos&&ReactDOM.createPortal(<>
                                                <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setShowItemMemberPicker(null);setMemberPickerPos(null);}}/>
                                                <div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:memberPickerPos.top,left:memberPickerPos.left,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',zIndex:9999,minWidth:160,padding:4,maxHeight:180,overflowY:'auto'}}>
                                                    {members.length===0?<div style={{padding:'8px',fontSize:11,color:'var(--text-muted)'}}>No members — sync with Trello first</div>:<>
                                                    {item.assignee&&<button onClick={e=>{e.stopPropagation();updateChecklistItemAssignee(cl.id,item.id,null);}} style={{width:'100%',padding:'5px 8px',fontSize:11,color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>Remove assignee</button>}
                                                    {members.map(m=>(<button key={m.id} onClick={e=>{e.stopPropagation();updateChecklistItemAssignee(cl.id,item.id,m.id);}} style={{width:'100%',padding:'5px 8px',fontSize:11,color:'var(--text-primary)',background:item.assignee===m.id?'var(--accent-light)':'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:6}} onMouseEnter={e=>{if(item.assignee!==m.id)e.currentTarget.style.background='var(--bg-secondary)';}} onMouseLeave={e=>{if(item.assignee!==m.id)e.currentTarget.style.background='none';}}>
                                                        {m.avatarUrl?<img src={m.avatarUrl} alt="" style={{width:18,height:18,borderRadius:'50%'}}/>:<span style={{width:18,height:18,borderRadius:'50%',background:'var(--accent)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600,flexShrink:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                                        <span>{m.fullName||m.username}</span>
                                                    </button>))}</>}
                                                </div>
                                            </>,document.body)}
                                        </div>
                                        {/* Due date badge */}
                                        <div style={{position:'relative',flexShrink:0}}>
                                            <label style={{padding:'2px 6px',borderRadius:4,border:'1px solid '+(item.due?'var(--accent)':'var(--border)'),background:item.due?'var(--accent-light)':'transparent',cursor:isReadOnly?'default':'pointer',fontSize:10,color:item.due?'var(--accent)':'var(--text-muted)',display:'flex',alignItems:'center',gap:3,whiteSpace:'nowrap'}} title={item.due?`Due: ${item.due}`:'Set due date'}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                                {item.due?new Date(item.due+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):''}
                                                {!isReadOnly&&<input type="date" value={item.due||''} onChange={e=>updateChecklistItemDue(cl.id,item.id,e.target.value||null)} onClick={e=>{e.target.showPicker?.();}} style={{position:'absolute',opacity:0,width:0,height:0,overflow:'hidden'}}/>}
                                            </label>
                                            {item.due&&!isReadOnly&&<button onClick={e=>{e.stopPropagation();updateChecklistItemDue(cl.id,item.id,null);}} style={{position:'absolute',top:-4,right:-4,width:14,height:14,borderRadius:'50%',background:'var(--text-muted)',color:'white',border:'none',cursor:'pointer',fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}} title="Clear date">&times;</button>}
                                        </div>
                                        {!isReadOnly&&<button onClick={()=>removeChecklistItem(cl.id,item.id)} style={{color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',flexShrink:0,padding:2}} className="hover:text-accent-red"><Icon.Trash size={12}/></button>}
                                    </div>
                                );})}
                                {!isReadOnly && <div style={{padding:'4px 4px 8px',display:'flex',gap:6}}><input type="text" value={newChecklistItems[cl.id]||''} onChange={e=>setNewChecklistItems({...newChecklistItems,[cl.id]:e.target.value})} onKeyPress={e=>e.key==='Enter'&&addChecklistItem(cl.id)} placeholder="Add item..." className="v11-input" style={{flex:1,fontSize:12}}/><button onClick={()=>addChecklistItem(cl.id)} className="px-3 py-1.5 bg-secondary text-white rounded-lg text-sm"><Icon.Plus size={12}/></button></div>}
                                </div>
                            </div>
                        );})}
                    </div>
                    <div className="rounded-xl mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'}}>
                        <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:8}}>💬 Comments ({form.comments?.length||0})</div>
                        {!isReadOnly && <div style={{marginBottom:(form.comments||[]).length>0?12:0}}>
                            {commentEditing ? (<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',background:'var(--bg-primary)',overflow:'hidden'}}>
                                <WysiwygToolbar editableRef={commentEditableRef} onAttach={()=>document.getElementById('comment-attach-input')?.click()}/>
                                <MentionInput editableRef={commentEditableRef} members={members} onSubmit={addComment}
                                    onDragOver={e=>{e.preventDefault();e.currentTarget.style.background='var(--accent-light)';}}
                                    onDragLeave={e=>{e.currentTarget.style.background='transparent';}}
                                    onDrop={e=>{e.preventDefault();e.currentTarget.style.background='transparent';const files=Array.from(e.dataTransfer.files);files.forEach(file=>{if(file.size>5*1024*1024)return;const reader=new FileReader();reader.onload=ev=>{setCommentAttachments(prev=>[...prev,{id:`catt-${crypto.randomUUID()}`,name:file.name,type:file.type,size:file.size,data:ev.target.result,date:new Date().toISOString()}]);};reader.readAsDataURL(file);});}}/>
                                {commentAttachments.length>0&&<div style={{padding:'4px 12px 8px',display:'flex',flexWrap:'wrap',gap:4}}>{commentAttachments.map((att,i)=>(<span key={i} style={{fontSize:11,padding:'2px 6px',borderRadius:4,background:'var(--accent-light)',color:'var(--accent)',display:'inline-flex',alignItems:'center',gap:3}}>📎 {att.name}<button onClick={()=>setCommentAttachments(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--accent)',fontSize:10,padding:0}}>&times;</button></span>))}</div>}
                                <div style={{padding:'6px 12px 10px',display:'flex',gap:6,alignItems:'center',borderTop:'1px solid var(--border)'}}>
                                    <button onClick={addComment} className="px-4 py-1.5 bg-secondary text-white rounded-lg text-sm">Send</button>
                                    <button onClick={()=>{setCommentEditing(false);setCommentAttachments([]);}} className="px-3 py-1.5 rounded-lg text-sm" style={{border:'1px solid var(--border)'}}>Cancel</button>
                                    <label style={{cursor:'pointer',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:3,fontSize:12,marginLeft:'auto'}} title="Attach file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg><input id="comment-attach-input" type="file" multiple style={{display:'none'}} onChange={e=>{const files=Array.from(e.target.files||[]);files.forEach(file=>{if(file.size>5*1024*1024)return;const reader=new FileReader();reader.onload=ev=>{setCommentAttachments(prev=>[...prev,{id:`catt-${crypto.randomUUID()}`,name:file.name,type:file.type,size:file.size,data:ev.target.result,date:new Date().toISOString()}]);};reader.readAsDataURL(file);});e.target.value='';}}/></label>
                                </div>
                            </div>) : (
                                <div onClick={()=>setCommentEditing(true)} className="v11-input" style={{cursor:'text',minHeight:36,color:'var(--text-muted)',padding:'8px 12px',fontSize:13}}>Write a comment...</div>
                            )}
                        </div>}
                        {(form.comments||[]).length>0&&<div className="space-y-2" style={{maxHeight:320,overflowY:'auto'}}>{[...(form.comments||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(c=>(<div key={c.id} className="p-3 rounded-lg" style={{background:'var(--bg-primary)',border:'1px solid var(--border)'}}>
                            <div className="flex justify-between mb-2"><span className="font-medium text-sm">{c.author}</span><span className="text-xs" style={{color:'var(--text-muted)'}}>{new Date(c.date).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>
                            <div style={{fontSize:13,color:'var(--text-secondary)'}}><SimpleMarkdown text={c.text}/></div>
                            {c.attachments&&c.attachments.length>0&&<div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:4}}>{c.attachments.map(att=>(<a key={att.id||att.name} href={att.url||att.data||'#'} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--accent)',display:'flex',alignItems:'center',gap:3,padding:'2px 6px',borderRadius:4,background:'var(--accent-light)',textDecoration:'none'}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>{att.name}</a>))}</div>}
                        </div>))}</div>}
                    </div>
                    <div className="rounded-xl mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'}}>
                        <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:8}}>📎 Attachments ({(form.attachments||[]).length})</div>
                        {(form.attachments||[]).length>0&&<div className="space-y-2 mb-3">
                            {(form.attachments||[]).map(att=>{
                                const thumbSrc = att.thumbnailUrl || att.data || null;
                                return (
                                <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg" style={{background:'var(--bg-secondary)',cursor:'pointer'}} onClick={()=>att.url ? window.open(att.url,'_blank') : setPreviewAttachment(att)}>
                                    {thumbSrc ?
                                        <img src={thumbSrc} alt={att.name} style={{width:40,height:40,objectFit:'cover',borderRadius:'var(--radius-sm)',flexShrink:0}}/>:
                                        <div style={{width:40,height:40,borderRadius:'var(--radius-sm)',background:'var(--accent-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:16}}>📄</div>
                                    }
                                    <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</div>
                                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{att.size?`${(att.size/1024).toFixed(1)} KB`:''}{att.date?` • ${new Date(att.date).toLocaleDateString('en-US')}`:''}</div>
                                    </div>
                                    {(att.data||att.url)&&<a href={att.data||att.url} download={att.data?att.name:undefined} target={att.url?'_blank':undefined} rel={att.url?'noopener noreferrer':undefined} onClick={e=>e.stopPropagation()} style={{color:'var(--accent)',fontSize:12,fontWeight:500,flexShrink:0,cursor:'pointer'}} title={att.url?'Open':'Download'}>{att.url?'↗':'↓'}</a>}
                                    {!isReadOnly && <button onClick={(e)=>{e.stopPropagation();if(att.storagePath)deleteAttachment(att.storagePath);setForm({...form,attachments:(form.attachments||[]).filter(a=>a.id!==att.id)});}} style={{color:'var(--text-muted)',cursor:'pointer',flexShrink:0,background:'none',border:'none',fontSize:14}} title="Delete">✕</button>}
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
                                files.forEach(file => handleFileUpload(file));
                            }}
                            className="border-2 border-dashed rounded-lg p-4 text-center" style={{borderColor:'var(--border)',cursor:'pointer',transition:'all 0.2s'}}
                            onClick={()=>document.getElementById('file-upload-input')?.click()}
                        >
                            <input id="file-upload-input" type="file" multiple style={{display:'none'}} onChange={e=>{
                                Array.from(e.target.files||[]).forEach(file => handleFileUpload(file));
                                e.target.value='';
                            }}/>
                            <p style={{fontSize:13,color:'var(--text-muted)'}}>{uploading?'Uploading...':'Drag files here or click to browse'}</p>
                            <p style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Max 5 MB per file</p>
                        </div>}
                    </div>
                    <div className="flex items-center justify-between pt-4" style={{borderTop:'1px solid var(--border)'}}>
                        {!isReadOnly && <button onClick={()=>{if(window.confirm('Are you sure you want to delete this task?')){onDelete(task.id);onClose();}}} className="px-4 py-2 text-accent-red hover:bg-red-50 rounded-lg text-sm flex items-center space-x-2"><Icon.Trash/><span>Delete</span></button>}
                        {isReadOnly && <span style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>Read-only (guest mode)</span>}
                        <button onClick={handleClose} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium">Close</button>
                    </div>
                </div>
            </div>
        </div>
        {previewAttachment&&(
            <div onClick={()=>setPreviewAttachment(null)} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.85)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'zoom-out',padding:24}}>
                <div style={{position:'absolute',top:16,right:16,display:'flex',gap:8}}>
                    {(previewAttachment.url||previewAttachment.data)&&<a href={(previewAttachment.url||previewAttachment.data)} download={previewAttachment.name} onClick={e=>e.stopPropagation()} style={{padding:'8px 16px',background:'rgba(255,255,255,0.15)',color:'white',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:500,textDecoration:'none',cursor:'pointer',backdropFilter:'blur(8px)'}}>↓ Download</a>}
                    <button onClick={()=>setPreviewAttachment(null)} style={{padding:'8px 16px',background:'rgba(255,255,255,0.15)',color:'white',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:500,border:'none',cursor:'pointer',backdropFilter:'blur(8px)'}}>✕ Close</button>
                </div>
                {previewAttachment.type?.startsWith('image/')?
                    <img src={(previewAttachment.url||previewAttachment.data)} alt={previewAttachment.name} onClick={e=>e.stopPropagation()} style={{maxWidth:'90vw',maxHeight:'85vh',objectFit:'contain',borderRadius:'var(--radius-lg)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',cursor:'default'}}/>:
                    previewAttachment.type==='application/pdf'?
                    <iframe src={(previewAttachment.url||previewAttachment.data)} onClick={e=>e.stopPropagation()} style={{width:'80vw',height:'85vh',borderRadius:'var(--radius-lg)',border:'none',background:'white',cursor:'default'}}/>:
                    <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-primary)',borderRadius:'var(--radius-lg)',padding:40,textAlign:'center',cursor:'default',maxWidth:400}}>
                        <div style={{fontSize:48,marginBottom:16}}>📄</div>
                        <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>{previewAttachment.name}</div>
                        <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>{previewAttachment.size?`${(previewAttachment.size/1024).toFixed(1)} KB`:''}</div>
                        <p style={{fontSize:12,color:'var(--text-muted)'}}>Preview not available for this file type</p>
                        {(previewAttachment.url||previewAttachment.data)&&<a href={(previewAttachment.url||previewAttachment.data)} download={previewAttachment.name} style={{display:'inline-block',marginTop:16,padding:'10px 20px',background:'var(--accent)',color:'white',borderRadius:'var(--radius-md)',fontSize:13,fontWeight:600,textDecoration:'none'}}>Download</a>}
                    </div>
                }
                <div style={{color:'rgba(255,255,255,0.7)',fontSize:12,marginTop:12}}>{previewAttachment.name}</div>
            </div>
        )}
        </React.Fragment>
    );
};

export default TaskDetailModal;
