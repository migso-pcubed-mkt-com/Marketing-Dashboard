import { useState, useRef, useCallback, useMemo, memo, Fragment } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';
import ActionCard from './ActionCard.jsx';
import TaskCard from './TaskCard.jsx';
import VirtualKanbanCards from './VirtualKanbanCards.jsx';

const VIRTUALIZE_THRESHOLD = 50;

const KanbanView=({categories,actions,tasks,onOpenTask,onOpenAction,onUpdateTask,onUpdateAction,onBatchUpdateTasks,onAddTask,onAddAction,onMoveTask,onReorderTask,onMoveAction,onReorderAction,filters,setFilters,allCountries,selectedYear,onYearChange,onReorderCategories,onReorderCountryColumns,isReadOnly,onRequestNewTask,onUpdateCategory,onAddCategory,onDeleteCategory,isCardAsTask,isUserInteractingRef,boardGroups})=>{
    const[viewMode,setViewMode]=useState('category');
    const[selectedAction,setSelectedAction]=useState(null);
    const[actionFilters,setActionFilters]=useState([]);
    const[sortBy,setSortBy]=useState('order');
    const kanbanScrollRef=useRef(null);

    // Column drag state
    const[dragColIdx,setDragColIdx]=useState(null);
    const[dropColIdx,setDropColIdx]=useState(null);
    const[editingCategoryId,setEditingCategoryId]=useState(null);
    const[editingCategoryValue,setEditingCategoryValue]=useState('');
    const[showAddCategory,setShowAddCategory]=useState(false);
    const[quickAddCol,setQuickAddCol]=useState(null);
    const[quickAddTitle,setQuickAddTitle]=useState('');
    const[newCategoryName,setNewCategoryName]=useState('');

    // Persisted column orders (category and country)
    const[categoryOrder,setCategoryOrder]=useState(null); // null = default order
    const[countryOrder,setCountryOrder]=useState(()=>{
        try { const saved = localStorage.getItem('kanban_country_order'); return saved ? JSON.parse(saved) : null; } catch { return null; }
    });
    const[catOrder,setCatOrder]=useState(()=>{
        try { const saved = localStorage.getItem('kanban_category_order'); return saved ? JSON.parse(saved) : null; } catch { return null; }
    });

    const filteredTasks=useMemo(()=>tasks.filter(t=>{
        const action=actions.find(a=>a.id===t.actionId);
        if(selectedYear){
            const taskStartYear=t.startDate?new Date(t.startDate).getFullYear():null;
            const taskEndYear=t.dueDate?new Date(t.dueDate).getFullYear():null;
            if(taskStartYear&&taskStartYear>selectedYear)return false;
            if(taskEndYear&&taskEndYear<selectedYear)return false;
            if(taskStartYear&&!taskEndYear&&taskStartYear!==selectedYear)return false;
        }
        if(filters.search){const q=filters.search.toLowerCase();if(!t.title.toLowerCase().includes(q)&&!(action?.name||'').toLowerCase().includes(q))return false;}
        if(filters.status.length>0&&!filters.status.includes(t.status))return false;
        if(filters.category.length>0&&!filters.category.includes(action?.categoryId))return false;
        if(filters.priority.length>0&&!filters.priority.includes(t.priority))return false;
        if(filters.channel&&filters.channel.length>0&&!(t.channels||[]).some(c=>filters.channel.includes(c)))return false;
        if(filters.country&&filters.country.length>0&&!(t.countries||[]).some(c=>filters.country.includes(c)))return false;
        if(filters.otherLabel&&filters.otherLabel.length>0&&!(t.otherLabels||[]).some(l=>filters.otherLabel.includes(l.id)))return false;
        if(filters.member&&filters.member.length>0&&!(t.assignees||[]).some(m=>filters.member.includes(m)))return false;
        if(actionFilters.length>0&&!actionFilters.includes(t.actionId))return false;
        return true;
    }),[tasks,actions,selectedYear,filters,actionFilters]);

    const handleActionDrop=(e,categoryId)=>{
        e.preventDefault();e.currentTarget.classList.remove('drag-over');
        const actionId=e.dataTransfer.getData('actionId');
        if(actionId&&onUpdateAction){
            onUpdateAction(actionId,{categoryId});
        }
    };

    const getTaskMonth=(t)=>{
        const refDate=t.dueDate||t.startDate;
        if(!refDate)return t.month!=null?t.month:0;
        // Parse as local time to avoid UTC month shift
        const d=new Date(refDate+'T00:00:00');
        const sy=d.getFullYear();
        if(sy<selectedYear)return 0;
        if(sy>selectedYear)return 11;
        return d.getMonth();
    };

    const columns=useMemo(()=>{
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
                if(sortBy==='created')return group.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
                if(sortBy==='priority'){
                    const priorityOrder={high:0,medium:1,low:2};
                    return group.sort((a,b)=>(priorityOrder[a.priority]||99)-(priorityOrder[b.priority]||99));
                }
                return group;
            };
            return[...sortGroup(notCompleted),...sortGroup(completed)];
        };

        const sortActionItems=(items)=>{
            const sorted=[...items];
            const completed=sorted.filter(a=>a.status==='completed');
            const notCompleted=sorted.filter(a=>a.status!=='completed');
            const sortGroup=(group)=>{
                if(sortBy==='order')return group.sort((a,b)=>(a.order||0)-(b.order||0));
                if(sortBy==='name')return group.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
                if(sortBy==='date')return group.sort((a,b)=>new Date(a.startDate||0)-new Date(b.startDate||0));
                if(sortBy==='deadline')return group.sort((a,b)=>new Date(a.dueDate||'9999')-new Date(b.dueDate||'9999'));
                if(sortBy==='created')return group.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
                if(sortBy==='priority'){
                    const priorityOrder={high:0,medium:1,low:2};
                    return group.sort((a,b)=>(priorityOrder[a.priority]||99)-(priorityOrder[b.priority]||99));
                }
                return group;
            };
            return[...sortGroup(notCompleted),...sortGroup(completed)];
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
            // Sort by category.order field (set by Trello sync or column drag)
            // Only fall back to localStorage catOrder if no order fields exist
            const hasOrderField = cats.some(c => c.order !== undefined);
            if(hasOrderField){
                cats.sort((a,b)=>(a.order??999)-(b.order??999));
            } else if(catOrder){
                cats.sort((a,b)=>{
                    const ai=catOrder.indexOf(a.id);
                    const bi=catOrder.indexOf(b.id);
                    return (ai===-1?999:ai)-(bi===-1?999:bi);
                });
            }
            // Combined view: group categories by source board so each board's columns
            // cluster together (the render loop inserts a separator between groups).
            if(boardGroups && boardGroups.length > 0){
                const boardOrder = new Map(boardGroups.map((g,i)=>[g.boardId,i]));
                cats.sort((a,b)=>{
                    const ai = boardOrder.has(a._sourceBoardId) ? boardOrder.get(a._sourceBoardId) : 999;
                    const bi = boardOrder.has(b._sourceBoardId) ? boardOrder.get(b._sourceBoardId) : 999;
                    return ai - bi;
                });
            }
            // Check if all actions in each category are "isDefault" (Trello-imported without label mapping)
            // If so, show tasks directly under category instead of action cards
            return cats.map(cat=>{
                const catActions = actions.filter(a=>a.categoryId===cat.id);
                const allDefault = (catActions.length > 0 && catActions.every(a=>a.isDefault)) || (catActions.length === 0 && isCardAsTask);
                if(allDefault){
                    // Show tasks directly under category
                    const catTaskIds = new Set(catActions.map(a=>a.id));
                    return {key:cat.id,name:cat.name,gradient:cat.gradient,items:sortItems(filteredTasks.filter(t=>catTaskIds.has(t.actionId))),directTasks:true};
                }
                // Filter actions: only show actions that have at least one matching task (when filters active)
                const hasActiveFilter = filters.search || filters.status.length > 0 || filters.priority.length > 0 || (filters.channel && filters.channel.length > 0) || (filters.country && filters.country.length > 0) || (filters.member && filters.member.length > 0) || (filters.otherLabel && filters.otherLabel.length > 0) || actionFilters.length > 0;
                const visibleActions = hasActiveFilter ? catActions.filter(a => filteredTasks.some(t => t.actionId === a.id) || (filters.search && a.name.toLowerCase().includes(filters.search.toLowerCase()))) : catActions;
                return {key:cat.id,name:cat.name,gradient:cat.gradient,items:sortActionItems(visibleActions)};
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
    return getColumns();
    },[viewMode,sortBy,filteredTasks,categories,actions,selectedAction,isCardAsTask,catOrder,allCountries,countryOrder,selectedYear,filters,actionFilters,boardGroups]);

    const canDragColumns = (viewMode === 'category' || viewMode === 'country') && !isReadOnly;

    // Combined view: group columns by source board so each board's columns cluster
    // together under a horizontal colored banner (instead of a vertical separator).
    const groupedColumns = useMemo(() => {
        if (!boardGroups || boardGroups.length === 0 || viewMode !== 'category') {
            return [{ group: null, cols: columns.map((c, i) => ({ col: c, colIdx: i })) }];
        }
        const bySource = new Map();
        columns.forEach((col, i) => {
            const sourceId = categories.find(c => c.id === col.key)?._sourceBoardId || null;
            const key = sourceId || '__unassigned__';
            if (!bySource.has(key)) bySource.set(key, []);
            bySource.get(key).push({ col, colIdx: i });
        });
        return Array.from(bySource.entries()).map(([sourceId, cols]) => ({
            group: boardGroups.find(g => g.boardId === sourceId) || null,
            cols
        }));
    }, [columns, categories, boardGroups, viewMode]);

    const handleColumnDragStart = (e, idx) => {
        if (!canDragColumns) return;
        setDragColIdx(idx);
        if (isUserInteractingRef) isUserInteractingRef.current = true;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('columnDrag', 'true');
        e.currentTarget.style.opacity = '0.5';
    };

    const handleColumnDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDragColIdx(null);
        setDropColIdx(null);
        if (isUserInteractingRef) isUserInteractingRef.current = false;
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
            setCatOrder(null);
            try { localStorage.removeItem('kanban_category_order'); } catch {}
            // Update actual category order fields so Trello sync picks up the change
            if (onUpdateCategory) {
                newOrder.forEach((catId, idx) => {
                    onUpdateCategory(catId, { order: idx });
                });
            }
        } else if (viewMode === 'country') {
            setCountryOrder(newOrder);
            try { localStorage.setItem('kanban_country_order', JSON.stringify(newOrder)); } catch {}
        }
        setDragColIdx(null);
        setDropColIdx(null);
    };

    // Touch drag for column reorder
    const colTouchRef = useRef({idx:null,timeout:null,startPos:null});
    const handleColTouchStart = useCallback((e, colIdx) => {
        if (!canDragColumns) return;
        // Only from header area, not from cards
        if (e.target.closest('.kanban-cards')) return;
        const touch = e.touches[0];
        colTouchRef.current = {idx:null,timeout:setTimeout(()=>{
            colTouchRef.current.idx = colIdx;
            setDragColIdx(colIdx);
            if (navigator.vibrate) navigator.vibrate(50);
        },300),startPos:{x:touch.clientX,y:touch.clientY}};
    }, [canDragColumns]);
    const handleColTouchMove = useCallback((e) => {
        const ref = colTouchRef.current;
        if (ref.idx === null) {
            if (ref.timeout && ref.startPos) {
                const t = e.touches[0];
                if (Math.abs(t.clientX - ref.startPos.x) > 10 || Math.abs(t.clientY - ref.startPos.y) > 10) {
                    clearTimeout(ref.timeout); ref.timeout = null;
                }
            }
            return;
        }
        e.preventDefault();
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el) return;
        const colEl = el.closest('[data-col-idx]');
        if (colEl) {
            const targetIdx = parseInt(colEl.getAttribute('data-col-idx'));
            if (!isNaN(targetIdx) && targetIdx !== ref.idx) setDropColIdx(targetIdx);
        }
    }, []);
    const handleColTouchEnd = useCallback((e) => {
        const ref = colTouchRef.current;
        if (ref.timeout) clearTimeout(ref.timeout);
        if (ref.idx !== null && dropColIdx !== null && ref.idx !== dropColIdx) {
            handleColumnDrop({ preventDefault: () => {} }, dropColIdx, columns);
        }
        setDragColIdx(null);
        setDropColIdx(null);
        colTouchRef.current = {idx:null,timeout:null,startPos:null};
    }, [dropColIdx, columns, handleColumnDrop]);

    return(
        <div className="animate-slide-in">
            <div className="kanban-wrapper">
            <div className="kanban-toolbar">
                <div className="kanban-toolbar-left">
                    <div className="view-btn-group">
                        {[{id:'category',label:(boardGroups&&boardGroups.length>0)?'By Board':(isCardAsTask?'Categories (tasks)':'Categories (actions)')},{id:'month',label:'By Month'},{id:'quarter',label:'By Quarter'},{id:'action',label:'By Status'},{id:'country',label:'By Country'}].map(v=>(
                            <button key={v.id} onClick={()=>{setViewMode(v.id);if(v.id!=='action')setSelectedAction(null);}} className={`view-btn ${viewMode===v.id?'active':''}`}>{v.label}</button>
                        ))}
                    </div>
                    <span className="kanban-context-label">{viewMode==='category'?(columns.some(c=>c.directTasks)?`${columns.reduce((s,c)=>s+c.items.length,0)} tasks`:`${columns.reduce((s,c)=>s+c.items.length,0)} actions`):`${columns.reduce((s,c)=>s+c.items.length,0)} tasks`}</span>
                </div>
                <div className="kanban-toolbar-right">
                    {<><span className="toolbar-label">Sort:</span>
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
            {boardGroups && boardGroups.length > 0 && (
                <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',padding:'6px 12px',marginBottom:8,fontSize:11,color:'var(--text-muted)',background:'var(--bg-secondary)',borderRadius:6}}>
                    <span style={{fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Boards</span>
                    {boardGroups.map(g => (
                        <span key={g.boardId} style={{display:'inline-flex',alignItems:'center',gap:6}}>
                            <span style={{display:'inline-block',width:12,height:12,borderRadius:3,background:g.boardColor}}/>
                            <span style={{color:'var(--text-primary)'}}>{g.boardName}</span>
                        </span>
                    ))}
                </div>
            )}
            <div className="kanban-board">
                    {groupedColumns.map(({ group, cols: groupCols }, groupIdx) => (
                    <div key={group?.boardId || `group-${groupIdx}`} className="kanban-board-group" style={{display:'flex',flexDirection:'column',flexShrink:0,gap:4}}>
                        {group && (
                            <div className="kanban-board-banner" title={group.boardName} style={{
                                background: group.boardColor, color: '#fff',
                                padding: '8px 14px', fontWeight: 700, fontSize: 13,
                                borderRadius: 6, letterSpacing: 0.3,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                minHeight: 32, boxSizing: 'border-box'
                            }}>
                                {group.boardName}
                            </div>
                        )}
                        <div className="kanban-board-columns" style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                    {groupCols.map(({ col, colIdx })=>{
                    const isActionView = viewMode==='category'&&!col.directTasks;
                    const useVirtual = col.items.length > VIRTUALIZE_THRESHOLD;
                    const inlineReorderTask = (viewMode==='country'||viewMode==='month'||viewMode==='quarter'||(viewMode==='category'&&col.directTasks))?(draggedId,targetId,position)=>{
                                    const colItems=[...col.items].sort((a,b)=>(a.order||0)-(b.order||0));
                                    const dragIdx=colItems.findIndex(t=>t.id===draggedId);
                                    if(dragIdx<0){
                                        const draggedTask=tasks.find(t=>t.id===draggedId);
                                        if(!draggedTask)return;
                                        const changes={};
                                        const targetIdx=colItems.findIndex(t=>t.id===targetId);
                                        if(targetIdx>=0){
                                            changes.order=position==='before'?(colItems[targetIdx].order||0)-0.5:(colItems[targetIdx].order||0)+0.5;
                                        }else{changes.order=colItems.length;}
                                        if(viewMode==='category'){
                                            const defaultAction=actions.find(a=>a.categoryId===col.key&&a.isDefault);
                                            if(defaultAction)changes.actionId=defaultAction.id;
                                        }else if(viewMode==='month'){
                                            const mi=col.key;const yr=Number(selectedYear)||new Date().getFullYear();
                                            const os=draggedTask.startDate?new Date(draggedTask.startDate+'T00:00:00'):null;
                                            const oe=draggedTask.dueDate?new Date(draggedTask.dueDate+'T00:00:00'):null;
                                            const ld=new Date(yr,mi+1,0).getDate();
                                            const sd=os?Math.min(os.getDate(),ld):1;
                                            const ed=oe?Math.min(oe.getDate(),ld):ld;
                                            changes.startDate=yr+'-'+String(mi+1).padStart(2,'0')+'-'+String(sd).padStart(2,'0');
                                            changes.dueDate=yr+'-'+String(mi+1).padStart(2,'0')+'-'+String(ed).padStart(2,'0');
                                            changes.month=mi;
                                        }else if(viewMode==='quarter'){
                                            const qi=col.key;const yr=Number(selectedYear)||new Date().getFullYear();
                                            const fm=qi*3;const lm=qi*3+2;
                                            changes.startDate=yr+'-'+String(fm+1).padStart(2,'0')+'-01';
                                            const ld2=new Date(yr,lm+1,0).getDate();
                                            changes.dueDate=yr+'-'+String(lm+1).padStart(2,'0')+'-'+ld2;
                                            changes.month=fm;
                                        }else if(viewMode==='country'){
                                            changes.countries=col.key==='_unassigned'?[]:[col.key];
                                        }
                                        onUpdateTask(draggedId,changes);
                                        return;
                                    }
                                    const reordered=[...colItems];
                                    reordered.splice(dragIdx,1);
                                    const adjustedTargetIdx=reordered.findIndex(t=>t.id===targetId);
                                    if(adjustedTargetIdx===-1)return;
                                    const insertAt=position==='before'?adjustedTargetIdx:adjustedTargetIdx+1;
                                    const draggedTask=tasks.find(t=>t.id===draggedId);
                                    if(draggedTask)reordered.splice(insertAt,0,draggedTask);
                                    const batchUpdates=reordered.map((t,i)=>({id:t.id,changes:{order:i}}));
                                    if(viewMode==='month'){
                                        const dt=tasks.find(t=>t.id===draggedId);
                                        if(dt){
                                            const dm=getTaskMonth(dt);
                                            if(dm!==col.key){
                                                const mi=col.key;const yr=Number(selectedYear)||new Date().getFullYear();
                                                const os=dt.startDate?new Date(dt.startDate+'T00:00:00'):null;
                                                const oe=dt.dueDate?new Date(dt.dueDate+'T00:00:00'):null;
                                                const ld=new Date(yr,mi+1,0).getDate();
                                                const sd=os?Math.min(os.getDate(),ld):1;
                                                const ed=oe?Math.min(oe.getDate(),ld):ld;
                                                const startDate=yr+'-'+String(mi+1).padStart(2,'0')+'-'+String(sd).padStart(2,'0');
                                                const dueDate=yr+'-'+String(mi+1).padStart(2,'0')+'-'+String(ed).padStart(2,'0');
                                                const bu=batchUpdates.find(u=>u.id===draggedId);
                                                if(bu){bu.changes.startDate=startDate;bu.changes.dueDate=dueDate;bu.changes.month=mi;}
                                            }
                                        }
                                    }else if(viewMode==='quarter'){
                                        const dt=tasks.find(t=>t.id===draggedId);
                                        if(dt){
                                            const dm=getTaskMonth(dt);const dq=Math.floor(dm/3);
                                            if(dq!==col.key){
                                                const qi=col.key;const yr=Number(selectedYear)||new Date().getFullYear();
                                                const fm=qi*3;const lm=qi*3+2;
                                                const startDate=yr+'-'+String(fm+1).padStart(2,'0')+'-01';
                                                const ld2=new Date(yr,lm+1,0).getDate();
                                                const dueDate=yr+'-'+String(lm+1).padStart(2,'0')+'-'+ld2;
                                                const bu=batchUpdates.find(u=>u.id===draggedId);
                                                if(bu){bu.changes.startDate=startDate;bu.changes.dueDate=dueDate;bu.changes.month=fm;}
                                            }
                                        }
                                    }else if(viewMode==='country'){
                                        // Only change country membership on a genuine move to a
                                        // different country column. A same-column reorder must NOT
                                        // overwrite a multi-country task's other countries (M10).
                                        const dt=tasks.find(t=>t.id===draggedId);
                                        const bu=batchUpdates.find(u=>u.id===draggedId);
                                        if(bu&&dt){
                                            const cur=dt.countries||[];
                                            const alreadyInTarget=col.key==='_unassigned'?cur.length===0:cur.includes(col.key);
                                            if(!alreadyInTarget)bu.changes.countries=col.key==='_unassigned'?[]:[col.key];
                                        }
                                    }else if(viewMode==='category'){
                                        const dt=tasks.find(t=>t.id===draggedId);
                                        if(dt){
                                            const defaultAction=actions.find(a=>a.categoryId===col.key&&a.isDefault);
                                            if(defaultAction&&dt.actionId!==defaultAction.id){
                                                const bu=batchUpdates.find(u=>u.id===draggedId);
                                                if(bu)bu.changes.actionId=defaultAction.id;
                                            }
                                        }
                                    }
                                    onBatchUpdateTasks(batchUpdates);
                                }:onReorderTask;
                    const renderCard = isActionView
                        ? (item) => <ActionCard key={item.id} action={item} tasks={filteredTasks} categories={categories} onOpen={onOpenAction} onMoveAction={isReadOnly?null:(sortBy==='order'?onMoveAction:null)} onReorderAction={isReadOnly?null:(sortBy==='order'?onReorderAction:null)} isReadOnly={isReadOnly} onUpdateAction={onUpdateAction}/>
                        : (item) => <TaskCard key={item.id} task={item} action={actions.find(a=>a.id===item.actionId)} onOpen={onOpenTask} onMoveTask={isReadOnly?null:(sortBy==='order'?onMoveTask:null)} onReorderTask={isReadOnly?null:(sortBy==='order'?inlineReorderTask:null)} showAction={viewMode==='month'||viewMode==='country'} categories={categories} allCountries={allCountries} isReadOnly={isReadOnly}/>;
                    return (
                        <Fragment key={col.key}>
                        <div
                            data-col-idx={colIdx}
                            draggable={canDragColumns && col.key !== '_unassigned'}
                            onTouchStart={canDragColumns && col.key !== '_unassigned' ? (e) => handleColTouchStart(e, colIdx) : undefined}
                            onTouchMove={canDragColumns ? handleColTouchMove : undefined}
                            onTouchEnd={canDragColumns ? handleColTouchEnd : undefined}
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
                                        const year=Number(selectedYear)||new Date().getFullYear();
                                        const task=tasks.find(t=>t.id===taskId);
                                        // Preserve day-of-month, clamped to target month's last day
                                        const oldStart=task?.startDate?new Date(task.startDate+'T00:00:00'):null;
                                        const oldEnd=task?.dueDate?new Date(task.dueDate+'T00:00:00'):null;
                                        const lastDay=new Date(year,monthIdx+1,0).getDate();
                                        const startDay=oldStart?Math.min(oldStart.getDate(),lastDay):1;
                                        const endDay=oldEnd?Math.min(oldEnd.getDate(),lastDay):lastDay;
                                        const startDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+String(startDay).padStart(2,'0');
                                        const dueDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+String(endDay).padStart(2,'0');
                                        // Always set startDate so getTaskMonth anchors correctly (fixes null-date tasks from Trello)
                                        onUpdateTask(taskId,{startDate,dueDate,month:monthIdx});
                                    }
                                }else if(viewMode==='quarter'){
                                    const taskId=e.dataTransfer.getData('taskId');
                                    if(taskId){
                                        const quarterIdx=col.key;
                                        const year=Number(selectedYear)||new Date().getFullYear();
                                        const firstMonth=quarterIdx*3;
                                        const lastMonth=quarterIdx*3+2;
                                        // Always set startDate to anchor task in target quarter
                                        const startDate=year+'-'+String(firstMonth+1).padStart(2,'0')+'-01';
                                        const lastDay=new Date(year,lastMonth+1,0).getDate();
                                        const dueDate=year+'-'+String(lastMonth+1).padStart(2,'0')+'-'+lastDay;
                                        onUpdateTask(taskId,{startDate,dueDate,month:firstMonth});
                                    }
                                }else if(viewMode==='category'){
                                    const taskId=e.dataTransfer.getData('taskId');
                                    const actionId=e.dataTransfer.getData('actionId');
                                    if(taskId){
                                        // directTasks mode — move task to default action in target category
                                        const defaultAction=actions.find(a=>a.categoryId===col.key&&a.isDefault);
                                        if(defaultAction){
                                            onUpdateTask(taskId,{actionId:defaultAction.id});
                                        }
                                    }else if(actionId&&onUpdateAction){
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
                            style={{...(canDragColumns && col.key !== '_unassigned' ? {cursor:'grab'} : {}), ...(useVirtual ? {overflowY:'hidden'} : {})}}
                        >
                            <div className="column-header">
                                <div className="column-title">
                                    {canDragColumns && col.key !== '_unassigned' && <span style={{cursor:'grab',opacity:0.4,fontSize:10,marginRight:2}}>⋮⋮</span>}
                                    {col.color&&!col.countryColor&&<StatusIcon statusId={col.key} size={12}/>}
                                    {col.gradient&&<div style={{background:categories.find(c=>c.id===col.key)?.color||'var(--accent)',width:4,height:20,borderRadius:2,flexShrink:0}}/>}
                                    {col.countryColor&&<span style={{background:col.countryColor,color:'white',fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:4,letterSpacing:0.3,lineHeight:1}}>{col.countryFlag}</span>}
                                    {viewMode==='category'&&editingCategoryId===col.key&&!isReadOnly?(
                                        <input type="text" value={editingCategoryValue} onChange={e=>setEditingCategoryValue(e.target.value)} autoFocus onKeyDown={e=>{if(e.key==='Enter'&&editingCategoryValue.trim()){onUpdateCategory(col.key,{name:editingCategoryValue.trim()});setEditingCategoryId(null);}if(e.key==='Escape')setEditingCategoryId(null);}} onBlur={()=>{if(editingCategoryValue.trim()&&editingCategoryValue!==col.name)onUpdateCategory(col.key,{name:editingCategoryValue.trim()});setEditingCategoryId(null);}} onClick={e=>e.stopPropagation()} style={{fontSize:12,fontWeight:600,padding:'2px 4px',border:'1px solid var(--accent)',borderRadius:4,outline:'none',width:'100%'}}/>
                                    ):(
                                        <span className="column-name" onDoubleClick={()=>{if(viewMode==='category'&&!isReadOnly&&onUpdateCategory){setEditingCategoryId(col.key);setEditingCategoryValue(col.name);}}}>{col.name}</span>
                                    )}
                                    <span className="column-count">{col.items.length}</span>
                                </div>
                                                            </div>
                            <div className="kanban-cards" style={useVirtual ? {minHeight:0} : undefined} onDragStart={(e) => {
                                // Prevent column drag when dragging cards
                                e.stopPropagation();
                                if (isUserInteractingRef) isUserInteractingRef.current = true;
                            }} onDragEnd={() => {
                                if (isUserInteractingRef) isUserInteractingRef.current = false;
                            }}>
                                {useVirtual ? <VirtualKanbanCards items={col.items} renderItem={renderCard}/> : col.items.map(renderCard)}
                                {col.items.length===0&&<div className="column-empty" style={{color:'var(--text-muted)',fontSize:12}}>No tasks yet</div>}
                                {!isReadOnly&&quickAddCol===col.key?<form onSubmit={e=>{e.preventDefault();const title=quickAddTitle.trim();if(!title)return;
                                    if(viewMode==='category'&&col.directTasks){let defAct=actions.find(a=>a.categoryId===col.key&&a.isDefault);if(!defAct){const now=new Date().toISOString();defAct={id:`a-${crypto.randomUUID()}`,name:col.name,categoryId:col.key,isDefault:true,budget:0,priority:'medium',tags:[],status:'active',createdAt:now,updatedAt:now};onAddAction(defAct);}onAddTask({title,actionId:defAct.id,status:'todo'});}
                                    else if(viewMode==='action'){onAddTask({title,actionId:selectedAction||actions[0]?.id||'',status:col.key});}
                                    else if(viewMode==='month'){const y=selectedYear,m=col.key;const sd=y+'-'+String(m+1).padStart(2,'0')+'-01';const ld=new Date(y,m+1,0).getDate();onAddTask({title,startDate:sd,dueDate:y+'-'+String(m+1).padStart(2,'0')+'-'+ld});}
                                    else if(viewMode==='country'){onAddTask({title,countries:col.key==='_unassigned'?[]:[col.key]});}
                                    else if(viewMode==='category'&&!isCardAsTask&&!col.directTasks){const now=new Date().toISOString();onAddAction({id:crypto.randomUUID(),name:title,categoryId:col.key,budget:0,priority:'medium',tags:[],status:'active',createdAt:now,updatedAt:now});}
                                    else{onAddTask({title});}
                                    setQuickAddTitle('');setQuickAddCol(null);
                                }} style={{padding:'4px 0'}}>
                                    <input type="text" value={quickAddTitle} onChange={e=>setQuickAddTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setQuickAddCol(null);setQuickAddTitle('');}}} autoFocus placeholder={viewMode==='category'&&!isCardAsTask&&!col.directTasks?"Action name...":"Task title..."} style={{width:'100%',padding:'6px 8px',borderRadius:4,border:'1px solid var(--accent)',fontSize:12,outline:'none',background:'var(--bg-primary)',color:'var(--text-primary)'}}/>
                                </form>:null}
                                <button onClick={()=>{if(isReadOnly)return;setQuickAddCol(quickAddCol===col.key?null:col.key);setQuickAddTitle('');}} className="add-card-btn" style={isReadOnly?{display:'none'}:{}}>{quickAddCol===col.key?'Cancel':'+ Quick add'}</button>
                                <button onClick={()=>{
                                    const today=new Date().toISOString().split('T')[0];
                                    const oneWeekLater=new Date(Date.now()+7*24*60*60*1000).toISOString().split('T')[0];
                                    if(viewMode==='month'){
                                        const monthIdx=col.key;
                                        const year=selectedYear;
                                        const startDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-01';
                                        const lastDay=new Date(year,monthIdx+1,0).getDate();
                                        const dueDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+lastDay;
                                        if(onRequestNewTask) onRequestNewTask({startDate,dueDate});
                                    }else if(viewMode==='quarter'){
                                        const quarterIdx=col.key;
                                        const year=selectedYear;
                                        const firstMonth=quarterIdx*3;
                                        const startDate=year+'-'+String(firstMonth+1).padStart(2,'0')+'-01';
                                        const lastMonth=quarterIdx*3+2;
                                        const lastDay=new Date(year,lastMonth+1,0).getDate();
                                        const dueDate=year+'-'+String(lastMonth+1).padStart(2,'0')+'-'+lastDay;
                                        if(onRequestNewTask) onRequestNewTask({startDate,dueDate});
                                    }else if(viewMode==='category'){
                                        if(col.directTasks){
                                            // card-as-task mode: create a task under the default action
                                            let defaultAction=actions.find(a=>a.categoryId===col.key&&a.isDefault);
                                            if(!defaultAction){
                                                const now=new Date().toISOString();
                                                defaultAction={id:`a-${crypto.randomUUID()}`,name:col.name,categoryId:col.key,isDefault:true,budget:0,priority:'medium',tags:[],status:'active',createdAt:now,updatedAt:now};
                                                onAddAction(defaultAction);
                                            }
                                            if(onRequestNewTask) onRequestNewTask({actionId:defaultAction.id});
                                        }else{
                                            const now=new Date().toISOString();const newAction={id:`a-${crypto.randomUUID()}`,name:'New action',categoryId:col.key,budget:0,priority:'medium',tags:[],status:'active',createdAt:now,updatedAt:now};
                                            onAddAction(newAction);
                                            setTimeout(()=>onOpenAction(newAction),100);
                                        }
                                    }else if(viewMode==='action'){
                                        if(onRequestNewTask) onRequestNewTask({actionId:selectedAction||actions[0]?.id||'',status:col.key});
                                    }else if(viewMode==='country'){
                                        if(onRequestNewTask) onRequestNewTask({countries:col.key==='_unassigned'?[]:[col.key]});
                                    }
                                }} className="add-card-btn" style={isReadOnly?{display:'none'}:{}}>
                                    + Add
                                </button>
                            </div>
                        </div>
                        </Fragment>
                    );
                    })}
                        </div>
                    </div>
                    ))}
                    {viewMode==='category'&&!isReadOnly&&onAddCategory&&(
                        showAddCategory?(
                            <div className="kanban-column" style={{minWidth:200,background:'var(--bg-secondary)',border:'1px dashed var(--border)',borderRadius:8,padding:12}}>
                                <input type="text" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} placeholder="Category name..." autoFocus onKeyDown={e=>{if(e.key==='Enter'&&newCategoryName.trim()){onAddCategory({id:`cat-${crypto.randomUUID()}`,name:newCategoryName.trim(),color:CONFIG.CATEGORIES[categories.length%CONFIG.CATEGORIES.length]?.color||'#6366f1',gradient:CONFIG.CATEGORIES[categories.length%CONFIG.CATEGORIES.length]?.gradient||'from-indigo-500 to-purple-600',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});setNewCategoryName('');setShowAddCategory(false);}if(e.key==='Escape'){setShowAddCategory(false);setNewCategoryName('');}}} style={{width:'100%',padding:'6px 8px',borderRadius:4,border:'1px solid var(--border)',fontSize:12,marginBottom:6}}/>
                                <div style={{display:'flex',gap:4}}>
                                    <button onClick={()=>{if(newCategoryName.trim()){onAddCategory({id:`cat-${crypto.randomUUID()}`,name:newCategoryName.trim(),color:CONFIG.CATEGORIES[categories.length%CONFIG.CATEGORIES.length]?.color||'#6366f1',gradient:CONFIG.CATEGORIES[categories.length%CONFIG.CATEGORIES.length]?.gradient||'from-indigo-500 to-purple-600',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});setNewCategoryName('');setShowAddCategory(false);}}} style={{padding:'4px 10px',borderRadius:4,background:'var(--accent)',color:'white',border:'none',cursor:'pointer',fontSize:11}}>Create</button>
                                    <button onClick={()=>{setShowAddCategory(false);setNewCategoryName('');}} style={{padding:'4px 10px',borderRadius:4,background:'var(--bg-primary)',border:'1px solid var(--border)',cursor:'pointer',fontSize:11}}>Cancel</button>
                                </div>
                            </div>
                        ):(
                            <div className="kanban-column" onClick={()=>setShowAddCategory(true)} style={{minWidth:120,background:'transparent',border:'1px dashed var(--border)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',opacity:0.6,padding:16}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.6'}>
                                <span style={{fontSize:12,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:4}}><Icon.Plus size={12}/> Add category</span>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default memo(KanbanView);
