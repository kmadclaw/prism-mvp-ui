export const EXAMPLES = [
  {
    id: 'account-fee',
    title: 'Account fee + customer tier',
    description: 'Arithmetic, IF/ELSE, DISPLAY, and traceable Java generation.',
    source: `       IDENTIFICATION DIVISION.
       PROGRAM-ID. ACCOUNT-MVP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 BALANCE        PIC 9(5) VALUE 1000.
       01 FEE            PIC 9(3) VALUE 25.
       01 CUSTOMER-TYPE  PIC X(10) VALUE 'STANDARD'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD FEE TO BALANCE.
           IF BALANCE > 1000
               MOVE 'GOLD' TO CUSTOMER-TYPE
           ELSE
               MOVE 'STANDARD' TO CUSTOMER-TYPE
           END-IF.
           DISPLAY CUSTOMER-TYPE.
           STOP RUN.`
  },
  {
    id: 'loan-payment',
    title: 'Loan payment computation',
    description: 'COMPUTE, MOVE, numeric fields, and deterministic Java field mapping.',
    source: `       IDENTIFICATION DIVISION.
       PROGRAM-ID. LOAN-PAYMENT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 PRINCIPAL      PIC 9(5) VALUE 12000.
       01 RATE           PIC 9(2) VALUE 6.
       01 MONTHS         PIC 9(3) VALUE 12.
       01 INTEREST       PIC 9(5) VALUE 0.
       01 PAYMENT        PIC 9(5) VALUE 0.
       PROCEDURE DIVISION.
       MAIN.
           COMPUTE INTEREST = PRINCIPAL * RATE.
           DIVIDE MONTHS INTO INTEREST.
           MOVE INTEREST TO PAYMENT.
           DISPLAY PAYMENT.
           STOP RUN.`
  },
  {
    id: 'unsupported-gap',
    title: 'Unsupported construct gap',
    description: 'Shows how PRISM returns structured gaps instead of hiding failures.',
    source: `       IDENTIFICATION DIVISION.
       PROGRAM-ID. GAP-DEMO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 BALANCE        PIC 9(5) VALUE 500.
       PROCEDURE DIVISION.
       MAIN.
           SEARCH CUSTOMER-TABLE.
           DISPLAY BALANCE.
           STOP RUN.`
  }
];

export const SAMPLE_COBOL = EXAMPLES[0].source;

const RESERVED = new Set(['IF','ELSE','END-IF','END','DISPLAY','MOVE','ADD','SUBTRACT','MULTIPLY','DIVIDE','COMPUTE','PERFORM','CALL','STOP','RUN','TO','FROM','BY','GIVING','VALUE','PIC','SECTION','DIVISION']);

export function runPrismMvp(source) {
  const lines = normalizeLines(source);
  const sourceModel = buildSourceModel(lines);
  const symbols = resolveSymbols(sourceModel);
  const cfg = buildCfg(sourceModel);
  const rw = readWriteAnalysis(sourceModel, symbols);
  const semanticIr = buildSemanticIr(sourceModel, rw);
  const targetIr = mapToJavaTarget(sourceModel, symbols, semanticIr);
  const java = renderJava(targetIr);
  const gaps = validate(sourceModel, symbols, semanticIr, java);
  return { sourceModel, symbols, cfg, readWrite: rw, semanticIr, targetIr, java, gaps, summary: summarize(sourceModel, semanticIr, gaps) };
}

function normalizeLines(source) {
  return source.replace(/\r\n/g, '\n').split('\n').map((raw, i) => ({ raw, line: i + 1, text: raw.trim() })).filter(l => l.text && !l.text.startsWith('*'));
}

function id(prefix, line, index=0) { return `${prefix}-${line}-${index}`; }
function stripPeriod(s) { return s.replace(/\.\s*$/, '').trim(); }
function cobolNameToJava(name) {
  const clean = String(name || '').replace(/[^A-Za-z0-9-]/g, '').toLowerCase();
  return clean.split('-').filter(Boolean).map((p,i)=> i ? p[0].toUpperCase()+p.slice(1) : p).join('') || 'value';
}
function javaClassName(programId) {
  const base = (programId || 'PrismProgram').replace(/[^A-Za-z0-9-]/g, '-').split('-').filter(Boolean).map(p=>p[0].toUpperCase()+p.slice(1).toLowerCase()).join('');
  return /^[A-Za-z_]/.test(base) ? base : `Program${base}`;
}

