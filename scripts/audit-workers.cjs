const fs = require('fs');
const path = require('path');

// Configuration
const TARGET_DIR = path.join(__dirname, '../src');
const WORKER_PATTERN = /\.worker\.ts$/;
const FORBIDDEN_TERMS = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'navigator.sendBeacon'
];
// Exceptions: Lines containing these strings will be ignored (e.g. valid comments or security blocks)
const ALLOWED_EXCEPTIONS = [
  'enforceNetworkBlock', // We allow the function that blocks the network!
  'typeof fetch',        // Checks are allowed
  'typeof XMLHttpRequest',
  'typeof WebSocket'
];

let hasErrors = false;

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (WORKER_PATTERN.test(file)) {
      auditFile(fullPath);
    }
  }
}

function auditFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    FORBIDDEN_TERMS.forEach(term => {
      if (line.includes(term)) {
        // Check exceptions
        const isException = ALLOWED_EXCEPTIONS.some(exc => line.includes(exc));
        
        if (!isException) {
          console.error(`[Security] Forbidden network call found in ${path.relative(process.cwd(), filePath)}:${lineNumber}`);
          console.error(`   Line: ${line.trim()}`);
          console.error(`   Term: ${term}\n`);
          hasErrors = true;
        }
      }
    });
  });
}

console.log('🔍 Auditing worker files for network calls...');
scanDirectory(TARGET_DIR);

if (hasErrors) {
  console.error('❌ Security Audit Failed: Workers must not make direct network calls.');
  process.exit(1);
} else {
  console.log('✅ Security Audit Passed.');
}
