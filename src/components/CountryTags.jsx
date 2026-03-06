import { useState } from 'react';
import { CONFIG } from '../config.js';
import { Icon } from './Icons.jsx';

const CountryTags = ({countries=[], onAdd, onRemove, editable=true, allCountries=CONFIG.COUNTRIES, onAddCustomCountry}) => {
    const [showPicker, setShowPicker] = useState(false);
    const [showNewCountryForm, setShowNewCountryForm] = useState(false);
    const [newCountryName, setNewCountryName] = useState('');
    const [newCountryFlag, setNewCountryFlag] = useState('');
    const [newCountryColor, setNewCountryColor] = useState('#3b82f6');
    const [newCountryRegion, setNewCountryRegion] = useState('Europe');
    const available = allCountries.filter(c => !countries.includes(c.id));

    const byRegion = available.reduce((acc, country) => {
        if (!acc[country.region]) acc[country.region] = [];
        acc[country.region].push(country);
        return acc;
    }, {});

    const availableRegions = [...new Set(CONFIG.COUNTRIES.map(c => c.region))];

    const handleAddNewCountry = () => {
        if (!newCountryName.trim()) return;
        if (onAddCustomCountry) {
            const newId = onAddCustomCountry(newCountryName.trim(), newCountryFlag || '🌍', newCountryColor, newCountryRegion);
            if (newId && onAdd) onAdd(newId);
        }
        setNewCountryName('');
        setNewCountryFlag('');
        setNewCountryColor('#3b82f6');
        setNewCountryRegion('Europe');
        setShowNewCountryForm(false);
        setShowPicker(false);
    };

    return (
        <div className="flex flex-wrap gap-1 items-center">
            {countries.map(countryId => { const country = allCountries.find(c => c.id === countryId); return country ? (<span key={countryId} className="px-2 py-0.5 rounded-full text-xs text-white flex items-center" style={{backgroundColor:country.color}}>{country.flag} {country.name}{editable && <button onClick={() => onRemove(countryId)} className="ml-1 hover:bg-[var(--bg-primary)]/20 rounded-full w-4 h-4 flex items-center justify-center text-xs">×</button>}</span>) : null; })}
            {editable && (<div className="relative"><button onClick={() => setShowPicker(!showPicker)} className="px-2 py-0.5 rounded-full text-xs flex items-center space-x-1" style={{background:'var(--bg-secondary)'}}><Icon.Plus/><span>Country</span></button>{showPicker && (<div className="absolute top-full left-0 mt-1 rounded-lg shadow-xl p-2 z-50 min-w-[200px] max-h-96 overflow-y-auto" style={{background:'var(--bg-primary)',border:'1px solid var(--border)'}}>{!showNewCountryForm ? (<>{Object.keys(byRegion).map(region => (<div key={region}><div className="text-xs font-semibold px-2 py-1" style={{color:'var(--text-muted)'}}>{region}</div>{byRegion[region].map(country => (<button key={country.id} onClick={() => {onAdd(country.id);setShowPicker(false);}} className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center space-x-2"><span>{country.flag}</span><span>{country.name}</span></button>))}</div>))}{onAddCustomCountry && <button onClick={() => setShowNewCountryForm(true)} className="w-full mt-2 px-2 py-1.5 rounded text-xs border border-dashed flex items-center justify-center space-x-1" style={{borderColor:'var(--border)'}}><Icon.Plus/><span>New country</span></button>}</>) : (<div className="p-2"><div className="text-xs font-semibold mb-2">Add a country</div><input type="text" placeholder="Country name" value={newCountryName} onChange={e => setNewCountryName(e.target.value)} className="v11-input" style={{fontSize:11,marginBottom:8}}/><input type="text" placeholder="Emoji (e.g. 🇫🇷)" value={newCountryFlag} onChange={e => setNewCountryFlag(e.target.value)} className="v11-input" style={{fontSize:11,marginBottom:8}} maxLength="4"/><div className="mb-2"><label className="text-xs block mb-1">Continent:</label><select value={newCountryRegion} onChange={e => setNewCountryRegion(e.target.value)} className="v11-select" style={{fontSize:11,width:'100%'}}>{availableRegions.map(region => <option key={region} value={region}>{region}</option>)}</select></div><div className="flex items-center gap-2 mb-2"><label className="text-xs">Color:</label><input type="color" value={newCountryColor} onChange={e => setNewCountryColor(e.target.value)} className="w-12 h-6 rounded"/></div><div className="flex gap-1"><button onClick={handleAddNewCountry} className="flex-1 px-2 py-1 text-xs bg-secondary text-white rounded">Add</button><button onClick={() => {setShowNewCountryForm(false);setNewCountryName('');setNewCountryFlag('');setNewCountryRegion('Europe');}} className="v11-btn-secondary" style={{flex:1,fontSize:11}}>Cancel</button></div></div>)}</div>)}</div>)}
        </div>
    );
};

export default CountryTags;
