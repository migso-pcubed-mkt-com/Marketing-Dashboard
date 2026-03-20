import { useState, useRef, useEffect } from 'react';
import { CONFIG } from '../config.js';
import { markdownToHtml, htmlToMarkdown, WysiwygToolbar, SimpleMarkdown } from '../lib/markdown.jsx';
import { useApp } from '../context.js';
import { Icon, StatusIcon, PriorityIcon, StatusOption, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';
import CountryTags from './CountryTags.jsx';

const ActionDetailModal=({categories,action,tasks,onClose,onUpdateAction,onUpdateTask,onOpenTask,onAddTask,onDeleteAction,members=[],allCountries,onAddCustomCountry,availableOtherLabels=[],isTrelloBoard=false,isReadOnly=false,onRenameChecklistGroup,onAddTaskInGroup,onDeleteTask})=>{
    const { trelloUser } = useApp();
    const[form,setForm]=useState({...action, comments: action.comments || [], attachments: action.attachments || []});
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
    const[editingGroupName,setEditingGroupName]=useState(null);
    const[editingGroupValue,setEditingGroupValue]=useState('');
    const[showAddGroup,setShowAddGroup]=useState(false);
    const[newGroupName,setNewGroupName]=useState('');
    const[addingTaskGroup,setAddingTaskGroup]=useState(null);
    const[newTaskTitle,setNewTaskTitle]=useState('');
    const[addTaskPickerGroup,setAddTaskPickerGroup]=useState(null);
    const[pendingGroups,setPendingGroups]=useState([]);
    const commentFileRef=useRef(null);
    const attachmentFileRef=useRef(null);
    // Drag state for groups and tasks
    const[dragGroupName,setDragGroupName]=useState(null);
    const[dragTaskId,setDragTaskId]=useState(null);
    const[dragOverGroup,setDragOverGroup]=useState(null);
    const[dragOverTaskId,setDragOverTaskId]=useState(null);
    const[dragOverTaskPos,setDragOverTaskPos]=useState(null);
    // Inline member picker per task
    const[taskMemberPicker,setTaskMemberPicker]=useState(null);

    const actionTasks=tasks.filter(t=>t.actionId===action.id);
    const completedTasks=actionTasks.filter(t=>t.status==='completed').length;
    const progressPct=actionTasks.length>0?Math.round((completedTasks/actionTasks.length)*100):0;
    const category=categories?.find(c=>c.id===form.categoryId);
    const totalBudget=(form.budget||0)+actionTasks.reduce((s,t)=>s+(t.budget||0),0);

    // Group tasks by trelloChecklistName
    const taskGroups=[];
    const groupMap={};
    actionTasks.forEach(t=>{
        const gName=t.trelloChecklistName||'Tasks';
        if(!groupMap[gName]){groupMap[gName]={name:gName,tasks:[]};taskGroups.push(groupMap[gName]);}
        groupMap[gName].tasks.push(t);
    });
    // Sort tasks within each group by order
    taskGroups.forEach(g=>g.tasks.sort((a,b)=>(a.order||0)-(b.order||0)));
    // Include pending (empty) groups that have no tasks yet
    pendingGroups.forEach(gName=>{
        if(!groupMap[gName]){taskGroups.push({name:gName,tasks:[]});}
    });

    // Re-sync comments/attachments when action prop updates (e.g. after Trello sync)
    useEffect(()=>{
        setForm(prev=>({
            ...prev,
            comments: action.comments || [],
            attachments: action.attachments || []
        }));
    },[action.comments, action.attachments]);

    useEffect(()=>{
        if(descriptionEditing&&descEditableRef.current){
            const html=markdownToHtml(descriptionDraft);
            if(descEditableRef.current.innerHTML!==html)descEditableRef.current.innerHTML=html;
        }
    },[descriptionEditing]);

    const handleClose=()=>{
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

    const modalScrollRef=useRef(null);

    // Restore scroll position when reopening from task view
    useEffect(()=>{
        const saved=sessionStorage.getItem(`action_scroll_${action.id}`);
        if(saved&&modalScrollRef.current){
            setTimeout(()=>{if(modalScrollRef.current)modalScrollRef.current.scrollTop=parseInt(saved,10);},50);
            sessionStorage.removeItem(`action_scroll_${action.id}`);
        }
    },[action.id]);

    const handleOpenTask=(task)=>{
        if(modalScrollRef.current){
            sessionStorage.setItem(`action_scroll_${action.id}`,String(modalScrollRef.current.scrollTop));
        }
        onOpenTask(task);
    };

    // Keyboard shortcuts: Delete key for delete, Escape to close (context-aware)
    useEffect(()=>{
        const handleKeyDown=(e)=>{
            if(e.key==='Escape'){
                e.preventDefault();
                // Close sub-forms/popups first before closing the modal
                if(showConfirmDelete){setShowConfirmDelete(false);return;}
                if(descriptionEditing){setDescriptionEditing(false);return;}
                if(editingGroupName){setEditingGroupName(null);return;}
                if(showAddGroup){setShowAddGroup(false);setNewGroupName('');return;}
                if(addingTaskGroup){setAddingTaskGroup(null);setNewTaskTitle('');return;}
                if(addTaskPickerGroup){setAddTaskPickerGroup(null);return;}
                handleClose();
                return;
            }
            if(e.key==='Delete'&&!isReadOnly&&!descriptionEditing&&!editingGroupName&&!addingTaskGroup&&!showAddGroup){
                e.preventDefault();
                if(!showConfirmDelete)setShowConfirmDelete(true);
                else handleDelete();
            }
        };
        window.addEventListener('keydown',handleKeyDown);
        return()=>window.removeEventListener('keydown',handleKeyDown);
    },[isReadOnly,descriptionEditing,editingGroupName,addingTaskGroup,showAddGroup,showConfirmDelete,addTaskPickerGroup]);

    // Group drag-and-drop handlers
    const handleGroupDragStart=(e,groupName)=>{
        e.dataTransfer.setData('groupDrag','true');
        setDragGroupName(groupName);
    };
    const handleGroupDragOver=(e,groupName)=>{
        if(!dragGroupName&&!dragTaskId)return;
        e.preventDefault();
        setDragOverGroup(groupName);
    };
    const handleGroupDrop=(e,targetGroupName)=>{
        e.preventDefault();
        // Handle task dropped on group area (move task to this group)
        if(dragTaskId&&!dragGroupName){
            const srcTask=actionTasks.find(t=>t.id===dragTaskId);
            if(srcTask){
                const targetGroup=taskGroups.find(g=>g.name===targetGroupName);
                const updates={};
                const currentGroup=srcTask.trelloChecklistName||'Tasks';
                if(currentGroup!==targetGroupName){
                    updates.trelloChecklistName=targetGroupName;
                }
                // Append task to end of target group with proper order
                const targetTasks=targetGroup?targetGroup.tasks.filter(t=>t.id!==dragTaskId):[];
                const maxOrder=targetTasks.reduce((m,t)=>Math.max(m,t.order||0),0);
                updates.order=maxOrder+1;
                onUpdateTask(dragTaskId,updates);
            }
            setDragTaskId(null);
            setDragOverTaskId(null);
            setDragOverTaskPos(null);
            return;
        }
        if(dragGroupName&&dragGroupName!==targetGroupName&&taskGroups.length>1){
            // Reorder groups by reordering tasks' order field
            const srcIdx=taskGroups.findIndex(g=>g.name===dragGroupName);
            const tgtIdx=taskGroups.findIndex(g=>g.name===targetGroupName);
            if(srcIdx>=0&&tgtIdx>=0){
                const reordered=[...taskGroups];
                const [moved]=reordered.splice(srcIdx,1);
                reordered.splice(tgtIdx,0,moved);
                let order=0;
                for(const group of reordered){
                    for(const task of group.tasks){
                        onUpdateTask(task.id,{order:order++});
                    }
                }
            }
        }
        setDragGroupName(null);
        setDragOverGroup(null);
    };

    // Task drag within groups
    const handleTaskDragStart=(e,taskId)=>{
        e.stopPropagation();
        e.dataTransfer.setData('taskDragInGroup','true');
        setDragTaskId(taskId);
    };
    const handleTaskDragOver=(e,taskId)=>{
        if(!dragTaskId||dragTaskId===taskId)return;
        e.preventDefault();
        e.stopPropagation();
        const rect=e.currentTarget.getBoundingClientRect();
        const mid=rect.top+rect.height/2;
        setDragOverTaskId(taskId);
        setDragOverTaskPos(e.clientY<mid?'before':'after');
    };
    const handleTaskDrop=(e,targetTaskId,groupName)=>{
        e.preventDefault();
        e.stopPropagation();
        if(!dragTaskId||dragTaskId===targetTaskId)return;
        const group=taskGroups.find(g=>g.name===groupName);
        if(!group)return;
        const srcTask=actionTasks.find(t=>t.id===dragTaskId);
        if(!srcTask)return;
        // Move task to this group if different
        const updates={};
        if((srcTask.trelloChecklistName||'Tasks')!==groupName){
            updates.trelloChecklistName=groupName;
        }
        // Reorder within group
        const groupTasks=[...group.tasks];
        const srcInGroup=groupTasks.findIndex(t=>t.id===dragTaskId);
        if(srcInGroup>=0)groupTasks.splice(srcInGroup,1);
        const tgtIdx=groupTasks.findIndex(t=>t.id===targetTaskId);
        if(tgtIdx>=0){
            groupTasks.splice(dragOverTaskPos==='before'?tgtIdx:tgtIdx+1,0,srcTask);
        }else{
            groupTasks.push(srcTask);
        }
        groupTasks.forEach((t,i)=>{
            if(t.id===dragTaskId){
                onUpdateTask(t.id,{...updates,order:i});
            }else{
                onUpdateTask(t.id,{order:i});
            }
        });
        setDragTaskId(null);
        setDragOverTaskId(null);
        setDragOverTaskPos(null);
    };

    // Handle "Add task" with group picker when multiple groups exist
    const handleAddTaskClick=()=>{
        if(taskGroups.length>1){
            setAddTaskPickerGroup('__picker__');
        }else if(taskGroups.length===1){
            setAddingTaskGroup(taskGroups[0].name);
        }else{
            // No tasks yet — create first group
            setShowAddGroup(true);
        }
    };

    const sectionLabel={fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px'};
    const sectionCard={background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'};

    return(
        <div className="v11-modal-overlay" onClick={handleClose} style={{alignItems:'flex-start',paddingTop:64,overflowY:'auto'}}>
            <div className="v11-modal animate-slide-up" style={{maxWidth:640,marginBottom:32}} onClick={e=>e.stopPropagation()}>
                {/* Amber gradient bar */}
                <div className="h-2 rounded-t-2xl" style={{background:'linear-gradient(to right, #f59e0b, #d97706)'}}/>
                <div ref={modalScrollRef} className="p-6" style={{maxHeight:'calc(90vh - 80px)',overflowY:'auto'}}>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <span className="text-xs" style={{color:'#d97706',textTransform:'uppercase',letterSpacing:0.5,fontWeight:700}}>📁 ACTION</span>
                            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
                                <button onClick={()=>{if(!isReadOnly)setForm({...form,status:form.status==='completed'?'inprogress':'completed'});}} style={{width:24,height:24,borderRadius:'50%',border:form.status==='completed'?'2px solid #22c55e':'2px solid var(--border-strong)',background:form.status==='completed'?'#22c55e':'transparent',cursor:isReadOnly?'default':'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',padding:0}} title={form.status==='completed'?'Mark incomplete':'Mark complete'}>{form.status==='completed'&&<svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button>
                                <input type="text" value={form.name} onChange={e=>!isReadOnly&&setForm({...form,name:e.target.value})} className="v11-input" style={{fontSize:'1.25rem',fontWeight:700,textDecoration:form.status==='completed'?'line-through':'none'}} readOnly={isReadOnly}/>
                            </div>
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

                    {/* Summary */}
                    <div className="rounded-xl p-4 mb-5" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)'}}>
                        <div style={{...sectionLabel,marginBottom:10}}>Summary</div>
                        <div className="flex justify-between mb-3">
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>Budget</span><p className="text-lg font-bold text-secondary">{totalBudget.toLocaleString()}€</p></div>
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>Progress</span><p className="text-lg font-bold">{progressPct}%</p></div>
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>Tasks</span><p className="text-lg font-bold">{completedTasks}/{actionTasks.length}</p></div>
                        </div>
                        <div className="v11-progress-bar" style={{height:12}}><div className={`v11-progress-fill ${progressPct>=70?'high':progressPct>=40?'medium':'low'}`} style={{width:`${progressPct}%`}}/></div>
                    </div>

                    {/* Tags & People */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div style={{...sectionLabel,marginBottom:10}}>Tags & People</div>
                        <div style={{marginBottom:10}}><label className="v11-label">Channel Tags</label><ChannelTags channels={form.tags||[]} onAdd={addChannel} onRemove={removeChannel} editable={!isReadOnly}/></div>
                        <div style={{marginBottom:10}}><label className="v11-label">Country Tags</label><CountryTags countries={form.countries||[]} onAdd={addCountry} onRemove={removeCountry} allCountries={allCountries} onAddCustomCountry={onAddCustomCountry} editable={!isReadOnly}/></div>
                        {/* Members */}
                        {(isTrelloBoard || members.length > 0) && (
                            <div style={{marginBottom:10}}>
                                <label className="v11-label">Members</label>
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
                            <label className="v11-label">Other Labels</label>
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
                            {descriptionDraft&&!descriptionEditing&&!isReadOnly&&<button onClick={()=>{setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML=markdownToHtml(descriptionDraft);descEditableRef.current.focus();}},0);}} style={{fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:500}}>Edit</button>}
                        </div>
                        <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',background:'var(--bg-primary)',padding:12}}>
                        {descriptionEditing?(
                            <div>
                                <WysiwygToolbar editableRef={descEditableRef}/>
                                <div ref={descEditableRef} contentEditable suppressContentEditableWarning style={{minHeight:80,maxHeight:400,overflowY:'auto',width:'100%',lineHeight:1.7,outline:'none',whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:13,color:'var(--text-secondary)'}} onBlur={()=>{if(descEditableRef.current){const md=htmlToMarkdown(descEditableRef.current.innerHTML);setDescriptionDraft(md);setForm(f=>({...f,description:md}))}}}/>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={()=>{const md=htmlToMarkdown(descEditableRef.current?.innerHTML||'');setDescriptionDraft(md);setForm(f=>({...f,description:md}));setDescriptionEditing(false);}} className="px-4 py-1.5 text-white rounded-lg text-sm" style={{background:'#d97706'}}>Save</button>
                                    <button onClick={()=>{setDescriptionEditing(false);}} className="px-4 py-1.5 rounded-lg text-sm" style={{border:'1px solid var(--border)'}}>Cancel</button>
                                </div>
                            </div>
                        ):!descriptionDraft&&!isReadOnly?(
                            <div onClick={()=>{setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML='';descEditableRef.current.focus();}},0);}} style={{cursor:'text',minHeight:40,color:'var(--text-muted)',fontSize:13}}>Add a description...</div>
                        ):(
                            <div onClick={()=>{if(isReadOnly)return;setDescriptionEditing(true);setTimeout(()=>{if(descEditableRef.current){descEditableRef.current.innerHTML=markdownToHtml(descriptionDraft);descEditableRef.current.focus();}},0);}} style={{cursor:isReadOnly?'default':'pointer'}}>
                                {descriptionDraft?<SimpleMarkdown text={descriptionDraft}/>:<p style={{fontSize:13,color:'var(--text-muted)',fontStyle:'italic'}}>No description</p>}
                            </div>
                        )}
                        </div>
                    </div>

                    {/* Tasks — grouped by checklist name */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div className="flex items-center justify-between mb-3">
                            <span style={sectionLabel}>Tasks ({actionTasks.length})</span>
                            <div style={{display:'flex',gap:6}}>
                                {!isReadOnly&&<button onClick={()=>setShowAddGroup(true)} className="px-3 py-1 rounded-lg text-xs flex items-center space-x-1" style={{background:'var(--bg-primary)',border:'1px solid var(--border)',color:'var(--text-secondary)'}}><Icon.Plus size={10}/><span>Task group</span></button>}
                            </div>
                        </div>
                        {/* Group picker for "Add task" when multiple groups exist */}
                        {addTaskPickerGroup==='__picker__'&&!isReadOnly&&<div style={{marginBottom:8,padding:8,background:'var(--bg-primary)',borderRadius:6,border:'1px solid var(--border)'}}>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:6}}>Select task group:</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                                {taskGroups.map(g=>(
                                    <button key={g.name} onClick={()=>{setAddTaskPickerGroup(null);setAddingTaskGroup(g.name);}} style={{padding:'4px 10px',borderRadius:4,background:'var(--bg-secondary)',border:'1px solid var(--border)',cursor:'pointer',fontSize:11,color:'var(--text-secondary)'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#d97706'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>{g.name}</button>
                                ))}
                                <button onClick={()=>{setAddTaskPickerGroup(null);setShowAddGroup(true);}} style={{padding:'4px 10px',borderRadius:4,background:'none',border:'1px dashed var(--border)',cursor:'pointer',fontSize:11,color:'var(--accent)',display:'flex',alignItems:'center',gap:3}}><Icon.Plus size={9}/> New task group</button>
                            </div>
                        </div>}
                        {showAddGroup&&!isReadOnly&&<div style={{marginBottom:8,display:'flex',gap:4,alignItems:'center'}}>
                            <input type="text" value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="New task group name..." autoFocus onKeyDown={e=>{if(e.key==='Enter'&&newGroupName.trim()){const gn=newGroupName.trim();if(onRenameChecklistGroup)onRenameChecklistGroup(null,gn);setPendingGroups(prev=>[...prev,gn]);setNewGroupName('');setShowAddGroup(false);setAddingTaskGroup(gn);}if(e.key==='Escape'){setShowAddGroup(false);setNewGroupName('');}}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'1px solid var(--border)',fontSize:12}}/>
                            <button onClick={()=>{if(newGroupName.trim()){const gn=newGroupName.trim();if(onRenameChecklistGroup)onRenameChecklistGroup(null,gn);setPendingGroups(prev=>[...prev,gn]);setNewGroupName('');setShowAddGroup(false);setAddingTaskGroup(gn);}}} style={{padding:'4px 10px',borderRadius:4,background:'#d97706',color:'white',border:'none',cursor:'pointer',fontSize:11}}>Create</button>
                            <button onClick={()=>{setShowAddGroup(false);setNewGroupName('');}} style={{padding:'4px 10px',borderRadius:4,background:'var(--bg-secondary)',border:'1px solid var(--border)',cursor:'pointer',fontSize:11}}>Cancel</button>
                        </div>}
                        {taskGroups.length>0?taskGroups.map(group=>{
                            const groupCompleted=group.tasks.filter(t=>t.status==='completed').length;
                            const groupPct=group.tasks.length>0?Math.round((groupCompleted/group.tasks.length)*100):0;
                            const isCollapsed=collapsedGroups[group.name];
                            return(
                                <div key={group.name} className="mb-3"
                                    onDragOver={e=>handleGroupDragOver(e,group.name)}
                                    onDrop={e=>handleGroupDrop(e,group.name)}
                                    style={{opacity:dragGroupName===group.name?0.5:1,borderTop:dragOverGroup===group.name&&dragGroupName?'2px solid #d97706':'2px solid transparent'}}>
                                    {/* Group header — draggable for group reorder */}
                                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid var(--border-light)',marginBottom:8}}
                                        draggable={!isReadOnly&&taskGroups.length>1}
                                        onDragStart={e=>handleGroupDragStart(e,group.name)}
                                        onDragEnd={()=>{setDragGroupName(null);setDragOverGroup(null);}}>
                                        {!isReadOnly&&taskGroups.length>1&&<span style={{cursor:'grab',opacity:0.4,fontSize:10}}>⋮⋮</span>}
                                        {editingGroupName===group.name&&!isReadOnly?(
                                            <input type="text" value={editingGroupValue} onChange={e=>setEditingGroupValue(e.target.value)} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&editingGroupValue.trim()){if(onRenameChecklistGroup)onRenameChecklistGroup(group.name,editingGroupValue.trim());setEditingGroupName(null);}if(e.key==='Escape')setEditingGroupName(null);}} onBlur={()=>{if(editingGroupValue.trim()&&editingGroupValue!==group.name&&onRenameChecklistGroup)onRenameChecklistGroup(group.name,editingGroupValue.trim());setEditingGroupName(null);}} style={{flex:1,padding:'2px 6px',borderRadius:4,border:'1px solid var(--accent)',fontSize:11,fontWeight:600,outline:'none'}}/>
                                        ):(
                                            <span onClick={()=>{if(!isReadOnly){setEditingGroupName(group.name);setEditingGroupValue(group.name);}else toggleGroup(group.name);}} style={{fontSize:11,fontWeight:600,color:'var(--text-secondary)',flex:1,cursor:'pointer'}} title={isReadOnly?'':'Click to rename'}>{group.name}</span>
                                        )}
                                        <span style={{fontSize:10,color:'var(--text-muted)'}}>{groupCompleted}/{group.tasks.length}</span>
                                        <div style={{width:60,height:4,borderRadius:2,background:'var(--border-light)',overflow:'hidden'}}>
                                            <div style={{width:`${groupPct}%`,height:'100%',borderRadius:2,background:groupPct>=70?'#22c55e':groupPct>=40?'#f59e0b':'#ef4444'}}/>
                                        </div>
                                        <span onClick={()=>toggleGroup(group.name)} style={{fontSize:10,transform:isCollapsed?'rotate(-90deg)':'rotate(0)',transition:'transform 0.15s',color:'var(--text-muted)',cursor:'pointer'}}>▼</span>
                                    </div>
                                    {!isCollapsed&&<div className="space-y-2">
                                        {group.tasks.map(task=>{
                                            const boardMembers=members||[];
                                            return(
                                                <div key={task.id} className="rounded-lg p-3" style={{background:'var(--bg-primary)',border:'1px solid var(--border-light)',borderTop:dragOverTaskId===task.id&&dragOverTaskPos==='before'?'2px solid #d97706':undefined,borderBottom:dragOverTaskId===task.id&&dragOverTaskPos==='after'?'2px solid #d97706':undefined,cursor:'default'}}
                                                    draggable={!isReadOnly}
                                                    onDragStart={e=>handleTaskDragStart(e,task.id)}
                                                    onDragOver={e=>handleTaskDragOver(e,task.id)}
                                                    onDrop={e=>handleTaskDrop(e,task.id,group.name)}
                                                    onDragEnd={()=>{setDragTaskId(null);setDragOverTaskId(null);setDragOverTaskPos(null);}}>
                                                    <div className="flex items-center gap-3">
                                                        {!isReadOnly&&<span style={{cursor:'grab',opacity:0.3,fontSize:10,flexShrink:0}}>⋮⋮</span>}
                                                        <IconSelect value={task.status} options={CONFIG.STATUSES} onChange={v=>handleStatusChange(task.id,v)} renderOption={o=><StatusOption status={o}/>} style={{minWidth:110,flexShrink:0}} disabled={isReadOnly}/>
                                                        <div className="flex-1 min-w-0" style={{cursor:'pointer'}} onClick={()=>handleOpenTask(task)}>
                                                            <p className="font-medium text-sm truncate" style={{color:task.status==='completed'?'var(--text-muted)':'var(--accent)',textDecoration:task.status==='completed'?'line-through':'none'}} onMouseEnter={e=>{if(task.status!=='completed')e.target.style.textDecoration='underline';}} onMouseLeave={e=>{e.target.style.textDecoration=task.status==='completed'?'line-through':'none';}}>{task.title}</p>
                                                        </div>
                                                        <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                                                            {/* Inline due date — click opens calendar directly */}
                                                            <label onClick={e=>e.stopPropagation()} style={{position:'relative',padding:'2px 6px',borderRadius:4,border:'1px solid '+(task.dueDate?'var(--accent)':'var(--border)'),background:task.dueDate?'var(--accent-light)':'transparent',cursor:isReadOnly?'default':'pointer',fontSize:10,color:task.dueDate&&new Date(task.dueDate)<new Date()&&task.status!=='completed'?'#ef4444':task.dueDate?'var(--accent)':'var(--text-muted)',display:'flex',alignItems:'center',gap:3,whiteSpace:'nowrap'}} title={task.dueDate?`Due: ${task.dueDate}`:'Set due date'}>
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                                                {task.dueDate?new Date(task.dueDate+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short'}):'No date'}
                                                                {!isReadOnly&&<input type="date" value={task.dueDate||''} onChange={e=>onUpdateTask(task.id,{dueDate:e.target.value})} onClick={e=>{e.target.showPicker?.();}} style={{position:'absolute',opacity:0,width:0,height:0,overflow:'hidden'}}/>}
                                                            </label>
                                                            {/* Inline member avatars + picker */}
                                                            {(task.assignees||[]).slice(0,2).map((mId,idx)=>{
                                                                const m=boardMembers.find(mb=>mb.id===mId);
                                                                if(!m)return null;
                                                                return m.avatarUrl
                                                                    ?<img key={mId} src={m.avatarUrl} alt={m.fullName||''} title={m.fullName||m.username} style={{width:20,height:20,borderRadius:'50%',border:'1.5px solid var(--bg-primary)',marginLeft:idx>0?-4:0}}/>
                                                                    :<span key={mId} title={m.fullName||m.username} style={{width:20,height:20,borderRadius:'50%',background:'#d97706',color:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:600,border:'1.5px solid var(--bg-primary)',marginLeft:idx>0?-4:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>;
                                                            })}
                                                            {(task.assignees||[]).length>2&&<span style={{fontSize:9,color:'var(--text-muted)'}}>+{task.assignees.length-2}</span>}
                                                            {!isReadOnly&&members.length>0&&<div style={{position:'relative'}}>
                                                                <button onClick={e=>{e.stopPropagation();setTaskMemberPicker(taskMemberPicker===task.id?null:task.id);}} style={{width:18,height:18,borderRadius:'50%',border:'1px dashed var(--border-strong)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-secondary)',flexShrink:0,padding:0}} title="Assign member"><Icon.Plus size={8}/></button>
                                                                {taskMemberPicker===task.id&&(<>
                                                                    <div style={{position:'fixed',inset:0,zIndex:98}} onClick={()=>setTaskMemberPicker(null)}/>
                                                                    <div style={{position:'absolute',top:'100%',right:0,marginTop:4,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',zIndex:99,minWidth:160,padding:4,maxHeight:180,overflowY:'auto'}}>
                                                                        {members.filter(m=>!(task.assignees||[]).includes(m.id)).map(m=>(
                                                                            <button key={m.id} onClick={e=>{e.stopPropagation();onUpdateTask(task.id,{assignees:[...(task.assignees||[]),m.id]});setTaskMemberPicker(null);}} style={{width:'100%',padding:'5px 8px',fontSize:11,color:'var(--text-primary)',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:6}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                                                {m.avatarUrl?<img src={m.avatarUrl} alt="" style={{width:18,height:18,borderRadius:'50%'}}/>:<span style={{width:18,height:18,borderRadius:'50%',background:'#d97706',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600,flexShrink:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                                                                <span>{m.fullName||m.username}</span>
                                                                            </button>
                                                                        ))}
                                                                        {(task.assignees||[]).length>0&&<>
                                                                            <div style={{borderTop:'1px solid var(--border)',marginTop:2,paddingTop:2}}/>
                                                                            {(task.assignees||[]).map(mId=>{
                                                                                const m=members.find(mb=>mb.id===mId);
                                                                                if(!m)return null;
                                                                                return <button key={mId} onClick={e=>{e.stopPropagation();onUpdateTask(task.id,{assignees:(task.assignees||[]).filter(a=>a!==mId)});}} style={{width:'100%',padding:'5px 8px',fontSize:11,color:'#ef4444',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',gap:6}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                                                                    {m.avatarUrl?<img src={m.avatarUrl} alt="" style={{width:18,height:18,borderRadius:'50%',opacity:0.6}}/>:<span style={{width:18,height:18,borderRadius:'50%',background:'#d97706',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600,flexShrink:0,opacity:0.6}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                                                                    <span style={{textDecoration:'line-through'}}>{m.fullName||m.username}</span>
                                                                                </button>;
                                                                            })}
                                                                        </>}
                                                                    </div>
                                                                </>)}
                                                            </div>}
                                                            {task.budget>0&&<span className="text-xs font-semibold text-secondary">{task.budget}€</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {/* Add task within this group */}
                                        {!isReadOnly&&(addingTaskGroup===group.name?(
                                            <div style={{display:'flex',gap:4,alignItems:'center',padding:'4px 0'}}>
                                                <Icon.Plus size={10} style={{color:'var(--text-muted)',flexShrink:0}}/>
                                                <input type="text" value={newTaskTitle} onChange={e=>setNewTaskTitle(e.target.value)} placeholder="Task name..." autoFocus onKeyDown={e=>{if(e.key==='Enter'&&newTaskTitle.trim()){if(onAddTaskInGroup)onAddTaskInGroup(action.id,group.name,newTaskTitle.trim());setNewTaskTitle('');/* Keep input open for quick multiple adds */}if(e.key==='Escape'){setAddingTaskGroup(null);setNewTaskTitle('');}}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'1px solid var(--border)',fontSize:12}}/>
                                                <button onClick={()=>{if(newTaskTitle.trim()&&onAddTaskInGroup){onAddTaskInGroup(action.id,group.name,newTaskTitle.trim());setNewTaskTitle('');}}} style={{padding:'3px 8px',borderRadius:4,background:'#d97706',color:'white',border:'none',cursor:'pointer',fontSize:11}}>Add</button>
                                                <button onClick={()=>{setAddingTaskGroup(null);setNewTaskTitle('');}} style={{padding:'3px 8px',borderRadius:4,background:'var(--bg-secondary)',border:'1px solid var(--border)',cursor:'pointer',fontSize:11}}>Done</button>
                                            </div>
                                        ):(
                                            <button onClick={()=>setAddingTaskGroup(group.name)} style={{width:'100%',padding:'6px 8px',fontSize:11,color:'var(--text-muted)',background:'none',border:'1px dashed var(--border-light)',borderRadius:6,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:4}} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-light)'}><Icon.Plus size={10}/> New task</button>
                                        ))}
                                    </div>}
                                </div>
                            );
                        }):<p className="text-center py-4 text-sm" style={{color:'var(--text-muted)'}}>No tasks yet. Create a task group to get started.</p>}
                    </div>

                    {/* Comments */}
                    <div className="rounded-xl mb-5" style={sectionCard}>
                        <div style={{...sectionLabel,marginBottom:10}}>💬 Comments ({(form.comments||[]).length})</div>
                        {(form.comments||[]).length>0&&<div className="space-y-2 mb-4">
                            {(form.comments||[]).slice().sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).map((comment,idx)=>(
                                <div key={comment.id||idx} className="p-3 rounded-lg" style={{background:'var(--bg-primary)',border:'1px solid var(--border)'}}>
                                    <div className="flex justify-between mb-2">
                                        <span className="font-medium text-sm">{comment.author}</span>
                                        <span className="text-xs" style={{color:'var(--text-muted)'}}>{comment.date?new Date(comment.date).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}):''}</span>
                                    </div>
                                    <div style={{fontSize:13,color:'var(--text-secondary)'}}><SimpleMarkdown text={comment.text}/></div>
                                    {comment.attachments?.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
                                        {comment.attachments.map(att=>(
                                            <a key={att.id||att.name} href={att.url||att.data||'#'} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--accent)',display:'flex',alignItems:'center',gap:3,padding:'2px 6px',borderRadius:4,background:'var(--accent-light)',textDecoration:'none'}}>📎 {att.name}</a>
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
                            <span style={sectionLabel}>Attachments ({(form.attachments||[]).length})</span>
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

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4" style={{borderTop:'1px solid var(--border)'}}>
                        {!isReadOnly&&<button onClick={()=>setShowConfirmDelete(true)} className="px-4 py-2 text-accent-red hover:bg-red-50 rounded-lg text-sm flex items-center space-x-2"><Icon.Trash/><span>Delete</span></button>}
                        {isReadOnly&&<span style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>Read-only (guest mode)</span>}
                        <button onClick={handleClose} className="px-6 py-2 text-white rounded-lg text-sm font-medium" style={{background:'#d97706'}}>Close</button>
                    </div>
                </div>
            </div>
            {/* Delete confirmation popup */}
            {showConfirmDelete&&(
                <div onClick={()=>setShowConfirmDelete(false)} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <div onClick={e=>e.stopPropagation()} className="animate-slide-up" style={{background:'var(--bg-primary)',borderRadius:'var(--radius-lg)',padding:24,maxWidth:400,width:'90%',boxShadow:'var(--shadow-lg)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                            <div style={{width:36,height:36,borderRadius:'50%',background:'#fef2f2',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon.Trash size={16} style={{color:'#ef4444'}}/></div>
                            <h3 style={{fontSize:16,fontWeight:700,color:'var(--text-primary)'}}>Delete action?</h3>
                        </div>
                        <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16,lineHeight:1.6}}>
                            The action <strong>"{form.name}"</strong> and its <strong>{actionTasks.length} task(s)</strong> will be permanently deleted. This cannot be undone.
                        </p>
                        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                            <button onClick={()=>setShowConfirmDelete(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',cursor:'pointer'}}>Cancel</button>
                            <button onClick={handleDelete} className="px-4 py-2 rounded-lg text-sm font-medium" style={{background:'#ef4444',color:'white',border:'none',cursor:'pointer'}}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActionDetailModal;
