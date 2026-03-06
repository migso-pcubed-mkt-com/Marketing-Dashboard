import { useState } from 'react';
import { CONFIG } from '../config.js';
import { Icon } from './Icons.jsx';

const ChannelTags = ({channels=[], onAdd, onRemove, editable=true}) => {
    const [showPicker, setShowPicker] = useState(false);
    const available = CONFIG.CHANNELS.filter(c => !channels.includes(c.id));
    return (
        <div className="flex flex-wrap gap-1 items-center">
            {channels.map(chId => { const ch = CONFIG.CHANNELS.find(c => c.id === chId); return ch ? (<span key={chId} className="px-2 py-0.5 rounded-full text-xs text-white flex items-center" style={{backgroundColor:ch.color}}>{ch.name}{editable && <button onClick={() => onRemove(chId)} className="ml-1 hover:bg-[var(--bg-primary)]/20 rounded-full w-4 h-4 flex items-center justify-center text-xs">×</button>}</span>) : null; })}
            {editable && available.length > 0 && (<div className="relative"><button onClick={() => setShowPicker(!showPicker)} className="px-2 py-0.5 rounded-full text-xs flex items-center space-x-1" style={{background:'var(--bg-secondary)'}}><Icon.Plus/><span>Tag</span></button>{showPicker && (<div className="absolute top-full left-0 mt-1 rounded-lg shadow-xl p-2 z-50 min-w-[150px] max-h-48 overflow-y-auto" style={{background:'var(--bg-primary)',border:'1px solid var(--border)'}}>{available.map(ch => (<button key={ch.id} onClick={() => {onAdd(ch.id);setShowPicker(false);}} className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center space-x-2"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:ch.color}}/><span>{ch.name}</span></button>))}</div>)}</div>)}
        </div>
    );
};

export default ChannelTags;
