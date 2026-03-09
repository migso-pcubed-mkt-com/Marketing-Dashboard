import React from 'react';
import { useState, useRef, useEffect } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon, PriorityIcon, StatusOption, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';
import CountryTags from './CountryTags.jsx';

const TaskDetailModal=({categories,task,action,actions,onClose,onUpdate,onDelete,onBackToAction,allCountries,onAddCustomCountry,onCreateAction})=>{
    const[form,setForm]=useState({...task});
    const[previewAttachment,setPreviewAttachment]=useState(null);
    const[descriptionDraft,setDescriptionDraft]=useState(task.description||''); // Draft pour description
    const[descriptionSaved,setDescriptionSaved]=useState(true); // Track if saved
    const[newComment,setNewComment]=useState('');
    const[newChecklistItem,setNewChecklistItem]=useState('');
    const[showInlineCreateAction,setShowInlineCreateAction]=useState(false);
    const[newActionName,setNewActionName]=useState('');
    const[newActionCategoryId,setNewActionCategoryId]=useState(categories?.[0]?.id||'');
    const newActionInputRef=useRef(null);
    const currentAction=actions?.find(a=>a.id===form.actionId)||action;
    const category=categories?.find(c=>c.id===currentAction?.categoryId);

    useEffect(()=>{
        if(showInlineCreateAction&&newActionInputRef.current)newActionInputRef.current.focus();
    },[showInlineCreateAction]);

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
    const addComment=()=>{if(!newComment.trim())return;setForm({...form,comments:[...(form.comments||[]),{id:`cm${Date.now()}`,author:'Vous',text:newComment,date:new Date().toISOString()}]});setNewComment('');};
    const addChecklistItem=()=>{if(!newChecklistItem.trim())return;setForm({...form,checklist:[...(form.checklist||[]),{id:`cl${Date.now()}`,text:newChecklistItem,done:false}]});setNewChecklistItem('');};
    const toggleChecklistItem=(id)=>setForm({...form,checklist:form.checklist.map(i=>i.id===id?{...i,done:!i.done}:i)});
    const removeChecklistItem=(id)=>setForm({...form,checklist:form.checklist.filter(i=>i.id!==id)});
    const addChannel=(id)=>setForm({...form,channels:[...(form.channels||[]),id]});
    const removeChannel=(id)=>setForm({...form,channels:(form.channels||[]).filter(c=>c!==id)});
    const addCountry=(id)=>setForm({...form,countries:[...(form.countries||[]),id]});
    const removeCountry=(id)=>setForm({...form,countries:(form.countries||[]).filter(c=>c!==id)});
    const checklistPct=form.checklist?.length>0?Math.round((form.checklist.filter(c=>c.done).length/form.checklist.length)*100):0;

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
                        {actions&&<div className="w-full"><label className="v11-label">📋 Action</label>{!showInlineCreateAction?(<><select value={form.actionId} onChange={e=>{const newAction=actions.find(a=>a.id===e.target.value);setForm({...form,actionId:e.target.value,channels:newAction?.tags||form.channels});}} className="v11-select" style={{width:'100%'}}>{actions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{onCreateAction&&<button onClick={()=>setShowInlineCreateAction(true)} style={{marginTop:4,fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4}}><Icon.Plus size={10}/> Create a new action</button>}</>):(<div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:12,background:'var(--bg-secondary)'}}><div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:6}}>New action</div><input ref={newActionInputRef} type="text" value={newActionName} onChange={e=>setNewActionName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleInlineCreateAction();if(e.key==='Escape')setShowInlineCreateAction(false);}} placeholder="Action name..." className="v11-input" style={{marginBottom:8}}/><select value={newActionCategoryId} onChange={e=>setNewActionCategoryId(e.target.value)} className="v11-input" style={{marginBottom:8}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><div style={{display:'flex',gap:6}}><button onClick={handleInlineCreateAction} style={{padding:'5px 10px',fontSize:11,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Create</button><button onClick={()=>{setShowInlineCreateAction(false);setNewActionName('');}} style={{padding:'5px 10px',fontSize:11,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button></div></div>)}</div>}
                        <div><label className="v11-label">Status</label><IconSelect value={form.status} options={CONFIG.STATUSES} onChange={v=>setForm({...form,status:v})} renderOption={o=><StatusOption status={o}/>}/></div>
                        <div><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v=>setForm({...form,priority:v})} renderOption={o=><PriorityOption priority={o}/>}/></div>
                        <div><label className="v11-label">Start</label><input type="date" value={form.startDate||''} onChange={e=>setForm({...form,startDate:e.target.value})} className="v11-input"/></div>
                        <div><label className="v11-label">End</label><input type="date" value={form.dueDate||''} onChange={e=>setForm({...form,dueDate:e.target.value})} className="v11-input"/></div>
                        <div><label className="v11-label">Budget €</label><input type="number" value={form.budget||0} onChange={e=>setForm({...form,budget:parseInt(e.target.value)||0})} className="v11-input" style={{width:96}}/></div>
                    </div>
                    <div className="mb-4"><label className="v11-label">🏷️ Channel Tags</label><ChannelTags channels={form.channels||[]} onAdd={addChannel} onRemove={removeChannel}/></div>
                    <div className="mb-4"><label className="v11-label">🌍 Country Tags</label><CountryTags countries={form.countries||[]} onAdd={addCountry} onRemove={removeCountry} allCountries={allCountries} onAddCustomCountry={onAddCustomCountry}/></div>
                    <div className="mb-6"><label className="block text-sm font-medium mb-2">📝 Description</label><textarea value={descriptionDraft} onChange={e=>{setDescriptionDraft(e.target.value);setDescriptionSaved(false);}} placeholder="Description..." rows={3} className="v11-input" style={{resize:'none'}}/>{!descriptionSaved&&<button onClick={saveDescription} className="mt-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm">Save</button>}</div>
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium">✅ Checklist</label>{form.checklist?.length>0&&<span className="text-sm" style={{color:'var(--text-muted)'}}>{checklistPct}%</span>}</div>
                        {form.checklist?.length>0&&<div className="v11-progress-bar" style={{height:8,marginBottom:12}}><div className={`v11-progress-fill ${checklistPct>=70?'high':checklistPct>=40?'medium':'low'}`} style={{width:`${checklistPct}%`}}/></div>}
                        <div className="space-y-2 mb-3">{form.checklist?.map(item=>(<div key={item.id} className="flex items-center space-x-3 p-2 rounded-lg" style={{background:'var(--bg-secondary)'}}><button onClick={()=>toggleChecklistItem(item.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center ${item.done?'bg-accent-green border-accent-green text-white':''}`} style={!item.done?{borderColor:'var(--border-strong)'}:{}}>{item.done&&<Icon.Check/>}</button><span className={`flex-1 text-sm ${item.done?'line-through':''}`} style={item.done?{color:'var(--text-muted)'}:{}}>{item.text}</span><button onClick={()=>removeChecklistItem(item.id)} className="hover:text-accent-red" style={{color:'var(--text-muted)'}}><Icon.Trash/></button></div>))}</div>
                        <div className="flex space-x-2"><input type="text" value={newChecklistItem} onChange={e=>setNewChecklistItem(e.target.value)} onKeyPress={e=>e.key==='Enter'&&addChecklistItem()} placeholder="Add..." className="v11-input" style={{flex:1}}/><button onClick={addChecklistItem} className="px-3 py-2 bg-secondary text-white rounded-lg"><Icon.Plus/></button></div>
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">💬 Comments ({form.comments?.length||0})</label>
                        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">{form.comments?.map(c=>(<div key={c.id} className="p-3 rounded-lg" style={{background:'var(--bg-secondary)'}}><div className="flex justify-between mb-1"><span className="font-medium text-sm">{c.author}</span><span className="text-xs" style={{color:'var(--text-muted)'}}>{new Date(c.date).toLocaleDateString('en-US')}</span></div><p className="text-sm" style={{color:'var(--text-secondary)'}}>{c.text}</p></div>))}</div>
                        <div className="flex space-x-2"><input type="text" value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyPress={e=>e.key==='Enter'&&addComment()} placeholder="Write..." className="v11-input" style={{flex:1}}/><button onClick={addComment} className="px-4 py-2 bg-secondary text-white rounded-lg text-sm">Send</button></div>
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">📎 Attachments ({(form.attachments||[]).length})</label>
                        {(form.attachments||[]).length>0&&<div className="space-y-2 mb-3">
                            {(form.attachments||[]).map(att=>(
                                <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg" style={{background:'var(--bg-secondary)',cursor:'pointer'}} onClick={()=>setPreviewAttachment(att)}>
                                    {att.type?.startsWith('image/')?
                                        <img src={att.data} alt={att.name} style={{width:40,height:40,objectFit:'cover',borderRadius:'var(--radius-sm)',flexShrink:0}}/>:
                                        <div style={{width:40,height:40,borderRadius:'var(--radius-sm)',background:'var(--accent-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:16}}>📄</div>
                                    }
                                    <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</div>
                                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{att.size?`${(att.size/1024).toFixed(1)} KB`:''} • {att.date?new Date(att.date).toLocaleDateString('en-US'):''}</div>
                                    </div>
                                    {att.data&&<a href={att.data} download={att.name} onClick={e=>e.stopPropagation()} style={{color:'var(--accent)',fontSize:12,fontWeight:500,flexShrink:0,cursor:'pointer'}} title="Download">↓</a>}
                                    <button onClick={(e)=>{e.stopPropagation();setForm({...form,attachments:(form.attachments||[]).filter(a=>a.id!==att.id)});}} style={{color:'var(--text-muted)',cursor:'pointer',flexShrink:0,background:'none',border:'none',fontSize:14}} title="Delete">✕</button>
                                </div>
                            ))}
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
