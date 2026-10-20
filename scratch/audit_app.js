const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

console.log('--- AUDITORIA GERAL DO APP TREINAMENTO ---');
console.log('Tamanho do index.html:', (html.length / 1024).toFixed(2), 'KB');
console.log('Total de linhas:', html.split('\n').length);

// 1. Extração de Scripts
const scriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scripts = [];
while ((match = scriptRegex.exec(html)) !== null) {
    scripts.push(match[1]);
}
const allJs = scripts.join('\n');

// 2. Extração de todos os IDs no HTML
const idRegex = /\bid=["']([^"']+)["']/g;
const htmlIds = new Set();
while ((match = idRegex.exec(html)) !== null) {
    htmlIds.add(match[1]);
}
console.log('Total de IDs únicos no HTML:', htmlIds.size);

// 3. Extração de getElementById no JS
const getElemRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
const referencedIds = new Set();
while ((match = getElemRegex.exec(allJs)) !== null) {
    referencedIds.add(match[1]);
}

const missingIds = [];
for (const id of referencedIds) {
    if (!htmlIds.has(id)) {
        missingIds.push(id);
    }
}
console.log('IDs referenciados no JS mas ausentes no HTML:', missingIds);

// 4. Extração de chamadas onclick no HTML
const onclickRegex = /\bonclick=["']([^"']+)["']/g;
const onclickHandlers = [];
while ((match = onclickRegex.exec(html)) !== null) {
    onclickHandlers.push(match[1]);
}
console.log('Total de onclicks encontrados:', onclickHandlers.length);

// 5. Extração de funções declaradas no JS
const funcDefRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
const declaredFunctions = new Set();
while ((match = funcDefRegex.exec(allJs)) !== null) {
    declaredFunctions.add(match[1]);
}
// Também let/const com arrow function ou function expression
const varFuncRegex = /(?:let|const|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)?\s*=>/g;
while ((match = varFuncRegex.exec(allJs)) !== null) {
    declaredFunctions.add(match[1]);
}
console.log('Total de funções declaradas no JS:', declaredFunctions.size);

// Checar se funções chamadas em onclicks existem
const missingFunctions = new Set();
onclickHandlers.forEach(handler => {
    // extrai o nome da primeira função chamada
    const callMatch = handler.match(/([a-zA-Z0-9_$]+)\s*\(/);
    if (callMatch) {
        const fnName = callMatch[1];
        // ignorar built-ins do browser / bibliotecas externas
        const builtIns = new Set(['event', 'preventDefault', 'stopPropagation', 'alert', 'confirm', 'console', 'window', 'lucide', 'confetti']);
        if (!declaredFunctions.has(fnName) && !builtIns.has(fnName)) {
            missingFunctions.add(fnName);
        }
    }
});
console.log('Funções chamadas em onclick mas não encontradas no JS:', Array.from(missingFunctions));
