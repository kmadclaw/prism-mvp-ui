import { runPrismMvp, SAMPLE_COBOL } from './src/prism-core.mjs';

const $ = (id) => document.getElementById(id);
const input = $('cobolInput');
const summary = $('summary');
const javaOut = $('javaOut');
const irOut = $('irOut');
const sourceOut = $('sourceOut');
const cfgOut = $('cfgOut');
const gapsOut = $('gapsOut');
const tabs = [...document.querySelectorAll('[data-tab]')];
const panels = [...document.querySelectorAll('[data-panel]')];

input.value = SAMPLE_COBOL;

function showTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  panels.forEach(p => p.hidden = p.dataset.panel !== name);
}

tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

function render() {
  try {
    const result = runPrismMvp(input.value);
    const gapErrors = result.gaps.filter(g => g.severity === 'error').length;
    const gapWarnings = result.gaps.filter(g => g.severity !== 'error').length;
    summary.innerHTML = `
      <div class="metric"><strong>${result.summary.programId}</strong><span>Program ID</span></div>
      <div class="metric"><strong>${result.summary.declarations}</strong><span>Variables</span></div>
      <div class="metric"><strong>${result.summary.statements}</strong><span>Statements</span></div>
      <div class="metric"><strong>${result.summary.semanticOperations}</strong><span>Semantic ops</span></div>
      <div class="metric ${gapErrors ? 'bad' : gapWarnings ? 'warn' : 'good'}"><strong>${result.summary.gaps}</strong><span>Gaps</span></div>`;
    javaOut.textContent = result.java;
    irOut.textContent = JSON.stringify(result.semanticIr, null, 2);
    sourceOut.textContent = JSON.stringify({ sourceModel: result.sourceModel, symbols: result.symbols, readWrite: result.readWrite }, null, 2);
    cfgOut.textContent = JSON.stringify(result.cfg, null, 2);
    gapsOut.textContent = result.gaps.length ? JSON.stringify(result.gaps, null, 2) : '[]\n\nNo MVP gaps detected for supported constructs.';
  } catch (err) {
    summary.innerHTML = `<div class="metric bad"><strong>FAILED</strong><span>${err.message}</span></div>`;
  }
}

$('runBtn').addEventListener('click', render);
$('sampleBtn').addEventListener('click', () => { input.value = SAMPLE_COBOL; render(); });
$('clearBtn').addEventListener('click', () => { input.value = ''; render(); });
$('copyJavaBtn').addEventListener('click', async () => navigator.clipboard.writeText(javaOut.textContent));
input.addEventListener('input', () => window.clearTimeout(window.__prismTimer) || (window.__prismTimer = window.setTimeout(render, 250)));
showTab('java');
render();
