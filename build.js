/* Extract the app source from index.html and precompile JSX/TS → app.js.
 * Source of truth: the inline source, mirrored to app.src.jsx for readability.
 * Run via ./build.sh (installs babel locally if needed). */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Prefer app.src.jsx as source if present; else fall back to an inline babel block.
let src;
if (fs.existsSync(path.join(ROOT, 'app.src.jsx'))) {
  src = fs.readFileSync(path.join(ROOT, 'app.src.jsx'), 'utf8');
} else {
  const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) { console.error('no app.src.jsx and no inline babel block'); process.exit(2); }
  src = m[1].replace(/^\n/, '');
  fs.writeFileSync(path.join(ROOT, 'app.src.jsx'), src);
}

const babel = require('@babel/core');
const out = babel.transformSync(src, {
  presets: [
    ['@babel/preset-typescript', { allExtensions: true, isTSX: true }],
    '@babel/preset-react',
  ],
  filename: 'app.tsx', compact: false, comments: false,
});
fs.writeFileSync(path.join(ROOT, 'app.js'),
  '/* built from app.src.jsx by build.sh — do not edit by hand */\n' + out.code);
console.log('built app.js (' + out.code.length + ' chars) from app.src.jsx (' + src.length + ' chars)');
