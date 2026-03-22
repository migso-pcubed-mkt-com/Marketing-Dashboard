import { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary]', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)'}}>
                    <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
                    <h3 style={{margin:'0 0 8px',color:'var(--text-primary)',fontSize:14,fontWeight:600}}>Something went wrong</h3>
                    <p style={{fontSize:12,marginBottom:12}}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{padding:'6px 16px',fontSize:12,fontWeight:500,background:'var(--accent)',color:'white',border:'none',borderRadius:'var(--radius-sm)',cursor:'pointer'}}
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
