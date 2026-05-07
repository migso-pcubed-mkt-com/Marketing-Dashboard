import { useState, useRef, useCallback, useMemo } from 'react';
import { Icon } from './Icons.jsx';
import {
    parseWorkbook,
    analyzeWorkbook,
    buildBoard,
    buildBoardFromList,
    detectColumnMappings
} from '../lib/excelMapping.js';

const LEVEL_OPTIONS = [
    { value: 'category', label: 'Category', color: '#6366f1', desc: 'Section header' },
    { value: 'action',   label: 'Action',   color: '#f59e0b', desc: 'A row of tasks across months' },
    { value: 'empty',    label: 'Skip',     color: '#94a3b8', desc: 'Ignore this row' }
];

const FIELD_OPTIONS = [
    { value: '', label: '— Ignore —' },
    { value: 'title', label: 'Title' },
    { value: 'description', label: 'Description' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'startDate', label: 'Start date' },
    { value: 'dueDate', label: 'Due date / Deadline' },
    { value: 'category', label: 'Category' },
    { value: 'action', label: 'Action' },
    { value: 'owner', label: 'Owner / Assignee' },
    { value: 'budget', label: 'Budget' }
];

const currentYear = new Date().getFullYear();

const ExcelImportModal = ({ onClose, onImport }) => {
    // step: upload | review | preview
    const [step, setStep] = useState('upload');
    const [error, setError] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [year, setYear] = useState(currentYear);

    // After parsing: array of { name, sheet, analysis } — one per workbook sheet.
    const [sheets, setSheets] = useState([]);
    // Per-sheet user state: { included, boardName, overrides{rowIdx:level}, listMappings? }
    const [sheetState, setSheetState] = useState({});
    const [activeSheet, setActiveSheet] = useState(0);
    const fileInputRef = useRef(null);

    // ─── Step 1: Upload ──────────────────────────────────
    const handleFile = useCallback(async (file) => {
        if (!file) return;
        setError(null);
        try {
            const buffer = await file.arrayBuffer();
            const wb = await parseWorkbook(buffer);
            if (!wb.sheets || wb.sheets.length === 0) {
                setError('No sheets found in the file.');
                return;
            }
            const analyzed = analyzeWorkbook(wb);
            setSheets(analyzed);
            // Initialize per-sheet state — included by default, boardName = sheet name.
            const baseFile = file.name.replace(/\.(xlsx?|csv)$/i, '');
            const initial = {};
            analyzed.forEach((s, i) => {
                const isList = s.analysis.kind === 'list';
                initial[i] = {
                    included: true,
                    boardName: analyzed.length > 1 ? `${baseFile} — ${s.name}` : (baseFile || s.name),
                    overrides: {},
                    listMappings: isList ? detectColumnMappings(s.sheet.data?.[0] || []) : null
                };
            });
            setSheetState(initial);
            setActiveSheet(0);
            setStep('review');
        } catch (err) {
            setError(`Failed to parse file: ${err.message}`);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    // ─── Step 2: Review (per sheet) ──────────────────────
    const updateSheetState = (idx, patch) => {
        setSheetState(prev => ({ ...prev, [idx]: { ...prev[idx], ...patch } }));
    };

    const setRowLevel = (sheetIdx, rowIdx, level) => {
        setSheetState(prev => {
            const cur = prev[sheetIdx];
            const newOverrides = { ...cur.overrides, [rowIdx]: level };
            return { ...prev, [sheetIdx]: { ...cur, overrides: newOverrides } };
        });
    };

    const applyToSimilar = (sheetIdx, rowIdx, level) => {
        const target = sheets[sheetIdx];
        if (!target || target.analysis.kind !== 'grid') return;
        const sourceRow = target.analysis.rows.find(r => r.rowIdx === rowIdx);
        if (!sourceRow) return;
        const sourceSig = sourceRow.suggested;
        setSheetState(prev => {
            const cur = prev[sheetIdx];
            const newOverrides = { ...cur.overrides };
            for (const r of target.analysis.rows) {
                if (r.rowIdx === rowIdx) continue;
                if (r.suggested === sourceSig) newOverrides[r.rowIdx] = level;
            }
            newOverrides[rowIdx] = level;
            return { ...prev, [sheetIdx]: { ...cur, overrides: newOverrides } };
        });
    };

    // ─── Build preview boards from current state ─────────
    const previews = useMemo(() => {
        return sheets.map((s, i) => {
            const st = sheetState[i];
            if (!st || !st.included) return null;
            if (s.analysis.kind === 'list' && st.listMappings) {
                return buildBoardFromList(s.sheet, st.listMappings, { boardName: st.boardName });
            }
            return buildBoard(s.sheet, s.analysis, {
                year,
                boardName: st.boardName,
                overrides: st.overrides
            });
        });
    }, [sheets, sheetState, year]);

    const includedCount = previews.filter(Boolean).length;

    const handleImport = () => {
        const list = previews.filter(Boolean).map(b => ({
            name: b.name,
            categories: b.categories,
            actions: b.actions,
            tasks: b.tasks
        }));
        if (list.length === 0) {
            setError('Select at least one sheet to import.');
            return;
        }
        onImport(list);
        onClose();
    };

    // ─── UI helpers ──────────────────────────────────────
    const levelButton = (level, current, onClick) => {
        const def = LEVEL_OPTIONS.find(o => o.value === level);
        const isActive = current === level;
        return (
            <button
                onClick={onClick}
                className="v11-btn-ghost"
                style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    border: `1.5px solid ${isActive ? def.color : 'var(--border)'}`,
                    background: isActive ? def.color : 'var(--bg-primary)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 500,
                    borderRadius: 4
                }}
                title={def.desc}
            >
                {def.label}
            </button>
        );
    };

    const renderUpload = () => (
        <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
                border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 12,
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragging ? 'var(--accent-light)' : 'var(--bg-secondary)',
                transition: 'all 0.15s'
            }}
        >
            <Icon.Upload size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop your Excel file here</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>or click to browse — .xlsx, .xls, .csv</div>
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
            />
        </div>
    );

    const renderSheetTabs = () => (
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 12, flexWrap: 'wrap' }}>
            {sheets.map((s, i) => {
                const st = sheetState[i];
                const isActive = activeSheet === i;
                const cls = st?.included ? '' : 'opacity-50';
                return (
                    <button
                        key={i}
                        onClick={() => setActiveSheet(i)}
                        className={cls}
                        style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                            background: 'transparent',
                            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                            fontWeight: isActive ? 600 : 500
                        }}
                        title={st?.included ? '' : '(skipped)'}
                    >
                        {s.name} {!st?.included && '⊘'}
                    </button>
                );
            })}
        </div>
    );

    const renderListMapping = (sheet, st) => {
        const headerRow = sheet.sheet.data?.[0] || [];
        const onChange = (col, field) => {
            const m = { ...st.listMappings };
            // Remove any previous column assigned to this field
            for (const k of Object.keys(m)) if (m[k] === col) delete m[k];
            if (field) m[field] = col;
            updateSheetState(activeSheet, { listMappings: m });
        };
        return (
            <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    No month grid detected — map each column to a task field.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 6 }}>
                    {headerRow.map((h, c) => {
                        const currentField = Object.entries(st.listMappings).find(([, col]) => col === c)?.[0] || '';
                        return (
                            <div key={c} style={{ display: 'contents' }}>
                                <div style={{ padding: '6px 0', fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Col {c + 1}</span>
                                    <strong>{h || '(empty)'}</strong>
                                </div>
                                <select
                                    value={currentField}
                                    onChange={(e) => onChange(c, e.target.value)}
                                    className="v11-select"
                                    style={{ fontSize: 12, padding: '4px 8px' }}
                                >
                                    {FIELD_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderGridReview = (sheet, st) => {
        const analysis = sheet.analysis;
        // Group rows for compact visual: a category followed by its actions (until next category).
        return (
            <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Detected {analysis.rows.filter(r => r.suggested === 'category').length} categories,
                    {' '}{analysis.rows.filter(r => r.suggested === 'action').length} actions across
                    {' '}{analysis.monthCols.length} months. Adjust any misclassified row below.
                </div>
                <div style={{ maxHeight: '40vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Row</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Label</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Months</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Classification</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analysis.rows.map(row => {
                                const current = st.overrides[row.rowIdx] || row.level;
                                return (
                                    <tr key={row.rowIdx} style={{
                                        borderBottom: '1px solid var(--border-light)',
                                        background: current === 'empty' ? 'var(--bg-page)' : 'transparent',
                                        opacity: current === 'empty' ? 0.5 : 1
                                    }}>
                                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{row.rowIdx + 1}</td>
                                        <td style={{ padding: '6px 10px', fontWeight: current === 'category' ? 600 : 400 }}>
                                            {row.label || <span style={{ color: 'var(--text-muted)' }}>(empty)</span>}
                                        </td>
                                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>
                                            {row.monthSignals.length > 0
                                                ? `${row.monthSignals.length} cell${row.monthSignals.length > 1 ? 's' : ''}`
                                                : '—'}
                                        </td>
                                        <td style={{ padding: '6px 10px' }}>
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                                {LEVEL_OPTIONS.map(o => (
                                                    <span key={o.value}>
                                                        {levelButton(o.value, current, () => setRowLevel(activeSheet, row.rowIdx, o.value))}
                                                    </span>
                                                ))}
                                                <button
                                                    className="v11-btn-ghost"
                                                    onClick={() => applyToSimilar(activeSheet, row.rowIdx, current)}
                                                    style={{ fontSize: 10, padding: '2px 6px', color: 'var(--text-muted)' }}
                                                    title="Apply this classification to every row that was auto-detected the same way"
                                                >
                                                    Apply to similar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderReview = () => {
        const sheet = sheets[activeSheet];
        const st = sheetState[activeSheet];
        if (!sheet || !st) return null;
        return (
            <div>
                {sheets.length > 1 && renderSheetTabs()}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Board name</label>
                        <input
                            value={st.boardName}
                            onChange={(e) => updateSheetState(activeSheet, { boardName: e.target.value })}
                            className="v11-input"
                            style={{ width: '100%' }}
                            placeholder="Board name"
                        />
                    </div>
                    <div style={{ width: 90 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Year</label>
                        <input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value) || currentYear)}
                            className="v11-input"
                            style={{ width: '100%' }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, paddingBottom: 6 }}>
                        <input
                            type="checkbox"
                            checked={st.included}
                            onChange={(e) => updateSheetState(activeSheet, { included: e.target.checked })}
                        />
                        Include this sheet
                    </label>
                </div>
                {sheet.analysis.kind === 'list'
                    ? renderListMapping(sheet, st)
                    : renderGridReview(sheet, st)}
            </div>
        );
    };

    const renderPreview = () => {
        const valid = previews.filter(Boolean);
        return (
            <div>
                <div style={{ fontSize: 13, marginBottom: 12 }}>
                    Ready to import <strong>{valid.length} board{valid.length > 1 ? 's' : ''}</strong>:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
                    {valid.map((b, i) => (
                        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {b.categories.length} categories · {b.actions.length} actions · {b.tasks.length} tasks
                            </div>
                            {b.categories.length > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    {b.categories.slice(0, 6).map(c => c.name).join(' · ')}
                                    {b.categories.length > 6 && ' …'}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
             role="dialog" aria-modal="true" aria-labelledby="excel-import-title">
            <div className="modal-content" style={{ width: 720, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 id="excel-import-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                        Import from Excel {step === 'review' && sheets.length > 0 && `— step 2 of 3`}
                        {step === 'preview' && '— step 3 of 3'}
                    </h2>
                    <button onClick={onClose} className="v11-btn-icon" aria-label="Close"><Icon.Close /></button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {error && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 8, background: 'var(--error-light)',
                            color: 'var(--error)', fontSize: 13, marginBottom: 12
                        }}>
                            {error}
                        </div>
                    )}
                    {step === 'upload' && renderUpload()}
                    {step === 'review' && renderReview()}
                    {step === 'preview' && renderPreview()}
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                    <button onClick={onClose} className="v11-btn-secondary">Cancel</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {step === 'review' && (
                            <button
                                onClick={() => setStep('preview')}
                                className="v11-btn-primary"
                                disabled={includedCount === 0}
                            >
                                Preview {includedCount} board{includedCount > 1 ? 's' : ''} →
                            </button>
                        )}
                        {step === 'preview' && (
                            <>
                                <button onClick={() => setStep('review')} className="v11-btn-secondary">← Back</button>
                                <button onClick={handleImport} className="v11-btn-primary">Import</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExcelImportModal;
