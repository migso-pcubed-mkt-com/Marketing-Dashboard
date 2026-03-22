import { useState } from 'react';

const STEPS = [
    {
        title: 'Welcome to Marketing Dashboard',
        desc: 'Manage your marketing initiatives with Categories, Actions, and Tasks. Let\'s take a quick tour!',
        icon: '👋'
    },
    {
        title: 'Create categories & tasks',
        desc: 'Use the "Create" button in the toolbar to add categories (groups), actions (initiatives), and tasks (work items).',
        icon: '➕'
    },
    {
        title: 'Drag & drop to organize',
        desc: 'Drag cards between columns to reassign them. Drag column headers to reorder. Try the different views: Kanban, Timeline, Calendar, KPIs.',
        icon: '✋'
    },
    {
        title: 'Connect Trello for sync',
        desc: 'Link a Trello board for bidirectional sync. Your cards, lists, and checklists stay in sync automatically.',
        icon: '🔄'
    }
];

const OnboardingOverlay = ({ onClose }) => {
    const [step, setStep] = useState(0);
    const current = STEPS[step];

    return (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
            <div style={{background:'var(--bg-primary)',borderRadius:'var(--radius-lg)',padding:32,maxWidth:420,width:'100%',textAlign:'center',boxShadow:'var(--shadow-xl)'}}>
                <div style={{fontSize:48,marginBottom:16}}>{current.icon}</div>
                <h2 style={{fontSize:18,fontWeight:700,color:'var(--text-primary)',marginBottom:8}}>{current.title}</h2>
                <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:24}}>{current.desc}</p>
                <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:20}}>
                    {STEPS.map((_, i) => (
                        <div key={i} style={{width:8,height:8,borderRadius:'50%',background:i===step?'var(--accent)':'var(--border)',transition:'background 0.2s'}}/>
                    ))}
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                    <button onClick={onClose} style={{padding:'8px 20px',fontSize:12,fontWeight:500,background:'none',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer',color:'var(--text-muted)'}}>
                        Skip
                    </button>
                    {step < STEPS.length - 1 ? (
                        <button onClick={() => setStep(step + 1)} style={{padding:'8px 20px',fontSize:12,fontWeight:600,background:'var(--accent)',color:'white',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>
                            Next
                        </button>
                    ) : (
                        <button onClick={onClose} style={{padding:'8px 20px',fontSize:12,fontWeight:600,background:'var(--accent)',color:'white',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>
                            Get started
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OnboardingOverlay;
