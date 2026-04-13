import { CONFIG } from '../../config.js';

/**
 * Calculate ISO week number for a date.
 */
export function getWeekNumber(date, weekBase) {
    const diff = date - weekBase;
    return Math.floor(diff / (7 * 24 * 60 * 1000 * 60));
}

/**
 * Convert a date to pixel position on the timeline.
 */
export function dateToPixel(d, { zoom, colWidth, selectedYear, weekBase }) {
    const m = d.getMonth();
    const day = d.getDate();
    const dim = new Date(selectedYear, m + 1, 0).getDate();
    if (zoom === 'day') {
        const doy = Math.floor((d - new Date(selectedYear, 0, 1)) / 86400000);
        return doy * colWidth;
    } else if (zoom === 'week') {
        const daysFromBase = Math.round(
            (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
                Date.UTC(weekBase.getFullYear(), weekBase.getMonth(), weekBase.getDate())) / 86400000
        );
        return daysFromBase * (colWidth / 7);
    } else if (zoom === 'month') {
        return m * colWidth + ((day - 1) / dim) * colWidth;
    } else {
        const q = Math.floor(m / 3);
        const miq = m % 3;
        const mw = colWidth / 3;
        return q * colWidth + miq * mw + ((day - 1) / dim) * mw;
    }
}

/**
 * Convert a pixel position to a date on the timeline.
 */
export function pixelToDate(absX, { zoom, colWidth, selectedYear, weekBase }) {
    const year = selectedYear;
    if (zoom === 'day') {
        const dayIdx = Math.round(absX / colWidth);
        return new Date(year, 0, 1 + Math.max(0, dayIdx));
    } else if (zoom === 'week') {
        const pixelsPerDay = colWidth / 7;
        const dayIdx = Math.round(absX / pixelsPerDay);
        const nearestWeekDay = Math.round(dayIdx / 7) * 7;
        const snappedDay = Math.abs(dayIdx - nearestWeekDay) <= 1 ? nearestWeekDay : dayIdx;
        return new Date(weekBase.getFullYear(), weekBase.getMonth(), weekBase.getDate() + Math.max(0, snappedDay));
    } else if (zoom === 'month') {
        const monthIdx = Math.max(0, Math.min(11, Math.floor(absX / colWidth)));
        const monthFrac = Math.max(0, (absX - monthIdx * colWidth) / colWidth);
        const dim = new Date(year, monthIdx + 1, 0).getDate();
        const day = Math.max(1, Math.round(monthFrac * dim));
        return new Date(year, monthIdx, day);
    } else {
        const qIdx = Math.max(0, Math.min(3, Math.floor(absX / colWidth)));
        const qFrac = Math.max(0, (absX - qIdx * colWidth) / colWidth);
        const miq = Math.min(2, Math.floor(qFrac * 3));
        const mFrac = (qFrac * 3) - miq;
        const targetMonth = qIdx * 3 + miq;
        const dim = new Date(year, targetMonth + 1, 0).getDate();
        const day = Math.max(1, Math.round(mFrac * dim));
        return new Date(year, targetMonth, Math.min(day, dim));
    }
}

/**
 * Calculate pixel position and width for a task bar.
 */
