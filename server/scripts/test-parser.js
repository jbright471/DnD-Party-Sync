/**
 * Test script for the Advanced LLM Parser.
 * Run with: node server/scripts/test-parser.js [path/to/pdf]
 */
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { parseCharacterPdfLLM } = require('../ollama');

async function testParser() {
    const pdfPath = process.argv[2] || path.join(__dirname, '../../brightgamer_141818457.pdf');

    if (!fs.existsSync(pdfPath)) {
        console.error(`Error: File not found at ${pdfPath}`);
        process.exit(1);
    }

    console.log(`[Test] Reading PDF via pdftotext -layout: ${pdfPath}`);
    const { execSync } = require('child_process');
    let rawText;
    try {
        rawText = execSync(`pdftotext -layout "${pdfPath}" -`).toString();
    } catch (_err) {
        console.error('[Test] pdftotext failed, falling back to pdf-parse');
        const buffer = fs.readFileSync(pdfPath);
        const pdfData = await pdfParse(buffer);
        rawText = pdfData.text;
    }

    console.log(`[Test] Extracted ${rawText.length} characters.`);
    console.log(`[Test] Snippet: ${rawText.substring(0, 800).replace(/\s+/g, ' ')}...`);

    console.log(`[Test] Dispatching to LLM Parser... (this may take a few seconds)`);
    try {
        const result = await parseCharacterPdfLLM(rawText);
        console.log('--- EXTRACTION RESULT ---');
        console.log(JSON.stringify(result, null, 2));
        console.log('-------------------------');

        if (result.validation && !result.validation.valid) {
            console.warn('[Test] Validation WARNINGS:', result.validation.warnings);
            console.error('[Test] Validation ERRORS:', result.validation.errors);
        } else {
            console.log('[Test] Extraction successfully validated!');
        }

    } catch (err) {
        console.error('[Test] Parser failed:', err.message);
    }
}

testParser();
