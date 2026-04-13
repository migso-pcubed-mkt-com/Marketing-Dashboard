import { useState, useRef, useCallback } from 'react';
import { Icon } from './Icons.jsx';
import { parseWorkbook, detectFormat, detectColumnMappings, parseGrid, parseList } from '../lib/excelMapping.js';

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
    { value: 'budget', label: 'Budget' },
    { value: 'channel', label: 'Channel' },
];

const ExcelImportModal = ({ onClose, onImport }) => {
    // step: upload | sheet | format | mapping | preview
    const [step, setStep] = useState('upload');
    const [workbook, setWorkbook] = useState(null);
    const [selectedSheet, setSelectedSheet] = useState(0);
    const [format, setFormat] = useState(null);  // 'grid' | 'list'
    const [columnMappings, setColumnMappings] = useState({});
    const [preview, setPreview] = useState(null);
    const [boardName, setBoardName] = useState('');
    const [error, setError] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    // ─── Step 1: File Upload ─────────────────────────────
    const handleFile = useCallback(async (file) => {
        if (!file) return;
        setError(null);
        try {
            const buffer = await file.arrayBuffer();
            const wb = parseWorkbook(buffer);
            if (!wb.sheets || wb.sheets.length === 0) {
                setError('No sheets found in the file.');
                return;
            }
            setWorkbook(wb);
            setBoardName(file.name.replace(/\.(xlsx?|csv)$/i, ''));
            if (wb.sheets.length === 1) {
                // Skip sheet selection
                setSelectedSheet(0);
                const detected = detectFormat(wb.sheets[0].data);
                setFormat(detected);
                if (detected === 'list') {
                    const mappings = detectColumnMappings(wb.sheets[0].data[0]);
                    setColumnMappings(mappings);
                    setStep('mapping');
                } else {
                    // Grid: skip mapping, go to preview directly
                    const result = parseGrid(wb.sheets[0].data, wb.sheets[0].merges);
                    if (result) {
                        setPreview(result);
                        setStep('preview');
                    } else {
                        // Fallback to list
                        setFormat('list');
                        const mappings = detectColumnMappings(wb.sheets[0].data[0]);
                        setColumnMappings(mappings);
                        setStep('mapping');
                    }
                }
            } else {
                setStep('sheet');
            }
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

    // ─── Step 2: Sheet Selection ─────────────────────────
    const handleSheetSelect = (idx) => {
        setSelectedSheet(idx);
        const sheet = workbook.sheets[idx];
        const detected = detectFormat(sheet.data);
        setFormat(detected);
        if (detected === 'list') {
            const mappings = detectColumnMappings(sheet.data[0]);
            setColumnMappings(mappings);
            setStep('mapping');
        } else {
            const result = parseGrid(sheet.data, sheet.merges);
            if (result) {
                setPreview(result);
                setStep('preview');
            } else {
                setFormat('list');
                const mappings = detectColumnMappings(sheet.data[0]);
                setColumnMappings(mappings);
                setStep('mapping');
            }
        }
    };

    // ─── Step 3: Column Mapping (list mode) ──────────────
    const handleMappingChange = (colIdx, field) => {
        setColumnMappings(prev => {
            const next = { ...prev };
            // Remove old assignment of this field
            for (const [key, val] of Object.entries(next)) {
                if (val === colIdx && key !== field) delete next[key];
            }
            // Remove old assignment of this column
            for (const [key, val] of Object.entries(next)) {
                if (val === colIdx) delete next[key];
            }
            if (field) next[field] = colIdx;
            return next;
        });
    };

    const handleProceedToPreview = () => {
        const sheet = workbook.sheets[selectedSheet];
        if (format === 'grid') {
            const result = parseGrid(sheet.data, sheet.merges);
            setPreview(result);
        } else {
            const result = parseList(sheet.data, columnMappings);
            setPreview(result);
        }
        setStep('preview');
    };

    // ─── Step 5: Import ──────────────────────────────────
    const handleImport = () => {
        if (!preview) return;
        onImport(preview, boardName.trim() || 'Excel Import');
        onClose();
    };

    // ─── Rendering ───────────────────────────────────────

    const sheet = workbook?.sheets?.[selectedSheet];
    const headerRow = sheet?.data?.[0] || [];
    const dataRows = sheet?.data?.slice(1) || [];

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose}/>
            <div style={{
                position: 'relative', background: 'var(--bg-primary)', borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xl)', width: 560, maxWidth: '90vw', maxHeight: '85vh',
                display: 'flex', flexDirection: 'column', zIndex: 1
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        Import from Excel
                        {step !== 'upload' && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {step === 'sheet' ? '— Select sheet' : step === 'mapping' ? '— Map columns' : step === 'preview' ? '— Preview' : ''}
                        </span>}
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Icon.Close/>
                    </button>
                </div>

                <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
                    {error && (
                        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 16 }}>
                            {error}
                        </div>
                    )}

                    {/* ─── UPLOAD STEP ─── */}
                    {step === 'upload' && (
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
                                borderRadius: 'var(--radius-lg)',
                                padding: '48px 24px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: isDragging ? 'rgba(99,102,241,0.05)' : 'var(--bg-secondary)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                                Drop your Excel file here
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                or click to browse — .xlsx, .xls, .csv supported
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                style={{ display: 'none' }}
                                onChange={e => handleFile(e.target.files?.[0])}
                            />
                        </div>
                    )}

                    {/* ─── SHEET SELECTION STEP ─── */}
                    {step === 'sheet' && workbook && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                                This file has {workbook.sheets.length} sheets. Select one to import:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {workbook.sheets.map((s, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSheetSelect(idx)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '12px 14px', borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)', fontSize: 13, fontWeight: 500,
                                            cursor: 'pointer', textAlign: 'left'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                    >
                                        <span>{s.name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {s.data.length} rows
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── COLUMN MAPPING STEP (list mode) ─── */}
                    {step === 'mapping' && sheet && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                                    Detected format: <strong style={{ color: 'var(--text-primary)' }}>{format === 'grid' ? 'Grid / Roadmap' : 'List / Table'}</strong>
                                </p>
                                {format === 'list' && (
                                    <button
                                        onClick={() => { setFormat('grid'); handleProceedToPreview(); }}
                                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        Try as grid
                                    </button>
                                )}
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                                Map each column to a field. Unmapped columns will be ignored.
                            </p>

                            {/* Data preview table */}
                            <div style={{ overflowX: 'auto', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                        <tr>
                                            {headerRow.map((h, ci) => (
                                                <th key={ci} style={{ padding: '6px 8px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'left' }}>
                                                    {String(h || `Col ${ci + 1}`)}
                                                </th>
                                            ))}
                                        </tr>
                                        <tr>
                                            {headerRow.map((_, ci) => {
                                                const currentField = Object.entries(columnMappings).find(([, v]) => v === ci)?.[0] || '';
                                                return (
                                                    <th key={ci} style={{ padding: '4px 4px', background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                                                        <select
                                                            value={currentField}
                                                            onChange={e => handleMappingChange(ci, e.target.value)}
                                                            style={{
                                                                width: '100%', padding: '3px 4px', borderRadius: 'var(--radius-sm)',
                                                                border: `1px solid ${currentField ? 'var(--accent)' : 'var(--border)'}`,
                                                                background: currentField ? 'rgba(99,102,241,0.08)' : 'var(--bg-primary)',
                                                                color: 'var(--text-primary)', fontSize: 10, cursor: 'pointer'
                                                            }}
                                                        >
                                                            {FIELD_OPTIONS.map(opt => (
                                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dataRows.slice(0, 5).map((row, ri) => (
                                            <tr key={ri}>
                                                {headerRow.map((_, ci) => (
                                                    <td key={ci} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {String(row[ci] ?? '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {dataRows.length > 5 && (
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                                    Showing 5 of {dataRows.length} rows
                                </p>
                            )}
                        </div>
                    )}

                    {/* ─── PREVIEW STEP ─── */}
                    {step === 'preview' && (
                        <div>
                            {preview ? (
                                <>
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Board name</label>
                                        <input
                                            value={boardName}
                                            onChange={e => setBoardName(e.target.value)}
                                            style={{
                                                width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>

                                    {/* Summary */}
                                    <div style={{
                                        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                                        padding: 14, marginBottom: 16, fontSize: 13
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Format</span>
                                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{format === 'grid' ? 'Grid / Roadmap' : 'List / Table'}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Categories</span>
                                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{preview.categories.length}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Actions</span>
                                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{preview.actions.length}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Tasks</span>
                                            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{preview.tasks.length}</span>
                                        </div>
                                    </div>

                                    {/* Category breakdown */}
                                    <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 500, color: 'var(--text-primary)' }}>Categories breakdown</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                                        {preview.categories.map(cat => {
                                            const catActions = preview.actions.filter(a => a.categoryId === cat.id);
                                            const catTasks = preview.tasks.filter(t => catActions.some(a => a.id === t.actionId));
                                            return (
                                                <div key={cat.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--bg-secondary)', fontSize: 12
                                                }}>
                                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }}/>
                                                    <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 500 }}>{cat.name}</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>
                                                        {catActions.filter(a => !a.isDefault).length > 0 && `${catActions.filter(a => !a.isDefault).length} actions · `}
                                                        {catTasks.length} tasks
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                                    No data could be parsed from this sheet. Try a different format or sheet.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
                    {step !== 'upload' && (
                        <button
                            onClick={() => {
                                if (step === 'preview' && format === 'list') setStep('mapping');
                                else if (step === 'preview' && format === 'grid') setStep(workbook.sheets.length > 1 ? 'sheet' : 'upload');
                                else if (step === 'mapping') setStep(workbook.sheets.length > 1 ? 'sheet' : 'upload');
                                else if (step === 'sheet') setStep('upload');
                                else setStep('upload');
                            }}
                            style={{
                                padding: '10px 16px', borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer'
                            }}
                        >
                            Back
                        </button>
                    )}
                    <div style={{ flex: 1 }}/>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 16px', borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    {step === 'mapping' && (
                        <button
                            onClick={handleProceedToPreview}
                            disabled={!columnMappings.title && columnMappings.title !== 0}
                            style={{
                                padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none',
                                background: (columnMappings.title !== undefined) ? 'var(--accent)' : 'var(--bg-tertiary)',
                                color: (columnMappings.title !== undefined) ? 'white' : 'var(--text-muted)',
                                fontSize: 13, fontWeight: 500, cursor: (columnMappings.title !== undefined) ? 'pointer' : 'default'
                            }}
                        >
                            Preview
                        </button>
                    )}
                    {step === 'preview' && preview && (
                        <button
                            onClick={handleImport}
                            style={{
                                padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none',
                                background: 'var(--accent)', color: 'white',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            Import {preview.tasks.length} tasks
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExcelImportModal;
