import { useMemo, useEffect, useRef } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon } from './Icons.jsx';

const FilterSidebar = ({show, onClose, filters, setFilters, categories, allCountries, tasks = [], members = [], searchInputRef: externalRef}) => {
    const internalRef = useRef(null);
    const inputRef = externalRef || internalRef;

    // Auto-focus search input when sidebar opens
    useEffect(() => {
        if (show && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [show]);
    // Collect unique otherLabels from all tasks
    const uniqueOtherLabels = useMemo(() => {
        const labelMap = new Map();
        for (const t of tasks) {
            for (const l of (t.otherLabels || [])) {
                if (!labelMap.has(l.id)) labelMap.set(l.id, l);
            }
        }
        return Array.from(labelMap.values());
    }, [tasks]);

    return (
        <div className={`filter-sidebar ${show ? 'open' : ''}`}>
            <div className="sidebar-header">
                <span className="sidebar-title">Filters</span>
                <button className="sidebar-close" onClick={onClose}><Icon.Close/></button>
            </div>
            <div className="filter-section">
                <div className="filter-section-title">Search</div>
                <input ref={inputRef} type="text" placeholder="Search..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} className="v11-input"/>
            </div>
            <div className="filter-section">
                <div className="filter-section-title">Status</div>
                <div className="filter-options">{CONFIG.STATUSES.map(s => (<button key={s.id} onClick={() => { const n = filters.status.includes(s.id) ? filters.status.filter(x => x !== s.id) : [...filters.status, s.id]; setFilters({...filters, status: n}); }} className={`filter-option ${filters.status.includes(s.id) ? 'selected' : ''}`} style={{display:'flex',alignItems:'center',gap:4}}><StatusIcon statusId={s.id} size={11}/> {s.name}</button>))}</div>
            </div>
            <div className="filter-section">
                <div className="filter-section-title">Category</div>
                <div className="filter-options">{categories.map(c => (<button key={c.id} onClick={() => { const n = filters.category.includes(c.id) ? filters.category.filter(x => x !== c.id) : [...filters.category, c.id]; setFilters({...filters, category: n}); }} className={`filter-option ${filters.category.includes(c.id) ? 'selected' : ''}`}>{c.name}</button>))}</div>
            </div>
            <div className="filter-section">
                <div className="filter-section-title">Priority</div>
                <div className="filter-options">{CONFIG.PRIORITIES.map(p => (<button key={p.id} onClick={() => { const n = filters.priority.includes(p.id) ? filters.priority.filter(x => x !== p.id) : [...filters.priority, p.id]; setFilters({...filters, priority: n}); }} className={`filter-option ${filters.priority.includes(p.id) ? 'selected' : ''}`} style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:8,height:8,borderRadius:'50%',background:p.color,flexShrink:0}}/> {p.name}</button>))}</div>
            </div>
            <div className="filter-section">
                <div className="filter-section-title">Channel</div>
                <div className="filter-options">{CONFIG.CHANNELS.map(ch => (<button key={ch.id} onClick={() => { const n = (filters.channel || []).includes(ch.id) ? (filters.channel || []).filter(x => x !== ch.id) : [...(filters.channel || []), ch.id]; setFilters({...filters, channel: n}); }} className={`filter-option ${(filters.channel || []).includes(ch.id) ? 'selected' : ''}`}>{ch.name}</button>))}</div>
            </div>
            <div className="filter-section">
                <div className="filter-section-title">Country</div>
                <div className="filter-options">{allCountries.map(co => (<button key={co.id} onClick={() => { const n = (filters.country || []).includes(co.id) ? (filters.country || []).filter(x => x !== co.id) : [...(filters.country || []), co.id]; setFilters({...filters, country: n}); }} className={`filter-option ${(filters.country || []).includes(co.id) ? 'selected' : ''}`}>{co.flag} {co.name}</button>))}</div>
            </div>
            {members.length > 0 && (
                <div className="filter-section">
                    <div className="filter-section-title">Members</div>
                    <div className="filter-options">{members.map(m => (<button key={m.id} onClick={() => { const n = (filters.member || []).includes(m.id) ? (filters.member || []).filter(x => x !== m.id) : [...(filters.member || []), m.id]; setFilters({...filters, member: n}); }} className={`filter-option ${(filters.member || []).includes(m.id) ? 'selected' : ''}`} style={{display:'flex',alignItems:'center',gap:6}}>
                        {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{width:16,height:16,borderRadius:'50%'}}/> : <span style={{width:16,height:16,borderRadius:'50%',background:'var(--accent)',color:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600}}>{(m.fullName||m.username||'?')[0].toUpperCase()}</span>}
                        {m.fullName || m.username}
                    </button>))}</div>
                </div>
            )}
            {uniqueOtherLabels.length > 0 && (
                <div className="filter-section">
                    <div className="filter-section-title">Other Labels</div>
                    <div className="filter-options">{uniqueOtherLabels.map(l => (<button key={l.id} onClick={() => { const n = (filters.otherLabel || []).includes(l.id) ? (filters.otherLabel || []).filter(x => x !== l.id) : [...(filters.otherLabel || []), l.id]; setFilters({...filters, otherLabel: n}); }} className={`filter-option ${(filters.otherLabel || []).includes(l.id) ? 'selected' : ''}`} style={{display:'flex',alignItems:'center',gap:5}}>
                        <div style={{width:8,height:8,borderRadius:2,background:l.color||'#888',flexShrink:0}}/>
                        {l.name || 'Label'}
                    </button>))}</div>
                </div>
            )}
            <div className="sidebar-footer">
                <button onClick={() => setFilters({search:'',status:[],category:[],priority:[],channel:[],country:[],otherLabel:[],member:[]})} className="v11-btn-secondary" style={{flex:1}}>Reset</button>
                <button onClick={onClose} className="v11-btn-primary" style={{flex:1}}>Apply</button>
            </div>
        </div>
    );
};

export default FilterSidebar;
