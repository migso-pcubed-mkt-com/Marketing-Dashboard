import { useState } from 'react';
import { CONFIG } from '../config.js';
import { Icon, PriorityOption } from './Icons.jsx';
import IconSelect from './IconSelect.jsx';
import ChannelTags from './ChannelTags.jsx';

const NewActionModal = ({categories, onClose, onAdd}) => {
    const [form, setForm] = useState({name:'',categoryId:categories[0]?.id||'',budget:0,priority:'medium',tags:[]});
    const handleAdd = () => {
        if (!form.name.trim() || !form.categoryId) return;
        onAdd({...form, id: `a${Date.now()}`});
        onClose();
    };
    return (
        <div className="v11-modal-overlay" onClick={onClose}>
            <div className="v11-modal animate-slide-up" style={{maxWidth:512}} onClick={e => e.stopPropagation()}>
                <div style={{height:3,background:'var(--accent)',borderRadius:'var(--radius-lg) var(--radius-lg) 0 0'}}/>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold">📁 New Action</h2>
                        <button onClick={onClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium mb-2">Action name</label><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="E.g. Google Ads - Brand" className="v11-input"/></div>
                        <div><label className="block text-sm font-medium mb-2">Category</label><select value={form.categoryId} onChange={e => setForm({...form, categoryId: e.target.value})} className="v11-input">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="block text-sm font-medium mb-2">Budget (€)</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: parseInt(e.target.value) || 0})} className="v11-input"/></div>
                            <div className="flex-1"><label className="block text-sm font-medium mb-2">Priority</label><IconSelect value={form.priority} options={CONFIG.PRIORITIES} onChange={v => setForm({...form, priority: v})} renderOption={o => <PriorityOption priority={o}/>}/></div>
                        </div>
                        <div><label className="block text-sm font-medium mb-2">Channel Tags</label><ChannelTags channels={form.tags} onAdd={id => setForm({...form, tags: [...form.tags, id]})} onRemove={id => setForm({...form, tags: form.tags.filter(t => t !== id)})}/></div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6"><button onClick={onClose} className="v11-btn-secondary">Cancel</button><button onClick={handleAdd} className="px-6 py-2 bg-primary text-white rounded-lg font-medium">Create action</button></div>
                </div>
            </div>
        </div>
    );
};

export default NewActionModal;
