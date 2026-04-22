import { memo } from 'react';
import { CONFIG } from '../../config.js';

const CHANNEL_COLORS = {
    social: '#60a5fa', gads: '#fbbf24', lads: '#818cf8', events: '#f472b6',
    seo: '#4ade80', press: '#c4b5fd', email: '#fbbf24', web: '#818cf8',
    video: '#f87171', lp: '#2dd4bf', ia: '#c4b5fd', auto: '#fb923c',
};
const DARK_CHANNELS = ['gads', 'email'];

const TimelineBar = ({
    task, pos, action, zoom, swimLane, isReadOnly,
    isResizing, justResized, isDragOver, dragOverPosition,
    onOpenTask, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onStartResize, onResetLane,
}) => {
    const status = CONFIG.STATUSES.find(s => s.id === task.status);
    const isCompleted = task.status === 'completed';
    const channels = task.channels || action?.tags || [];
    const mainChannel = channels[0] || '';
    const barColor = CHANNEL_COLORS[mainChannel] || status?.color || '#94a3b8';
    const textColor = DARK_CHANNELS.includes(mainChannel) ? '#78350f' : 'white';
    const dragOverClass = isDragOver ? (dragOverPosition === 'before' ? 'drop-indicator-before' : 'drop-indicator-after') : '';
    const topOffset = 8 + swimLane * 34;
    const isPinned = typeof task.swimLane === 'number' && task.swimLane >= 0;
    const resizingStyle = isResizing ? { boxShadow: '0 0 0 3px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.3)', transform: 'scale(1.02)', zIndex: 30 } : {};

    const handleContextMenu = (e) => {
        if (!isPinned || isReadOnly || !onResetLane) return;
        e.preventDefault();
        e.stopPropagation();
        onResetLane(task.id);
    };

    return (
        <div
            draggable={!isReadOnly && !isResizing}
            onClick={() => !isResizing && !justResized && onOpenTask(task)}
            onContextMenu={handleContextMenu}
            onDragStart={(e) => onDragStart(e, task)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, task)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, task)}
            className={`timeline-bar absolute flex items-center ${isResizing ? '' : 'cursor-move'} ${dragOverClass}`}
            style={{
                left: pos.left, width: Math.max(pos.width - 2, 4), top: `${topOffset}px`, height: 26,
                borderRadius: 5, padding: '0 8px', fontSize: 10, fontWeight: 500,
                // overflow:visible so the title can spill to the right of short bars onto the
                // timeline background instead of being ellipsized out of sight.
                whiteSpace: 'nowrap', overflow: 'visible',
                backgroundColor: barColor, color: textColor, zIndex: 1,
                transition: 'transform 0.15s, box-shadow 0.15s',
                opacity: isCompleted ? 0.45 : 1,
                ...resizingStyle,
            }}
            title={`${task.title}\n${status?.name}\n${task.startDate} → ${task.dueDate}${task.budget > 0 ? '\nBudget: ' + task.budget + '€' : ''}${isPinned ? '\n📌 Pinned lane (right-click to reset)' : ''}`}
        >
            {!isReadOnly && (
                <div className="resize-handle resize-handle-left"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onStartResize(task.id, 'left', e.clientX, task); }}
                    onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); onStartResize(task.id, 'left', e.touches[0].clientX, task); }}
                    onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); return false; }}
                    draggable={false}
                />
            )}
            <span
                className="flex-1 pointer-events-none"
                style={{
                    whiteSpace: 'nowrap',
                    overflow: 'visible',
                    // Keep the title readable both inside the colored bar and on the white
                    // timeline background when it spills to the right of a short bar.
                    color: '#1f2937',
                    textShadow: '0 0 3px rgba(255,255,255,0.85), 0 0 6px rgba(255,255,255,0.6)',
                    ...(isCompleted ? { textDecoration: 'line-through' } : {})
                }}
            >
                {task.title}
            </span>
            {task.budget > 0 && (zoom === 'month' || zoom === 'quarter') && (
                <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 9 }} className="pointer-events-none">({(task.budget / 1000).toFixed(0)}k)</span>
            )}
            {!isReadOnly && (
                <div className="resize-handle resize-handle-right"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onStartResize(task.id, 'right', e.clientX, task); }}
                    onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); onStartResize(task.id, 'right', e.touches[0].clientX, task); }}
                    onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); return false; }}
                    draggable={false}
                />
            )}
        </div>
    );
};

export default memo(TimelineBar);
