#!/usr/bin/env node
// One-shot debugging helper to dump the structure of both reference files.
// Run: node scripts/analyzeExcel.mjs
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';

const files = [
    'public/2026 Country Marketing Plan framework.xlsx',
    'public/2026 MC Strategy Roadmap.xlsx'
];

function firstNonEmpty(row) {
    for (let i = 0; i < row.length; i++) if (row[i] != null && row[i] !== '') return i;
    return -1;
}

async function analyze(file) {
    console.log('\n========================================');
    console.log('FILE:', file);
    console.log('========================================');
    const buf = readFileSync(file);
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
    const exWb = new ExcelJS.Workbook();
    await exWb.xlsx.load(buf);

    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
        const merges = sheet['!merges'] || [];
        const exSheet = exWb.getWorksheet(sheetName);

        console.log(`\n─── Sheet: "${sheetName}" ─── ${data.length} rows × ${Math.max(...data.map(r => r.length || 0), 0)} cols, ${merges.length} merges`);

        // Show first 20 rows, compact
        const maxPreview = Math.min(25, data.length);
        for (let r = 0; r < maxPreview; r++) {
            const row = data[r] || [];
            const nonEmpty = row.map((c, i) => c != null && c !== '' ? `${i}:${String(c).slice(0, 30)}` : null).filter(Boolean);
            // Colour signals for first 18 columns
            let colors = '';
            if (exSheet) {
                const ps = [];
                for (let c = 1; c <= Math.min(row.length, 18); c++) {
                    const cell = exSheet.getCell(r + 1, c);
                    const fg = cell.fill?.fgColor?.argb;
                    if (fg && fg !== '00000000' && fg !== 'FFFFFFFF') ps.push(`${c}=${fg.slice(-6)}`);
                }
                if (ps.length) colors = ' [fills: ' + ps.join(',') + ']';
            }
            console.log(`  r${r}: ${nonEmpty.join(' | ') || '(empty)'}${colors}`);
        }
        if (data.length > maxPreview) console.log(`  ... (+${data.length - maxPreview} more rows)`);
        if (merges.length) {
            console.log(`  Merges:`, merges.slice(0, 10).map(m => `${m.s.r},${m.s.c}→${m.e.r},${m.e.c}`).join(' ; '));
        }
    }
}

(async () => {
    for (const f of files) {
        await analyze(f);
    }
})();