export function getTaskPosition(task, { zoom, colWidth, selectedYear, weekBase }) {
    if (!task.startDate || !task.dueDate) return null;
    let start = new Date(task.startDate);
    let end = new Date(task.dueDate);

    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31);
    if (start < yearStart) start = yearStart;
    if (end > yearEnd) end = yearEnd;

    const startMonth = start.getMonth();
    const endMonth = end.getMonth();
    const startDay = start.getDate();
    const endDay = end.getDate();
    const daysInStartMonth = new Date(selectedYear, startMonth + 1, 0).getDate();
    const daysInEndMonth = new Date(selectedYear, endMonth + 1, 0).getDate();

    if (zoom === 'day') {
        const startDOY = Math.round((Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) - Date.UTC(selectedYear, 0, 1)) / 86400000);
        const endDOY = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(selectedYear, 0, 1)) / 86400000);
        const left = startDOY * colWidth;
        const width = Math.max((endDOY - startDOY + 1) * colWidth, colWidth);
        return { left, width };
    }
    if (zoom === 'week') {
        const startDays = Math.round((Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) - Date.UTC(weekBase.getFullYear(), weekBase.getMonth(), weekBase.getDate())) / 86400000);
        const endDays = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(weekBase.getFullYear(), weekBase.getMonth(), weekBase.getDate())) / 86400000);
        const pixelsPerDay = colWidth / 7;
        const left = startDays * pixelsPerDay;
        const width = Math.max((endDays - startDays + 1) * pixelsPerDay, pixelsPerDay);
        return { left, width };
    }
    if (zoom === 'month') {
        const startOffset = ((startDay - 1) / daysInStartMonth) * colWidth;
        const totalMonths = endMonth - startMonth;
        const endOffset = ((daysInEndMonth - endDay) / daysInEndMonth) * colWidth;
        const width = (totalMonths + 1) * colWidth - startOffset - endOffset;
        const minWidth = (1 / daysInStartMonth) * colWidth;
        return { left: startMonth * colWidth + startOffset, width: Math.max(width, minWidth) };
    }
    if (zoom === 'quarter') {
        const startQuarter = Math.floor(startMonth / 3);
        const endQuarter = Math.floor(endMonth / 3);
        const quarterWidth = colWidth;
        const monthWidthInQuarter = quarterWidth / 3;

        const monthInStartQuarter = startMonth % 3;
        const daysInMonth = new Date(selectedYear, startMonth + 1, 0).getDate();
        const dayOffset = (startDay - 1) / daysInMonth;
        const startOffset = monthInStartQuarter * monthWidthInQuarter + dayOffset * monthWidthInQuarter;
        const left = startQuarter * quarterWidth + startOffset;

        const totalQuarters = endQuarter - startQuarter;
        const monthInEndQuarter = endMonth % 3;
        const daysInEndMonthQ = new Date(selectedYear, endMonth + 1, 0).getDate();
        const endDayOffset = endDay / daysInEndMonthQ;
        const endOffsetQ = monthInEndQuarter * monthWidthInQuarter + endDayOffset * monthWidthInQuarter;

        let width;
        if (totalQuarters === 0) {
            width = endOffsetQ - startOffset;
        } else {
            width = (totalQuarters + 1) * quarterWidth - startOffset - (quarterWidth - endOffsetQ);
        }

        const minWidth = monthWidthInQuarter / 30;
        return { left, width: Math.max(width, minWidth) };
    }
    return { left: startMonth * colWidth, width: colWidth };
}

/**
 * Calculate swim lanes for overlapping tasks.
 * resizingInfo: optional {taskId, originalStart, originalEnd}
 */
