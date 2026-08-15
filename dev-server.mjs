import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import translate from './api/translate.mjs';
import examples from './api/examples.mjs';

const root = process.cwd();
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function adapt(handler, req, res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); return res; };
  handler(req, res);
}

http.createServer((req, res) => {
  if (req.url === '/api/translate') return adapt(translate, req, res);
  if (req.url === '/api/examples') return adapt(examples, req, res);
  const clean = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(root, clean);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; res.end('not found'); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');
  fs.createReadStream(file).pipe(res);
}).listen(4174, '127.0.0.1', () => console.log('PRISM local API server ready http://127.0.0.1:4174'));
