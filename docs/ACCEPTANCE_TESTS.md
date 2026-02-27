# Acceptance Tests — st2stack v0/v1

## Goal
Ensure the system produces deterministic IR and a runnable scaffold from supported Streamlit apps.

---

## A) IR Acceptance (Parser Contract)

### A1. Schema validation
- The parser MUST emit an `ir.json` that validates against `schema/ir.schema.json`.

Command:
- `make validate-ir`

### A2. Determinism (golden fixture)
Given fixture input:
- `fixtures/streamlit_hf_equity_screener/app.py`

The produced IR MUST be identical (byte-for-byte after stable JSON formatting) to:
- `fixtures/streamlit_hf_equity_screener/expected/ir.json`

Notes:
- IDs must be stable per `docs/ID_RULES.md`
- Arrays must be stably sorted (see ordering rules)

---

## B) Codegen Acceptance (Scaffold Contract)

A conversion is successful only if ALL checks pass in the worker sandbox:

### B1. Backend (generated scaffold)
- dependencies install (`npm ci` preferred when lockfile exists)
- `npm run build` (if TypeScript) or `node -c` equivalent passes
- backend boots
- `/health` returns 200

### B2. Frontend
- `npm ci` succeeds
- `npm run build` succeeds
- server responds 200

### B3. Docker Compose smoke test
- `docker compose up` boots both services
- backend `/health` 200
- frontend 200

Credits are charged ONLY if B1–B3 pass.

---

## C) End-to-End Behavior (Minimum UX)
For the fixture app conversion:
- Sidebar inputs render
- “Run” triggers API call
- Table renders returned rows
- At least one metric renders

---

## Supported scope reminder (v0/v1)
- Single entry file
- `st.sidebar`
- `st.form` (optional; v1 may stub form-specific behavior)
- Inputs: selectbox, multiselect, slider, text_input, number_input, date_input, checkbox
- Outputs: metric, dataframe/table, line_chart/bar_chart placeholders
- Button-driven execution is acceptable in v0/v1