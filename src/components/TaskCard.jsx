import { useState, useRef, memo } from 'react';
import { useBoard } from '../context.js';
import { CONFIG } from '../config.js';
const TaskCard = ({task, action, onOpen, onMoveTask, onReorderTask, showAction=false, onTouchDrag, categories, allCountries, isReadOnly}) => {
    const { effectiveMembers } = useBoard();
    const boardMembers = effectiveMembers || [];
    const [touching, setTouching] = useState(false);
    const [dragOverPosition, setDragOverPosition] = useState(null);
    const cardRef = useRef(null);
    const touchTimeout = useRef(null);
    const isCompleted = task.status === 'completed';

    const handleTouchStart = (e) => {
        touchTimeout.current = setTimeout(() => {
            setTouching(true);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 300);
    };
    const handleTouchEnd = () => {
        if (touchTimeout.current) clearTimeout(touchTimeout.current);
        setTouching(false);
    };
    const handleTouchMove = (e) => {
        if (touching && onTouchDrag) {
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                const dropZone = el.closest('[data-drop-month]');
                if (dropZone) {
                    dropZone.classList.add('drag-over');
                }
            }
        }
    };

    const handleDragOver = (e) => {
        if (!onReorderTask) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = cardRef.current.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const position = e.clientY < midpoint ? 'before' : 'after';
        setDragOverPosition(position);
    };

    const handleDragLeave = (e) => {
        if (!onReorderTask) return;
        // Only clear if actually leaving the card (not moving between children)
        if (cardRef.current && !cardRef.current.contains(e.relatedTarget)) {
            e.stopPropagation();
            setDragOverPosition(null);
        }
    };

    const handleDrop = (e) => {
        if (!onReorderTask) {
            setDragOverPosition(null);
            return; // Let event bubble to column handler
        }
        e.preventDefault();
        e.stopPropagation();
        // Compute position from drop event directly — immune to dragLeave race
        let pos = dragOverPosition;
        if (!pos && cardRef.current) {
            const rect = cardRef.current.getBoundingClientRect();
            pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        }
        const draggedId = e.dataTransfer.getData('taskId');
        if (draggedId && draggedId !== task.id && pos) {
            onReorderTask(draggedId, task.id, pos);
        }
        setDragOverPosition(null);
    };

    const status = CONFIG.STATUSES.find(s => s.id === task.status);
    const priority = CONFIG.PRIORITIES.find(p => p.id === task.priority);
    const category = categories?.find(c => c.id === action?.categoryId);
    // Count checklist items across both old flat format and new named checklists
    const allCheckItems = (task.checklists || []).flatMap(cl => cl.items || []).concat(task.checklist || []);
    const checkDone = allCheckItems.filter(c => c.done).length;
    const checkTotal = allCheckItems.length;
    const attCount = (task.attachments || []).length;

    const handleToggleComplete = (e) => {
        e.stopPropagation();
        if (onUpdateTask) {
            onUpdateTask(task.id, { status: isCompleted ? 'todo' : 'completed' });
        }
    };

    return (
        <div
            ref={cardRef}
            draggable={!isReadOnly}
            onDragStart={(e) => { if(isReadOnly){e.preventDefault();return;} e.dataTransfer.setData('taskId', task.id); e.dataTransfer.setData('type', 'task'); e.currentTarget.classList.add('dragging'); }}
            onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); setDragOverPosition(null); }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onTouchStart={isReadOnly ? undefined : handleTouchStart}
            onTouchMove={isReadOnly ? undefined : handleTouchMove}
            onTouchEnd={isReadOnly ? undefined : handleTouchEnd}
            onClick={() => onOpen(task)}
            className={`kanban-card ${task.status === 'completed' ? 'completed' : ''} ${touching ? 'touch-dragging' : ''} ${dragOverPosition === 'before' ? 'drop-indicator-before' : dragOverPosition === 'after' ? 'drop-indicator-after' : ''}`}>
            <div className="card-header">
                <div className="card-title" style={task.status === 'completed' ? {textDecoration:'line-through',color:'var(--text-muted)'} : task.trelloArchived ? {color:'var(--text-muted)'} : {}}>
                    {task._sourceBoardColor && (
                        <span title={`Board: ${task._sourceBoardName || ''}`} style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:task._sourceBoardColor,marginRight:6,verticalAlign:'middle'}}/>
                    )}
                    {task.trelloArchived && <span style={{fontSize:9,background:'var(--text-muted)',color:'white',borderRadius:3,padding:'1px 4px',marginRight:4,verticalAlign:'middle',fontWeight:600}}>ARCHIVED</span>}{task.title}
                </div>
                <div className={`card-priority ${task.priority}`}/>
            </div>
            {(task.channels || action?.tags || []).length > 0 && <div className="card-tags">
                {(task.channels || action?.tags || []).slice(0, 2).map(chId => { const ch = CONFIG.CHANNELS.find(c => c.id === chId); return ch ? <span key={chId} className={`card-tag ${chId}`}>{ch.name}</span> : null; })}
            </div>}
            {(task.startDate || task.dueDate || task.budget > 0 || (task.assignees||[]).length > 0 || (task.comments?.length || 0) > 0 || checkTotal > 0 || attCount > 0) && <div className="card-footer">
                <span className={`card-date ${task.dueDate && new Date(task.dueDate+'T23:59:59') < new Date() && task.status !== 'completed' ? 'overdue' : ''}`}>{task.dueDate && new Date(task.dueDate+'T23:59:59') < new Date() && task.status !== 'completed' && <span style={{fontSize:9,background:'var(--error)',color:'white',borderRadius:3,padding:'1px 4px',marginRight:3,fontWeight:600,letterSpacing:0.3}}>LATE</span>}{task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US',{day:'numeric',month:'short'}) : task.startDate ? new Date(task.startDate).toLocaleDateString('en-US',{day:'numeric',month:'short'}) : ''}</span>
                <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
                    {checkTotal > 0 && <span style={{display:'flex',alignItems:'center',gap:3,fontSize:10,color:checkDone===checkTotal?'var(--success)':'var(--text-muted)'}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>{checkDone}/{checkTotal}</span>}
                    {attCount > 0 && <span style={{display:'flex',alignItems:'center',gap:3,fontSize:10,color:'var(--text-muted)'}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>{attCount}</span>}
                    {(task.comments?.length || 0) > 0 && <span style={{display:'flex',alignItems:'center',gap:3,fontSize:10,color:'var(--text-muted)'}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>{task.comments.length}</span>}
                    {task.budget > 0 && <span className="card-budget">{task.budget.toLocaleString()}€</span>}
                    {(()=>{const resolved=(task.assignees||[]).filter(id=>boardMembers.some(mb=>mb.id===id));return resolved.length>0&&<div style={{display:'flex',alignItems:'center'}}>
                        {resolved.slice(0,3).map((mId,idx) => {
                            const m = boardMembers.find(mb => mb.id === mId);
                            return m.avatarUrl
                                ? <img key={mId} src={m.avatarUrl} alt={m.fullName||''} title={m.fullName||m.username} style={{width:22,height:22,borderRadius:'50%',border:'2px solid var(--bg-primary)',marginLeft:idx>0?-6:0}}/>
                                : <span key={mId} title={m.fullName||m.username} style={{width:22,height:22,borderRadius:'50%',background:'var(--accent)',color:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600,border:'2px solid var(--bg-primary)',marginLeft:idx>0?-6:0}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>;
                        })}
                        {resolved.length > 3 && <span style={{fontSize:10,color:'var(--text-muted)',marginLeft:4}}>+{resolved.length-3}</span>}
                    </div>})()}
                </div>
            </div>}
        </div>
    );
};

export default memo(TaskCard);
