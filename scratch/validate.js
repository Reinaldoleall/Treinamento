const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const scriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
let combined = '';

while ((match = scriptRegex.exec(html)) !== null) {
    count++;
    combined += `\n/* SCRIPT BLOCK ${count} */\n` + match[1];
}

fs.writeFileSync('scratch/extracted_all.js', combined, 'utf8');
console.log(`Extracted ${count} inline script blocks (${combined.length} chars).`);
