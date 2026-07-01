const fs = require('fs');
const path = require('path');

const masterDir = process.argv[2];
const oldDirs = process.argv.slice(3);

function extractFunctions(dir) {
    const results = {};
    if (!fs.existsSync(dir)) return results;
    
    function walk(currentPath) {
        if (currentPath.includes('.git') || currentPath.includes('node_modules') || currentPath.includes('.agents')) return;
        const stat = fs.statSync(currentPath);
        if (stat.isDirectory()) {
            const files = fs.readdirSync(currentPath);
            for (const file of files) {
                walk(path.join(currentPath, file));
            }
        } else if (currentPath.endsWith('.js') || currentPath.endsWith('.gs')) {
            const content = fs.readFileSync(currentPath, 'utf8');
            // Regex to find "function xyz(..." or "const xyz = function(..." or "const xyz = (...)"
            // Simple regex for function declarations:
            const functionRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const funcName = match[1];
                if (!results[funcName]) {
                    results[funcName] = currentPath;
                }
            }
            
            // Also look for const/let/var funcName = function...
            const varFuncRegex = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_]+\s*=>)/g;
            while ((match = varFuncRegex.exec(content)) !== null) {
                const funcName = match[1];
                if (!results[funcName]) {
                    results[funcName] = currentPath;
                }
            }
        }
    }
    walk(dir);
    return results;
}

const masterFuncs = extractFunctions(masterDir);
const missingFuncs = {};

for (const oldDir of oldDirs) {
    const oldFuncs = extractFunctions(oldDir);
    for (const [funcName, filePath] of Object.entries(oldFuncs)) {
        if (!masterFuncs[funcName]) {
            if (!missingFuncs[funcName]) {
                missingFuncs[funcName] = [];
            }
            missingFuncs[funcName].push(filePath);
        }
    }
}

fs.writeFileSync('missing_functions_report.json', JSON.stringify(missingFuncs, null, 2));
console.log('Comparison complete. Found ' + Object.keys(missingFuncs).length + ' missing functions.');
