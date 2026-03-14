import { useState, useEffect, useRef } from 'react';

const IconSelect = ({value, options, onChange, renderOption, className, style, disabled}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);
    const selected = options.find(o => o.id === value) || options[0];
    return (
        <div ref={ref} style={{position:'relative',...style}} className={className}>
            <div onClick={() => !disabled && setOpen(!open)} className="v11-select" style={{cursor:disabled?'default':'pointer',display:'flex',alignItems:'center',gap:6,paddingRight:24,opacity:disabled?0.7:1}}>
                {renderOption(selected)}
                <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:10,color:'var(--text-muted)'}}>▾</span>
            </div>
            {open && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',maxHeight:200,overflowY:'auto',marginTop:2}}>
                    {options.map(o => (
                        <div key={o.id} onClick={() => {onChange(o.id);setOpen(false);}} style={{padding:'6px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:6,background:o.id===value?'var(--bg-secondary)':'transparent'}}
                            onMouseEnter={e => e.currentTarget.style.background='var(--bg-secondary)'}
                            onMouseLeave={e => e.currentTarget.style.background=o.id===value?'var(--bg-secondary)':'transparent'}>
                            {renderOption(o)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default IconSelect;
