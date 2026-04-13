import { useState, useMemo, useRef, useCallback, memo } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';

const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const CalendarView = ({ categories, actions, tasks, onOpenTask, onUpdateTask, onAddTask, filters, selectedYear, onYearChange, isReadOnly }) => {
    const [mode, setMode] = useState('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [expandedDay, setExpandedDay] = useState(null); // dateStr of day showing all tasks
    // Touch drag state for calendar task pills
    const touchDragRef = useRef({ taskId: null, timeout: null });
    const [touchDragging, setTouchDragging] = useState(false);
    const calendarTouchStart = useCallback((e, taskId) => {
        if (isReadOnly) return;
        const touch = e.touches[0];
        touchDragRef.current.startPos = { x: touch.clientX, y: touch.clientY };
        touchDragRef.current.timeout = setTimeout(() => {
            touchDragRef.current.taskId = taskId;
            setTouchDragging(true);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 300);
    }, [isReadOnly]);
    const calendarTouchMove = useCallback((e) => {
        if (!touchDragRef.current.taskId) {
            // Cancel if moved too far before activation
            if (touchDragRef.current.timeout) {
                const touch = e.touches[0];
                const sp = touchDragRef.current.startPos;
                if (sp && (Math.abs(touch.clientX - sp.x) > 10 || Math.abs(touch.clientY - sp.y) > 10)) {
                    clearTimeout(touchDragRef.current.timeout);
                    touchDragRef.current.timeout = null;
                }
            }
            return;
        }
        e.preventDefault();
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el) return;
        document.querySelectorAll('.calendar-day-dragover').forEach(n => n.classList.remove('calendar-day-dragover'));
        const dayCell = el.closest('[data-calendar-date]');
        if (dayCell) dayCell.classList.add('calendar-day-dragover');
    }, []);
    const calendarTouchEnd = useCallback((e) => {
        const taskId = touchDragRef.current.taskId;
        if (touchDragRef.current.timeout) clearTimeout(touchDragRef.current.timeout);
        if (taskId && onUpdateTask) {
            const touch = e.changedTouches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                const dayCell = el.closest('[data-calendar-date]');
                if (dayCell) {
                    const dateStr = dayCell.getAttribute('data-calendar-date');
                    const date = new Date(dateStr + 'T00:00:00');
                    const task = tasks.find(t => t.id === taskId);
                    if (task && dateStr) {
                        if (task.startDate && task.dueDate) {
                            const start = new Date(task.startDate);
                            const end = new Date(task.dueDate);
                            const duration = Math.round((end - start) / (1000 * 60 * 60 * 24));
                            const newEnd = new Date(date);
                            newEnd.setDate(newEnd.getDate() + duration);
                            onUpdateTask(taskId, { startDate: dateStr, dueDate: formatDate(newEnd), month: date.getMonth() });
                        } else {
                            onUpdateTask(taskId, { startDate: dateStr, dueDate: dateStr, month: date.getMonth() });
                        }
                    }
                }
            }
        }
        document.querySelectorAll('.calendar-day-dragover').forEach(n => n.classList.remove('calendar-day-dragover'));
        // Restore opacity
        if (taskId) {
            document.querySelectorAll(`[data-cal-task="${taskId}"]`).forEach(n => { n.style.opacity = ''; });
        }
        touchDragRef.current = { taskId: null, timeout: null };
        setTouchDragging(false);
    }, [tasks, onUpdateTask]);

    const filteredTasks = useMemo(() => tasks.filter(t => {
        const action = actions.find(a => a.id === t.actionId);
        if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
        if (filters.category.length > 0 && !filters.category.includes(action?.categoryId)) return false;
        if (filters.priority.length > 0 && !filters.priority.includes(t.priority)) return false;
        if (filters.channel && filters.channel.length > 0 && !(t.channels || []).some(c => filters.channel.includes(c))) return false;
        if (filters.country && filters.country.length > 0 && !(t.countries || []).some(c => filters.country.includes(c))) return false;
        if (filters.otherLabel && filters.otherLabel.length > 0 && !(t.otherLabels || []).some(l => filters.otherLabel.includes(l.id))) return false;
        if (filters.member && filters.member.length > 0 && !(t.assignees || []).some(m => filters.member.includes(m))) return false;
        return true;
    }), [tasks, actions, filters]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const goNext = () => {
        if (mode === 'month') setCurrentDate(new Date(year, month + 1, 1));
        else { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); }
    };
    const goPrev = () => {
        if (mode === 'month') setCurrentDate(new Date(year, month - 1, 1));
        else { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); }
    };
    const goToday = () => setCurrentDate(new Date());

    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const today = formatDate(new Date());
    const monthLabel = CONFIG.MONTHS_FULL[month] + ' ' + year;

    const getMonthDays = () => {
        const firstDay = new Date(year, month, 1);
        let startDow = firstDay.getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        const days = [];
        for (let i = startDow - 1; i >= 0; i--) {
            const d = new Date(year, month - 1, daysInPrevMonth - i);
            days.push({ date: d, isCurrentMonth: false });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({ date: new Date(year, month, i), isCurrentMonth: true });
        }
        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
        }
        return days;
    };

    const getWeekDays = () => {
        const d = new Date(currentDate);
        let dow = d.getDay();
        dow = dow === 0 ? 6 : dow - 1;
        const monday = new Date(d);
        monday.setDate(d.getDate() - dow);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            days.push({ date: day, isCurrentMonth: day.getMonth() === month });
        }
        return days;
    };

    const getWeekLabel = () => {
        const days = getWeekDays();
        const start = days[0].date;
        const end = days[6].date;
        const sameMonth = start.getMonth() === end.getMonth();
        if (sameMonth) return `${start.getDate()} - ${end.getDate()} ${CONFIG.MONTHS_FULL[start.getMonth()]} ${start.getFullYear()}`;
        return `${start.getDate()} ${CONFIG.MONTHS_FULL[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${CONFIG.MONTHS_FULL[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    };

    const handleDrop = (e, date) => {
        if (isReadOnly) return;
        e.preventDefault();
        e.currentTarget.classList.remove('calendar-day-dragover');
        const taskId = e.dataTransfer.getData('taskId');
        if (!taskId) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        const dateStr = formatDate(date);
        if (task.startDate && task.dueDate) {
            const start = new Date(task.startDate);
            const end = new Date(task.dueDate);
            const duration = Math.round((end - start) / (1000 * 60 * 60 * 24));
            const newEnd = new Date(date);
            newEnd.setDate(newEnd.getDate() + duration);
            onUpdateTask(taskId, { startDate: dateStr, dueDate: formatDate(newEnd), month: date.getMonth() });
        } else {
            onUpdateTask(taskId, { startDate: dateStr, dueDate: dateStr, month: date.getMonth() });
        }
    };

    const handleCreateTask = (date) => {
        if (!onAddTask || isReadOnly) return;
        const dateStr = formatDate(date);
        const oneWeekLater = new Date(date);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);
        const action = actions[0];
        const newTask = {
            id: `t-${crypto.randomUUID()}`,
            title: 'New task',
            actionId: action?.id || '',
            month: date.getMonth(),
            startDate: dateStr,
            dueDate: formatDate(oneWeekLater),
            status: 'todo',
            priority: 'medium',
            description: '',
            checklist: [],
            comments: [],
            attachments: [],
            channels: action?.tags || []
        };
        onAddTask(newTask);
        setTimeout(() => onOpenTask(newTask), 100);
    };

    const getPriorityColor = (priority) => {
        const p = CONFIG.PRIORITIES.find(x => x.id === priority);
        return p?.color || '#a1a1aa';
    };

    // Compute bar layout for a set of 7 days
    const computeWeekBars = (weekDays) => {
        const weekStart = formatDate(weekDays[0].date);
        const weekEnd = formatDate(weekDays[6].date);
        const weekTasks = filteredTasks.filter(t => {
            if (!t.startDate && !t.dueDate) return false;
            const tStart = t.startDate || t.dueDate;
            const tEnd = t.dueDate || t.startDate;
            return tStart <= weekEnd && tEnd >= weekStart;
        });

        weekTasks.sort((a, b) => {
            const aStart = a.startDate || a.dueDate;
            const bStart = b.startDate || b.dueDate;
            if (aStart !== bStart) return aStart.localeCompare(bStart);
            const aEnd = a.dueDate || a.startDate;
            const bEnd = b.dueDate || b.startDate;
            return bEnd.localeCompare(aEnd); // longer tasks first
        });

        const bars = [];
        const rows = [];

        weekTasks.forEach(task => {
            const tStart = task.startDate || task.dueDate;
            const tEnd = task.dueDate || task.startDate;
            const barStart = tStart < weekStart ? weekStart : tStart;
            const barEnd = tEnd > weekEnd ? weekEnd : tEnd;

            const startCol = weekDays.findIndex(d => formatDate(d.date) === barStart);
            const endCol = weekDays.findIndex(d => formatDate(d.date) === barEnd);
            if (startCol === -1 || endCol === -1) return;

            const span = endCol - startCol + 1;
            const isMultiDay = (tStart !== tEnd);
            const continuesLeft = tStart < weekStart;
            const continuesRight = tEnd > weekEnd;

            let rowIdx = 0;
            while (true) {
                if (!rows[rowIdx]) rows[rowIdx] = new Array(7).fill(false);
                let fits = true;
                for (let c = startCol; c <= endCol; c++) {
                    if (rows[rowIdx][c]) { fits = false; break; }
                }
                if (fits) break;
                rowIdx++;
            }
            if (!rows[rowIdx]) rows[rowIdx] = new Array(7).fill(false);
            for (let c = startCol; c <= endCol; c++) rows[rowIdx][c] = true;

            bars.push({ task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight });
        });

        return { bars, rowCount: rows.length };
    };

    // Compact bar for month view (single line)
    const renderMonthBar = (task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight, topOffset, keyPrefix = '') => {
        const action = actions.find(a => a.id === task.actionId);
        const statusObj = CONFIG.STATUSES.find(s => s.id === task.status);
        const barColor = statusObj?.color || '#94a3b8';
        const left = `calc(${(startCol / 7) * 100}% + 4px)`;
        const width = `calc(${(span / 7) * 100}% - 8px)`;
        const top = topOffset + rowIdx * 24;

        return (
            <div
                key={task.id + '-' + keyPrefix}
                draggable={!isReadOnly}
                onDragStart={(e) => {
                    if (isReadOnly) { e.preventDefault(); return; }
                    e.stopPropagation();
                    e.dataTransfer.setData('taskId', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.currentTarget.style.opacity = '0.5';
                }}
                onDragEnd={(e) => { e.currentTarget.style.opacity = '1'; }}
                onTouchStart={isReadOnly ? undefined : (e) => calendarTouchStart(e, task.id)}
                onTouchMove={isReadOnly ? undefined : calendarTouchMove}
                onTouchEnd={isReadOnly ? undefined : calendarTouchEnd}
                onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
                data-cal-task={task.id}
                className="calendar-bar"
                style={{
                    position: 'absolute',
                    left, width, top, height: 20, zIndex: 10,
                    background: `linear-gradient(90deg, ${barColor}30, ${barColor}50)`,
                    border: `1px solid ${barColor}66`,
                    borderLeftWidth: continuesLeft ? 1 : 3,
                    borderLeftColor: continuesLeft ? `${barColor}66` : barColor,
                    borderRadius: `${continuesLeft ? 0 : 4}px ${continuesRight ? 0 : 4}px ${continuesRight ? 0 : 4}px ${continuesLeft ? 0 : 4}px`,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '0 6px', overflow: 'hidden', whiteSpace: 'nowrap',
                    fontSize: 11, fontWeight: 500,
                    opacity: task.status === 'completed' ? 0.6 : 1,
                }}
                title={`${task.title}\n${action?.name || ''}`}
            >
                <StatusIcon statusId={task.status} size={7}/>
                <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                    color: barColor,
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none'
                }}>
                    {task.title}
                </span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: getPriorityColor(task.priority), flexShrink: 0 }}/>
            </div>
        );
    };

    // Month view
    const renderMonthView = () => {
        const days = getMonthDays();
        const weeks = [];
        for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

        return (
            <div className="calendar-grid">
                <div className="calendar-header-row">
                    {DAYS_SHORT.map(d => <div key={d} className="calendar-header-cell">{d}</div>)}
                </div>
                {weeks.map((week, wi) => {
                    const { bars, rowCount } = computeWeekBars(week);
                    const isExpanded = week.some(d => formatDate(d.date) === expandedDay);
                    const MAX_VISIBLE_ROWS = isExpanded ? rowCount : 3;
                    const visibleBars = bars.filter(b => b.rowIdx < MAX_VISIBLE_ROWS);
                    const hiddenByDay = new Array(7).fill(0);
                    bars.filter(b => b.rowIdx >= MAX_VISIBLE_ROWS).forEach(b => {
                        for (let c = b.startCol; c < b.startCol + b.span; c++) hiddenByDay[c]++;
                    });
                    const barAreaHeight = Math.min(rowCount, MAX_VISIBLE_ROWS) * 24;

                    return (
                        <div key={wi} className="calendar-week-row" style={{ position: 'relative' }}>
                            {week.map(({ date, isCurrentMonth }, dayIdx) => {
                                const dateStr = formatDate(date);
                                const isToday = dateStr === today;
                                return (
                                    <div
                                        key={dateStr}
                                        className={`calendar-day-cell${!isCurrentMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`}
                                        style={{ minHeight: 36 + barAreaHeight + (hiddenByDay[dayIdx] > 0 ? 18 : 0) }}
                                        data-calendar-date={dateStr}
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('calendar-day-dragover'); }}
                                        onDragLeave={(e) => e.currentTarget.classList.remove('calendar-day-dragover')}
                                        onDrop={(e) => handleDrop(e, date)}
                                    >
                                        <div className="calendar-day-number" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className={isToday ? 'calendar-today-badge' : ''}>
                                                {date.getDate()}
                                            </span>
                                            {onAddTask && !isReadOnly && (
                                                <button
                                                    className="calendar-add-btn"
                                                    onClick={(e) => { e.stopPropagation(); handleCreateTask(date); }}
                                                    title="Create task"
                                                >+</button>
                                            )}
                                        </div>
                                        <div style={{ height: barAreaHeight }}/>
                                        {hiddenByDay[dayIdx] > 0 && (
                                            <div
                                                className="calendar-more"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedDay(expandedDay === dateStr ? null : dateStr);
                                                }}
                                            >
                                                +{hiddenByDay[dayIdx]} more
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {visibleBars.map(({ task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight }) =>
                                renderMonthBar(task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight, 28, 'm' + wi)
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Week view - taller bars with action name + date details
    const WEEK_BAR_HEIGHT = 56;
    const WEEK_BAR_GAP = 4;
    const renderWeekView = () => {
        const days = getWeekDays();
        const { bars, rowCount } = computeWeekBars(days);
        const barAreaHeight = rowCount * (WEEK_BAR_HEIGHT + WEEK_BAR_GAP);

        return (
            <div className="calendar-week-view">
                <div className="calendar-week-header">
                    <div className="calendar-week-time-col"></div>
                    {days.map(({ date }) => {
                        const dateStr = formatDate(date);
                        const isToday = dateStr === today;
                        return (
                            <div key={dateStr} className={`calendar-week-day-header${isToday ? ' today' : ''}`}>
                                <span className="calendar-week-day-name">{DAYS_SHORT[date.getDay() === 0 ? 6 : date.getDay() - 1]}</span>
                                <span className={`calendar-week-day-num${isToday ? ' calendar-today-badge' : ''}`}>{date.getDate()}</span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ position: 'relative', minHeight: Math.max(barAreaHeight + 40, 300) }}>
                    {/* Grid lines */}
                    <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', position: 'absolute', inset: 0 }}>
                        <div style={{ borderRight: '1px solid var(--border-light)' }}/>
                        {days.map(({ date }, i) => {
                            const dateStr = formatDate(date);
                            const isToday = dateStr === today;
                            return (
                                <div
                                    key={dateStr}
                                    style={{
                                        borderRight: i < 6 ? '1px solid var(--border-light)' : undefined,
                                        background: isToday ? 'rgba(99,102,241,0.03)' : undefined,
                                        position: 'relative'
                                    }}
                                    data-calendar-date={dateStr}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                                    onDragLeave={(e) => { e.currentTarget.style.background = isToday ? 'rgba(99,102,241,0.03)' : ''; }}
                                    onDrop={(e) => { e.currentTarget.style.background = isToday ? 'rgba(99,102,241,0.03)' : ''; handleDrop(e, date); }}
                                >
                                    {onAddTask && (
                                        <button
                                            className="calendar-add-btn"
                                            onClick={(e) => { e.stopPropagation(); handleCreateTask(date); }}
                                            title="Create task"
                                            style={{ position: 'absolute', bottom: 8, left: 8 }}
                                        >+</button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {/* Detailed bars */}
                    {bars.map(({ task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight }) => {
                        const action = actions.find(a => a.id === task.actionId);
                        const statusObj = CONFIG.STATUSES.find(s => s.id === task.status);
                        const barColor = statusObj?.color || '#94a3b8';
                        const colWidth = `calc((100% - 60px) / 7)`;
                        const left = `calc(60px + ${colWidth} * ${startCol} + 4px)`;
                        const width = `calc(${colWidth} * ${span} - 8px)`;
                        const top = 8 + rowIdx * (WEEK_BAR_HEIGHT + WEEK_BAR_GAP);

                        return (
                            <div
                                key={task.id + '-w'}
                                draggable={!isReadOnly}
                                onDragStart={(e) => {
                                    if (isReadOnly) { e.preventDefault(); return; }
                                    e.stopPropagation();
                                    e.dataTransfer.setData('taskId', task.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.currentTarget.style.opacity = '0.5';
                                }}
                                onDragEnd={(e) => { e.currentTarget.style.opacity = '1'; }}
                                onTouchStart={isReadOnly ? undefined : (e) => calendarTouchStart(e, task.id)}
                                onTouchMove={isReadOnly ? undefined : calendarTouchMove}
                                onTouchEnd={isReadOnly ? undefined : calendarTouchEnd}
                                data-cal-task={task.id}
                                onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
                                className="calendar-bar"
                                style={{
                                    position: 'absolute',
                                    left, width, top, height: WEEK_BAR_HEIGHT, zIndex: 10,
                                    background: `linear-gradient(90deg, ${barColor}30, ${barColor}50)`,
                                    border: `1px solid ${barColor}66`,
                                    borderLeftWidth: continuesLeft ? 1 : 3,
                                    borderLeftColor: continuesLeft ? `${barColor}66` : barColor,
                                    borderRadius: `${continuesLeft ? 0 : 6}px ${continuesRight ? 0 : 6}px ${continuesRight ? 0 : 6}px ${continuesLeft ? 0 : 6}px`,
                                    cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                    padding: '4px 8px', overflow: 'hidden',
                                    opacity: task.status === 'completed' ? 0.6 : 1,
                                }}
                                title={`${task.title}\n${action?.name || ''}`}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    <StatusIcon statusId={task.status} size={9}/>
                                    <span style={{
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                                        fontSize: 12, fontWeight: 600,
                                        color: barColor,
                                        textDecoration: task.status === 'completed' ? 'line-through' : 'none'
                                    }}>
                                        {task.title}
                                    </span>
                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: getPriorityColor(task.priority), flexShrink: 0 }}/>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {action?.name || ''}
                                </div>
                                {task.startDate && task.dueDate && task.startDate !== task.dueDate && (
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginTop: 1 }}>
                                        {task.startDate.slice(5).replace('-', '/')} → {task.dueDate.slice(5).replace('-', '/')}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="animate-slide-in">
            <div className="kanban-wrapper">
            <div className="kanban-toolbar">
                <div className="kanban-toolbar-left">
                    <div className="view-btn-group">
                        <button className={`view-btn ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')}>Month</button>
                        <button className={`view-btn ${mode === 'week' ? 'active' : ''}`} onClick={() => setMode('week')}>Week</button>
                    </div>
                </div>
                <div className="kanban-toolbar-right">
                    <span style={{ fontWeight: 700, fontSize: 14, minWidth: 180, textAlign: 'center', color: 'var(--text-primary)' }}>
                        {mode === 'month' ? monthLabel : getWeekLabel()}
                    </span>
                    <div className="timeline-nav">
                        <button className="timeline-nav-btn" onClick={goPrev}>◀</button>
                        <button className="calendar-today-btn" onClick={goToday}>Today</button>
                        <button className="timeline-nav-btn" onClick={goNext}>▶</button>
                    </div>
                </div>
            </div>
            {mode === 'month' ? renderMonthView() : renderWeekView()}
            </div>
        </div>
    );
};

export default memo(CalendarView);