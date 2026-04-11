import { useState, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { Icon } from './Icons.jsx';

const CategoriesManagementModal = ({categories, onClose, onUpdate, onAdd, onDelete, onReorder}) => {
    const focusTrapRef = useFocusTrap(true);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({});
    const [isAdding, setIsAdding] = useState(false);
    const [newCategory, setNewCategory] = useState({name:'',color:'#6366f1',gradient:'from-indigo-500 to-purple-600'});
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [touchStartY, setTouchStartY] = useState(null);
    const [touchCurrentY, setTouchCurrentY] = useState(null);

    const gradientPresets = [
        {name:'Blue',gradient:'from-blue-500 to-indigo-700'},
        {name:'Green',gradient:'from-emerald-400 to-cyan-500'},
        {name:'Orange',gradient:'from-yellow-400 to-orange-500'},
        {name:'Purple',gradient:'from-purple-500 to-pink-600'},
        {name:'Red',gradient:'from-red-500 to-pink-500'}
    ];

    const startEdit = (cat) => { setEditingId(cat.id); setForm({...cat}); };
    const cancelEdit = () => { setEditingId(null); setForm({}); };
    const saveEdit = () => { onUpdate(editingId, form); cancelEdit(); };
    const handleAdd = () => {
        if (!newCategory.name.trim()) return;
        onAdd({...newCategory, id: `cat-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()});
        setNewCategory({name:'',color:'#6366f1',gradient:'from-indigo-500 to-purple-600'});
        setIsAdding(false);
    };

    const handleDragStart = (index) => { setDraggedIndex(index); };
    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        const newCategories = [...categories];
        const draggedItem = newCategories[draggedIndex];
        newCategories.splice(draggedIndex, 1);
        newCategories.splice(index, 0, draggedItem);
        onReorder(newCategories);
        setDraggedIndex(index);
    };
    const handleDragEnd = () => { setDraggedIndex(null); };

    const handleTouchStart = (e, index) => {
        if (editingId) return;
        const touch = e.touches[0];
        setTouchStartY(touch.clientY);
        setTouchCurrentY(touch.clientY);
        setDraggedIndex(index);
    };
    const handleTouchMove = (e, index) => {
        if (draggedIndex === null || editingId) return;
        const touch = e.touches[0];
        setTouchCurrentY(touch.clientY);
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!element) return;
        const categoryItem = element.closest('[data-category-index]');
        if (!categoryItem) return;
        const targetIndex = parseInt(categoryItem.getAttribute('data-category-index'));
        if (targetIndex !== draggedIndex && targetIndex >= 0 && targetIndex < categories.length) {
            const newCategories = [...categories];
            const draggedItem = newCategories[draggedIndex];
            newCategories.splice(draggedIndex, 1);
            newCategories.splice(targetIndex, 0, draggedItem);
            onReorder(newCategories);
            setDraggedIndex(targetIndex);
        }
    };
    const handleTouchEnd = () => {
        setDraggedIndex(null);
        setTouchStartY(null);
        setTouchCurrentY(null);
    };

    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="v11-modal-overlay" onClick={onClose}>
            <div ref={focusTrapRef} className="v11-modal animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="categories-modal-title" style={{maxWidth:672,maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
                <div style={{height:3,background:'var(--accent)',borderRadius:'var(--radius-lg) var(--radius-lg) 0 0'}}/>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 id="categories-modal-title" className="text-xl font-bold">📂 Manage Categories</h2>
                        <button onClick={onClose} className="v11-icon-btn"><Icon.Close/></button>
                    </div>
                    <div className="space-y-3 mb-4">
                        {categories.map((cat, index) => (
                            <div key={cat.id} data-category-index={index} draggable={editingId !== cat.id} onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd} onTouchStart={(e) => handleTouchStart(e, index)} onTouchMove={(e) => handleTouchMove(e, index)} onTouchEnd={handleTouchEnd} className={`p-4 rounded-lg ${draggedIndex === index ? 'opacity-50' : ''} ${editingId === cat.id ? '' : 'cursor-move touch-none'}`} style={{border:'1px solid var(--border)',background:'var(--bg-secondary)'}}>
                                {editingId === cat.id ? (
                                    <div className="space-y-3">
                                        <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="v11-input"/>
                                        <div><label className="v11-label">Gradient:</label><div className="flex gap-2">{gradientPresets.map(g => (<button key={g.name} onClick={() => setForm({...form, gradient: g.gradient})} className={`flex-1 h-8 rounded-lg bg-gradient-to-r ${g.gradient} ${form.gradient === g.gradient ? 'ring-2 ring-secondary' : ''}`}/>))}</div></div>
                                        <div className="flex gap-2"><button onClick={saveEdit} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Save</button><button onClick={cancelEdit} className="v11-btn-secondary">Cancel</button></div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3"><div className="cursor-move" style={{color:'var(--text-muted)'}} title="Drag to reorder">⋮⋮</div><div className={`w-12 h-8 rounded-lg bg-gradient-to-r ${cat.gradient}`}/><span className="font-medium">{cat.name}</span></div>
                                        <div className="flex gap-2"><button onClick={() => startEdit(cat)} className="px-3 py-1 text-sm text-secondary hover:bg-secondary/10 rounded-lg">Edit</button><button onClick={() => {if(window.confirm('Are you sure you want to delete this category?'))onDelete(cat.id);}} className="px-3 py-1 text-sm text-accent-red hover:bg-red-50 rounded-lg">Delete</button></div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {isAdding ? (
                        <div className="p-4 rounded-lg border-2 border-dashed space-y-3" style={{borderColor:'var(--border)'}}>
                            <input type="text" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} placeholder="Category name" className="v11-input"/>
                            <div><label className="v11-label">Gradient:</label><div className="flex gap-2">{gradientPresets.map(g => (<button key={g.name} onClick={() => setNewCategory({...newCategory, gradient: g.gradient})} className={`flex-1 h-8 rounded-lg bg-gradient-to-r ${g.gradient} ${newCategory.gradient === g.gradient ? 'ring-2 ring-secondary' : ''}`}/>))}</div></div>
                            <div className="flex gap-2"><button onClick={handleAdd} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Add</button><button onClick={() => setIsAdding(false)} className="v11-btn-secondary">Cancel</button></div>
                        </div>
                    ) : (
                        <button onClick={() => setIsAdding(true)} className="w-full px-4 py-3 border-2 border-dashed rounded-lg hover:border-secondary hover:text-secondary flex items-center justify-center space-x-2" style={{borderColor:'var(--border)',color:'var(--text-muted)'}}><Icon.Plus/><span>New Category</span></button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CategoriesManagementModal;