export function calculateSwimLanes(tasksList, resizingInfo, layoutParams) {
    const swimLanes = {};
    const lanes = [];

    const sortedTasks = [...tasksList].sort((a, b) => {
        const aStart = (resizingInfo && a.id === resizingInfo.taskId) ? resizingInfo.originalStart : a.startDate;
        const bStart = (resizingInfo && b.id === resizingInfo.taskId) ? resizingInfo.originalStart : b.startDate;
        if (!aStart || !bStart) return 0;
        const dateDiff = new Date(aStart) - new Date(bStart);
        if (dateDiff !== 0) return dateDiff;
        return (a.order || 0) - (b.order || 0);
    });

    sortedTasks.forEach(task => {
        if (!task.startDate || !task.dueDate) {
            swimLanes[task.id] = 0;
            return;
        }

        const pos = (resizingInfo && task.id === resizingInfo.taskId)
            ? getTaskPosition({ ...task, startDate: resizingInfo.originalStart, dueDate: resizingInfo.originalEnd }, layoutParams)
            : getTaskPosition(task, layoutParams);
        if (!pos) {
            swimLanes[task.id] = 0;
            return;
        }

        const taskStart = pos.left;
        const taskEnd = pos.left + pos.width;

        let assignedLane = -1;
        for (let i = 0; i < lanes.length; i++) {
            let canFit = true;
            for (const existingTask of lanes[i]) {
                if (taskStart < existingTask.end && taskEnd > existingTask.start) {
                    canFit = false;
                    break;
                }
            }
            if (canFit) {
                assignedLane = i;
                lanes[i].push({ id: task.id, start: taskStart, end: taskEnd });
                break;
            }
        }

        if (assignedLane === -1) {
            assignedLane = lanes.length;
            lanes.push([{ id: task.id, start: taskStart, end: taskEnd }]);
        }

        swimLanes[task.id] = assignedLane;
    });

    const maxLanes = lanes.length;
    return { swimLanes, maxLanes: Math.max(maxLanes, 1) };
}

/**
 * Generate day-level headers for the timeline.
 */
export function getDayHeaders(selectedYear) {
    const days = [];
    const months = [];
    let dayCounter = 0;
    for (let m = 0; m < 12; m++) {
        const daysInMonth = new Date(selectedYear, m + 1, 0).getDate();
        const monthStart = dayCounter;
        for (let d = 1; d <= daysInMonth; d++) {
            days.push({ day: dayCounter, date: d, month: m, label: d.toString() });
            dayCounter++;
        }
        months.push({ month: m, label: CONFIG.MONTHS[m], startDay: monthStart, endDay: dayCounter - 1, days: daysInMonth });
    }
    return { days, months };
}

/**
 * Generate week-level headers for the timeline.
 */
export function getWeekHeaders(selectedYear, weekBase) {
    const weeks = [];
    const months = [];
    const monthBoundaries = [];
    const dec31 = new Date(selectedYear, 11, 31);
    let lastMonth = -1;
    for (let w = 0; w < 54; w++) {
        const weekStart = new Date(weekBase.getFullYear(), weekBase.getMonth(), weekBase.getDate() + w * 7);
        if (weekStart > dec31) break;
        const thu = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 3);
        const isoD = new Date(Date.UTC(thu.getFullYear(), thu.getMonth(), thu.getDate()));
        isoD.setUTCDate(isoD.getUTCDate() + 4 - (isoD.getUTCDay() || 7));
        const isoYS = new Date(Date.UTC(isoD.getUTCFullYear(), 0, 1));
        const isoWeek = Math.ceil(((isoD - isoYS) / 86400000 + 1) / 7);
        const weekObj = { week: w, label: isoWeek.toString(), monthStart: null, monthLabel: null };
        const monthIdx = weekStart.getFullYear() < selectedYear ? 0 : weekStart.getMonth();
        weekObj.monthLabel = CONFIG.MONTHS[monthIdx];
        if (monthIdx !== lastMonth) {
            if (months.length > 0) months[months.length - 1].endWeek = w;
            months.push({ month: monthIdx, label: CONFIG.MONTHS[monthIdx], startWeek: w, endWeek: w + 1 });
            lastMonth = monthIdx;
            if (w > 0 || monthIdx > 0) {
                const firstOfMonth = new Date(selectedYear, monthIdx, 1);
                const dayOff = Math.round((firstOfMonth - weekStart) / 86400000);
                if (dayOff >= 0 && dayOff < 7) {
                    monthBoundaries.push({ weekIndex: w, dayOffset: dayOff, label: CONFIG.MONTHS[monthIdx] });
                    weekObj.monthStart = CONFIG.MONTHS[monthIdx];
                }
            }
        }
        weeks.push(weekObj);
    }
    if (months.length > 0) months[months.length - 1].endWeek = weeks.length;
    return { weeks, months, monthBoundaries };
}
