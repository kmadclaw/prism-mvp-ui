import assert from 'node:assert/strict';
import { createRunArtifacts, EXAMPLES, runPrismMvp, SAMPLE_COBOL } from '../src/prism-core.mjs';

const result = runPrismMvp(SAMPLE_COBOL);
assert.equal(result.summary.programId, 'ACCOUNT-MVP');
assert.equal(result.summary.declarations, 3);
assert.ok(result.java.includes('public class AccountMvp'));
assert.ok(result.java.includes('private int balance = 1000;'));
assert.ok(result.java.includes('private String customerType = "STANDARD";'));
assert.ok(result.java.includes('balance += fee;'));
assert.ok(result.java.includes('if (balance > 1000)'));
assert.ok(result.java.includes('System.out.println(customerType);'));
assert.ok(result.semanticIr.operations.some(op => op.kind === 'StateMutation'));
assert.ok(result.readWrite.statements.some(s => s.reads.includes('BALANCE') && s.writes.includes('BALANCE')));

const run = createRunArtifacts(SAMPLE_COBOL, { runId: 'test-run' });
assert.equal(run.runId, 'test-run');
assert.ok(run.artifacts['artifacts/test-run/source/source-model.json']);
assert.ok(run.artifacts['artifacts/test-run/semantic/semantic-ir.json']);
assert.ok(run.artifacts['artifacts/test-run/generated/AccountMvp.java'].includes('public class AccountMvp'));
assert.equal(run.artifacts['artifacts/test-run/manifest.json'].artifactCount, 11);
assert.ok(EXAMPLES.length >= 3);

const unsupported = runPrismMvp(EXAMPLES.find(e => e.id === 'unsupported-gap').source);
assert.ok(unsupported.gaps.some(g => g.type === 'UNSUPPORTED_CONSTRUCT'));
assert.ok(unsupported.java.includes('GAP: Unsupported statement'));

const unresolved = runPrismMvp(`IDENTIFICATION DIVISION.
PROGRAM-ID. MISS.
DATA DIVISION.
WORKING-STORAGE SECTION.
01 BALANCE PIC 9(5).
PROCEDURE DIVISION.
MAIN.
    ADD FEE TO BALANCE.
    STOP RUN.`);
assert.ok(unresolved.gaps.some(g => g.type === 'UNRESOLVED_SYMBOL' && g.symbol === 'FEE'));

console.log('PRISM MVP core tests passed');
