import { useState, useMemo } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';

const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const CalendarView = ({ categories, actions, tasks, onOpenTask, onUpdateTask, onAddTask, filters, selectedYear, onYearChange }) => {
    const [mode, setMode] = useState('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [expandedDay, setExpandedDay] = useState(null); // dateStr of day showing all tasks

    const filteredTasks = useMemo(() => tasks.filter(t => {
        const action = actions.find(a => a.id === t.actionId);
        if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
        if (filters.category.length > 0 && !filters.category.includes(action?.categoryId)) return false;
        if (filters.priority.length > 0 && !filters.priority.includes(t.priority)) return false;
        if (filters.channel && filters.channel.length > 0 && !(t.channels || []).some(c => filters.channel.includes(c))) return false;
        if (filters.country && filters.country.length > 0 && !(t.countries || []).some(c => filters.country.includes(c))) return false;
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
        if (!onAddTask) return;
        const dateStr = formatDate(date);
        const oneWeekLater = new Date(date);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);
        const action = actions[0];
        const newTask = {
            id: `t${Date.now()}`,
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

    const renderBar = (task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight, topOffset, keyPrefix = '') => {
        const action = actions.find(a => a.id === task.actionId);
        const cat = categories.find(c => c.id === action?.categoryId);
        const barColor = cat?.color || 'var(--accent)';
        const left = `calc(${(startCol / 7) * 100}% + 4px)`;
        const width = `calc(${(span / 7) * 100}% - 8px)`;
        const top = topOffset + rowIdx * 24;

        return (
            <div
                key={task.id + '-' + keyPrefix}
                draggable
                onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('taskId', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.currentTarget.style.opacity = '0.5';
                }}
                onDragEnd={(e) => { e.currentTarget.style.opacity = '1'; }}
                onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
                className="calendar-bar"
                style={{
                    position: 'absolute',
                    left, width, top, height: 20, zIndex: 10,
                    background: isMultiDay
                        ? `linear-gradient(90deg, ${barColor}22, ${barColor}33)`
                        : (task.status === 'completed' ? 'var(--success-light)' : 'var(--bg-primary)'),
                    border: isMultiDay ? `1px solid ${barColor}44` : `1px solid var(--border-light)`,
                    borderLeftWidth: continuesLeft ? 1 : 3,
                    borderLeftColor: continuesLeft ? `${barColor}44` : barColor,
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
                    color: isMultiDay ? barColor : 'var(--text-primary)',
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
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('calendar-day-dragover'); }}
                                        onDragLeave={(e) => e.currentTarget.classList.remove('calendar-day-dragover')}
                                        onDrop={(e) => handleDrop(e, date)}
                                    >
                                        <div className="calendar-day-number" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className={isToday ? 'calendar-today-badge' : ''}>
                                                {date.getDate()}
                                            </span>
                                            {onAddTask && (
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
                                renderBar(task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight, 28, 'm' + wi)
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Week view - same bar system as month
    const renderWeekView = () => {
        const days = getWeekDays();
        const { bars, rowCount } = computeWeekBars(days);
        const barAreaHeight = rowCount * 28;

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
                {/* Bar area - same layout as month view but with 7 equal columns + time gutter */}
                <div style={{ position: 'relative', minHeight: Math.max(barAreaHeight + 20, 300) }}>
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
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                                    onDragLeave={(e) => { e.currentTarget.style.background = isToday ? 'rgba(99,102,241,0.03)' : ''; }}
                                    onDrop={(e) => { e.currentTarget.style.background = isToday ? 'rgba(99,102,241,0.03)' : ''; handleDrop(e, date); }}
                                >
                                    {/* Hover + button at bottom */}
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
                    {/* Bars rendered absolutely, offset by gutter width */}
                    {bars.map(({ task, startCol, span, rowIdx, isMultiDay, continuesLeft, continuesRight }) => {
                        const action = actions.find(a => a.id === task.actionId);
                        const cat = categories.find(c => c.id === action?.categoryId);
                        const barColor = cat?.color || 'var(--accent)';
                        // Account for the 60px gutter
                        const colWidth = `calc((100% - 60px) / 7)`;
                        const left = `calc(60px + ${colWidth} * ${startCol} + 4px)`;
                        const width = `calc(${colWidth} * ${span} - 8px)`;
                        const top = 8 + rowIdx * 28;

                        return (
                            <div
                                key={task.id + '-w'}
                                draggable
                                onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.setData('taskId', task.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.currentTarget.style.opacity = '0.5';
                                }}
                                onDragEnd={(e) => { e.currentTarget.style.opacity = '1'; }}
                                onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
                                className="calendar-bar"
                                style={{
                                    position: 'absolute',
                                    left, width, top, height: 24, zIndex: 10,
                                    background: isMultiDay
                                        ? `linear-gradient(90deg, ${barColor}22, ${barColor}33)`
                                        : (task.status === 'completed' ? 'var(--success-light)' : 'var(--bg-primary)'),
                                    border: isMultiDay ? `1px solid ${barColor}44` : `1px solid var(--border-light)`,
                                    borderLeftWidth: continuesLeft ? 1 : 3,
                                    borderLeftColor: continuesLeft ? `${barColor}44` : barColor,
                                    borderRadius: `${continuesLeft ? 0 : 4}px ${continuesRight ? 0 : 4}px ${continuesRight ? 0 : 4}px ${continuesLeft ? 0 : 4}px`,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '0 8px', overflow: 'hidden', whiteSpace: 'nowrap',
                                    fontSize: 12, fontWeight: 500,
                                    opacity: task.status === 'completed' ? 0.6 : 1,
                                }}
                                title={`${task.title}\n${action?.name || ''}`}
                            >
                                <StatusIcon statusId={task.status} size={8}/>
                                <span style={{
                                    overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                                    color: isMultiDay ? barColor : 'var(--text-primary)',
                                    textDecoration: task.status === 'completed' ? 'line-through' : 'none'
                                }}>
                                    {task.title}
                                </span>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: getPriorityColor(task.priority), flexShrink: 0 }}/>
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

export default CalendarView;
