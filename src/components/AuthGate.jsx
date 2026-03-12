import { useState } from 'react';

const AuthGate = ({ onTrelloLogin, onGuestLogin }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGuestSubmit = async (e) => {
        e.preventDefault();
        if (!password.trim()) return;
        setLoading(true);
        setError('');
        try {
            await onGuestLogin(password);
        } catch (err) {
            setError(err.message || 'Invalid password');
        }
        setLoading(false);
    };

    const handleTrelloClick = async () => {
        setError('');
        try {
            await onTrelloLogin();
        } catch (err) {
            setError(err.message || 'Trello login failed');
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 24
        }}>
            <div style={{
                background: 'white', borderRadius: 16, padding: '48px 40px', maxWidth: 400, width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center'
            }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Marketing Dashboard</h1>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 32px' }}>MIGSO-PCUBED Marketing Team</p>

                <button onClick={handleTrelloClick} style={{
                    width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
                    background: '#0079BF', color: 'white', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.2s'
                }} onMouseEnter={e => e.currentTarget.style.background = '#026AA7'}
                   onMouseLeave={e => e.currentTarget.style.background = '#0079BF'}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                        <rect x="1" y="1" width="22" height="22" rx="3" ry="3"/>
                        <rect x="4" y="4" width="7" height="15" rx="1.5" ry="1.5" fill="#0079BF"/>
                        <rect x="13" y="4" width="7" height="10" rx="1.5" ry="1.5" fill="#0079BF"/>
                    </svg>
                    Connect with Trello
                </button>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0',
                    color: '#94a3b8', fontSize: 12
                }}>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }}/>
                    <span>or</span>
                    <div style={{ flex: 1, height: 1, background: '#e2e8f0' }}/>
                </div>

                <form onSubmit={handleGuestSubmit}>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px', fontWeight: 500 }}>Guest Access</p>
                    <input
                        type="password"
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        placeholder="Enter password..."
                        style={{
                            width: '100%', padding: '10px 14px', borderRadius: 8,
                            border: `1px solid ${error ? '#ef4444' : '#e2e8f0'}`, fontSize: 14,
                            outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s'
                        }}
                        onFocus={e => e.target.style.borderColor = '#6366f1'}
                        onBlur={e => e.target.style.borderColor = error ? '#ef4444' : '#e2e8f0'}
                    />
                    {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '8px 0 0', textAlign: 'left' }}>{error}</p>}
                    <button type="submit" disabled={loading || !password.trim()} style={{
                        width: '100%', padding: '10px 20px', borderRadius: 8, border: 'none',
                        background: '#6366f1', color: 'white', fontSize: 14, fontWeight: 600,
                        cursor: loading ? 'wait' : 'pointer', marginTop: 12, opacity: (!password.trim() || loading) ? 0.6 : 1,
                        transition: 'opacity 0.2s'
                    }}>
                        {loading ? 'Verifying...' : 'Enter'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AuthGate;
