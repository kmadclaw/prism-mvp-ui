# PRISM MVP UI

A lightweight browser MVP for the PRISM PRD: deterministic COBOL → PRISM-owned models/IR → Java translation with structured gaps.

## MVP scope

- Input constrained COBOL directly in the browser.
- Build a parser-independent source model with stable IDs and source locations.
- Resolve variables/procedures.
- Produce a deterministic CFG and read/write facts.
- Build language-neutral Semantic IR without COBOL-specific MOVE/PERFORM nodes.
- Map to Java Target IR and render Java source.
- Show structured gap objects for unsupported constructs or unresolved symbols.

## Run locally

```bash
npm test
python3 -m http.server 4173
# open http://localhost:4173
```

## Supported constructs

PROGRAM-ID, WORKING-STORAGE elementary declarations, MOVE, ADD, SUBTRACT, MULTIPLY, DIVIDE, COMPUTE, IF/ELSE/END-IF, PERFORM, DISPLAY, STOP RUN, and basic CALL stubs.

This is an MVP/prototype UI, not a production COBOL compiler.