function buildSourceModel(lines) {
  const program = { schema: 'prism.source.v1', id: 'program-1', programId: 'UNKNOWN', declarations: [], procedures: [], statements: [], unsupported: [] };
  let inData = false, inProc = false, currentProcedure = null, stmtIndex = 0;
  for (const l of lines) {
    let text = stripPeriod(l.text);
    const upper = text.toUpperCase();
    const pid = upper.match(/^PROGRAM-ID\.?\s+([A-Z0-9-]+)/);
    if (pid) { program.programId = pid[1]; continue; }
    if (upper.includes('WORKING-STORAGE SECTION') || upper === 'DATA DIVISION') { inData = true; continue; }
    if (upper === 'PROCEDURE DIVISION') { inData = false; inProc = true; continue; }
    if (inData) {
      const d = parseDeclaration(text, l.line);
      if (d) program.declarations.push(d);
      continue;
    }
    if (inProc) {
      const para = text.match(/^([A-Z0-9-]+)$/i);
      if (para && !RESERVED.has(para[1].toUpperCase())) {
        currentProcedure = { id: id('proc', l.line), name: para[1], sourceLocation: loc(l), statementIds: [] };
        program.procedures.push(currentProcedure);
        continue;
      }
      const stmt = parseStatement(text, l, stmtIndex++);
      if (stmt) {
        stmt.procedureId = currentProcedure?.id || 'procedure-main';
        program.statements.push(stmt);
        if (currentProcedure) currentProcedure.statementIds.push(stmt.id);
      }
    }
  }
  if (!program.procedures.length && program.statements.length) program.procedures.push({ id:'procedure-main', name:'MAIN', sourceLocation:null, statementIds: program.statements.map(s=>s.id) });
  return program;
}
function loc(l) { return { file: 'inline.cbl', startLine: l.line, endLine: l.line, raw: l.raw }; }
function parseDeclaration(text, line) {
  const m = text.match(/^(\d{2})\s+([A-Z0-9-]+)(?:\s+PIC\s+([^\s]+(?:\([^)]*\))?))?(?:\s+VALUE\s+(.+))?$/i);
  if (!m) return null;
  const level = Number(m[1]);
  const pic = m[3] || null;
  const rawValue = m[4] ? stripPeriod(m[4].trim()) : null;
  return { id: id('var', line), level, name: m[2], javaName: cobolNameToJava(m[2]), kind: level === 1 ? 'group-or-elementary' : 'elementary', type: inferType(pic, rawValue), pic, initialValue: parseLiteral(rawValue), sourceLocation: { file:'inline.cbl', startLine:line, endLine:line } };
}
function inferType(pic, value) { if ((pic||'').toUpperCase().startsWith('X') || /^['"]/.test(value||'')) return 'string'; return 'number'; }
function parseLiteral(v) { if (v == null) return null; const t=stripPeriod(v); const q=t.match(/^['"](.*)['"]$/); if(q) return q[1]; const n=Number(t); return Number.isFinite(n)?n:t; }
function parseStatement(text, l, idx) {
  const upper = text.toUpperCase();
  const base = { id: id('stmt', l.line, idx), sourceLocation: loc(l), raw: text };
  let m;
  if ((m=text.match(/^MOVE\s+(.+?)\s+TO\s+([A-Z0-9-]+)$/i))) return { ...base, type:'MOVE', value: parseExpr(m[1]), target:m[2] };
  if ((m=text.match(/^ADD\s+(.+?)\s+TO\s+([A-Z0-9-]+)$/i))) return { ...base, type:'ADD', value: parseExpr(m[1]), target:m[2] };
  if ((m=text.match(/^SUBTRACT\s+(.+?)\s+FROM\s+([A-Z0-9-]+)$/i))) return { ...base, type:'SUBTRACT', value: parseExpr(m[1]), target:m[2] };
  if ((m=text.match(/^MULTIPLY\s+([A-Z0-9-]+)\s+BY\s+([A-Z0-9-]+)$/i))) return { ...base, type:'MULTIPLY', value: parseExpr(m[1]), target:m[2] };
  if ((m=text.match(/^DIVIDE\s+([A-Z0-9-]+)\s+(?:INTO|BY)\s+([A-Z0-9-]+)$/i))) return { ...base, type:'DIVIDE', value: parseExpr(m[1]), target:m[2] };
  if ((m=text.match(/^COMPUTE\s+([A-Z0-9-]+)\s*=\s*(.+)$/i))) return { ...base, type:'COMPUTE', target:m[1], expression: parseExpr(m[2]) };
  if ((m=text.match(/^IF\s+(.+)$/i))) return { ...base, type:'IF', condition: parseCondition(m[1]) };
  if (upper === 'ELSE') return { ...base, type:'ELSE' };
  if (upper === 'END-IF') return { ...base, type:'END_IF' };
  if ((m=text.match(/^EVALUATE\s+(.+)$/i))) return { ...base, type:'EVALUATE', expression: parseExpr(m[1]), unsupportedReason:'EVALUATE parsed as gap in MVP UI' };
  if ((m=text.match(/^PERFORM\s+([A-Z0-9-]+)$/i))) return { ...base, type:'PERFORM', procedure:m[1] };
  if ((m=text.match(/^DISPLAY\s+(.+)$/i))) return { ...base, type:'DISPLAY', value: parseExpr(m[1]) };
  if ((m=text.match(/^CALL\s+(.+)$/i))) return { ...base, type:'CALL', target: parseLiteral(m[1]), unsupportedReason:'Basic CALL is represented but rendered as a stub comment' };
  if (upper === 'STOP RUN') return { ...base, type:'STOP_RUN' };
  return { ...base, type:'UNSUPPORTED', unsupportedReason:`Unsupported statement: ${text}` };
}
function parseExpr(s) { const t=stripPeriod(String(s).trim()); if (/^['"]/.test(t) || /^\d+(\.\d+)?$/.test(t)) return { kind:'literal', value: parseLiteral(t) }; return { kind:'symbol', name:t }; }
function parseCondition(s) { const m=String(s).trim().match(/^(.+?)\s*(>=|<=|=|>|<|NOT\s*=)\s*(.+)$/i); return m ? { left:parseExpr(m[1]), operator:m[2].toUpperCase(), right:parseExpr(m[3]) } : { raw:s }; }

function resolveSymbols(model) { return { schema:'prism.symbols.v1', variables: model.declarations.map(d=>({ id:`sym-${d.id}`, sourceId:d.id, name:d.name, javaName:d.javaName, type:d.type, initialValue:d.initialValue, pic:d.pic })), procedures: model.procedures.map(p=>({ id:`sym-${p.id}`, sourceId:p.id, name:p.name, javaName:cobolNameToJava(p.name) })) }; }
function buildCfg(model) { const nodes=model.statements.map((s,i)=>({ id:`cfg-${s.id}`, statementId:s.id, kind:s.type, order:i })); const edges=[]; for(let i=0;i<nodes.length-1;i++) edges.push({ from:nodes[i].id, to:nodes[i+1].id, type:'NEXT' }); return { schema:'prism.cfg.v1', nodes, edges }; }
function namesInExpr(e) { if(!e) return []; if(e.kind==='symbol') return [e.name]; if(e.left) return [...namesInExpr(e.left), ...namesInExpr(e.right)]; return []; }
function readWriteAnalysis(model) { return { schema:'prism.dataflow.v1', statements: model.statements.map(s=>{ let reads=[], writes=[]; if(['MOVE'].includes(s.type)){ reads=namesInExpr(s.value); writes=[s.target]; } if(['ADD','SUBTRACT','MULTIPLY','DIVIDE'].includes(s.type)){ reads=[s.target,...namesInExpr(s.value)]; writes=[s.target]; } if(s.type==='COMPUTE'){ reads=namesInExpr(s.expression); writes=[s.target]; } if(s.type==='IF'){ reads=namesInExpr(s.condition); } if(s.type==='DISPLAY'){ reads=namesInExpr(s.value); } return { statementId:s.id, type:s.type, reads:[...new Set(reads)], writes:[...new Set(writes)] }; })}; }
function buildSemanticIr(model, rw) { return { schema:'prism.semantic.v1', programId:model.programId, operations:model.statements.map((s,i)=>({ id:`op-${i+1}`, kind: semanticKind(s.type), sourceStatementId:s.id, provenance:{ sourceLocation:s.sourceLocation, statement:s.raw }, reads:rw.statements[i]?.reads||[], writes:rw.statements[i]?.writes||[], payload: semanticPayload(s) })) }; }
function semanticKind(t) { return ({MOVE:'Assignment',ADD:'StateMutation',SUBTRACT:'StateMutation',MULTIPLY:'StateMutation',DIVIDE:'StateMutation',COMPUTE:'Computation',IF:'Branch',ELSE:'BranchMarker',END_IF:'BranchMarker',PERFORM:'Invocation',DISPLAY:'ExternalEffect',CALL:'Invocation',STOP_RUN:'Termination'})[t] || 'UnsupportedConstruct'; }
function semanticPayload(s) { const copy={...s}; delete copy.sourceLocation; delete copy.raw; delete copy.id; delete copy.procedureId; return copy; }
function mapToJavaTarget(model, symbols, semanticIr) { return { schema:'prism.java.v1', className:javaClassName(model.programId), fields:symbols.variables, operations:semanticIr.operations }; }
function exprToJava(e, symbolMap) { if(!e) return 'null'; if(e.kind==='literal') return typeof e.value === 'string' ? JSON.stringify(e.value) : String(e.value); if(e.kind==='symbol') return symbolMap.get(e.name.toUpperCase()) || cobolNameToJava(e.name); if(e.left) return `${exprToJava(e.left,symbolMap)} ${opToJava(e.operator)} ${exprToJava(e.right,symbolMap)}`; return '/* unsupported expr */'; }
function opToJava(op){ return op==='='?'==':op==='NOT ='?'!=':op; }
function initialJavaValue(f) {
  if (f.type === 'string') return JSON.stringify(f.initialValue == null ? '' : String(f.initialValue));
  return Number.isFinite(Number(f.initialValue)) ? String(Number(f.initialValue)) : '0';
}
function renderJava(target) {
  const map = new Map(target.fields.map(f=>[f.name.toUpperCase(), f.javaName]));
  const lines=[];
  lines.push('// Generated by PRISM MVP deterministic renderer');
  lines.push(`public class ${target.className} {`);
  for (const f of target.fields) lines.push(`    private ${f.type==='string'?'String':'int'} ${f.javaName} = ${initialJavaValue(f)}; // source: ${f.name}`);
  lines.push(''); lines.push(`    public static void main(String[] args) { new ${target.className}().run(); }`); lines.push(''); lines.push('    public void run() {');
  let indent='        ';
  for (const op of target.operations) {
    const s=op.payload;
    lines.push(`${indent}// trace: ${op.id} <- ${op.sourceStatementId}`);
    if(s.type==='MOVE') lines.push(`${indent}${map.get(s.target.toUpperCase())||cobolNameToJava(s.target)} = ${exprToJava(s.value,map)};`);
    else if(s.type==='ADD') lines.push(`${indent}${map.get(s.target.toUpperCase())||cobolNameToJava(s.target)} += ${exprToJava(s.value,map)};`);
    else if(s.type==='SUBTRACT') lines.push(`${indent}${map.get(s.target.toUpperCase())||cobolNameToJava(s.target)} -= ${exprToJava(s.value,map)};`);
    else if(s.type==='MULTIPLY') lines.push(`${indent}${map.get(s.target.toUpperCase())||cobolNameToJava(s.target)} *= ${exprToJava(s.value,map)};`);
    else if(s.type==='DIVIDE') lines.push(`${indent}${map.get(s.target.toUpperCase())||cobolNameToJava(s.target)} /= ${exprToJava(s.value,map)};`);
    else if(s.type==='COMPUTE') lines.push(`${indent}${map.get(s.target.toUpperCase())||cobolNameToJava(s.target)} = ${exprToJava(s.expression,map)};`);
    else if(s.type==='IF') { lines.push(`${indent}if (${exprToJava(s.condition,map)}) {`); indent += '    '; }
    else if(s.type==='ELSE') { indent=indent.slice(0,-4); lines.push(`${indent}} else {`); indent += '    '; }
    else if(s.type==='END_IF') { indent=indent.slice(0,-4); lines.push(`${indent}}`); }
    else if(s.type==='DISPLAY') lines.push(`${indent}System.out.println(${exprToJava(s.value,map)});`);
    else if(s.type==='PERFORM') lines.push(`${indent}${cobolNameToJava(s.procedure)}();`);
    else if(s.type==='CALL') lines.push(`${indent}// CALL ${s.target} represented as external invocation stub`);
    else if(s.type==='STOP_RUN') lines.push(`${indent}return;`);
    else lines.push(`${indent}// GAP: ${s.unsupportedReason || 'Unsupported construct'}`);
  }
  lines.push('    }'); lines.push('}'); return lines.join('\n');
}

export function createRunArtifacts(source, options = {}) {
  const result = runPrismMvp(source);
  const runId = options.runId || createRunId(result.summary.programId);
  const generatedFile = `${result.targetIr.className}.java`;
  const now = new Date().toISOString();
  const artifacts = {
    [`artifacts/${runId}/source/input.cbl`]: source,
    [`artifacts/${runId}/source/source-model.json`]: result.sourceModel,
    [`artifacts/${runId}/analysis/symbols.json`]: result.symbols,
    [`artifacts/${runId}/analysis/cfg.json`]: result.cfg,
    [`artifacts/${runId}/analysis/read-write.json`]: result.readWrite,
    [`artifacts/${runId}/semantic/semantic-ir.json`]: result.semanticIr,
    [`artifacts/${runId}/target/java-ir.json`]: result.targetIr,
    [`artifacts/${runId}/generated/${generatedFile}`]: result.java,
    [`artifacts/${runId}/validation/compile.json`]: {
      schema: 'prism.compile.v1',
      status: 'not-run-in-vercel-mvp',
      note: 'The MVP backend generates compile artifacts; javac execution is a next backend worker step.'
    },
    [`artifacts/${runId}/validation/gaps.json`]: result.gaps,
    [`artifacts/${runId}/manifest.json`]: {
      schema: 'prism.artifact-manifest.v1',
      runId,
      createdAt: now,
      programId: result.summary.programId,
      generatedFile,
      artifactCount: 10,
      engine: 'prism-mvp-deterministic-js-engine',
      stages: ['source', 'symbols', 'cfg', 'read-write', 'semantic-ir', 'java-target-ir', 'java-render', 'validation-gaps']
    }
  };
  return { runId, ...result, artifacts };
}

function createRunId(programId) {
  const safe = String(programId || 'program').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'program';
  return `${safe}-${Date.now().toString(36)}`;
}

export function artifactPayloadForDownload(run) {
  return JSON.stringify(run.artifacts, null, 2);
}

function validate(model, symbols, ir, java) { const gaps=[]; const symbolNames=new Set(symbols.variables.map(v=>v.name.toUpperCase())); for (const s of model.statements) { if(s.type==='UNSUPPORTED' || s.unsupportedReason) gaps.push({ schema:'prism.gap.v1', type:s.type==='UNSUPPORTED'?'UNSUPPORTED_CONSTRUCT':'PARTIAL_SUPPORT', severity:s.type==='UNSUPPORTED'?'error':'warning', sourceStatementId:s.id, line:s.sourceLocation.startLine, message:s.unsupportedReason }); for (const n of [...(namesInExpr(s.value)), ...(namesInExpr(s.expression)), ...(namesInExpr(s.condition)), ...(s.target?[s.target]:[])]) if(n && !/^\d/.test(n) && !/^['"]/.test(n) && !symbolNames.has(n.toUpperCase())) gaps.push({ schema:'prism.gap.v1', type:'UNRESOLVED_SYMBOL', severity:'warning', sourceStatementId:s.id, line:s.sourceLocation.startLine, symbol:n, message:`Symbol ${n} was not declared in WORKING-STORAGE` }); }
  if(!/public class/.test(java)) gaps.push({ schema:'prism.gap.v1', type:'COMPILATION_FAILURE', severity:'error', message:'Renderer did not produce a Java class' }); return gaps; }
function summarize(model, ir, gaps) { return { programId:model.programId, declarations:model.declarations.length, statements:model.statements.length, semanticOperations:ir.operations.length, gaps:gaps.length, deterministic:true }; }
