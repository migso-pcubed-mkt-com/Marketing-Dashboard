import { useState, useRef, useEffect } from 'react';
import { CONFIG } from '../config.js';
import { markdownToHtml, htmlToMarkdown, WysiwygToolbar, SimpleMarkdown } from '../lib/markdown.jsx';
import { useApp } from '../context.js';
import { Icon, StatusIcon, PriorityIcon, StatusOption, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';
import CountryTags from './CountryTags.jsx';

const ActionDetailModal=({categories,action,tasks,onClose,onUpdateAction,onUpdateTask,onOpenTask,onAddTask,onDeleteAction,members=[],allCountries,onAddCustomCountry,availableOtherLabels=[],isTrelloBoard=false,isReadOnly=false})=>{
    const { trelloUser } = useApp();
    const[form,setForm]=useState({...action});
    const[showConfirmDelete,setShowConfirmDelete]=useState(false);
    const[descriptionDraft,setDescriptionDraft]=useState(action.description||'');
    const[descriptionEditing,setDescriptionEditing]=useState(false);
    const descEditableRef=useRef(null);
    const[showMemberPicker,setShowMemberPicker]=useState(false);
    const[showAddOtherLabel,setShowAddOtherLabel]=useState(false);
    const[showCreateOtherLabel,setShowCreateOtherLabel]=useState(false);
    const[newOtherLabelName,setNewOtherLabelName]=useState('');
    const[newOtherLabelColor,setNewOtherLabelColor]=useState('#6366f1');
    const[newComment,setNewComment]=useState('');
    const[commentAttachments,setCommentAttachments]=useState([]);
    const newCommentEditableRef=useRef(null);
    const[previewAttachment,setPreviewAttachment]=useState(null);
    const[collapsedGroups,setCollapsedGroups]=useState({});
    const commentFileRef=useRef(null);
    const attachmentFileRef=useRef(null);

    const actionTasks=tasks.filter(t=>t.actionId===action.id);
    const completedTasks=actionTasks.filter(t=>t.status==='completed').length;
    const progressPct=actionTasks.length>0?Math.round((completedTasks/actionTasks.length)*100):0;
    const category=categories?.find(c=>c.id===form.categoryId);
    const totalBudget=actionTasks.reduce((s,t)=>s+(t.budget||0),0);

    // Group tasks by trelloChecklistName
    const taskGroups=[];
    const groupMap={};
    actionTasks.forEach(t=>{
        const gName=t.trelloChecklistName||'Tasks';
        if(!groupMap[gName]){groupMap[gName]={name:gName,tasks:[]};taskGroups.push(groupMap[gName]);}
        groupMap[gName].tasks.push(t);
    });

    useEffect(()=>{
        if(descriptionEditing&&descEditableRef.current){
            const html=markdownToHtml(descriptionDraft);
            if(descEditableRef.current.innerHTML!==html)descEditableRef.current.innerHTML=html;
        }
    },[descriptionEditing]);

    const handleClose=()=>{
        // Save description from contentEditable
        let finalForm = form;
        if(descriptionEditing && descEditableRef.current){
            const md = htmlToMarkdown(descEditableRef.current.innerHTML);
            finalForm = {...form, description: md};
        } else {
            finalForm = {...form, description: descriptionDraft};
        }
        if(!isReadOnly)onUpdateAction(action.id,finalForm);
        onClose();
    };
    const handleDelete=()=>{if(onDeleteAction){onDeleteAction(action.id);onClose();}};
    const handleStatusChange=(taskId,newStatus)=>{onUpdateTask(taskId,{status:newStatus});};
    const addChannel=(id)=>setForm({...form,tags:[...(form.tags||[]),id]});
    const removeChannel=(id)=>setForm({...form,tags:(form.tags||[]).filter(c=>c!==id)});
    const addCountry=(id)=>setForm({...form,countries:[...(form.countries||[]),id]});
    const removeCountry=(id)=>setForm({...form,countries:(form.countries||[]).filter(c=>c!==id)});

    const saveDescription=()=>{
        if(descEditableRef.current){
            const md=htmlToMarkdown(descEditableRef.current.innerHTML);
            setDescriptionDraft(md);
            setForm({...form,description:md});
        }
        setDescriptionEditing(false);
    };

    const addComment=()=>{
        let text=newComment.trim();
        if(newCommentEditableRef.current){
            text=htmlToMarkdown(newCommentEditableRef.current.innerHTML).trim();
        }
        if(!text&&commentAttachments.length===0)return;
        const comment={
            id:`cmt${Date.now()}`,
            author:trelloUser?.fullName||'User',
            text,
            date:new Date().toISOString(),
            attachments:commentAttachments.length>0?[...commentAttachments]:undefined
        };
        const updatedForm={...form,comments:[...(form.comments||[]),comment]};
        if(commentAttachments.length>0){
            updatedForm.attachments=[...(form.attachments||[]),...commentAttachments.map(att=>({
                id:att.id||`att${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
                name:att.name,type:att.type,size:att.size,data:att.data,url:att.url,date:att.date
            }))];
        }
        setForm(updatedForm);
        setNewComment('');
        setCommentAttachments([]);
        if(newCommentEditableRef.current)newCommentEditableRef.current.innerHTML='';
    };

    const handleCommentFileSelect=(e)=>{
        const files=Array.from(e.target.files||[]);
        files.forEach(file=>{
            const reader=new FileReader();
            reader.onload=(ev)=>{
                setCommentAttachments(prev=>[...prev,{
                    id:`att${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
                    name:file.name,type:file.type,size:file.size,
                    data:ev.target.result,date:new Date().toISOString()
                }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value='';
    };

    const handleAttachmentFileSelect=(e)=>{
        const files=Array.from(e.target.files||[]);
        files.forEach(file=>{
            const reader=new FileReader();
            reader.onload=(ev)=>{
                setForm(prev=>({...prev,attachments:[...(prev.attachments||[]),{
                    id:`att${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
                    name:file.name,type:file.type,size:file.size,
                    data:ev.target.result,date:new Date().toISOString()
                }]}));
            };
            reader.readAsDataURL(file);
        });
        e.target.value='';
    };

    const removeAttachment=(attId)=>{
        setForm({...form,attachments:(form.attachments||[]).filter(a=>a.id!==attId)});
    };

    const toggleGroup=(name)=>{
        setCollapsedGroups(prev=>({...prev,[name]:!prev[name]}));
    };

    const sectionLabel={fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px'};
    const sectionCard={background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'};

    return(
        <div className="v11-modal-overlay" onClick={handleClose} style={{alignItems:'flex-start',paddingTop:64,overflowY:'auto'}}>
            <div className="v11-modal animate-slide-up" style={{maxWidth:640,marginBottom:32}} onClick={e=>e.stopPropagation()}>
                {/* Amber gradient bar — differentiates from task modals */}
                <div className="h-2 rounded-t-2xl" style={{background:'linear-gradient(to right, #f59e0b, #d97706)'}}/>
                <div className="p-6" style={{maxHeight:'calc(90vh - 80px)',overflowY:'auto'}}>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <span className="text-xs" style={{color:'#d97706',textTransform:'uppercase',letterSpacing:0.5,fontWeight:700}}>📁 ACTION</span>
                            <input type="text" value={form.name} onChange={e=>!isReadOnly&&setForm({...form,name:e.target.value})} className="v11-input" style={{fontSize:'1.25rem',fontWeight:700,marginTop:4}} readOnly={isReadOnly}/>
                        </div>
                        <button onClick={handleClose} className="ml-2 v11-icon-btn"><Icon.Close/></button>
                    </div>

                    {/* Details */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div style={{...sectionLabel,marginBottom:10}}>Details</div>
                        <div className="flex flex-wrap gap-3">
                            <div><label className="v11-label">Category</label><select value={form.categoryId} onChange={e=>!isReadOnly&&setForm({...form,categoryId:e.target.value})} className="v11-select" disabled={isReadOnly}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                            <div><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v=>setForm({...form,priority:v})} renderOption={o=><PriorityOption priority={o}/>} disabled={isReadOnly}/></div>
                            <div><label className="v11-label">Start</label><input type="date" value={form.startDate||''} onChange={e=>setForm({...form,startDate:e.target.value})} className="v11-input" readOnly={isReadOnly}/></div>
                            <div><label className="v11-label">End</label><input type="date" value={form.dueDate||''} onChange={e=>setForm({...form,dueDate:e.target.value})} className="v11-input" readOnly={isReadOnly}/></div>
                            <div><label className="v11-label">Budget €</label><input type="number" value={form.budget||0} onChange={e=>setForm({...form,budget:parseInt(e.target.value)||0})} className="v11-input" style={{width:96}} readOnly={isReadOnly}/></div>
                        </div>
                    </div>

                    {/* Summary — unique to actions */}
                    <div className="rounded-xl p-4 mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)'}}>
                        <div style={{...sectionLabel,marginBottom:10}}>Summary</div>
                        <div className="flex justify-between mb-3">
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>💰 Budget</span><p className="text-lg font-bold text-secondary">{totalBudget.toLocaleString()}€</p></div>
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>📊 Progress</span><p className="text-lg font-bold">{progressPct}%</p></div>
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>📋 Tasks</span><p className="text-lg font-bold">{completedTasks}/{actionTasks.length}</p></div>
                        </div>
                        <div className="v11-progress-bar" style={{height:12}}><div className={`v11-progress-fill ${progressPct>=70?'high':progressPct>=40?'medium':'low'}`} style={{width:`${progressPct}%`}}/></div>
                    </div>

                    {/* Tags & People */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div style={{...sectionLabel,marginBottom:10}}>Tags & People</div>
                        <div style={{marginBottom:10}}><label className="v11-label">🏷️ Channel Tags</label><ChannelTags channels={form.tags||[]} onAdd={addChannel} onRemove={removeChannel} editable={!isReadOnly}/></div>
                        <div style={{marginBottom:10}}><label className="v11-label">🌍 Country Tags</label><CountryTags countries={form.countries||[]} onAdd={addCountry} onRemove={removeCountry} allCountries={allCountries} onAddCustomCountry={onAddCustomCountry} editable={!isReadOnly}/></div>
                        {/* Members */}
                        {(isTrelloBoard || members.length > 0) && (
                            <div style={{marginBottom:10}}>
                                <label className="v11-label">👥 Members</label>
                                <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',position:'relative'}}>
                                    {(form.assignees||[]).map(id=>{
                                        const m=members.find(m=>m.id===id);
                                        if(!m)return null;
                                        return(
                                            <button key={m.id} onClick={()=>!isReadOnly&&setForm({...form,assignees:(form.assignees||[]).filter(aid=>aid!==m.id)})} title={isReadOnly?(m.fullName||m.username):`${m.fullName||m.username} — click to remove`} style={{width:30,height:30,borderRadius:'50%',border:'2px solid #d97706',cursor:isReadOnly?'default':'pointer',padding:0,background:'none',flexShrink:0,overflow:'hidden'}}>
                                                {m.avatarUrl?<img src={m.avatarUrl} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:<span style={{width:'100%',height:'100%',borderRadius:'50%',background:'#d97706',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                            </button>
                                        );
                                    })}
                                    {!isReadOnly&&<div style={{position:'relative'}}>
                                        <button onClick={()=>setShowMemberPicker(!showMemberPicker)} style={{width:30,height:30,borderRadius:'50%',border:'1px dashed var(--border-strong)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-secondary)',flexShrink:0}} title="Add member"><Icon.Plus size={12}/></button>
                                        {showMemberPicker&&(<>
                                            <div style={{position:'fixed',inset:0,zIndex:98}} onClick={()=>setShowMemberPicker(false)}/>
                                            <div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',zIndex:99,minWidth:180,padding:4,maxHeight:200,overflowY:'auto'}}>
                                                {members.filter(m=>!(form.assignees||[]).includes(m.id)).map(m=>(
                                                    <button key={m.id} onClick={()=>{setForm({...form,assignees:[...(form.assignees||[]),m.id]});setShowMemberPicker(false);}} style={{width:'100%',padding:'6px 10px',fontSize:12,color:'var(--text-primary)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                        {m.avatarUrl?<img src={m.avatarUrl} alt="" style={{width:22,height:22,borderRadius:'50%'}}/>:<span style={{width:22,height:22,borderRadius:'50%',background:'#d97706',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600,flexShrink:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                                        <span>{m.fullName||m.username}</span>
                                                    </button>
                                                ))}
                                                {members.filter(m=>!(form.assignees||[]).includes(m.id)).length===0&&<div style={{padding:'8px 10px',fontSize:12,color:'var(--text-muted)',textAlign:'center'}}>All members assigned</div>}
                                            </div>
                                        </>)}
                                    </div>}
                                    {(form.assignees||[]).length===0&&<span style={{fontSize:12,color:'var(--text-muted)',marginLeft:4}}>No members assigned</span>}
                                </div>
                            </div>
                        )}
                        {/* Other Labels */}
                        <div>
                            <label className="v11-label">🏷️ Other Labels</label>
                            <div style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}>
                                {(form.otherLabels||[]).map(label=>(
                                    <span key={label.id} style={{padding:'2px 8px',borderRadius:4,background:(label.color||'#64748b')+'20',color:label.color||'#64748b',fontSize:11,fontWeight:500,display:'inline-flex',alignItems:'center',gap:4}}>
                                        {label.name||'Label'}
                                        {!isReadOnly&&<button onClick={()=>setForm({...form,otherLabels:(form.otherLabels||[]).filter(l=>l.id!==label.id)})} style={{background:'none',border:'none',cursor:'pointer',color:'inherit',fontSize:10,padding:0,lineHeight:1}}>&times;</button>}
                                    </span>
                                ))}
                                {!isReadOnly&&<div style={{position:'relative'}}>
                                    <button onClick={()=>setShowAddOtherLabel(!showAddOtherLabel)} className="px-2 py-0.5 rounded-full text-xs flex items-center space-x-1" style={{background:'var(--bg-secondary)'}}><Icon.Plus/><span>Label</span></button>
                                    {showAddOtherLabel&&(<>
                                        <div style={{position:'fixed',inset:0,zIndex:98}} onClick={()=>{setShowAddOtherLabel(false);setShowCreateOtherLabel(false);}}/>
                                        <div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',zIndex:99,minWidth:180,padding:4,maxHeight:220,overflowY:'auto'}}>
                                            {availableOtherLabels.filter(l=>!(form.otherLabels||[]).some(fl=>fl.id===l.id)).map(label=>(
                                                <button key={label.id} onClick={()=>{setForm({...form,otherLabels:[...(form.otherLabels||[]),label]});setShowAddOtherLabel(false);}} style={{width:'100%',padding:'6px 10px',fontSize:12,color:'var(--text-primary)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                    <div style={{width:10,height:10,borderRadius:3,background:label.color||'#64748b',flexShrink:0}}/><span>{label.name||'Label'}</span>
                                                </button>
                                            ))}
                                            <div style={{borderTop:'1px solid var(--border)',marginTop:4,paddingTop:4}}>
                                                {!showCreateOtherLabel?(
                                                    <button onClick={()=>setShowCreateOtherLabel(true)} style={{width:'100%',padding:'6px 10px',fontSize:12,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:6}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}><Icon.Plus size={10}/> Create new label</button>
                                                ):(
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
                                    </>)}
                                </div>}
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div className="flex items-center justify-between mb-2">
                            <span style={sectionLabel}>📝 Description</span>
                            {!isReadOnly&&!descriptionEditing&&<button onClick={()=>setDescriptionEditing(true)} style={{fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:500}}>Edit</button>}
                            {!isReadOnly&&descriptionEditing&&<button onClick={saveDescription} style={{fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:500}}>Save</button>}
                        </div>
                        {descriptionEditing?(
                            <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',background:'var(--bg-primary)'}}>
                                <div style={{padding:'4px 8px',borderBottom:'1px solid var(--border)'}}>
                                    <WysiwygToolbar editableRef={descEditableRef}/>
                                </div>
                                <div ref={descEditableRef} contentEditable suppressContentEditableWarning style={{padding:'10px 12px',minHeight:80,fontSize:13,lineHeight:1.7,outline:'none',color:'var(--text-secondary)'}} onBlur={()=>{if(descEditableRef.current){const md=htmlToMarkdown(descEditableRef.current.innerHTML);setDescriptionDraft(md);setForm(f=>({...f,description:md}))}}}/>
                            </div>
                        ):(
                            <div onClick={()=>!isReadOnly&&setDescriptionEditing(true)} style={{cursor:isReadOnly?'default':'pointer',minHeight:32}}>
                                {descriptionDraft?<SimpleMarkdown text={descriptionDraft}/>:<p style={{fontSize:13,color:'var(--text-muted)',fontStyle:'italic'}}>{isReadOnly?'No description':'Click to add a description...'}</p>}
                            </div>
                        )}
                    </div>

                    {/* Tasks — grouped by checklist name */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div className="flex items-center justify-between mb-3">
                            <span style={sectionLabel}>📋 Tasks ({actionTasks.length})</span>
                            {!isReadOnly&&<button onClick={()=>onAddTask(action.id)} className="px-3 py-1 text-white rounded-lg text-xs flex items-center space-x-1" style={{background:'#d97706'}}><Icon.Plus/><span>Add</span></button>}
                        </div>
                        {taskGroups.length>0?taskGroups.map(group=>{
                            const groupCompleted=group.tasks.filter(t=>t.status==='completed').length;
                            const groupPct=group.tasks.length>0?Math.round((groupCompleted/group.tasks.length)*100):0;
                            const isCollapsed=collapsedGroups[group.name];
                            return(
                                <div key={group.name} className="mb-3">
                                    {/* Group header — shows checklist name */}
                                    <div onClick={()=>toggleGroup(group.name)} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'6px 0',borderBottom:'1px solid var(--border-light)',marginBottom:8}}>
                                        <span style={{fontSize:11,fontWeight:600,color:'var(--text-secondary)',flex:1}}>{group.name}</span>
                                        <span style={{fontSize:10,color:'var(--text-muted)'}}>{groupCompleted}/{group.tasks.length}</span>
                                        <div style={{width:60,height:4,borderRadius:2,background:'var(--border-light)',overflow:'hidden'}}>
                                            <div style={{width:`${groupPct}%`,height:'100%',borderRadius:2,background:groupPct>=70?'#22c55e':groupPct>=40?'#f59e0b':'#ef4444'}}/>
                                        </div>
                                        <span style={{fontSize:10,transform:isCollapsed?'rotate(-90deg)':'rotate(0)',transition:'transform 0.15s',color:'var(--text-muted)'}}>▼</span>
                                    </div>
                                    {!isCollapsed&&<div className="space-y-2">
                                        {group.tasks.map(task=>{
                                            const boardMembers=members||[];
                                            return(
                                                <div key={task.id} className="rounded-lg p-3" style={{background:'var(--bg-primary)',border:'1px solid var(--border-light)'}}>
                                                    <div className="flex items-center gap-3">
                                                        <IconSelect value={task.status} options={CONFIG.STATUSES} onChange={v=>handleStatusChange(task.id,v)} renderOption={o=><StatusOption status={o}/>} style={{minWidth:110,flexShrink:0}} disabled={isReadOnly}/>
                                                        <div className="flex-1 min-w-0" style={{cursor:'pointer'}} onClick={()=>onOpenTask(task)}>
                                                            <p className="font-medium text-sm truncate" style={{color:'var(--accent)',textDecoration:'none'}} onMouseEnter={e=>e.target.style.textDecoration='underline'} onMouseLeave={e=>e.target.style.textDecoration='none'}>{task.title}</p>
                                                            <p className="text-xs" style={{color:'var(--text-muted)'}}>📅 {task.startDate?new Date(task.startDate).toLocaleDateString('en-US',{day:'numeric',month:'short'}):'?'} → {task.dueDate?new Date(task.dueDate).toLocaleDateString('en-US',{day:'numeric',month:'short'}):'?'}</p>
                                                        </div>
                                                        <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                                                            {(task.assignees||[]).slice(0,2).map((mId,idx)=>{
                                                                const m=boardMembers.find(mb=>mb.id===mId);
                                                                if(!m)return null;
                                                                return m.avatarUrl
                                                                    ?<img key={mId} src={m.avatarUrl} alt={m.fullName||''} title={m.fullName||m.username} style={{width:20,height:20,borderRadius:'50%',border:'1.5px solid var(--bg-primary)',marginLeft:idx>0?-4:0}}/>
                                                                    :<span key={mId} title={m.fullName||m.username} style={{width:20,height:20,borderRadius:'50%',background:'#d97706',color:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:600,border:'1.5px solid var(--bg-primary)',marginLeft:idx>0?-4:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>;
                                                            })}
                                                            {(task.assignees||[]).length>2&&<span style={{fontSize:9,color:'var(--text-muted)'}}>+{task.assignees.length-2}</span>}
                                                            {task.budget>0&&<span className="text-xs font-semibold text-secondary">{task.budget}€</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>}
                                </div>
                            );
                        }):<p className="text-center py-4 text-sm" style={{color:'var(--text-muted)'}}>No tasks</p>}
                    </div>

                    {/* Comments */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div style={{...sectionLabel,marginBottom:10}}>💬 Comments ({(form.comments||[]).length})</div>
                        {(form.comments||[]).length>0&&<div className="space-y-3 mb-4">
                            {(form.comments||[]).slice().reverse().map(comment=>(
                                <div key={comment.id} style={{borderBottom:'1px solid var(--border-light)',paddingBottom:8}}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span style={{fontSize:11,fontWeight:600,color:'var(--text-primary)'}}>{comment.author}</span>
                                        <span style={{fontSize:10,color:'var(--text-muted)'}}>{comment.date?new Date(comment.date).toLocaleDateString('en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}</span>
                                    </div>
                                    <SimpleMarkdown text={comment.text}/>
                                    {comment.attachments?.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
                                        {comment.attachments.map(att=>(
                                            <a key={att.id||att.name} href={att.url||att.data||'#'} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--accent)',display:'flex',alignItems:'center',gap:3,padding:'2px 6px',background:'var(--bg-secondary)',borderRadius:4,textDecoration:'none'}}>📎 {att.name}</a>
                                        ))}
                                    </div>}
                                </div>
                            ))}
                        </div>}
                        {!isReadOnly&&<div>
                            <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',background:'var(--bg-primary)'}}>
                                <div style={{padding:'4px 8px',borderBottom:'1px solid var(--border)'}}>
                                    <WysiwygToolbar editableRef={newCommentEditableRef} onAttach={()=>commentFileRef.current?.click()}/>
                                </div>
                                <div ref={newCommentEditableRef} contentEditable suppressContentEditableWarning style={{padding:'8px 12px',minHeight:48,fontSize:13,outline:'none',color:'var(--text-secondary)'}} placeholder="Write a comment..."/>
                            </div>
                            <input ref={commentFileRef} type="file" multiple style={{display:'none'}} onChange={handleCommentFileSelect}/>
                            {commentAttachments.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>
                                {commentAttachments.map((att,i)=>(
                                    <span key={i} style={{fontSize:11,padding:'2px 6px',background:'var(--bg-secondary)',borderRadius:4,display:'flex',alignItems:'center',gap:3}}>📎 {att.name}<button onClick={()=>setCommentAttachments(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:'var(--text-muted)',padding:0}}>&times;</button></span>
                                ))}
                            </div>}
                            <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                                <button onClick={addComment} className="px-3 py-1 text-white rounded-lg text-xs font-medium" style={{background:'#d97706'}}>Comment</button>
                            </div>
                        </div>}
                    </div>

                    {/* Attachments */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div className="flex items-center justify-between mb-2">
                            <span style={sectionLabel}>📎 Attachments ({(form.attachments||[]).length})</span>
                            {!isReadOnly&&<button onClick={()=>attachmentFileRef.current?.click()} style={{fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:500}}>+ Add</button>}
                        </div>
                        <input ref={attachmentFileRef} type="file" multiple style={{display:'none'}} onChange={handleAttachmentFileSelect}/>
                        {(form.attachments||[]).length>0?<div className="space-y-2">
                            {(form.attachments||[]).map(att=>(
                                <div key={att.id||att.name} className="flex items-center justify-between p-2 rounded" style={{background:'var(--bg-primary)',border:'1px solid var(--border-light)'}}>
                                    <a href={att.url||att.data||'#'} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'var(--accent)',textDecoration:'none',display:'flex',alignItems:'center',gap:6,flex:1,minWidth:0}}>
                                        <span>📎</span><span className="truncate">{att.name}</span>
                                    </a>
                                    <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                                        {att.size&&<span style={{fontSize:10,color:'var(--text-muted)'}}>{(att.size/1024).toFixed(0)}KB</span>}
                                        {att.date&&<span style={{fontSize:10,color:'var(--text-muted)'}}>{new Date(att.date).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</span>}
                                        {!isReadOnly&&<button onClick={()=>removeAttachment(att.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:12,padding:2}}>&times;</button>}
                                    </div>
                                </div>
                            ))}
                        </div>:<p style={{fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>No attachments</p>}
                    </div>

                    {/* Delete confirmation */}
                    {showConfirmDelete&&(
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm font-medium text-red-800 mb-2">⚠️ Confirm deletion?</p>
                            <p className="text-xs text-red-600 mb-3">This action and its {actionTasks.length} task(s) will be permanently deleted.</p>
                            <div className="flex space-x-2">
                                <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">Confirm</button>
                                <button onClick={()=>setShowConfirmDelete(false)} className="v11-btn-secondary">Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4" style={{borderTop:'1px solid var(--border)'}}>
                        {!isReadOnly&&<button onClick={()=>setShowConfirmDelete(true)} className="px-4 py-2 text-accent-red hover:bg-red-50 rounded-lg text-sm flex items-center space-x-2"><Icon.Trash/><span>Delete</span></button>}
                        {isReadOnly&&<span style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>Read-only (guest mode)</span>}
                        <button onClick={handleClose} className="px-6 py-2 text-white rounded-lg text-sm font-medium" style={{background:'#d97706'}}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActionDetailModal;
