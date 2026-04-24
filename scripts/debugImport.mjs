// Debug what the new import sees on the reference files.
import { readFileSync } from 'node:fs';
import { parseWorkbook, analyzeWorkbook, buildBoard } from '../src/lib/excelMapping.js';

const files = [
    'public/2026 Country Marketing Plan framework.xlsx',
    'public/2026 MC Strategy Roadmap.xlsx'
];

for (const file of files) {
    console.log('\n========== ', file, ' ==========');
    const buf = readFileSync(file);
    const wb = await parseWorkbook(buf);
    const analyzed = analyzeWorkbook(wb);
    // Drill into the 2nd sheet of file 1 — it confused the heuristic.
    if (file.includes('Country') && analyzed[1]) {
        const a = analyzed[1].analysis;
        console.log('\nDEBUG sheet 2 — row 2 raw:', JSON.stringify(analyzed[1].sheet.data[1]));
        console.log('Detected month cols:', JSON.stringify(a.monthCols));
        console.log('Row 2 monthSignals:', JSON.stringify(a.rows[0].monthSignals));
    }
    for (const { name, sheet, analysis } of analyzed) {
        console.log(`\n--- Sheet "${name}" — kind=${analysis.kind}, headerRow=${analysis.headerRow}, monthCols=${analysis.monthCols?.length}`);
        if (analysis.kind !== 'grid') continue;
        let cats = 0, acts = 0, empties = 0;
        for (const row of analysis.rows) {
            const tag = row.suggested === 'category' ? 'CAT' : row.suggested === 'action' ? 'ACT' : '   ';
            if (row.suggested === 'category') cats++;
            else if (row.suggested === 'action') acts++;
            else empties++;
            const lbl = (row.label || '').slice(0, 50);
            console.log(`  r${row.rowIdx + 1}: ${tag} "${lbl}" (${row.monthSignals.length} cells)`);
        }
        console.log(`  → cats=${cats}, acts=${acts}, empty=${empties}`);
        const board = buildBoard(sheet, analysis, { year: 2026, boardName: name });
        console.log(`  → board: ${board.categories.length} categories, ${board.actions.length} actions, ${board.tasks.length} tasks`);
    }
}
