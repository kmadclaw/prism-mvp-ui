import assert from 'node:assert/strict';
import translateHandler from '../api/translate.mjs';
import examplesHandler from '../api/examples.mjs';
import { Readable } from 'node:stream';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

async function callTranslate(payload) {
  const req = Readable.from([JSON.stringify(payload)]);
  req.method = 'POST';
  const res = mockRes();
  await translateHandler(req, res);
  return res;
}

const exRes = mockRes();
examplesHandler({ method: 'GET' }, exRes);
assert.equal(exRes.statusCode, 200);
assert.ok(exRes.body.examples.length >= 3);

const res = await callTranslate({ source: exRes.body.examples[0].source });
assert.equal(res.statusCode, 200);
assert.ok(res.body.runId);
assert.ok(res.body.java.includes('public class AccountMvp'));
assert.ok(Object.keys(res.body.artifacts).some(path => path.endsWith('/manifest.json')));
assert.ok(Object.keys(res.body.artifacts).some(path => path.endsWith('/generated/AccountMvp.java')));

const bad = await callTranslate({ source: '' });
assert.equal(bad.statusCode, 400);
assert.equal(bad.body.error, 'source is required');

console.log('PRISM API tests passed');
