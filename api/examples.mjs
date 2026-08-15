import { EXAMPLES } from '../src/prism-core.mjs';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({ examples: EXAMPLES.map(({ id, title, description, source }) => ({ id, title, description, source })) });
}
