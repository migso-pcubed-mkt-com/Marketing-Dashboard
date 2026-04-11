const SkeletonBlock = ({ className = '', style = {} }) => (
    <div className={`animate-pulse rounded ${className}`} style={{ background: 'var(--bg-tertiary)', ...style }} />
);

export const KanbanSkeleton = () => (
    <div style={{ display: 'flex', gap: 16, padding: '16px 0', overflow: 'hidden' }}>
        {[1, 2, 3].map(col => (
            <div key={col} style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SkeletonBlock style={{ height: 32, borderRadius: 8 }} />
                {[1, 2, 3, 4].map(i => (
                    <SkeletonBlock key={i} style={{ height: 80, borderRadius: 8 }} />
                ))}
            </div>
        ))}
    </div>
);

export const TimelineSkeleton = () => (
    <div style={{ padding: '16px 0' }}>
        <SkeletonBlock style={{ height: 40, marginBottom: 12, borderRadius: 8 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(row => (
                <div key={row} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <SkeletonBlock style={{ width: 120, height: 28, borderRadius: 6, flexShrink: 0 }} />
                    <SkeletonBlock style={{ width: `${30 + Math.random() * 40}%`, height: 28, borderRadius: 6 }} />
                </div>
            ))}
        </div>
    </div>
);

export const CalendarSkeleton = () => (
    <div style={{ padding: '16px 0' }}>
        <SkeletonBlock style={{ height: 40, marginBottom: 12, borderRadius: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: 35 }, (_, i) => (
                <SkeletonBlock key={i} style={{ height: 80, borderRadius: 6 }} />
            ))}
        </div>
    </div>
);

export const DashboardSkeleton = () => (
    <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
            {[1, 2, 3, 4].map(i => (
                <SkeletonBlock key={i} style={{ height: 80, borderRadius: 10 }} />
            ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[1, 2].map(i => (
                <SkeletonBlock key={i} style={{ height: 200, borderRadius: 10 }} />
            ))}
        </div>
    </div>
);

export const ViewSkeleton = ({ view }) => {
    switch (view) {
        case 'kanban': return <KanbanSkeleton />;
        case 'timeline': return <TimelineSkeleton />;
        case 'calendar': return <CalendarSkeleton />;
        case 'dashboard': return <DashboardSkeleton />;
        default: return <KanbanSkeleton />;
    }
};
