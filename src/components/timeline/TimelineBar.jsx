import { memo } from 'react';
import { CONFIG } from '../../config.js';

const CHANNEL_COLORS = {
    social: '#60a5fa', gads: '#fbbf24', lads: '#818cf8', events: '#f472b6',
    seo: '#4ade80', press: '#c4b5fd', email: '#fbbf24', web: '#818cf8',
    video: '#f87171', lp: '#2dd4bf', ia: '#c4b5fd', auto: '#fb923c',
};
const DARK_CHANNELS = ['gads', 'email'];
// Bars narrower than this (in pixels) can't realistically fit their title, so we spill the
// full title as a dedicated overflow label to the right of the bar — on the white timeline
// background — instead of ellipsizing it inside the bar.
const OVERFLOW_LABEL_THRESHOLD = 80;

// Minimum free pixels to the right of a narrow bar before we dare spill the
// overflow label onto the timeline background. If the next bar in the same
// lane is closer than this, we skip the label and rely on the hover tooltip
// so the label never gets visually absorbed by the neighbour.
const OVERFLOW_LABEL_MIN_SPACE = 40;

const TimelineBar = ({
    task, pos, action, zoom, swimLane, isReadOnly, neighborLeftEdge,
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
    const freeSpaceRight = typeof neighborLeftEdge === 'number'
        ? Math.max(0, neighborLeftEdge - (pos.left + pos.width))
        : Infinity;
    const showOverflowLabel = pos.width < OVERFLOW_LABEL_THRESHOLD && freeSpaceRight >= OVERFLOW_LABEL_MIN_SPACE;
    const overflowMaxWidth = freeSpaceRight === Infinity
        ? undefined
        : Math.max(0, freeSpaceRight - 6);
    const barWidth = Math.max(pos.width - 2, 4);

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
                left: pos.left, width: barWidth, top: `${topOffset}px`, height: 26,
                borderRadius: 5, padding: '0 8px', fontSize: 10, fontWeight: 500,
                // overflow:visible so the optional overflow-label span (left:100%) isn't
                // clipped. The inner .truncate span still ellipsizes its own content so
                // the title inside the colored bar never spills onto neighbouring bars.
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
            <span className="truncate flex-1 pointer-events-none" style={isCompleted ? { textDecoration: 'line-through' } : {}}>{task.title}</span>
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
            {showOverflowLabel && (
                <span
                    className="pointer-events-none"
                    style={{
                        position: 'absolute',
                        left: '100%',
                        marginLeft: 6,
                        top: 0,
                        height: 26,
                        display: 'flex',
                        alignItems: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: overflowMaxWidth,
                        color: 'var(--text-primary, #1f2937)',
                        fontSize: 10,
                        fontWeight: 500,
                        textDecoration: isCompleted ? 'line-through' : 'none',
                        opacity: isCompleted ? 0.6 : 0.9,
                        zIndex: 2,
                    }}
                >
                    {task.title}
                </span>
            )}
        </div>
    );
};

export default memo(TimelineBar);
