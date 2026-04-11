import { useState, useRef, useEffect } from 'react';
import { CONFIG } from '../config.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { Icon, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';

const NewTaskModal = ({actions, categories, onClose, onAdd, onCreateAction, onAddCategory, initialValues, isCardAsTask=false}) => {
    const focusTrapRef = useFocusTrap(true);
    const [form, setForm] = useState({title:'',actionId:initialValues?.actionId||actions[0]?.id||'',startDate:initialValues?.startDate||new Date().toISOString().split('T')[0],dueDate:initialValues?.dueDate||'',priority:initialValues?.priority||'medium',status:initialValues?.status||'todo',description:'',budget:0,countries:initialValues?.countries||[]});
    const [showInlineCreate, setShowInlineCreate] = useState(false);
    const [newActionName, setNewActionName] = useState('');
    const [newActionCategoryId, setNewActionCategoryId] = useState(categories[0]?.id || '');
    const [showInlineCreateCategory, setShowInlineCreateCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const newActionInputRef = useRef(null);

    useEffect(() => {
        if (showInlineCreate && newActionInputRef.current) newActionInputRef.current.focus();
    }, [showInlineCreate]);

    const handleInlineCreateCategory = () => {
        if (!newCategoryName.trim() || !onAddCategory) return;
        const nc = {id:`cat-${crypto.randomUUID()}`, name:newCategoryName.trim(), color:'#6366f1', gradient:'from-indigo-500 to-purple-500', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()};
        onAddCategory(nc);
        setNewActionCategoryId(nc.id);
        setNewCategoryName('');
        setShowInlineCreateCategory(false);
    };

    const handleInlineCreateAction = () => {
        const name = newActionName.trim();
        if (!name || !newActionCategoryId) return;
        const newAction = {
            id: `a-${crypto.randomUUID()}`,
            name,
            categoryId: newActionCategoryId,
            budget: 0,
            priority: 'medium',
            tags: [],
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (typeof onCreateAction === 'function') {
            onCreateAction(newAction);
        }
        setForm(prev => ({...prev, actionId: newAction.id}));
        setNewActionName('');
        setNewActionCategoryId(categories[0]?.id || '');
        setShowInlineCreate(false);
        setShowInlineCreateCategory(false);
    };

    const handleAdd = () => {
        if (!form.title.trim() || !form.actionId) return;
        const action = actions.find(a => a.id === form.actionId);
        const month = form.startDate ? new Date(form.startDate).getMonth() : new Date().getMonth();
        const now = new Date().toISOString();
        onAdd({...form, id: `t-${crypto.randomUUID()}`, month, channels: action?.tags || [], checklist: [], comments: [], attachments: [], countries: form.countries || [], createdAt: now, updatedAt: now});
        onClose();
    };
    const selectedAction = actions.find(a => a.id === form.actionId);
    const actionCategory = categories.find(c => c.id === selectedAction?.categoryId);
    // Escape key — close sub-forms first, then close modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (showInlineCreateCategory) { setShowInlineCreateCategory(false); setNewCategoryName(''); return; }
                if (showInlineCreate) { setShowInlineCreate(false); setNewActionName(''); return; }
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, showInlineCreate, showInlineCreateCategory]);

    return (
        <div className="v11-modal-overlay" onClick={onClose}>
            <div ref={focusTrapRef} className="v11-modal animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="new-task-modal-title" style={{maxWidth:512}} onClick={e => e.stopPropagation()}>
                <div className={`h-2 rounded-t-2xl bg-gradient-to-r ${actionCategory?.gradient || 'from-gray-400 to-gray-500'}`}/>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 id="new-task-modal-title" className="text-xl font-bold flex items-center gap-2"><Icon.Check size={18}/> New Task</h2>
                        <button onClick={onClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    <div className="space-y-4">
                        <div><label className="v11-label">Title</label><input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="E.g. LinkedIn Post January" className="v11-input" autoFocus/></div>
                        {!isCardAsTask && <div>
                            <label className="v11-label">Action</label>
                            {!showInlineCreate ? (
                                <>
                                    <select value={form.actionId} onChange={e => setForm({...form, actionId: e.target.value})} className="v11-input">{actions.map(a => { const cat = categories.find(c => c.id === a.categoryId); return <option key={a.id} value={a.id}>{a.name} ({cat?.name})</option>; })}</select>
                                    {!isCardAsTask && <button onClick={() => setShowInlineCreate(true)} className="mt-1.5 text-xs flex items-center gap-1" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0}}>
                                        <Icon.Plus size={11}/> Create a new action
                                    </button>}
                                </>
                            ) : (
                                <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:12,background:'var(--bg-secondary)'}}>
                                    <div className="text-xs font-semibold mb-2" style={{color:'var(--text-muted)'}}>New action</div>
                                    <input
                                        ref={newActionInputRef}
                                        type="text"
                                        value={newActionName}
                                        onChange={e => setNewActionName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleInlineCreateAction(); if (e.key === 'Escape') setShowInlineCreate(false); }}
                                        placeholder="Action name..."
                                        className="v11-input"
                                        style={{marginBottom:8}}
                                    />
                                    {!showInlineCreateCategory ? (
                                        <>
                                            <select value={newActionCategoryId} onChange={e => setNewActionCategoryId(e.target.value)} className="v11-input" style={{marginBottom:4}}>
                                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                            {onAddCategory && <button onClick={() => setShowInlineCreateCategory(true)} style={{marginBottom:8,fontSize:10,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:3}}>
                                                <Icon.Plus size={9}/> New category
                                            </button>}
                                        </>
                                    ) : (
                                        <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:8,background:'var(--bg-primary)',marginBottom:8}}>
                                            <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleInlineCreateCategory(); if (e.key === 'Escape') setShowInlineCreateCategory(false); }} placeholder="Category name..." className="v11-input" style={{marginBottom:6,fontSize:12}} autoFocus/>
                                            <div style={{display:'flex',gap:4}}>
                                                <button onClick={handleInlineCreateCategory} style={{padding:'3px 8px',fontSize:10,color:'white',background:'var(--accent)',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer',fontWeight:500}}>Add</button>
                                                <button onClick={() => {setShowInlineCreateCategory(false);setNewCategoryName('');}} style={{padding:'3px 8px',fontSize:10,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer'}}>Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <button onClick={handleInlineCreateAction} className="px-3 py-1.5 text-xs text-white rounded-md font-medium" style={{background:'var(--accent)'}}>Create</button>
                                        <button onClick={() => { setShowInlineCreate(false); setNewActionName(''); setShowInlineCreateCategory(false); }} className="px-3 py-1.5 text-xs rounded-md" style={{background:'var(--bg-primary)',border:'1px solid var(--border)'}}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>}
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="v11-label">Start date</label><input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="v11-input"/></div>
                            <div className="flex-1"><label className="v11-label">End date</label><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="v11-input"/></div>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v => setForm({...form, priority: v})} renderOption={o => <PriorityOption priority={o}/>}/></div>
                            <div className="flex-1"><label className="v11-label">Budget (€)</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: parseInt(e.target.value) || 0})} className="v11-input"/></div>
                        </div>
                        <div><label className="v11-label">Description</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} className="v11-input" style={{resize:'none'}}/></div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6"><button onClick={onClose} className="v11-btn-secondary">Cancel</button><button onClick={handleAdd} className="px-6 py-2 text-white rounded-lg font-medium" style={{background:'var(--accent)'}}>Create task</button></div>
                </div>
            </div>
        </div>
    );
};

export default NewTaskModal;
