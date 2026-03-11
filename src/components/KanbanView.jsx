import { useState, useRef, useCallback } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';
import ActionCard from './ActionCard.jsx';
import TaskCard from './TaskCard.jsx';

const KanbanView=({categories,actions,tasks,onOpenTask,onOpenAction,onUpdateTask,onUpdateAction,onAddTask,onAddAction,onMoveTask,onReorderTask,onMoveAction,onReorderAction,filters,setFilters,allCountries,selectedYear,onYearChange,onReorderCategories,onReorderCountryColumns})=>{
    const[viewMode,setViewMode]=useState('month');
    const[selectedAction,setSelectedAction]=useState(null);
    const[actionFilters,setActionFilters]=useState([]);
    const[sortBy,setSortBy]=useState('order');
    const kanbanScrollRef=useRef(null);

    // Column drag state
    const[dragColIdx,setDragColIdx]=useState(null);
    const[dropColIdx,setDropColIdx]=useState(null);

    // Persisted column orders (category and country)
    const[categoryOrder,setCategoryOrder]=useState(null); // null = default order
    const[countryOrder,setCountryOrder]=useState(()=>{
        try { const saved = localStorage.getItem('kanban_country_order'); return saved ? JSON.parse(saved) : null; } catch { return null; }
    });
    const[catOrder,setCatOrder]=useState(()=>{
        try { const saved = localStorage.getItem('kanban_category_order'); return saved ? JSON.parse(saved) : null; } catch { return null; }
    });

    const filteredTasks=tasks.filter(t=>{
        const action=actions.find(a=>a.id===t.actionId);
        if(selectedYear){
            const taskStartYear=t.startDate?new Date(t.startDate).getFullYear():null;
            const taskEndYear=t.dueDate?new Date(t.dueDate).getFullYear():null;
            if(taskStartYear&&taskStartYear>selectedYear)return false;
            if(taskEndYear&&taskEndYear<selectedYear)return false;
            if(taskStartYear&&!taskEndYear&&taskStartYear!==selectedYear)return false;
        }
        if(filters.search&&!t.title.toLowerCase().includes(filters.search.toLowerCase()))return false;
        if(filters.status.length>0&&!filters.status.includes(t.status))return false;
        if(filters.category.length>0&&!filters.category.includes(action?.categoryId))return false;
        if(filters.priority.length>0&&!filters.priority.includes(t.priority))return false;
        if(filters.channel&&filters.channel.length>0&&!(t.channels||[]).some(c=>filters.channel.includes(c)))return false;
        if(filters.country&&filters.country.length>0&&!(t.countries||[]).some(c=>filters.country.includes(c)))return false;
        if(filters.otherLabel&&filters.otherLabel.length>0&&!(t.otherLabels||[]).some(l=>filters.otherLabel.includes(l.id)))return false;
        if(filters.member&&filters.member.length>0&&!(t.assignees||[]).some(m=>filters.member.includes(m)))return false;
        if(actionFilters.length>0&&!actionFilters.includes(t.actionId))return false;
        return true;
    });

    const handleActionDrop=(e,categoryId)=>{
        e.preventDefault();e.currentTarget.classList.remove('drag-over');
        const actionId=e.dataTransfer.getData('actionId');
        if(actionId&&onUpdateAction){
            onUpdateAction(actionId,{categoryId});
        }
    };

    const getColumns=()=>{
        const sortItems=(items)=>{
            const sorted=[...items];
            const completed=sorted.filter(t=>t.status==='completed');
            const notCompleted=sorted.filter(t=>t.status!=='completed');
            const sortGroup=(group)=>{
                if(sortBy==='order')return group.sort((a,b)=>(a.order||0)-(b.order||0));
                if(sortBy==='name')return group.sort((a,b)=>a.title.localeCompare(b.title));
                if(sortBy==='date')return group.sort((a,b)=>new Date(a.startDate||0)-new Date(b.startDate||0));
                if(sortBy==='deadline')return group.sort((a,b)=>new Date(a.dueDate||'9999')-new Date(b.dueDate||'9999'));
                if(sortBy==='created')return group.sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
                if(sortBy==='priority'){
                    const priorityOrder={high:0,medium:1,low:2};
                    return group.sort((a,b)=>(priorityOrder[a.priority]||99)-(priorityOrder[b.priority]||99));
                }
                return group;
            };
            return[...sortGroup(notCompleted),...sortGroup(completed)];
        };

        const getTaskMonth=(t)=>{
            if(!t.startDate)return t.month;
            const sy=new Date(t.startDate).getFullYear();
            if(sy<selectedYear)return 0;
            if(sy>selectedYear)return 11;
            return new Date(t.startDate).getMonth();
        };
        if(viewMode==='month')return CONFIG.MONTHS_FULL.map((name,idx)=>({key:idx,name,items:sortItems(filteredTasks.filter(t=>getTaskMonth(t)===idx))}));
        if(viewMode==='quarter'){
            const quarters=[
                {key:0,name:'Q1 (Jan-Mar)',months:[0,1,2]},
                {key:1,name:'Q2 (Apr-Jun)',months:[3,4,5]},
                {key:2,name:'Q3 (Jul-Sep)',months:[6,7,8]},
                {key:3,name:'Q4 (Oct-Dec)',months:[9,10,11]}
            ];
            return quarters.map(q=>({
                key:q.key,
                name:q.name,
                items:sortItems(filteredTasks.filter(t=>q.months.includes(getTaskMonth(t))))
            }));
        }
        if(viewMode==='category'){
            let cats = [...categories];
            if(catOrder){
                cats.sort((a,b)=>{
                    const ai=catOrder.indexOf(a.id);
                    const bi=catOrder.indexOf(b.id);
                    return (ai===-1?999:ai)-(bi===-1?999:bi);
                });
            }
            // Check if all actions in each category are "isDefault" (Trello-imported without label mapping)
            // If so, show tasks directly under category instead of action cards
            return cats.map(cat=>{
                const catActions = actions.filter(a=>a.categoryId===cat.id);
                const allDefault = catActions.length > 0 && catActions.every(a=>a.isDefault);
                if(allDefault){
                    // Show tasks directly under category
                    const catTaskIds = new Set(catActions.map(a=>a.id));
                    return {key:cat.id,name:cat.name,gradient:cat.gradient,items:sortItems(filteredTasks.filter(t=>catTaskIds.has(t.actionId))),directTasks:true};
                }
                return {key:cat.id,name:cat.name,gradient:cat.gradient,items:catActions};
            });
        }
        if(viewMode==='action'){
            if(selectedAction){
                return CONFIG.STATUSES.map(s=>({key:s.id,name:s.name,color:s.color,icon:s.icon,items:sortItems(filteredTasks.filter(t=>t.actionId===selectedAction&&t.status===s.id))}));
            }else{
                return CONFIG.STATUSES.map(s=>({key:s.id,name:s.name,color:s.color,icon:s.icon,items:sortItems(filteredTasks.filter(t=>t.status===s.id))}));
            }
        }
        if(viewMode==='country'){
            const countryTaskMap={};
            const unassigned=[];
            filteredTasks.forEach(t=>{
                const taskCountries=t.countries||[];
                if(taskCountries.length===0){
                    unassigned.push(t);
                }else{
                    taskCountries.forEach(cId=>{
                        if(!countryTaskMap[cId])countryTaskMap[cId]=[];
                        countryTaskMap[cId].push(t);
                    });
                }
            });
            let countries = [...allCountries];
            if(countryOrder){
                countries.sort((a,b)=>{
                    const ai=countryOrder.indexOf(a.id);
                    const bi=countryOrder.indexOf(b.id);
                    return (ai===-1?999:ai)-(bi===-1?999:bi);
                });
            }
            const cols=countries.map(c=>({
                key:c.id,
                name:c.name,
                countryFlag:c.flag,
                countryColor:c.color,
                items:sortItems(countryTaskMap[c.id]||[])
            }));
            cols.push({key:'_unassigned',name:'Unassigned',countryFlag:'—',countryColor:'#a1a1aa',items:sortItems(unassigned)});
            return cols;
        }
        return[];
    };

    const canDragColumns = viewMode === 'category' || viewMode === 'country';

    const handleColumnDragStart = (e, idx) => {
        if (!canDragColumns) return;
        setDragColIdx(idx);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('columnDrag', 'true');
        e.currentTarget.style.opacity = '0.5';
    };

    const handleColumnDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDragColIdx(null);
        setDropColIdx(null);
    };

    const handleColumnDragOver = (e, idx) => {
        if (dragColIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropColIdx(idx);
    };

    const handleColumnDrop = (e, idx, columns) => {
        if (dragColIdx === null || dragColIdx === idx) {
            setDragColIdx(null);
            setDropColIdx(null);
            return;
        }
        e.preventDefault();
        const reordered = [...columns];
        const [moved] = reordered.splice(dragColIdx, 1);
        reordered.splice(idx, 0, moved);
        const newOrder = reordered.map(c => c.key);

        if (viewMode === 'category') {
            setCatOrder(newOrder);
            try { localStorage.setItem('kanban_category_order', JSON.stringify(newOrder)); } catch {}
        } else if (viewMode === 'country') {
            setCountryOrder(newOrder);
            try { localStorage.setItem('kanban_country_order', JSON.stringify(newOrder)); } catch {}
        }
        setDragColIdx(null);
        setDropColIdx(null);
    };

    const columns = getColumns();

    return(
        <div className="animate-slide-in">
            <div className="kanban-wrapper">
            <div className="kanban-toolbar">
                <div className="kanban-toolbar-left">
                    <div className="view-btn-group">
                        {[{id:'month',label:'By Month'},{id:'quarter',label:'By Quarter'},{id:'category',label:'By Category'},{id:'action',label:'By Action'},{id:'country',label:'By Country'}].map(v=>(
                            <button key={v.id} onClick={()=>{setViewMode(v.id);if(v.id!=='action')setSelectedAction(null);}} className={`view-btn ${viewMode===v.id?'active':''}`}>{v.label}</button>
                        ))}
                    </div>
                </div>
                <div className="kanban-toolbar-right">
                    {viewMode!=='category'&&<><span className="toolbar-label">Sort:</span>
                    <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="toolbar-select">
                        <option value="order">Manual</option>
                        <option value="name">Name A→Z</option>
                        <option value="created">Created date</option>
                        <option value="date">Start date</option>
                        <option value="deadline">Deadline</option>
                        <option value="priority">Priority</option>
                    </select></>}
                    {onYearChange&&<div className="timeline-nav" style={{marginLeft:12}}>
                        <button className="timeline-nav-btn" onClick={()=>onYearChange(selectedYear-1)}>◀</button>
                        <span className="timeline-current">{selectedYear}</span>
                        <button className="timeline-nav-btn" onClick={()=>onYearChange(selectedYear+1)}>▶</button>
                    </div>}
                </div>
            </div>
            <div className="kanban-board">
                    {columns.map((col, colIdx)=>(
                        <div
                            key={col.key}
                            draggable={canDragColumns && col.key !== '_unassigned'}
                            onDragStart={canDragColumns ? (e) => {
                                // Only handle column drag if started from header area
                                if (e.target.closest('.kanban-cards')) return;
                                handleColumnDragStart(e, colIdx);
                            } : undefined}
                            onDragEnd={canDragColumns ? handleColumnDragEnd : undefined}
                            data-drop-month={viewMode==='month'?col.key:null}
                            onDragOver={(e)=>{
                                // Column reorder drag
                                if(dragColIdx !== null && canDragColumns) {
                                    handleColumnDragOver(e, colIdx);
                                    return;
                                }
                                e.preventDefault();
                                if(viewMode==='month'||viewMode==='quarter'||viewMode==='category'||viewMode==='action'||viewMode==='country')e.currentTarget.classList.add('drag-over');
                            }}
                            onDragLeave={(e)=>{
                                e.currentTarget.classList.remove('drag-over');
                                if (dropColIdx === colIdx) setDropColIdx(null);
                            }}
                            onDrop={(e)=>{
                                // Column reorder drop
                                if(dragColIdx !== null && canDragColumns && e.dataTransfer.getData('columnDrag')) {
                                    handleColumnDrop(e, colIdx, columns);
                                    return;
                                }

                                e.preventDefault();
                                e.currentTarget.classList.remove('drag-over');
                                if(viewMode==='month'){
                                    const taskId=e.dataTransfer.getData('taskId');
                                    if(taskId){
                                        const monthIdx=col.key;
                                        const year=selectedYear;
                                        const startDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-01';
                                        const lastDay=new Date(year,monthIdx+1,0).getDate();
                                        const dueDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+lastDay;
                                        onUpdateTask(taskId,{startDate,dueDate,month:monthIdx});
                                    }
                                }else if(viewMode==='quarter'){
                                    const taskId=e.dataTransfer.getData('taskId');
                                    if(taskId){
                                        const quarterIdx=col.key;
                                        const year=selectedYear;
                                        const firstMonth=quarterIdx*3;
                                        const lastMonth=quarterIdx*3+2;
                                        const startDate=year+'-'+String(firstMonth+1).padStart(2,'0')+'-01';
                                        const lastDay=new Date(year,lastMonth+1,0).getDate();
                                        const dueDate=year+'-'+String(lastMonth+1).padStart(2,'0')+'-'+lastDay;
                                        onUpdateTask(taskId,{startDate,dueDate,month:firstMonth});
                                    }
                                }else if(viewMode==='category'){
                                    const actionId=e.dataTransfer.getData('actionId');
                                    if(actionId&&onUpdateAction){
                                        onUpdateAction(actionId,{categoryId:col.key});
                                    }
                                }else if(viewMode==='action'){
                                    const taskId=e.dataTransfer.getData('taskId');
                                    if(taskId){
                                        onUpdateTask(taskId,{status:col.key});
                                    }
                                }else if(viewMode==='country'){
                                    const taskId=e.dataTransfer.getData('taskId');
                                    if(taskId){
                                        if(col.key==='_unassigned'){
                                            onUpdateTask(taskId,{countries:[]});
                                        }else{
                                            onUpdateTask(taskId,{countries:[col.key]});
                                        }
                                    }
                                }
                            }}
                            className={`kanban-column${dropColIdx === colIdx && dragColIdx !== null ? ' column-drop-target' : ''}`}
                            style={canDragColumns && col.key !== '_unassigned' ? {cursor:'grab'} : undefined}
                        >
                            <div className="column-header">
                                <div className="column-title">
                                    {canDragColumns && col.key !== '_unassigned' && <span style={{cursor:'grab',opacity:0.4,fontSize:10,marginRight:2}}>⋮⋮</span>}
                                    {col.color&&!col.countryColor&&<StatusIcon statusId={col.key} size={12}/>}
                                    {col.gradient&&<div style={{background:categories.find(c=>c.id===col.key)?.color||'var(--accent)',width:4,height:20,borderRadius:2,flexShrink:0}}/>}
                                    {col.countryColor&&<span style={{background:col.countryColor,color:'white',fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:4,letterSpacing:0.3,lineHeight:1}}>{col.countryFlag}</span>}
                                    <span className="column-name">{col.name}</span>
                                    <span className="column-count">{col.items.length}</span>
                                </div>
                                <button className="column-menu" onClick={(e)=>e.stopPropagation()}>⋮</button>
                            </div>
                            <div className="kanban-cards" onDragStart={(e) => {
                                // Prevent column drag when dragging cards
                                e.stopPropagation();
                            }}>
                                {(viewMode==='category'&&!col.directTasks)?col.items.sort((a,b)=>(a.order||0)-(b.order||0)).map(action=><ActionCard key={action.id} action={action} tasks={tasks} categories={categories} onOpen={onOpenAction} onMoveAction={onMoveAction} onReorderAction={onReorderAction}/>):[...col.items].sort((a,b)=>(a.status==='completed')-(b.status==='completed')).map(task=><TaskCard key={task.id} task={task} action={actions.find(a=>a.id===task.actionId)} onOpen={onOpenTask} onMoveTask={sortBy==='order'?onMoveTask:null} onReorderTask={sortBy==='order'?(viewMode==='country'?((draggedId,targetId,position)=>{
                                    const targetCountry=col.key==='_unassigned'?[]:[col.key];
                                    onUpdateTask(draggedId,{countries:targetCountry});
                                    const colItems=[...col.items].sort((a,b)=>(a.order||0)-(b.order||0));
                                    const dragIdx=colItems.findIndex(t=>t.id===draggedId);
                                    const targetIdx=colItems.findIndex(t=>t.id===targetId);
                                    if(targetIdx===-1)return;
                                    const reordered=dragIdx>=0?[...colItems]:[...colItems];
                                    if(dragIdx>=0)reordered.splice(dragIdx,1);
                                    const insertAt=position==='before'?targetIdx:(dragIdx>=0&&dragIdx<targetIdx?targetIdx:targetIdx+1);
                                    const draggedTask=tasks.find(t=>t.id===draggedId);
                                    if(draggedTask)reordered.splice(insertAt,0,draggedTask);
                                    reordered.forEach((t,i)=>onUpdateTask(t.id,{order:i}));
                                }):onReorderTask):null} showAction={viewMode==='month'||viewMode==='country'} categories={categories} allCountries={allCountries}/>)}
                                {col.items.length===0&&<div className="column-empty">No tasks</div>}
                                <button onClick={()=>{
                                    const today=new Date().toISOString().split('T')[0];
                                    const oneWeekLater=new Date(Date.now()+7*24*60*60*1000).toISOString().split('T')[0];
                                    if(viewMode==='month'){
                                        const monthIdx=col.key;
                                        const year=selectedYear;
                                        const startDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-01';
                                        const lastDay=new Date(year,monthIdx+1,0).getDate();
                                        const dueDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+lastDay;
                                        const newTask={id:`t${Date.now()}`,title:'New task',actionId:actions[0]?.id||'',month:monthIdx,startDate,dueDate,status:'todo',priority:'medium',description:'',checklist:[],comments:[],attachments:[],channels:actions[0]?.tags||[]};
                                        onAddTask(newTask);
                                        setTimeout(()=>onOpenTask(newTask),100);
                                    }else if(viewMode==='quarter'){
                                        const quarterIdx=col.key;
                                        const year=selectedYear;
                                        const firstMonth=quarterIdx*3;
                                        const startDate=year+'-'+String(firstMonth+1).padStart(2,'0')+'-01';
                                        const lastMonth=quarterIdx*3+2;
                                        const lastDay=new Date(year,lastMonth+1,0).getDate();
                                        const dueDate=year+'-'+String(lastMonth+1).padStart(2,'0')+'-'+lastDay;
                                        const newTask={id:`t${Date.now()}`,title:'New task',actionId:actions[0]?.id||'',month:firstMonth,startDate,dueDate,status:'todo',priority:'medium',description:'',checklist:[],comments:[],attachments:[],channels:actions[0]?.tags||[]};
                                        onAddTask(newTask);
                                        setTimeout(()=>onOpenTask(newTask),100);
                                    }else if(viewMode==='category'){
                                        const newAction={id:`a${Date.now()}`,name:'New action',categoryId:col.key,budget:0,priority:'medium',tags:[]};
                                        onAddAction(newAction);
                                        setTimeout(()=>onOpenAction(newAction),100);
                                    }else if(viewMode==='action'){
                                        const newTask={id:`t${Date.now()}`,title:'New task',actionId:selectedAction||actions[0]?.id||'',month:new Date().getMonth(),startDate:today,dueDate:oneWeekLater,status:col.key,priority:'medium',description:'',checklist:[],comments:[],attachments:[],channels:actions.find(a=>a.id===(selectedAction||actions[0]?.id))?.tags||[]};
                                        onAddTask(newTask);
                                        setTimeout(()=>onOpenTask(newTask),100);
                                    }else if(viewMode==='country'){
                                        const newTask={id:`t${Date.now()}`,title:'New task',actionId:actions[0]?.id||'',month:new Date().getMonth(),startDate:today,dueDate:oneWeekLater,status:'todo',priority:'medium',description:'',checklist:[],comments:[],attachments:[],channels:actions[0]?.tags||[],countries:col.key==='_unassigned'?[]:[col.key]};
                                        onAddTask(newTask);
                                        setTimeout(()=>onOpenTask(newTask),100);
                                    }
                                }} className="add-card-btn">
                                    + Add
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default KanbanView;
