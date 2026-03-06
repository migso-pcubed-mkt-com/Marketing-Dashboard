import { useState, useRef } from 'react';
import { CONFIG } from '../config.js';

const TaskCard = ({task, action, onOpen, onMoveTask, onReorderTask, showAction=false, onTouchDrag, categories, allCountries}) => {
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
        e.stopPropagation();
        setDragOverPosition(null);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!onReorderTask || !dragOverPosition) return;
        const draggedId = e.dataTransfer.getData('taskId');
        if (draggedId && draggedId !== task.id) {
            onReorderTask(draggedId, task.id, dragOverPosition);
        }
        setDragOverPosition(null);
    };

    const status = CONFIG.STATUSES.find(s => s.id === task.status);
    const priority = CONFIG.PRIORITIES.find(p => p.id === task.priority);
    const category = categories?.find(c => c.id === action?.categoryId);
    const checklistPct = task.checklist?.length > 0 ? Math.round((task.checklist.filter(c => c.done).length / task.checklist.length) * 100) : null;

    const handleToggleComplete = (e) => {
        e.stopPropagation();
        if (onUpdateTask) {
            onUpdateTask(task.id, { status: isCompleted ? 'todo' : 'completed' });
        }
    };

    return (
        <div
            ref={cardRef}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('taskId', task.id); e.dataTransfer.setData('type', 'task'); e.currentTarget.classList.add('dragging'); }}
            onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); setDragOverPosition(null); }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => onOpen(task)}
            className={`kanban-card ${task.status === 'completed' ? 'completed' : ''} ${touching ? 'touch-dragging' : ''} ${dragOverPosition === 'before' ? 'drop-indicator-before' : dragOverPosition === 'after' ? 'drop-indicator-after' : ''}`}>
            <div className="card-header">
                <div className="card-title" style={task.status === 'completed' ? {textDecoration:'line-through',color:'var(--text-muted)'} : {}}>{task.title}</div>
                <div className={`card-priority ${task.priority}`}/>
            </div>
            {(task.channels || action?.tags || []).length > 0 && <div className="card-tags">
                {(task.channels || action?.tags || []).slice(0, 2).map(chId => { const ch = CONFIG.CHANNELS.find(c => c.id === chId); return ch ? <span key={chId} className={`card-tag ${chId}`}>{ch.name}</span> : null; })}
            </div>}
            {(task.dueDate || task.budget > 0) && <div className="card-footer">
                <span className={`card-date ${task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed' ? 'overdue' : ''}`}>{task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', {day:'numeric',month:'short'}) : ''}</span>
                {task.budget > 0 && <span className="card-budget">{task.budget.toLocaleString()}€</span>}
            </div>}
        </div>
    );
};

export default TaskCard;
