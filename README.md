# PRISM Engine Workbench

A real product-development skeleton for PRISM: browser workbench + Vercel serverless backend + shared deterministic engine.

Live GitHub Pages legacy/static URL: https://kmadclaw.github.io/prism-mvp-ui/

> The intended product deployment target is Vercel because this version uses `/api/*` backend routes.

## What is real now

- Browser UI chooses example COBOL fixtures or accepts pasted COBOL.
- UI calls backend endpoint `POST /api/translate`.
- Backend runs the shared deterministic PRISM MVP engine in `src/prism-core.mjs`.
- The engine returns generated Java plus a full artifact bundle.
- Unsupported constructs become structured gaps instead of silent mock output.
- Tests cover core engine and API route behavior.

## Engine pipeline

```text
COBOL source
  -> PRISM source model
  -> symbol resolution
  -> CFG
  -> read/write analysis
  -> Semantic IR
  -> Java Target IR
  -> Java renderer
  -> validation/gap artifacts
```

## Artifact bundle

Each backend run returns stable artifact paths:

```text
artifacts/<runId>/source/input.cbl
artifacts/<runId>/source/source-model.json
artifacts/<runId>/analysis/symbols.json
artifacts/<runId>/analysis/cfg.json
artifacts/<runId>/analysis/read-write.json
artifacts/<runId>/semantic/semantic-ir.json
artifacts/<runId>/target/java-ir.json
artifacts/<runId>/generated/<ClassName>.java
artifacts/<runId>/validation/compile.json
artifacts/<runId>/validation/gaps.json
artifacts/<runId>/manifest.json
```

## Supported MVP constructs

PROGRAM-ID, WORKING-STORAGE elementary declarations, MOVE, ADD, SUBTRACT, MULTIPLY, DIVIDE, COMPUTE, IF/ELSE/END-IF, PERFORM, DISPLAY, STOP RUN, and basic CALL stubs.

## Local development

```bash
npm test
npm run dev
# open http://127.0.0.1:4174

# Vercel-compatible dev server, when Vercel auth is available:
npx vercel dev --listen 4174 --token "$VERCEL_TOKEN"
```

Without Vercel credentials, the API and engine are still testable through `npm test`.

## Production next steps

- Replace regex COBOL frontend with a real adapter boundary around ProLeap / COBOL-REKT / ANTLR parser.
- Add a worker that runs `javac` and stores compile artifacts.
- Add persisted run history/artifact storage.
- Add fixture parity tests: source expected output vs generated Java output.
- Add schema files for every artifact contract.

This is no longer just a mocked static demo: outputs are generated from the submitted COBOL by a shared backend-capable engine, with product-shaped API, artifacts, tests, and deployment structure.
