import { useState, useRef } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';
import ActionCard from './ActionCard.jsx';
import TaskCard from './TaskCard.jsx';

const KanbanView=({categories,actions,tasks,onOpenTask,onOpenAction,onUpdateTask,onUpdateAction,onAddTask,onAddAction,onMoveTask,onReorderTask,onMoveAction,onReorderAction,filters,setFilters,allCountries,selectedYear,onYearChange})=>{
    const[viewMode,setViewMode]=useState('month');
    const[selectedAction,setSelectedAction]=useState(null);
    const[actionFilters,setActionFilters]=useState([]);
    const[sortBy,setSortBy]=useState('order'); // order, name, date, deadline, priority
    const kanbanScrollRef=useRef(null);

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
    const handleDragOver=(e)=>{e.preventDefault();e.currentTarget.classList.add('drag-over');};
    const handleDragLeave=(e)=>{e.currentTarget.classList.remove('drag-over');};

    const getColumns=()=>{
        // Helper to sort items by different criteria (completed tasks always at bottom)
        const sortItems=(items)=>{
            const sorted=[...items];
            // First separate completed and non-completed tasks
            const completed=sorted.filter(t=>t.status==='completed');
            const notCompleted=sorted.filter(t=>t.status!=='completed');

            // Sort each group separately
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

            // Return non-completed tasks first, then completed tasks
            return[...sortGroup(notCompleted),...sortGroup(completed)];
        };

        // Derive effective month for selected year (handles cross-year tasks)
        const getTaskMonth=(t)=>{
            if(!t.startDate)return t.month;
            const sy=new Date(t.startDate).getFullYear();
            if(sy<selectedYear)return 0; // Task from previous year → show in January
            if(sy>selectedYear)return 11; // Task from next year → show in December
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
        if(viewMode==='category')return categories.map(cat=>({key:cat.id,name:cat.name,gradient:cat.gradient,items:actions.filter(a=>a.categoryId===cat.id&&filteredTasks.some(t=>t.actionId===a.id))}));
        if(viewMode==='action'){
            if(selectedAction){
                return CONFIG.STATUSES.map(s=>({key:s.id,name:s.name,color:s.color,icon:s.icon,items:sortItems(filteredTasks.filter(t=>t.actionId===selectedAction&&t.status===s.id))}));
            }else{
                return CONFIG.STATUSES.map(s=>({key:s.id,name:s.name,color:s.color,icon:s.icon,items:sortItems(filteredTasks.filter(t=>t.status===s.id))}));
            }
        }
        if(viewMode==='country'){
            // Build columns for each country that has at least one task, plus an "Unassigned" column
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
            const cols=allCountries.filter(c=>countryTaskMap[c.id]).map(c=>({
                key:c.id,
                name:c.name,
                countryFlag:c.flag,
                countryColor:c.color,
                items:sortItems(countryTaskMap[c.id])
            }));
            if(unassigned.length>0){
                cols.push({key:'_unassigned',name:'Unassigned',countryFlag:'—',countryColor:'#a1a1aa',items:sortItems(unassigned)});
            }
            return cols;
        }
        return[];
    };

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
                    {getColumns().map(col=>(
                        <div
                            key={col.key}
                            data-drop-month={viewMode==='month'?col.key:null}
                            onDragOver={(e)=>{e.preventDefault();if(viewMode==='month'||viewMode==='quarter'||viewMode==='category'||viewMode==='action'||viewMode==='country')e.currentTarget.classList.add('drag-over');}}
                            onDragLeave={(e)=>e.currentTarget.classList.remove('drag-over')}
                            onDrop={(e)=>{
                                e.preventDefault();
                                e.currentTarget.classList.remove('drag-over');
                                if(viewMode==='month'){
                                    const taskId=e.dataTransfer.getData('taskId');
                                    if(taskId){
                                        const task=filteredTasks.find(t=>t.id===taskId);
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
                                        const task=filteredTasks.find(t=>t.id===taskId);
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
                            className="kanban-column" >
                            <div className="column-header">
                                <div className="column-title">
                                    {col.color&&!col.countryColor&&<StatusIcon statusId={col.key} size={12}/>}
                                    {col.gradient&&<div style={{background:categories.find(c=>c.id===col.key)?.color||'var(--accent)',width:4,height:20,borderRadius:2,flexShrink:0}}/>}
                                    {col.countryColor&&<span style={{background:col.countryColor,color:'white',fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:4,letterSpacing:0.3,lineHeight:1}}>{col.countryFlag}</span>}
                                    <span className="column-name">{col.name}</span>
                                    <span className="column-count">{col.items.length}</span>
                                </div>
                                <button className="column-menu" onClick={(e)=>e.stopPropagation()}>⋮</button>
                            </div>
                            <div className="kanban-cards">
                                {viewMode==='category'?col.items.sort((a,b)=>(a.order||0)-(b.order||0)).map(action=><ActionCard key={action.id} action={action} tasks={tasks} categories={categories} onOpen={onOpenAction} onMoveAction={onMoveAction} onReorderAction={onReorderAction}/>):[...col.items].sort((a,b)=>(a.status==='completed')-(b.status==='completed')).map(task=><TaskCard key={task.id} task={task} action={actions.find(a=>a.id===task.actionId)} onOpen={onOpenTask} onMoveTask={sortBy==='order'?onMoveTask:null} onReorderTask={sortBy==='order'?onReorderTask:null} showAction={viewMode==='month'||viewMode==='country'} categories={categories} allCountries={allCountries}/>)}
                                {col.items.length===0&&<div className="column-empty">No tasks</div>}
                                <button onClick={()=>{
                                    if(viewMode==='month'){
                                        const monthIdx=col.key;
                                        const year=selectedYear;
                                        const startDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-01';
                                        const lastDay=new Date(year,monthIdx+1,0).getDate();
                                        const dueDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+lastDay;
                                        const newTask={id:`t${Date.now()}`,title:'New task',actionId:actions[0]?.id||'',month:monthIdx,startDate,dueDate,status:'todo',priority:'medium',description:'',checklist:[],comments:[],attachments:[],channels:actions[0]?.tags||[]};
                                        onAddTask(newTask);
                                        setTimeout(()=>onOpenTask(newTask),100);
                                    }else if(viewMode==='category'){
                                        const newAction={id:`a${Date.now()}`,name:'New action',categoryId:col.key,budget:0,priority:'medium',tags:[]};
                                        onAddAction(newAction);
                                        setTimeout(()=>onOpenAction(newAction),100);
                                    }else if(viewMode==='action'){
                                        const newTask={id:`t${Date.now()}`,title:'New task',actionId:selectedAction||actions[0]?.id||'',month:new Date().getMonth(),startDate:new Date().toISOString().split('T')[0],dueDate:new Date().toISOString().split('T')[0],status:col.key,priority:'medium',description:'',checklist:[],comments:[],attachments:[],channels:actions.find(a=>a.id===(selectedAction||actions[0]?.id))?.tags||[]};
                                        onAddTask(newTask);
                                        setTimeout(()=>onOpenTask(newTask),100);
                                    }else if(viewMode==='country'){
                                        const newTask={id:`t${Date.now()}`,title:'New task',actionId:actions[0]?.id||'',month:new Date().getMonth(),startDate:new Date().toISOString().split('T')[0],dueDate:new Date().toISOString().split('T')[0],status:'todo',priority:'medium',description:'',checklist:[],comments:[],attachments:[],channels:actions[0]?.tags||[],countries:col.key==='_unassigned'?[]:[col.key]};
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
