import { memo } from 'react';

const ZOOM_OPTIONS = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
];

const TimelineHeader = ({ zoom, selectedYear, onZoomChange, onScrollToQuarter, onYearChange }) => (
    <div className="timeline-header">
        <div className="timeline-header-left">
            <div className="view-btn-group">
                {ZOOM_OPTIONS.map(z => (
                    <button key={z.id} onClick={() => onZoomChange(z.id)} className={`view-btn ${zoom === z.id ? 'active' : ''}`}>{z.label}</button>
                ))}
            </div>
            <div className="quarter-nav-group">
                {[1, 2, 3, 4].map(q => (
                    <button key={q} onClick={() => onScrollToQuarter(q)} className="quarter-btn">Q{q}</button>
                ))}
            </div>
        </div>
        <div className="timeline-nav">
            <button className="timeline-nav-btn" onClick={() => onYearChange && onYearChange(selectedYear - 1)}>◀</button>
            <span className="timeline-current">{selectedYear}</span>
            <button className="timeline-nav-btn" onClick={() => onYearChange && onYearChange(selectedYear + 1)}>▶</button>
        </div>
    </div>
);

export default memo(TimelineHeader);
