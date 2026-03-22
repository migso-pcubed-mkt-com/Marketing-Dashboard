import { useState } from 'react';
import { useApp } from '../context.js';
import { Icon } from './Icons.jsx';
import BoardSelector from './BoardSelector.jsx';

const Header = ({currentView, setCurrentView, onSync, syncing, githubConnected, savingStatus, trelloSync, trelloSyncStatus, onTrelloSync, isOffline, realtimeConnected}) => {
    const { trelloUser, onTrelloLogin, onTrelloLogout } = useApp();
    const [mobileMenu, setMobileMenu] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const navItems = [{id:'kanban',icon:Icon.Kanban,label:'Kanban'},{id:'timeline',icon:Icon.Timeline,label:'Timeline'},{id:'calendar',icon:Icon.Calendar,label:'Calendar'},{id:'dashboard',icon:Icon.Dashboard,label:'KPIs'}];
    return (
        <header className="v11-header" style={{background:'var(--bg-primary)',borderBottom:'1px solid var(--border)'}}>
            <div className="v11-header-inner" style={{maxWidth:1600,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',height:'100%',gap:16,padding:'0 24px'}}>
                <div className="flex items-center gap-2.5" style={{flex:1}}>
                    <BoardSelector/>
                </div>
                <nav className="hidden md:flex v11-view-tabs">
                    {navItems.map(({id, icon: I, label}) => (
                        <button key={id} onClick={() => setCurrentView(id)} className={`v11-view-tab ${currentView === id ? 'active' : ''}`}><I size={14}/><span>{label}</span></button>
                    ))}
                </nav>
                <div className="flex items-center gap-1.5" style={{flex:1,justifyContent:'flex-end'}}>
                    <span className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{background:isOffline?'#fef3c7':savingStatus==='error'?'var(--error-light)':savingStatus==='saving'?'var(--accent-light)':'transparent',color:isOffline?'#92400e':savingStatus==='error'?'var(--error)':savingStatus==='saving'?'var(--accent)':'var(--text-muted)',transition:'all 0.3s'}} title={isOffline?'Offline — saving locally':realtimeConnected===false?'Realtime disconnected':savingStatus==='error'?'Save failed':savingStatus==='saving'?'Saving...':'Connected'}>
                        <span style={{width:6,height:6,borderRadius:'50%',background:isOffline?'#f59e0b':savingStatus==='error'?'var(--error)':savingStatus==='saving'?'var(--accent)':realtimeConnected===false?'#f59e0b':'#22c55e',flexShrink:0}}/>
                        {isOffline?'Offline':savingStatus==='saving'?'Saving...':savingStatus==='error'?'Error':savingStatus==='saved'?'Saved':''}
                    </span>
                    {trelloUser ? (
                        <div style={{position:'relative'}}>
                            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-1.5" style={{background:'none',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:'var(--radius-sm)'}}>
                                {trelloUser.avatarUrl ? <img src={trelloUser.avatarUrl} alt="" style={{width:24,height:24,borderRadius:'50%'}}/> : <span style={{width:24,height:24,borderRadius:'50%',background:'#0079BF',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600}}>{(trelloUser.fullName||trelloUser.username||'?')[0].toUpperCase()}</span>}
                                <span className="hidden sm:inline text-xs" style={{color:'var(--text-primary)',fontWeight:500}}>{trelloUser.fullName || trelloUser.username}</span>
                            </button>
                            {showUserMenu && (
                                <>
                                    <div style={{position:'fixed',inset:0,zIndex:98}} onClick={() => setShowUserMenu(false)}/>
                                    <div style={{position:'absolute',top:'100%',right:0,marginTop:4,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-lg)',zIndex:99,minWidth:160,padding:4}}>
                                        <div style={{padding:'8px 12px',fontSize:11,color:'var(--text-muted)',borderBottom:'1px solid var(--border)'}}>
                                            @{trelloUser.username}
                                        </div>
                                        <button onClick={() => { onTrelloLogout(); setShowUserMenu(false); }} style={{width:'100%',padding:'8px 12px',fontSize:12,color:'#dc2626',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderRadius:'var(--radius-sm)'}}>
                                            Disconnect Trello
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <button onClick={onTrelloLogin} style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',border:'none',background:'#0079BF',color:'white',fontSize:11,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="1" y="1" width="22" height="22" rx="3" ry="3"/><rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="#0079BF"/><rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="#0079BF"/></svg>
                            Connect
                        </button>
                    )}
                    {trelloSync?.syncEnabled && (
                        <button
                            onClick={onTrelloSync}
                            disabled={trelloSyncStatus === 'syncing'}
                            className="v11-icon-btn"
                            style={{position:'relative'}}
                            title={trelloSyncStatus === 'syncing' ? 'Syncing with Trello...' : `Trello sync (last: ${trelloSync.lastSyncAt ? new Date(trelloSync.lastSyncAt).toLocaleTimeString() : 'never'})`}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill={trelloSyncStatus === 'error' ? '#ef4444' : '#0079BF'}>
                                <rect x="1" y="1" width="22" height="22" rx="3" ry="3"/>
                                <rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="white"/>
                                <rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="white"/>
                            </svg>
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{background: trelloSyncStatus === 'syncing' ? '#f59e0b' : trelloSyncStatus === 'error' ? '#ef4444' : '#22c55e'}}/>
                        </button>
                    )}
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
