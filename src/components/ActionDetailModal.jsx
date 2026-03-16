import { useState } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon, PriorityIcon, StatusOption, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';

const ActionDetailModal=({categories,action,tasks,onClose,onUpdateAction,onUpdateTask,onOpenTask,onAddTask,onDeleteAction,isReadOnly=false})=>{
    const[form,setForm]=useState({...action});
    const[showConfirmDelete,setShowConfirmDelete]=useState(false);
    const actionTasks=tasks.filter(t=>t.actionId===action.id);
    const completedTasks=actionTasks.filter(t=>t.status==='completed').length;
    const progressPct=actionTasks.length>0?Math.round((completedTasks/actionTasks.length)*100):0;
    const category=categories?.find(c=>c.id===form.categoryId);
    const totalBudget=actionTasks.reduce((s,t)=>s+(t.budget||0),0);

    const handleClose=()=>{if(!isReadOnly)onUpdateAction(action.id,form);onClose();}; // Auto-save on close, skip in read-only
    const handleDelete=()=>{if(onDeleteAction){onDeleteAction(action.id);onClose();}};
    const handleStatusChange=(taskId,newStatus)=>{onUpdateTask(taskId,{status:newStatus});};
    const addChannel=(id)=>setForm({...form,tags:[...(form.tags||[]),id]});
    const removeChannel=(id)=>setForm({...form,tags:(form.tags||[]).filter(c=>c!==id)});

    return(
        <div className="v11-modal-overlay" onClick={handleClose} style={{alignItems:'flex-start',paddingTop:64,overflowY:'auto'}}>
            <div className="v11-modal animate-slide-up" style={{maxWidth:512,marginBottom:32}} onClick={e=>e.stopPropagation()}>
                <div className={`h-2 rounded-t-2xl bg-gradient-to-r ${category?.gradient||'from-gray-400 to-gray-500'}`}/>
                <div className="p-6" style={{maxHeight:'calc(90vh - 80px)',overflowY:'auto'}}>
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <span className="text-xs" style={{color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5,fontWeight:600}}>📁 ACTION</span>
                            <input type="text" value={form.name} onChange={e=>!isReadOnly&&setForm({...form,name:e.target.value})} className="v11-input" style={{fontSize:'1.25rem',fontWeight:700,marginTop:4}} readOnly={isReadOnly}/>
                        </div>
                        <button onClick={handleClose} className="ml-2 v11-icon-btn"><Icon.Close/></button>
                    </div>
                    {/* Details section */}
                    <div className="rounded-xl mb-4" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)',padding:'14px 16px'}}>
                        <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Details</div>
                        <div className="flex flex-wrap gap-3">
                            <div><label className="v11-label">Category</label><select value={form.categoryId} onChange={e=>!isReadOnly&&setForm({...form,categoryId:e.target.value})} className="v11-select" disabled={isReadOnly}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                            <div><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v=>setForm({...form,priority:v})} renderOption={o=><PriorityOption priority={o}/>} disabled={isReadOnly}/></div>
                            <div><label className="v11-label">Budget €</label><input type="number" value={form.budget||0} onChange={e=>setForm({...form,budget:parseInt(e.target.value)||0})} className="v11-input" style={{width:128}} readOnly={isReadOnly}/></div>
                        </div>
                    </div>
                    {/* Summary */}
                    <div className="rounded-xl p-4 mb-4" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)'}}>
                        <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Summary</div>
                        <div className="flex justify-between mb-3">
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>💰 Budget</span><p className="text-lg font-bold text-secondary">{totalBudget.toLocaleString()}€</p></div>
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>📊 Progress</span><p className="text-lg font-bold">{progressPct}%</p></div>
                            <div><span className="text-xs" style={{color:'var(--text-muted)'}}>📋 Tasks</span><p className="text-lg font-bold">{completedTasks}/{actionTasks.length}</p></div>
                        </div>
                        <div className="v11-progress-bar" style={{height:12}}><div className={`v11-progress-fill ${progressPct>=70?'high':progressPct>=40?'medium':'low'}`} style={{width:`${progressPct}%`}}/></div>
                    </div>
                    <div className="mb-4"><label className="v11-label">🏷️ Channel Tags</label><ChannelTags channels={form.tags||[]} onAdd={addChannel} onRemove={removeChannel} editable={!isReadOnly}/></div>
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-3">
                            <span style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px'}}>📋 Tasks ({actionTasks.length})</span>
                            {!isReadOnly && <button onClick={()=>onAddTask(action.id)} className="px-3 py-1 bg-secondary text-white rounded-lg text-xs flex items-center space-x-1"><Icon.Plus/><span>Add</span></button>}
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {actionTasks.length>0?actionTasks.map(task=>{
                                const status=CONFIG.STATUSES.find(s=>s.id===task.status);
                                return(
                                    <div key={task.id} className="rounded-lg p-3" style={{background:'var(--bg-secondary)',border:'1px solid var(--border-light)'}}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                                                <IconSelect value={task.status} options={CONFIG.STATUSES} onChange={v=>handleStatusChange(task.id,v)} renderOption={o=><StatusOption status={o}/>} style={{minWidth:120}} disabled={isReadOnly}/>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm truncate">{task.title}</p>
                                                    <p className="text-xs" style={{color:'var(--text-muted)'}}>📅 {task.startDate?new Date(task.startDate).toLocaleDateString('en-US',{day:'numeric',month:'short'}):'?'} → {task.dueDate?new Date(task.dueDate).toLocaleDateString('en-US',{day:'numeric',month:'short'}):'?'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                {task.budget>0&&<span className="text-xs font-semibold text-secondary">{task.budget}€</span>}
                                                <button onClick={()=>onOpenTask(task)} className="p-1 rounded" style={{color:'var(--text-muted)'}}><Icon.External/></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }):<p className="text-center py-4 text-sm" style={{color:'var(--text-muted)'}}>No tasks</p>}
                        </div>
                    </div>
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
                    <div className="flex items-center justify-between pt-4" style={{borderTop:'1px solid var(--border)'}}>
                        {!isReadOnly && <button onClick={()=>setShowConfirmDelete(true)} className="px-4 py-2 text-accent-red hover:bg-red-50 rounded-lg text-sm flex items-center space-x-2"><Icon.Trash/><span>Delete</span></button>}
                        {isReadOnly && <span style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>Read-only (guest mode)</span>}
                        <button onClick={handleClose} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium">Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActionDetailModal;
