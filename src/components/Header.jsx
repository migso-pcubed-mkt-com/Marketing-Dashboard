import { useState } from 'react';
import { Icon } from './Icons.jsx';
import BoardSelector from './BoardSelector.jsx';

const Header = ({currentView, setCurrentView, onSync, syncing, githubConnected, savingStatus}) => {
    const [mobileMenu, setMobileMenu] = useState(false);
    const navItems = [{id:'kanban',icon:Icon.Kanban,label:'Kanban'},{id:'timeline',icon:Icon.Timeline,label:'Timeline'},{id:'dashboard',icon:Icon.Dashboard,label:'KPIs'}];
    return (
        <header className="v11-header" style={{background:'var(--bg-primary)',borderBottom:'1px solid var(--border)'}}>
            <div className="v11-header-inner" style={{maxWidth:1600,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',height:'100%',gap:16,padding:'0 24px'}}>
                <div className="flex items-center gap-2.5" style={{flex:1}}>
                    <div className="v11-logo">M</div>
                    <div><span className="font-semibold text-sm" style={{color:'var(--text-primary)'}}>Marketing Tracker</span><span className="block text-xs" style={{color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>MIGSO-PCUBED</span></div>
                    <BoardSelector/>
                </div>
                <nav className="hidden md:flex v11-view-tabs">
                    {navItems.map(({id, icon: I, label}) => (
                        <button key={id} onClick={() => setCurrentView(id)} className={`v11-view-tab ${currentView === id ? 'active' : ''}`}><I size={14}/><span>{label}</span></button>
                    ))}
                </nav>
                <div className="flex items-center gap-1.5" style={{flex:1,justifyContent:'flex-end'}}>
                    {savingStatus && <span className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{background:savingStatus==='error'?'var(--error-light)':'var(--accent-light)',color:savingStatus==='error'?'var(--error)':'var(--accent)'}}>{savingStatus==='saving'?'Saving...':savingStatus==='error'?'Error':'Saved'}</span>}
                    <button onClick={onSync} disabled={syncing} className={`v11-icon-btn ${syncing ? 'animate-spin' : ''}`} style={{position:'relative'}} title="Sync data">
                        <Icon.Refresh/>
                        {githubConnected && <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{background:'var(--success)'}}/>}
                    </button>
                    <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden v11-icon-btn">{mobileMenu ? <Icon.Close/> : <Icon.Menu/>}</button>
                </div>
            </div>
            {mobileMenu && (<div className="md:hidden py-3 border-t animate-slide-in" style={{borderColor:'var(--border)'}}>{navItems.map(({id, icon: I, label}) => (<button key={id} onClick={() => {setCurrentView(id);setMobileMenu(false);}} className={`flex items-center space-x-3 w-full px-4 py-3 rounded-lg text-sm ${currentView === id ? 'bg-primary text-white' : ''}`}><I/><span>{label}</span></button>))}</div>)}
        </header>
    );
};

export default Header;
