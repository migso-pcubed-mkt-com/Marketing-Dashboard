import { useState, useRef } from 'react';
import { CONFIG } from '../config.js';

const ActionCard = ({action, tasks, categories, onOpen, onMoveAction, onReorderAction, isReadOnly, onUpdateAction}) => {
    const [dragOverPosition, setDragOverPosition] = useState(null);
    const cardRef = useRef(null);

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

    return (
        <div
            ref={cardRef}
            draggable={!isReadOnly}
            onDragStart={(e) => { if(isReadOnly){e.preventDefault();return;} e.dataTransfer.setData('actionId', action.id); e.currentTarget.classList.add('dragging'); }}
            onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); setDragOverPosition(null); }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={(e) => { if (!e.defaultPrevented) onOpen(action); }}
            className={`action-card ${dragOverPosition === 'before' ? 'drop-indicator-before' : dragOverPosition === 'after' ? 'drop-indicator-after' : ''}`}>
            <div className="card-header">
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isReadOnly && onUpdateAction) onUpdateAction(action.id, { status: action.status === 'completed' ? 'inprogress' : 'completed' }); }} style={{width:20,height:20,borderRadius:'50%',border: action.status === 'completed' ? '2px solid #22c55e' : '2px solid var(--border-strong)',background: action.status === 'completed' ? '#22c55e' : 'transparent',cursor:isReadOnly?'default':'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',padding:0}} title={action.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}>{action.status === 'completed' && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button>
                <div className="card-title" style={action.status === 'completed' ? {textDecoration:'line-through',color:'var(--text-muted)'} : {}}>{action.name}</div>
                <div className={`card-priority ${action.priority || 'medium'}`}/>
            </div>
            {action.tags?.length > 0 && <div className="card-tags">{action.tags.slice(0, 3).map(t => { const ch = CONFIG.CHANNELS.find(c => c.id === t); return <span key={t} className={`card-tag ${t}`}>{ch?.name || t}</span>; })}</div>}
            <div className="action-progress-section">
                <div className="action-progress-bar"><div className={`action-progress-fill ${pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low'}`} style={{width:`${pct}%`}}/></div>
                <div className="action-progress-label"><span className="action-task-count"><strong>{completed}</strong>/{actionTasks.length} tasks</span><span className="action-progress-percent">{pct}%</span></div>
            </div>
            {actionTasks.reduce((s, t) => s + (t.budget || 0), 0) > 0 && <div className="card-footer"><span/><span className="card-budget">{actionTasks.reduce((s, t) => s + (t.budget || 0), 0).toLocaleString()}€</span></div>}
        </div>
    );
};

export default ActionCard;
