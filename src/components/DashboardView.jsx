import { memo } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';

const EmptyState = ({ icon, title, description }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>{icon}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13 }}>{description}</div>
    </div>
);

const DashboardView = ({categories, actions, tasks, members = []}) => {
    if (tasks.length === 0) return <EmptyState icon={<Icon.BarChart size={40}/>} title="No data yet" description="Create tasks to see dashboard statistics" />;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const actionBudgetTotal = actions.reduce((s, a) => s + (a.budget || 0), 0);
    const totalBudget = actionBudgetTotal + tasks.reduce((s, t) => s + (t.budget || 0), 0);
    const spentBudget = tasks.filter(t => ['completed', 'inprogress'].includes(t.status)).reduce((s, t) => s + (t.budget || 0), 0);
    const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const currentMonth = new Date().getMonth();
    const currentTasks = tasks.filter(t => t.month === currentMonth);
    const overdueTasks = tasks.filter(t => t.status !== 'completed' && (t.month < currentMonth || (t.dueDate && new Date(t.dueDate) < new Date())));

    // Members stats
    const memberStats = members.map(m => {
        const memberTasks = tasks.filter(t => (t.assignees || []).includes(m.id));
        const completed = memberTasks.filter(t => t.status === 'completed').length;
        const overdue = memberTasks.filter(t => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < new Date()).length;
        return { ...m, taskCount: memberTasks.length, completed, overdue, pct: memberTasks.length > 0 ? Math.round((completed / memberTasks.length) * 100) : 0 };
    }).filter(m => m.taskCount > 0).sort((a, b) => b.taskCount - a.taskCount);

    const KPICard = ({title, value, subtitle, icon: I, color}) => (
        <div className="v11-card" style={{padding:'20px 24px',cursor:'default'}}>
            <div className="flex items-start justify-between">
                <div>
                    <p style={{fontSize:12,fontWeight:500,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.3px'}}>{title}</p>
                    <p style={{fontSize:28,fontWeight:700,color,lineHeight:1.2}}>{value}</p>
                    {subtitle && <p style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>{subtitle}</p>}
                </div>
                <div style={{padding:10,borderRadius:'var(--radius-md)',backgroundColor:`${color}15`}}>
                    <I size={20} color={color}/>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-slide-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard title="Progress" value={`${progressPct}%`} subtitle={`${completedTasks}/${totalTasks} tasks`} icon={Icon.TrendUp} color="#22c55e"/>
                <KPICard title="Budget" value={`${(spentBudget/1000).toFixed(0)}k€`} subtitle={`sur ${(totalBudget/1000).toFixed(0)}k€`} icon={Icon.Dollar} color="#6366f1"/>
                <KPICard title="This month" value={currentTasks.length} subtitle="tasks actives" icon={Icon.Calendar} color="#f59e0b"/>
                <KPICard title="Overdue" value={overdueTasks.length} subtitle={overdueTasks.length > 0 ? 'to address' : 'All good!'} icon={Icon.Alert} color={overdueTasks.length > 0 ? '#ef4444' : '#22c55e'}/>
            </div>
            <div className="v11-card" style={{padding:'var(--space-6)',cursor:'default'}}>
                <h3 className="font-semibold mb-4">Progress by category</h3>
                <div className="space-y-4">
                    {categories.map(cat => {
                        const catActions = actions.filter(a => a.categoryId === cat.id);
                        const catTasks = tasks.filter(t => catActions.some(a => a.id === t.actionId));
                        const catCompleted = catTasks.filter(t => t.status === 'completed').length;
                        const catPct = catTasks.length > 0 ? Math.round((catCompleted / catTasks.length) * 100) : 0;
                        const catBudget = catActions.reduce((s, a) => s + (a.budget || 0), 0) + catTasks.reduce((s, t) => s + (t.budget || 0), 0);
                        return (
                            <div key={cat.id}>
                                <div className="flex items-center justify-between mb-2"><div className="flex items-center space-x-3"><div className={`w-3 h-3 rounded-full bg-gradient-to-r ${cat.gradient}`}/><span className="font-medium text-sm">{cat.name}</span></div><div className="flex items-center space-x-4 text-sm"><span style={{color:'var(--text-muted)'}}>{catCompleted}/{catTasks.length}</span><span className="font-semibold text-secondary">{(catBudget/1000).toFixed(0)}k€</span><span className="font-bold">{catPct}%</span></div></div>
                                <div className="v11-progress-bar" style={{height:12}}><div className={`h-full rounded-full bg-gradient-to-r ${cat.gradient}`} style={{width:`${catPct}%`}}/></div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="v11-card" style={{padding:'var(--space-6)',cursor:'default'}}>
                    <h3 className="font-semibold mb-4">By Status</h3>
                    <div className="space-y-3">
                        {CONFIG.STATUSES.map(s => { const count = tasks.filter(t => t.status === s.id).length; const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0; return (<div key={s.id} className="flex items-center"><div className="w-28 flex items-center space-x-2"><StatusIcon statusId={s.id} size={12}/><span className="text-sm">{s.name}</span></div><div className="flex-1 h-4 rounded-full mx-3" style={{background:'var(--bg-secondary)'}}><div className="h-full rounded-full" style={{width:`${pct}%`,backgroundColor:s.color}}/></div><span className="w-8 text-right text-sm font-medium">{count}</span></div>); })}
                    </div>
                </div>
                <div className="v11-card" style={{padding:'var(--space-6)',cursor:'default',borderColor:overdueTasks.length > 0 ? 'var(--error)' : 'var(--border-light)'}}>
                    <h3 className="font-semibold mb-4">🚨 Overdue</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {overdueTasks.length > 0 ? overdueTasks.slice(0, 8).map(t => { const action = actions.find(a => a.id === t.actionId); return <div key={t.id} style={{padding:'10px 14px',borderRadius:'var(--radius-sm)',background:'var(--error-light)',border:'1px solid #fecaca'}}><p style={{fontWeight:600,fontSize:13}}>{t.title}</p><p style={{fontSize:11,color:'var(--error)',marginTop:2}}>{action?.name} • {CONFIG.MONTHS_FULL[t.month]}</p></div>; }) : <div className="text-center" style={{padding:'32px 0'}}><span style={{fontSize:32}}>✅</span><p style={{fontSize:13,color:'var(--text-muted)',marginTop:8}}>All up to date!</p></div>}
                    </div>
                </div>
            </div>
            {memberStats.length > 0 && (
                <div className="v11-card" style={{padding:'var(--space-6)',cursor:'default'}}>
                    <h3 className="font-semibold mb-4">👥 By Member</h3>
                    <div className="space-y-3">
                        {memberStats.map(m => (
                            <div key={m.id} className="flex items-center gap-3">
                                <div style={{flexShrink:0}}>
                                    {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{width:28,height:28,borderRadius:'50%'}}/> : <span style={{width:28,height:28,borderRadius:'50%',background:'var(--accent)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                                </div>
                                <div style={{width:100,flexShrink:0}}>
                                    <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.fullName || m.username}</div>
                                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{m.completed}/{m.taskCount} done{m.overdue > 0 ? ` • ${m.overdue} overdue` : ''}</div>
                                </div>
                                <div className="flex-1 h-4 rounded-full" style={{background:'var(--bg-secondary)'}}>
                                    <div className="h-full rounded-full" style={{width:`${m.pct}%`,background:'var(--accent)',transition:'width 0.3s'}}/>
                                </div>
                                <span className="text-sm font-medium" style={{width:36,textAlign:'right'}}>{m.pct}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="v11-card" style={{padding:'var(--space-6)',cursor:'default'}}>
                <h3 className="font-semibold mb-4">📢 By Channel</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {CONFIG.CHANNELS.map(ch => {
                        const chTasks = tasks.filter(t => (t.channels || []).includes(ch.id));
                        const chCompleted = chTasks.filter(t => t.status === 'completed').length;
                        return (
                            <div key={ch.id} style={{padding:'14px 16px',borderRadius:'var(--radius-md)',border:'1px solid var(--border)',background:'var(--bg-primary)'}}>
                                <div className="flex items-center space-x-2" style={{marginBottom:8}}>
                                    <div style={{width:10,height:10,borderRadius:'50%',backgroundColor:ch.color,flexShrink:0}}/>
                                    <span style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ch.name}</span>
                                </div>
                                <div style={{fontSize:22,fontWeight:700}}>{chTasks.length}</div>
                                <div style={{fontSize:11,color:'var(--text-muted)'}}>{chCompleted} completed</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default memo(DashboardView);
