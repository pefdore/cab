const fs = require('fs');
const content = fs.readFileSync('./app.v2.js', 'utf8');
let braceCount = 0;
let inString = false;
let stringChar = '';

for (let i = 0; i < content.length; i++) {
  const c = content[i];
  const prev = i > 0 ? content[i - 1] : '';

  if ((c === '"' || c === "'" || c === '`') && prev !== '\\') {
    if (!inString) {
      inString = true;
      stringChar = c;
    } else if (c === stringChar) {
      inString = false;
    }
    continue;
  }

  if (inString) continue;
  if (c === '{') {
    braceCount++;
  }
  if (c === '}') {
    braceCount--;
    if (braceCount === 0) {
      const lineNum = content.substring(0, i).split('\n').length;
      console.log('Back to 0 at line', lineNum);
    }
  }
}

console.log('Final braces:', braceCount);