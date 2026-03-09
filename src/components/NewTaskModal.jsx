import { useState, useRef, useEffect } from 'react';
import { CONFIG } from '../config.js';
import { Icon, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';

const NewTaskModal = ({actions, categories, onClose, onAdd, onCreateAction}) => {
    const [form, setForm] = useState({title:'',actionId:actions[0]?.id||'',startDate:new Date().toISOString().split('T')[0],dueDate:'',priority:'medium',status:'todo',description:'',budget:0});
    const [showInlineCreate, setShowInlineCreate] = useState(false);
    const [newActionName, setNewActionName] = useState('');
    const [newActionCategoryId, setNewActionCategoryId] = useState(categories[0]?.id || '');
    const newActionInputRef = useRef(null);

    useEffect(() => {
        if (showInlineCreate && newActionInputRef.current) newActionInputRef.current.focus();
    }, [showInlineCreate]);

    const handleInlineCreateAction = () => {
        const name = newActionName.trim();
        if (!name || !newActionCategoryId) return;
        const newAction = {
            id: `a${Date.now()}`,
            name,
            categoryId: newActionCategoryId,
            budget: 0,
            priority: 'medium',
            tags: []
        };
        // We need to call onCreateAction which should add the action and return it
        // But the current API just navigates to NewActionModal. Let's handle it inline.
        if (typeof onCreateAction === 'function') {
            onCreateAction(newAction);
        }
        setForm(prev => ({...prev, actionId: newAction.id}));
        setNewActionName('');
        setNewActionCategoryId(categories[0]?.id || '');
        setShowInlineCreate(false);
    };

    const handleAdd = () => {
        if (!form.title.trim() || !form.actionId) return;
        const action = actions.find(a => a.id === form.actionId);
        const month = form.startDate ? new Date(form.startDate).getMonth() : new Date().getMonth();
        onAdd({...form, id: `t${Date.now()}`, month, channels: action?.tags || [], checklist: [], comments: [], attachments: []});
        onClose();
    };
    const selectedAction = actions.find(a => a.id === form.actionId);
    const actionCategory = categories.find(c => c.id === selectedAction?.categoryId);
    return (
        <div className="v11-modal-overlay" onClick={onClose}>
            <div className="v11-modal animate-slide-up" style={{maxWidth:512}} onClick={e => e.stopPropagation()}>
                <div className={`h-2 rounded-t-2xl bg-gradient-to-r ${actionCategory?.gradient || 'from-gray-400 to-gray-500'}`}/>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold">New Task</h2>
                        <button onClick={onClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium mb-2">Title</label><input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="E.g. LinkedIn Post January" className="v11-input"/></div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Action</label>
                            {!showInlineCreate ? (
                                <>
                                    <select value={form.actionId} onChange={e => setForm({...form, actionId: e.target.value})} className="v11-input">{actions.map(a => { const cat = categories.find(c => c.id === a.categoryId); return <option key={a.id} value={a.id}>{a.name} ({cat?.name})</option>; })}</select>
                                    <button onClick={() => setShowInlineCreate(true)} className="mt-1.5 text-xs flex items-center gap-1" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0}}>
                                        <Icon.Plus size={11}/> Create a new action
                                    </button>
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
                                    <select value={newActionCategoryId} onChange={e => setNewActionCategoryId(e.target.value)} className="v11-input" style={{marginBottom:8}}>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <div className="flex gap-2">
                                        <button onClick={handleInlineCreateAction} className="px-3 py-1.5 text-xs text-white rounded-md font-medium" style={{background:'var(--accent)'}}>Create</button>
                                        <button onClick={() => { setShowInlineCreate(false); setNewActionName(''); }} className="px-3 py-1.5 text-xs rounded-md" style={{background:'var(--bg-primary)',border:'1px solid var(--border)'}}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="block text-sm font-medium mb-2">Start date</label><input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="v11-input"/></div>
                            <div className="flex-1"><label className="block text-sm font-medium mb-2">End date</label><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="v11-input"/></div>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="block text-sm font-medium mb-2">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v => setForm({...form, priority: v})} renderOption={o => <PriorityOption priority={o}/>}/></div>
                            <div className="flex-1"><label className="block text-sm font-medium mb-2">Budget (€)</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: parseInt(e.target.value) || 0})} className="v11-input"/></div>
                        </div>
                        <div><label className="block text-sm font-medium mb-2">Description</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} className="v11-input" style={{resize:'none'}}/></div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6"><button onClick={onClose} className="v11-btn-secondary">Cancel</button><button onClick={handleAdd} className="px-6 py-2 bg-primary text-white rounded-lg font-medium">Create task</button></div>
                </div>
            </div>
        </div>
    );
};

export default NewTaskModal;
