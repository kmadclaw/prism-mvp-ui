import fs from 'node:fs';
import path from 'node:path';

fs.rmSync('public', { recursive: true, force: true });
fs.mkdirSync('public/src', { recursive: true });
for (const file of ['index.html', 'app.js']) fs.copyFileSync(file, path.join('public', file));
fs.copyFileSync('src/prism-core.mjs', 'public/src/prism-core.mjs');
console.log('Built static public/ assets for Vercel');
