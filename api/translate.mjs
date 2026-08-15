import { createRunArtifacts } from '../src/prism-core.mjs';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 500_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const source = String(body.source || '');
    if (!source.trim()) {
      res.status(400).json({ error: 'source is required' });
      return;
    }
    const run = createRunArtifacts(source);
    res.status(200).json(run);
  } catch (error) {
    res.status(500).json({ error: error.message, type: 'TRANSLATION_FAILURE' });
  }
}
