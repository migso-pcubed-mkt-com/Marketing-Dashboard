import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// Top-level error boundary to prevent blank screen on crash
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('Root error boundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        style: { padding: 40, fontFamily: 'system-ui', maxWidth: 600, margin: '60px auto' }
      },
        React.createElement('h2', { style: { color: '#ef4444', marginBottom: 12 } }, 'Something went wrong'),
        React.createElement('p', { style: { color: '#666', marginBottom: 16 } },
          'The application encountered an error. Try refreshing the page.'),
        React.createElement('pre', {
          style: { background: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', color: '#333' }
        }, String(this.state.error)),
        React.createElement('button', {
          onClick: () => window.location.reload(),
          style: { marginTop: 16, padding: '8px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }
        }, 'Refresh page')
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
