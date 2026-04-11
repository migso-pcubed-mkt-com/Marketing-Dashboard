import { useState, useRef, memo } from 'react';
import { CONFIG } from '../config.js';
import { useBoard } from '../context.js';
import { useTouchDrag } from '../hooks/useTouchDrag.js';

const ActionCard = ({action, tasks, categories, onOpen, onMoveAction, onReorderAction, isReadOnly, onUpdateAction}) => {
    const { currentBoard } = useBoard();
    const boardMembers = currentBoard?.members || [];
    const [dragOverPosition, setDragOverPosition] = useState(null);
    const cardRef = useRef(null);
    const { touchHandlers } = useTouchDrag({
        itemAttribute: 'data-action-id',
        onReorder: onReorderAction,
        disabled: isReadOnly || !onReorderAction,
    });

    const handleDragOver = (e) => {
        if (!onReorderAction) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = cardRef.current.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const position = e.clientY < midpoint ? 'before' : 'after';
        setDragOverPosition(position);
    };

    const handleDragLeave = (e) => {
        e.stopPropagation();
        setDragOverPosition(null);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!onReorderAction || !dragOverPosition) return;
        const draggedId = e.dataTransfer.getData('actionId');
        if (draggedId && draggedId !== action.id) {
            onReorderAction(draggedId, action.id, dragOverPosition);
        }
        setDragOverPosition(null);
    };

    const actionTasks = tasks.filter(t => t.actionId === action.id);
    const completed = actionTasks.filter(t => t.status === 'completed').length;
    const pct = actionTasks.length > 0 ? Math.round((completed / actionTasks.length) * 100) : 0;
    const cat = categories.find(c => c.id === action.categoryId);

    // Collect unique assignees from all tasks of this action
    const actionAssignees = action.assignees || [];
    const allAssignees = [...new Set([...actionAssignees, ...actionTasks.flatMap(t => t.assignees || [])])].filter(id => boardMembers.some(mb => mb.id === id));
    const totalBudget = (action.budget||0) + actionTasks.reduce((s, t) => s + (t.budget || 0), 0);
    const totalComments = (action.comments?.length || 0) + actionTasks.reduce((s, t) => s + (t.comments?.length || 0), 0);

    return (
        <div
            ref={cardRef}
            data-action-id={action.id}
            draggable={!isReadOnly}
            onDragStart={(e) => { if(isReadOnly){e.preventDefault();return;} e.dataTransfer.setData('actionId', action.id); e.currentTarget.classList.add('dragging'); }}
            onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); setDragOverPosition(null); }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            {...(isReadOnly ? {} : touchHandlers)}
            onClick={(e) => { if (!e.defaultPrevented) onOpen(action); }}
            className={`action-card ${dragOverPosition === 'before' ? 'drop-indicator-before' : dragOverPosition === 'after' ? 'drop-indicator-after' : ''}`}>
            <div className="card-header">
                <div className="card-title" style={action.status === 'completed' ? {textDecoration:'line-through',color:'var(--text-muted)'} : action.trelloArchived ? {color:'var(--text-muted)'} : {}}>{action.trelloArchived && <span style={{fontSize:9,background:'var(--text-muted)',color:'white',borderRadius:3,padding:'1px 4px',marginRight:4,verticalAlign:'middle',fontWeight:600}}>ARCHIVED</span>}{action.name}</div>
                <div className={`card-priority ${action.priority || 'medium'}`}/>
            </div>
            {action.tags?.length > 0 && <div className="card-tags">{action.tags.slice(0, 3).map(t => { const ch = CONFIG.CHANNELS.find(c => c.id === t); return <span key={t} className={`card-tag ${t}`}>{ch?.name || t}</span>; })}</div>}
            <div className="action-progress-section">
                <div className="action-progress-bar"><div className={`action-progress-fill ${pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low'}`} style={{width:`${pct}%`}}/></div>
                <div className="action-progress-label"><span className="action-task-count"><strong>{completed}</strong>/{actionTasks.length} tasks</span><span className="action-progress-percent">{pct}%</span></div>
            </div>
            {(action.dueDate || action.startDate || allAssignees.length > 0 || totalBudget > 0 || totalComments > 0) && <div className="card-footer">
                {(action.dueDate || action.startDate) && <span className={`card-date ${action.dueDate && new Date(action.dueDate+'T00:00:00') < new Date() && action.status !== 'completed' ? 'overdue' : ''}`}>{action.dueDate ? new Date(action.dueDate+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short'}) : new Date(action.startDate+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short'})}</span>}
                <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
                    {totalComments > 0 && <span style={{display:'flex',alignItems:'center',gap:3,fontSize:10,color:'var(--text-muted)'}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>{totalComments}</span>}
                    {totalBudget > 0 && <span className="card-budget">{totalBudget.toLocaleString()}€</span>}
                    {allAssignees.length > 0 && <div style={{display:'flex',alignItems:'center'}}>
                        {allAssignees.slice(0,3).map((mId,idx) => {
                            const m = boardMembers.find(mb => mb.id === mId);
                            if (!m) return null;
                            return m.avatarUrl
                                ? <img key={mId} src={m.avatarUrl} alt={m.fullName||''} title={m.fullName||m.username} style={{width:22,height:22,borderRadius:'50%',border:'2px solid var(--bg-primary)',marginLeft:idx>0?-6:0}}/>
                                : <span key={mId} title={m.fullName||m.username} style={{width:22,height:22,borderRadius:'50%',background:'var(--accent)',color:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600,border:'2px solid var(--bg-primary)',marginLeft:idx>0?-6:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>;
                        })}
                        {allAssignees.length > 3 && <span style={{fontSize:10,color:'var(--text-muted)',marginLeft:4}}>+{allAssignees.length-3}</span>}
                    </div>}
                </div>
            </div>}
        </div>
    );
};

export default memo(ActionCard);
