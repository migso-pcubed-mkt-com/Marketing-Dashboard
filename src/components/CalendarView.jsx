import { useState, useMemo } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';

const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const CalendarView = ({ categories, actions, tasks, onOpenTask, onUpdateTask, filters, selectedYear, onYearChange }) => {
    const [mode, setMode] = useState('month'); // 'month' | 'week'
    const [currentDate, setCurrentDate] = useState(new Date());

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

    // Navigation
    const goNext = () => {
        if (mode === 'month') {
            setCurrentDate(new Date(year, month + 1, 1));
        } else {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + 7);
            setCurrentDate(d);
        }
    };
    const goPrev = () => {
        if (mode === 'month') {
            setCurrentDate(new Date(year, month - 1, 1));
        } else {
            const d = new Date(currentDate);
            d.setDate(d.getDate() - 7);
            setCurrentDate(d);
        }
    };
    const goToday = () => setCurrentDate(new Date());

    // Get tasks for a specific date
    const getTasksForDate = (date) => {
        const dateStr = formatDate(date);
        return filteredTasks.filter(t => {
            if (!t.startDate && !t.dueDate) return false;
            const start = t.startDate || t.dueDate;
            const end = t.dueDate || t.startDate;
            return dateStr >= start && dateStr <= end;
        });
    };

    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // Month view: calendar grid
    const getMonthDays = () => {
        const firstDay = new Date(year, month, 1);
        let startDow = firstDay.getDay(); // 0=Sun
        startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        const days = [];

        // Previous month padding
        for (let i = startDow - 1; i >= 0; i--) {
            const d = new Date(year, month - 1, daysInPrevMonth - i);
            days.push({ date: d, isCurrentMonth: false });
        }
        // Current month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({ date: new Date(year, month, i), isCurrentMonth: true });
        }
        // Next month padding
        const remaining = 42 - days.length; // 6 rows
        for (let i = 1; i <= remaining; i++) {
            days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
        }
        return days;
    };

    // Week view: 7 days starting from Monday of current week
    const getWeekDays = () => {
        const d = new Date(currentDate);
        let dow = d.getDay();
        dow = dow === 0 ? 6 : dow - 1; // Mon=0
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

    const today = formatDate(new Date());
    const monthLabel = CONFIG.MONTHS_FULL[month] + ' ' + year;

    const getWeekLabel = () => {
        const days = getWeekDays();
        const start = days[0].date;
        const end = days[6].date;
        const sameMonth = start.getMonth() === end.getMonth();
        if (sameMonth) {
            return `${start.getDate()} - ${end.getDate()} ${CONFIG.MONTHS_FULL[start.getMonth()]} ${start.getFullYear()}`;
        }
        return `${start.getDate()} ${CONFIG.MONTHS_FULL[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${CONFIG.MONTHS_FULL[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    };

    // Handle drag & drop to reschedule tasks
    const handleDrop = (e, date) => {
        e.preventDefault();
        e.currentTarget.classList.remove('calendar-day-dragover');
        const taskId = e.dataTransfer.getData('taskId');
        if (!taskId) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        const dateStr = formatDate(date);
        // Keep same duration if task has both dates
        if (task.startDate && task.dueDate) {
            const start = new Date(task.startDate);
            const end = new Date(task.dueDate);
            const duration = Math.round((end - start) / (1000 * 60 * 60 * 24));
            const newEnd = new Date(date);
            newEnd.setDate(newEnd.getDate() + duration);
            onUpdateTask(taskId, {
                startDate: dateStr,
                dueDate: formatDate(newEnd),
                month: date.getMonth()
            });
        } else {
            onUpdateTask(taskId, { startDate: dateStr, dueDate: dateStr, month: date.getMonth() });
        }
    };

    const getPriorityColor = (priority) => {
        const p = CONFIG.PRIORITIES.find(x => x.id === priority);
        return p?.color || '#a1a1aa';
    };

    const getStatusInfo = (statusId) => CONFIG.STATUSES.find(s => s.id === statusId);

    const renderTaskPill = (task) => {
        const action = actions.find(a => a.id === task.actionId);
        const cat = categories.find(c => c.id === action?.categoryId);
        const status = getStatusInfo(task.status);
        return (
            <div
                key={task.id}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('taskId', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.currentTarget.style.opacity = '0.5';
                }}
                onDragEnd={(e) => { e.currentTarget.style.opacity = '1'; }}
                onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
                className="calendar-task-pill"
                style={{
                    borderLeft: `3px solid ${cat?.color || 'var(--accent)'}`,
                    background: task.status === 'completed' ? 'var(--success-light)' : 'var(--bg-primary)',
                    opacity: task.status === 'completed' ? 0.7 : 1
                }}
                title={`${task.title}\n${action?.name || ''}\nStatus: ${status?.name || task.status}`}
            >
                <div className="calendar-task-status">
                    <StatusIcon statusId={task.status} size={8}/>
                </div>
                <span className="calendar-task-title" style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                    {task.title}
                </span>
                <div className="calendar-task-priority" style={{ background: getPriorityColor(task.priority) }}/>
            </div>
        );
    };

    const renderMonthView = () => {
        const days = getMonthDays();
        const weeks = [];
        for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
        }
        return (
            <div className="calendar-grid">
                <div className="calendar-header-row">
                    {DAYS_SHORT.map(d => (
                        <div key={d} className="calendar-header-cell">{d}</div>
                    ))}
                </div>
                {weeks.map((week, wi) => (
                    <div key={wi} className="calendar-week-row">
                        {week.map(({ date, isCurrentMonth }) => {
                            const dateStr = formatDate(date);
                            const dayTasks = getTasksForDate(date);
                            const isToday = dateStr === today;
                            const MAX_VISIBLE = 3;
                            return (
                                <div
                                    key={dateStr}
                                    className={`calendar-day-cell${!isCurrentMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('calendar-day-dragover'); }}
                                    onDragLeave={(e) => e.currentTarget.classList.remove('calendar-day-dragover')}
                                    onDrop={(e) => handleDrop(e, date)}
                                >
                                    <div className="calendar-day-number">
                                        <span className={isToday ? 'calendar-today-badge' : ''}>
                                            {date.getDate()}
                                        </span>
                                    </div>
                                    <div className="calendar-day-tasks">
                                        {dayTasks.slice(0, MAX_VISIBLE).map(renderTaskPill)}
                                        {dayTasks.length > MAX_VISIBLE && (
                                            <div className="calendar-more">+{dayTasks.length - MAX_VISIBLE} more</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    };

    const renderWeekView = () => {
        const days = getWeekDays();
        // Generate hours 0-23
        const hours = Array.from({ length: 24 }, (_, i) => i);
        // For simplicity, show tasks as all-day bars (since marketing tasks are date-based, not hourly)
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
                {/* All-day section for tasks */}
                <div className="calendar-week-allday">
                    <div className="calendar-week-time-col" style={{ fontSize: 10, color: 'var(--text-muted)' }}>All day</div>
                    {days.map(({ date }) => {
                        const dateStr = formatDate(date);
                        const dayTasks = getTasksForDate(date);
                        return (
                            <div
                                key={dateStr}
                                className="calendar-week-allday-cell"
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('calendar-day-dragover'); }}
                                onDragLeave={(e) => e.currentTarget.classList.remove('calendar-day-dragover')}
                                onDrop={(e) => handleDrop(e, date)}
                            >
                                {dayTasks.map(renderTaskPill)}
                            </div>
                        );
                    })}
                </div>
                {/* Hour grid */}
                <div className="calendar-week-body">
                    {hours.filter(h => h >= 8 && h <= 19).map(h => (
                        <div key={h} className="calendar-week-hour-row">
                            <div className="calendar-week-time-col">
                                <span className="calendar-hour-label">{String(h).padStart(2, '0')}:00</span>
                            </div>
                            {days.map(({ date }) => {
                                const dateStr = formatDate(date);
                                return (
                                    <div
                                        key={`${dateStr}-${h}`}
                                        className="calendar-week-hour-cell"
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('calendar-day-dragover'); }}
                                        onDragLeave={(e) => e.currentTarget.classList.remove('calendar-day-dragover')}
                                        onDrop={(e) => handleDrop(e, date)}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="animate-slide-in">
            <div className="calendar-toolbar">
                <div className="calendar-toolbar-left">
                    <div className="view-btn-group">
                        <button className={`view-btn ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')}>Month</button>
                        <button className={`view-btn ${mode === 'week' ? 'active' : ''}`} onClick={() => setMode('week')}>Week</button>
                    </div>
                </div>
                <div className="calendar-toolbar-center">
                    <button className="calendar-nav-btn" onClick={goPrev}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <h2 className="calendar-title">{mode === 'month' ? monthLabel : getWeekLabel()}</h2>
                    <button className="calendar-nav-btn" onClick={goNext}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                    </button>
                </div>
                <div className="calendar-toolbar-right">
                    <button className="calendar-today-btn" onClick={goToday}>Today</button>
                </div>
            </div>
            {mode === 'month' ? renderMonthView() : renderWeekView()}
        </div>
    );
};

export default CalendarView;
