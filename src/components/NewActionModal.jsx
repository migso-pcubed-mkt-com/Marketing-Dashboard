import { useState, useEffect } from 'react';
import { CONFIG } from '../config.js';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Icon, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';

const NewActionModal = ({categories, onClose, onAdd, onAddCategory}) => {
    const focusTrapRef = useFocusTrap(true);
    const [form, setForm] = useState({name:'',categoryId:categories[0]?.id||'',budget:0,priority:'medium',tags:[]});
    const [showInlineCreateCategory, setShowInlineCreateCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    const handleInlineCreateCategory = () => {
        if (!newCategoryName.trim() || !onAddCategory) return;
        const nc = {id:`cat-${crypto.randomUUID()}`, name:newCategoryName.trim(), color:'#6366f1', gradient:'from-indigo-500 to-purple-500', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()};
        onAddCategory(nc);
        setForm({...form, categoryId: nc.id});
        setNewCategoryName('');
        setShowInlineCreateCategory(false);
    };

    const handleAdd = () => {
        if (!form.name.trim() || !form.categoryId) return;
        const now = new Date().toISOString();
        onAdd({...form, id: `a-${crypto.randomUUID()}`, createdAt: now, updatedAt: now});
        onClose();
    };

    // Context-aware Escape handler: close sub-forms first, then modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (showInlineCreateCategory) { setShowInlineCreateCategory(false); setNewCategoryName(''); return; }
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, showInlineCreateCategory]);

    return (
        <div className="v11-modal-overlay" onClick={onClose}>
            <div ref={focusTrapRef} className="v11-modal animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="new-action-modal-title" style={{maxWidth:512}} onClick={e => e.stopPropagation()}>
                <div style={{height:3,background:'var(--accent)',borderRadius:'var(--radius-lg) var(--radius-lg) 0 0'}}/>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 id="new-action-modal-title" className="text-xl font-bold flex items-center gap-2"><Icon.List size={18}/> New Action</h2>
                        <button onClick={onClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    <div className="space-y-4">
                        <div><label className="v11-label">Action name</label><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="E.g. Google Ads - Brand" className="v11-input" autoFocus/></div>
                        <div>
                            <label className="v11-label">Category</label>
                            {!showInlineCreateCategory ? (
                                <>
                                    <select value={form.categoryId} onChange={e => setForm({...form, categoryId: e.target.value})} className="v11-input">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                    {onAddCategory && (
                                        <button onClick={() => setShowInlineCreateCategory(true)} className="mt-1.5 text-xs flex items-center gap-1" style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0}}>
                                            <Icon.Plus size={11}/> Create a new category
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:12,background:'var(--bg-secondary)'}}>
                                    <div className="text-xs font-semibold mb-2" style={{color:'var(--text-muted)'}}>New category</div>
                                    <input
                                        type="text"
                                        value={newCategoryName}
                                        onChange={e => setNewCategoryName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleInlineCreateCategory(); if (e.key === 'Escape') setShowInlineCreateCategory(false); }}
                                        placeholder="Category name..."
                                        className="v11-input"
                                        style={{marginBottom:8}}
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleInlineCreateCategory} className="px-3 py-1.5 text-xs text-white rounded-md font-medium" style={{background:'var(--accent)'}}>Create</button>
                                        <button onClick={() => { setShowInlineCreateCategory(false); setNewCategoryName(''); }} className="px-3 py-1.5 text-xs rounded-md" style={{background:'var(--bg-primary)',border:'1px solid var(--border)'}}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="v11-label">Budget (€)</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: parseInt(e.target.value) || 0})} className="v11-input"/></div>
                            <div className="flex-1"><label className="v11-label">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v => setForm({...form, priority: v})} renderOption={o => <PriorityOption priority={o}/>}/></div>
                        </div>
                        <div><label className="v11-label">🏷️ Channel Tags</label><ChannelTags channels={form.tags} onAdd={id => setForm({...form, tags: [...form.tags, id]})} onRemove={id => setForm({...form, tags: form.tags.filter(t => t !== id)})}/></div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6"><button onClick={onClose} className="v11-btn-secondary">Cancel</button><button onClick={handleAdd} className="px-6 py-2 text-white rounded-lg font-medium" style={{background:'var(--accent)'}}>Create action</button></div>
                </div>
            </div>
        </div>
    );
};

export default NewActionModal;
