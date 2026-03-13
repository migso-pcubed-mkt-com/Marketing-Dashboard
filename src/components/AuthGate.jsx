import { useState } from 'react';

const AuthGate = ({ onTrelloLogin, onValidateToken, onGuestLogin }) => {
    const [password, setPassword] = useState('');
    const [manualToken, setManualToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showTokenPaste, setShowTokenPaste] = useState(false);

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
        setShowTokenPaste(false);
        try {
            const result = await onTrelloLogin();
            if (result?.needsManualToken) {
                setShowTokenPaste(true);
            }
        } catch (err) {
            setError(err.message || 'Trello login failed');
        }
    };

    const handleTokenSubmit = async (e) => {
        e.preventDefault();
        if (!manualToken.trim()) return;
        setLoading(true);
        setError('');
        try {
            await onValidateToken(manualToken);
        } catch (err) {
            // Show helpful error based on diagnostics
            let msg = err.message || 'Invalid token';
            if (manualToken.trim().length < 64 && (msg.includes('rejected') || msg.includes('unauthorized'))) {
                msg = `Token rejected (${manualToken.trim().length} chars). Trello tokens are typically 64 characters — make sure you copied the FULL token, not just the verification code.`;
            }
            setError(msg);
        }
        setLoading(false);
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

                {!showTokenPaste ? (
                    <>
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
                    </>
                ) : (
                    <>
                        <div style={{
                            background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
                            padding: '12px 16px', marginBottom: 20, textAlign: 'left'
                        }}>
                            <p style={{ fontSize: 13, color: '#0369a1', margin: 0, fontWeight: 600 }}>
                                Almost there!
                            </p>
                            <p style={{ fontSize: 12, color: '#0c4a6e', margin: '6px 0 0', lineHeight: 1.5 }}>
                                Trello displayed a verification code. Copy it from the Trello window and paste it below.
                            </p>
                        </div>

                        <form onSubmit={handleTokenSubmit}>
                            <input
                                type="text"
                                value={manualToken}
                                onChange={e => { setManualToken(e.target.value); setError(''); }}
                                placeholder="Paste your Trello token here..."
                                autoFocus
                                style={{
                                    width: '100%', padding: '10px 14px', borderRadius: 8,
                                    border: `1px solid ${error ? '#ef4444' : '#e2e8f0'}`, fontSize: 13,
                                    outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
                                    transition: 'border-color 0.2s'
                                }}
                                onFocus={e => e.target.style.borderColor = '#0079BF'}
                                onBlur={e => e.target.style.borderColor = error ? '#ef4444' : '#e2e8f0'}
                            />
                            {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '8px 0 0', textAlign: 'left' }}>{error}</p>}
                            <button type="submit" disabled={loading || !manualToken.trim()} style={{
                                width: '100%', padding: '10px 20px', borderRadius: 8, border: 'none',
                                background: '#0079BF', color: 'white', fontSize: 14, fontWeight: 600,
                                cursor: loading ? 'wait' : 'pointer', marginTop: 12,
                                opacity: (!manualToken.trim() || loading) ? 0.6 : 1,
                                transition: 'opacity 0.2s'
                            }}>
                                {loading ? 'Validating...' : 'Connect'}
                            </button>
                        </form>

                        <button onClick={() => { setShowTokenPaste(false); setError(''); setManualToken(''); }}
                            style={{
                                background: 'none', border: 'none', color: '#64748b', fontSize: 12,
                                cursor: 'pointer', marginTop: 16, textDecoration: 'underline'
                            }}>
                            Back to login options
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthGate;
